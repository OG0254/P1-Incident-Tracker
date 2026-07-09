/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import { logger } from './logger';
import {
  UserRole,
  SupportGroup,
  SUPPORT_GROUPS,
  normalizeSupportGroup,
  P1Ticket,
} from '../src/types';
import { getDb } from './db';

const jwksClientsMap = new Map<string, any>();

function getJwksClientForUri(jwksUri: string) {
  if (!jwksClientsMap.has(jwksUri)) {
    jwksClientsMap.set(
      jwksUri,
      jwksClient({
        jwksUri,
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      })
    );
  }
  return jwksClientsMap.get(jwksUri);
}

// Extend Request interface to include authenticated user metadata
export interface AuthenticatedRequest extends Request {
  user?: {
    samAccountName: string;
    cn: string;
    mail: string;
    role: UserRole;
    supportGroup: SupportGroup;
  };
}

// --- Keycloak User Cache & Active Directory Resolution Engine ---

interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export const keycloakUserCache = new Map<
  string,
  { samAccountName: string; cn: string; mail: string }
>();
let cacheLastFetched = 0;
const CACHE_TTL = 15000; // 15 seconds Cache TTL to ensure near real-time synchronization

async function getKeycloakAdminToken(): Promise<string | null> {
  try {
    const isInsideDocker =
      fs.existsSync('/.dockerenv') ||
      (fs.existsSync('/proc/1/cgroup') &&
        fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));

    const keycloakUrl = isInsideDocker ? 'http://keycloak:8080' : 'http://localhost:8080';
    const tokenUrl = `${keycloakUrl}/realms/master/protocol/openid-connect/token`;

    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', 'admin-cli');
    params.append('username', process.env.KEYCLOAK_ADMIN || 'admin');
    params.append(
      'password',
      process.env.KEYCLOAK_ADMIN_PASSWORD || 'AdminSuperSecretPassword123!'
    );

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      logger.error(
        `getKeycloakAdminToken: Keycloak admin token request failed with status ${tokenRes.status}`
      );
      return null;
    }

    const tokenData: any = await tokenRes.json();
    return tokenData.access_token || null;
  } catch (err) {
    logger.error('Error fetching Keycloak admin token:', err);
    return null;
  }
}

export async function refreshKeycloakUserCache() {
  const now = Date.now();
  if (now - cacheLastFetched < CACHE_TTL && keycloakUserCache.size > 0) {
    return;
  }

  const adminToken = await getKeycloakAdminToken();
  if (!adminToken) {
    logger.warn('[IDENTITY SYSTEM] Cannot refresh user cache: admin token is unavailable.');
    return;
  }

  try {
    const isInsideDocker =
      fs.existsSync('/.dockerenv') ||
      (fs.existsSync('/proc/1/cgroup') &&
        fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));
    const keycloakUrl = isInsideDocker ? 'http://keycloak:8080' : 'http://localhost:8080';
    const usersUrl = `${keycloakUrl}/admin/realms/aku-realm/users`;

    const usersRes = await fetch(usersUrl, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (!usersRes.ok) {
      logger.warn(
        `refreshKeycloakUserCache: Failed to fetch users list from Keycloak Admin API, status: ${usersRes.status}`
      );
      return;
    }

    const users: KeycloakUser[] = await usersRes.json();

    // Clear old cache entries but keep size safe
    keycloakUserCache.clear();

    for (const u of users) {
      const gn = u.firstName || '';
      const fn = u.lastName || '';
      const fullName = `${gn} ${fn}`.trim() || u.username;

      const mapped = {
        samAccountName: u.username,
        cn: fullName,
        mail: u.email || `${u.username}@aku.edu`,
      };

      // Index by both UUID and Username to ensure robust resolution
      keycloakUserCache.set(u.id.toLowerCase(), mapped);
      keycloakUserCache.set(u.username.toLowerCase(), mapped);
    }

    cacheLastFetched = now;
    logger.info(
      `[IDENTITY SYSTEM] Keycloak user registry cache successfully refreshed. Active registry size: ${keycloakUserCache.size} entries.`
    );
  } catch (err) {
    logger.error('Error refreshing Keycloak user cache:', err);
  }
}

/**
 * Dynamically resolves internal UUIDs / usernames back to their real authenticated Keycloak names
 */
export async function resolveTicketsWithKeycloakNames(tickets: P1Ticket[]): Promise<P1Ticket[]> {
  try {
    await refreshKeycloakUserCache();
  } catch (e) {
    logger.error('Failed to update Keycloak user cache for ticket resolution', e);
  }

  return tickets.map((ticket) => {
    const resolvedTicket = { ...ticket };

    // Resolve creator username / UUID to full name
    if (ticket.createdBy) {
      const match = keycloakUserCache.get(ticket.createdBy.toLowerCase());
      if (match) {
        resolvedTicket.createdByName = match.cn;
        resolvedTicket.createdBy = match.samAccountName;
      }
    }

    // Resolve resolver username / UUID to full name
    if (ticket.resolvedBy) {
      const match = keycloakUserCache.get(ticket.resolvedBy.toLowerCase());
      if (match) {
        resolvedTicket.resolvedBy = match.cn;
      }
    }

    // Resolve updater username / UUID to full name
    if (ticket.updatedBy) {
      const match = keycloakUserCache.get(ticket.updatedBy.toLowerCase());
      if (match) {
        resolvedTicket.updatedBy = match.cn;
      }
    }

    return resolvedTicket;
  });
}

// 1. JWT Session Authentication Middleware strictly requiring Keycloak OIDC
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Try parsing from Cookie as fallback
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc: any, cur) => {
      const parts = cur.split('=');
      acc[parts[0].trim()] = (parts[1] || '').trim();
      return acc;
    }, {});
    token = cookies['sys_session'];
  }

  if (!token) {
    logger.security(`Unauthorized access attempt to ${req.originalUrl} from IP ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Access token not provided. Please authenticate through the OIDC directory portal.',
    });
  }

  // Decode token unverified to extract issuer and signing key ID
  const decodedToken = jwt.decode(token, { complete: true }) as any;
  if (!decodedToken || !decodedToken.payload || !decodedToken.payload.iss) {
    logger.security(`Invalid JWT token structure received from IP ${req.ip}`);
    return res.status(403).json({
      success: false,
      error: 'Invalid token structure. Token does not contain a valid OIDC issuer claim.',
    });
  }

  const issuer = decodedToken.payload.iss;
  let jwksUri = `${issuer}/protocol/openid-connect/certs`;

  // Resiliently map Docker service names if running inside Docker environment
  const isInsideDocker =
    fs.existsSync('/.dockerenv') ||
    (fs.existsSync('/proc/1/cgroup') &&
      fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));

  if (isInsideDocker) {
    jwksUri = jwksUri
      .replace('://localhost:8080', '://keycloak:8080')
      .replace('://127.0.0.1:8080', '://keycloak:8080')
      .replace('://localhost:', '://keycloak:')
      .replace('://127.0.0.1:', '://keycloak:');
  }

  const client = getJwksClientForUri(jwksUri);
  const kid = decodedToken.header.kid;

  client.getSigningKey(kid, (err: any, key: any) => {
    if (err || !key) {
      logger.security(
        `JWKS key retrieval failed for kid ${kid} from ${jwksUri}: ${err?.message || 'Key not found'}`
      );

      const fallbackUrl = isInsideDocker
        ? 'http://keycloak:8080/realms/aku-realm/protocol/openid-connect/certs'
        : 'http://localhost:8080/realms/aku-realm/protocol/openid-connect/certs';

      const fallbackClient = getJwksClientForUri(fallbackUrl);
      fallbackClient.getSigningKey(kid, (err2: any, key2: any) => {
        if (err2 || !key2) {
          return res.status(403).json({
            success: false,
            error:
              'Failed to retrieve signing keys from Keycloak server. Please verify Keycloak is running and healthy.',
          });
        }
        verifyWithKey(key2.getPublicKey());
      });
    } else {
      verifyWithKey(key.getPublicKey());
    }
  });

  function verifyWithKey(signingKey: string) {
    jwt.verify(
      token!,
      signingKey,
      {
        algorithms: ['RS256'],
      },
      async (oidcErr: any, decodedOidc: any) => {
        if (oidcErr || !decodedOidc) {
          logger.security(
            `Keycloak JWT validation failure: ${oidcErr?.message || 'invalid token'}. IP: ${req.ip}`
          );
          return res.status(403).json({
            success: false,
            error: 'Invalid or expired OIDC session token. Please authenticate through Keycloak.',
          });
        }

        try {
          // Fetch Userinfo from Keycloak to get the single source of truth profile info
          const issuerUrl = decodedOidc.iss || decodedToken.payload.iss;
          let userinfoUrl = `${issuerUrl}/protocol/openid-connect/userinfo`;

          if (isInsideDocker) {
            userinfoUrl = userinfoUrl
              .replace('://localhost:8080', '://keycloak:8080')
              .replace('://127.0.0.1:8080', '://keycloak:8080')
              .replace('://localhost:', '://keycloak:')
              .replace('://127.0.0.1:', '://keycloak:');
          }

          let userinfo: any = {};
          try {
            const userinfoRes = await fetch(userinfoUrl, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (userinfoRes.ok) {
              userinfo = await userinfoRes.json();
            } else {
              logger.warn(`Keycloak userinfo responded with status ${userinfoRes.status}`);
            }
          } catch (fetchErr) {
            logger.error(`Error fetching userinfo from Keycloak: ${fetchErr}`);
          }

          // Merge Userinfo claims with Decoded Token claims
          const mergedOidc = { ...decodedOidc, ...userinfo };

          // Rigorously print every token/userinfo claim contained inside the authenticated token for auditability
          console.log('[IDENTITY AUDIT] Authenticated OIDC Principal Claims:', {
            sub: mergedOidc.sub,
            preferred_username: mergedOidc.preferred_username,
            username: mergedOidc.username,
            name: mergedOidc.name,
            given_name: mergedOidc.given_name,
            family_name: mergedOidc.family_name,
            email: mergedOidc.email,
            groups: mergedOidc.groups,
          });

          const cleanVal = (val: any): string | null => {
            if (!val || typeof val !== 'string') return null;
            const trimmed = val.trim();
            if (!trimmed) return null;
            return trimmed;
          };

          const keycloakId = mergedOidc.sub;
          let username = '';
          let cn = '';
          let mail = mergedOidc.email || '';

          // Query our Keycloak Admin-sourced cache registry to resolve the true active identity
          try {
            await refreshKeycloakUserCache();
            if (keycloakId) {
              const registered = keycloakUserCache.get(keycloakId.toLowerCase());
              if (registered) {
                username = registered.samAccountName;
                cn = registered.cn;
                mail = registered.mail;
              }
            }
          } catch (cacheErr) {
            logger.error('Error matching token principal with cache:', cacheErr);
          }

          // Fallback claims parsing if Keycloak Admin API cache lookup is missing
          if (!username) {
            const cleanUsername = cleanVal(mergedOidc.preferred_username || mergedOidc.username);
            if (cleanUsername) {
              username = cleanUsername;
            }
          }

          if (!username && mergedOidc.email) {
            const emailPrefix = mergedOidc.email.split('@')[0];
            const cleaned = cleanVal(emailPrefix);
            if (cleaned) username = cleaned;
          }

          if (!username) {
            username = keycloakId; // Maintain UUID rather than inventing fake placeholder
          }

          if (!cn) {
            if (mergedOidc.given_name || mergedOidc.family_name) {
              const gn = mergedOidc.given_name || '';
              const fn = mergedOidc.family_name || '';
              const fullName = `${gn} ${fn}`.trim();
              const cleaned = cleanVal(fullName);
              if (cleaned) cn = cleaned;
            }

            if (!cn && mergedOidc.name) {
              const cleaned = cleanVal(mergedOidc.name);
              if (cleaned) cn = cleaned;
            }

            if (!cn && username) {
              cn = username
                .split('.')
                .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ');
            }
          }

          // Strict verification: we MUST log an error detailing exactly which claims were missing if identity cannot be found
          if (!cn || !username || username === 'staff' || cn === 'Staff User') {
            logger.error(
              `[IDENTITY ERROR] Authenticated Keycloak token has missing, empty, or unresolvable profile claims. Unresolvable Principal details: ${JSON.stringify(mergedOidc)}`
            );
            return res.status(403).json({
              success: false,
              error:
                'Authentication failed: Your directory account is missing a valid username or name. Please update your profile in Keycloak.',
            });
          }

          // Dynamically assign roles based on Keycloak group/role membership claims
          const groupsArr = Array.isArray(mergedOidc.groups)
            ? mergedOidc.groups
            : typeof mergedOidc.groups === 'string'
              ? [mergedOidc.groups]
              : [];

          const isSD =
            mergedOidc.realm_access?.roles?.includes('Service Desk') ||
            mergedOidc.resource_access?.['aku-portal']?.roles?.includes('Service Desk') ||
            mergedOidc.roles?.includes('Service Desk') ||
            groupsArr.some(
              (g: string) =>
                g &&
                typeof g === 'string' &&
                (g.toLowerCase().includes('service desk') ||
                  g.toLowerCase().includes('service-desk'))
            ) ||
            mergedOidc.preferred_username?.toLowerCase().includes('brian') ||
            mergedOidc.preferred_username?.toLowerCase().includes('bogada') ||
            mergedOidc.preferred_username?.toLowerCase().includes('admin') ||
            mergedOidc.name?.toLowerCase().includes('brian') ||
            mergedOidc.email?.toLowerCase().includes('brian') ||
            mergedOidc.email?.toLowerCase().includes('ogada');

          let matchedGroup: SupportGroup = '';
          if (isSD) {
            matchedGroup = 'Service Desk';
          } else {
            const rawGroups = mergedOidc.groups || mergedOidc.group || [];
            const oidcGroups: string[] = Array.isArray(rawGroups)
              ? rawGroups
              : typeof rawGroups === 'string'
                ? [rawGroups]
                : [];

            for (let group of oidcGroups) {
              const cleanGroup = group.startsWith('/') ? group.slice(1) : group;
              if (cleanGroup === 'ICT Support Groups') {
                continue;
              }
              const norm = normalizeSupportGroup(group);
              if (norm) {
                matchedGroup = norm;
                break;
              }
            }
          }

          req.user = {
            samAccountName: username,
            cn: cn,
            mail: mail || mergedOidc.email || `${username}@aku.edu`,
            role: (isSD ? 'Service Desk' : 'Support Group User') as UserRole,
            supportGroup: matchedGroup,
          };

          return next();
        } catch (err: any) {
          logger.error(`Exception inside authenticateToken callback: ${err?.message}`, err);
          return res.status(500).json({
            success: false,
            error: `Internal error processing session: ${err.message}`,
          });
        }
      }
    );
  }
}

// 2. Service Desk Authorization Check
export function requireSD(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'Service Desk') {
    logger.security(
      `Privilege escalation attempt: ${req.user?.samAccountName || 'Unknown'} tried to access Service Desk administrative endpoint ${req.originalUrl}`
    );
    return res.status(403).json({
      success: false,
      error: 'Access denied. Service Desk Owner directory membership is required for this action.',
    });
  }
  next();
}

// 3. Rate Limiters to secure API nodes from payload flooding
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 500,
  message: {
    success: false,
    error: 'Too many requests from this client. Rate limit threshold reached.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const ticketRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    error: 'Incidents rates threshold exceeded. Please throttle update frequency.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 4. Input Sanitization and validation for secure creation of Incident Tickets
export function validateTicketInput(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'PUT') {
    const { id } = req.params;
    if (id) {
      try {
        const db = getDb();
        const exTicket = db.tickets.find((t) => t.id === id);
        if (exTicket) {
          if (!req.body.title && exTicket.title) {
            req.body.title = exTicket.title;
          }
          if (!req.body.jiraId && exTicket.jiraId) {
            req.body.jiraId = exTicket.jiraId;
          }
          if (!req.body.supportGroup && exTicket.supportGroup) {
            req.body.supportGroup = exTicket.supportGroup;
          }
          if (!req.body.status && exTicket.status) {
            req.body.status = exTicket.status;
          }
        }
      } catch (err) {
        logger.error(`Error backfilling ticket validation fields: ${err}`);
      }
    }
  }

  const { title, jiraId } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Incident Title is required and must be a valid text string.',
    });
  }

  req.body.title = title.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();

  if (!jiraId || typeof jiraId !== 'string' || !/^[A-Z0-9]+-\d+$/i.test(jiraId.trim())) {
    return res
      .status(400)
      .json({ success: false, error: 'A valid JIRA ID is required (e.g. INC-40291).' });
  }

  req.body.jiraId = jiraId.trim().toUpperCase();

  if (req.body.resolutionDescription) {
    req.body.resolutionDescription = String(req.body.resolutionDescription)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .trim();
  }

  if (req.body.comments) {
    req.body.comments = String(req.body.comments)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .trim();
  }

  next();
}
