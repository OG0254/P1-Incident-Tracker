import express from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

import { getDb, saveDb } from './server/db';
import { logger } from './server/logger';
import {
  authenticateToken,
  requireSD,
  generalRateLimiter,
  ticketRateLimiter,
  validateTicketInput,
  AuthenticatedRequest,
  resolveTicketsWithKeycloakNames,
  refreshKeycloakUserCache,
  keycloakUserCache,
} from './server/middleware';
import jwt from 'jsonwebtoken';
import { P1Ticket, SUPPORT_GROUPS, normalizeSupportGroup, SupportGroup } from './src/types';

const PORT = 3000;

async function startServer() {
  const app = express();

  // 1. Enterprise Security Shield Integration
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://fonts.googleapis.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'referrer', 'no-referrer'],
          connectSrc: [
            "'self'",
            'ws:',
            'wss:',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'ws://localhost:3000',
            'ws://127.0.0.1:3000',
          ],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request Auditing log
  app.use((req, res, next) => {
    logger.info(`Ingress Access: ${req.method} ${req.originalUrl} from source IP [${req.ip}]`);
    next();
  });

  // Prevent browser caching of dynamic API routes
  app.use('/api', (req, res, next) => {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // 2. Monitoring & Cluster Reliability Endpoints
  app.get('/api/monitoring/health', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
      success: true,
      status: 'HEALTHY',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      resources: {
        heapTotalMs: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
        heapUsedMs: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
        rssMs: Math.round(memory.rss / 1024 / 1024) + 'MB',
      },
    });
  });

  app.get('/api/monitoring/ready', (req, res) => {
    try {
      getDb(); // Check database readiness
      res.json({ success: true, status: 'READY', dbConnection: 'OK' });
    } catch (e: any) {
      logger.error('Database readiness probe failure', e);
      res.status(500).json({ success: false, status: 'UNREADY', error: e.message });
    }
  });

  app.get('/api/monitoring/live', (req, res) => {
    res.json({ success: true, status: 'ALIVE' });
  });

  // Background OIDC Keycloak Authentication Proxy
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    try {
      const isInsideDocker =
        fs.existsSync('/.dockerenv') ||
        (fs.existsSync('/proc/1/cgroup') &&
          fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));

      let keycloakUrl = 'http://localhost:8080';
      if (isInsideDocker) {
        keycloakUrl = 'http://keycloak:8080';
      }

      const tokenUrl = `${keycloakUrl}/realms/aku-realm/protocol/openid-connect/token`;

      const params = new URLSearchParams();
      params.append('grant_type', 'password');
      params.append('client_id', 'aku-portal');
      params.append('username', username);
      params.append('password', password);

      const kcRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!kcRes.ok) {
        const errText = await kcRes.text();
        logger.error(
          `FAILED LOGIN: Authentication failed for user [${username}] from IP [${req.ip}]. Keycloak returned: ${errText}`
        );

        // Parse Keycloak error body to see if a password update is required (e.g., temporary password)
        try {
          const errData = JSON.parse(errText);
          const isInvalidGrant = errData.error === 'invalid_grant';
          const desc = (errData.error_description || '').toLowerCase();

          if (
            isInvalidGrant &&
            (desc.includes('temporary') ||
              desc.includes('not fully set up') ||
              desc.includes('update_password') ||
              desc.includes('required_action'))
          ) {
            return res.status(401).json({
              success: false,
              requirePasswordChange: true,
              error:
                'Your password is temporary or requires a secure change in Keycloak. Redirecting you to complete your setup...',
            });
          }
        } catch (_) {}

        // Extract keycloak error details if available, or return generic single-sign-on verification error
        let responseError =
          'Authentication failed. Please verify your AKU single sign-on credentials.';
        try {
          const errData = JSON.parse(errText);
          if (errData.error_description) {
            responseError = `Authentication failed: ${errData.error_description}.`;
          } else if (errData.error) {
            responseError = `Authentication failed: ${errData.error}.`;
          }
        } catch (_) {}

        return res.status(401).json({ success: false, error: responseError });
      }

      const kcData: any = await kcRes.json();
      const accessToken = kcData.access_token;
      const idToken = kcData.id_token;

      // Decode the access token first, and if id_token exists, decode and merge claims (preferring ID Token for profile info)
      const decodedAccess: any = jwt.decode(accessToken) || {};
      const decodedId: any = idToken ? jwt.decode(idToken) : {};
      const decoded: any = { ...decodedAccess, ...decodedId };

      if (!decoded || Object.keys(decoded).length === 0) {
        return res
          .status(500)
          .json({ success: false, error: 'Failed to decode Keycloak OIDC token.' });
      }

      const groupsArr = Array.isArray(decoded.groups)
        ? decoded.groups
        : typeof decoded.groups === 'string'
          ? [decoded.groups]
          : [];

      const isServiceDesk =
        decoded.realm_access?.roles?.includes('Service Desk') ||
        decoded.resource_access?.['aku-portal']?.roles?.includes('Service Desk') ||
        decoded.roles?.includes('Service Desk') ||
        groupsArr.some(
          (g: string) =>
            g &&
            typeof g === 'string' &&
            (g.toLowerCase().includes('service desk') || g.toLowerCase().includes('service-desk'))
        ) ||
        // Fallback check for Brian / Admin
        decoded.preferred_username?.toLowerCase().includes('brian') ||
        decoded.preferred_username?.toLowerCase().includes('bogada') ||
        decoded.preferred_username?.toLowerCase().includes('admin') ||
        decoded.name?.toLowerCase().includes('brian') ||
        decoded.email?.toLowerCase().includes('brian') ||
        decoded.email?.toLowerCase().includes('ogada');

      // Determine group membership
      let defaultGroup: SupportGroup = '';
      if (isServiceDesk) {
        defaultGroup = 'Service Desk';
      } else {
        const rawGroups = decoded.groups || decoded.group || [];
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
            defaultGroup = norm;
            break;
          }
        }
      }

      const cleanVal = (val: any): string | null => {
        if (!val || typeof val !== 'string') return null;
        const trimmed = val.trim();
        if (!trimmed) return null;
        return trimmed;
      };

      const keycloakId = decoded.sub;
      let samAccountName = '';
      let cn = '';
      let mail = decoded.email || '';

      // Query cache first to match active identity perfectly
      try {
        await refreshKeycloakUserCache();
        if (keycloakId) {
          const registered = keycloakUserCache.get(keycloakId.toLowerCase());
          if (registered) {
            samAccountName = registered.samAccountName;
            cn = registered.cn;
            mail = registered.mail;
          }
        }
      } catch (cacheErr) {
        logger.error('Error matching login principal with cache:', cacheErr);
      }

      if (!samAccountName) {
        const cleanUsername = cleanVal(decoded.preferred_username || decoded.username);
        if (cleanUsername) {
          samAccountName = cleanUsername;
        }
      }

      if (!samAccountName && decoded.email) {
        const emailPrefix = decoded.email.split('@')[0];
        const cleaned = cleanVal(emailPrefix);
        if (cleaned) samAccountName = cleaned;
      }

      if (!samAccountName) {
        samAccountName = keycloakId;
      }

      if (!cn) {
        if (decoded.given_name || decoded.family_name) {
          const gn = decoded.given_name || '';
          const fn = decoded.family_name || '';
          const fullName = `${gn} ${fn}`.trim();
          const cleaned = cleanVal(fullName);
          if (cleaned) cn = cleaned;
        }

        if (!cn && decoded.name) {
          const cleaned = cleanVal(decoded.name);
          if (cleaned) cn = cleaned;
        }

        if (!cn && samAccountName) {
          cn = samAccountName
            .split('.')
            .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
        }
      }

      if (!cn || !samAccountName || samAccountName === 'staff' || cn === 'Staff User') {
        logger.error(
          `[IDENTITY ERROR] Authenticated Keycloak token has missing, empty, or unresolvable profile claims during login. Details: ${JSON.stringify(decoded)}`
        );
        return res.status(401).json({
          success: false,
          error:
            'Authentication failed: Your directory account is missing a valid username or name. Please update your profile in Keycloak.',
        });
      }

      const mappedUser = {
        samAccountName: samAccountName,
        cn: cn,
        mail: mail || decoded.email || `${samAccountName}@aku.edu`,
        role: isServiceDesk ? 'Service Desk' : 'Support Group User',
        supportGroup: defaultGroup,
        isActive: true,
      };

      logger.info(
        `SUCCESSFUL LOGIN: User [${samAccountName}] authenticated successfully as [${mappedUser.role}] via Keycloak ROPC.`
      );

      return res.json({
        success: true,
        token: accessToken,
        refreshToken: kcData.refresh_token,
        user: mappedUser,
      });
    } catch (err: any) {
      logger.error(`Error authenticating user against Keycloak`, err);
      return res
        .status(500)
        .json({ success: false, error: `Internal connection error with Keycloak: ${err.message}` });
    }
  });

  // Request Access Signup Endpoint (notification-only queue)
  app.post('/api/auth/register', (req, res) => {
    const { fullName, email, username, proposedRole, proposedGroup } = req.body;

    if (!fullName || !email || !username || !proposedRole || !proposedGroup) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    if (!email.toLowerCase().endsWith('@aku.edu')) {
      return res.status(400).json({
        success: false,
        error: 'Registration is restricted to authorized corporate domain @aku.edu.',
      });
    }

    const db = getDb();

    // Check if user already has a pending request
    const existing = db.accessRequests.find(
      (r) =>
        r.username.toLowerCase() === username.toLowerCase() ||
        r.email.toLowerCase() === email.toLowerCase()
    );
    if (existing && existing.status === 'Pending') {
      return res.status(400).json({
        success: false,
        error: 'An active pending access request already exists for this username or email.',
      });
    }

    const newRequest = {
      id: `req-${Date.now()}`,
      fullName,
      email,
      username,
      proposedRole,
      proposedGroup: normalizeSupportGroup(proposedGroup),
      requestDate: new Date().toISOString(),
      status: 'Pending' as const,
    };

    db.accessRequests.push(newRequest);
    saveDb(db);

    logger.info(
      `ACCESS REQUEST SUBMITTED: User [${username}] requested access as [${proposedRole}]. Added to notification queue.`
    );
    return res.json({
      success: true,
      message:
        'Your access request has been logged successfully. Brian Ogada will manually create your account in Keycloak.',
    });
  });

  // Get Pending and Managed Access Requests (Service Desk exclusive)
  app.get('/api/admin/requests', authenticateToken, requireSD, (req, res) => {
    const db = getDb();
    res.json({ success: true, requests: db.accessRequests || [] });
  });

  // Mark Request as Approved / Processed (does not create users locally, notification queue only)
  app.post('/api/admin/requests/:id/approve', authenticateToken, requireSD, (req, res) => {
    const { id } = req.params;
    const db = getDb();
    const reqIndex = db.accessRequests.findIndex((r) => r.id === id);
    if (reqIndex === -1) {
      return res.status(404).json({ success: false, error: 'Access request not found.' });
    }

    db.accessRequests[reqIndex].status = 'Approved';
    saveDb(db);

    logger.info(
      `ACCESS REQUEST ACKNOWLEDGED: Request ID [${id}] marked as Processed/Approved by Service Desk Owner.`
    );
    res.json({ success: true, message: 'Request has been marked as Approved in the queue.' });
  });

  // Mark Request as Rejected (notification queue only)
  app.post('/api/admin/requests/:id/reject', authenticateToken, requireSD, (req, res) => {
    const { id } = req.params;
    const db = getDb();
    const reqIndex = db.accessRequests.findIndex((r) => r.id === id);
    if (reqIndex === -1) {
      return res.status(404).json({ success: false, error: 'Access request not found.' });
    }

    db.accessRequests[reqIndex].status = 'Rejected';
    saveDb(db);

    logger.info(`ACCESS REQUEST REJECTED: Request ID [${id}] rejected by Service Desk Owner.`);
    res.json({ success: true, message: 'Request has been marked as Rejected in the queue.' });
  });

  // Dynamic Keycloak Support Groups Endpoint (Public)
  app.get('/api/groups', async (req, res) => {
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
        throw new Error(
          `Failed to fetch Keycloak admin token: ${tokenRes.status} ${tokenRes.statusText}`
        );
      }

      const tokenData: any = await tokenRes.json();
      const adminToken = tokenData.access_token;

      // Fetch groups from Keycloak realm
      const groupsUrl = `${keycloakUrl}/admin/realms/aku-realm/groups`;
      const groupsRes = await fetch(groupsUrl, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (!groupsRes.ok) {
        throw new Error(`Failed to fetch groups from Keycloak Admin API: ${groupsRes.statusText}`);
      }

      const groups: any[] = await groupsRes.json();

      // Recursive extraction function to extract all groups dynamically
      interface KcGroup {
        id: string;
        name: string;
        path: string;
        subGroups?: KcGroup[];
      }

      function extractSupportGroups(gList: KcGroup[]): string[] {
        let list: string[] = [];
        for (const g of gList) {
          const norm = normalizeSupportGroup(g.path);
          if (norm && norm !== 'ICT Support Groups') {
            list.push(norm);
          }
          if (g.subGroups && g.subGroups.length > 0) {
            list = list.concat(extractSupportGroups(g.subGroups));
          }
        }
        return list;
      }

      const extracted = extractSupportGroups(groups);
      const uniqueGroups = Array.from(new Set(extracted)).filter(Boolean);

      return res.json({ success: true, groups: uniqueGroups });
    } catch (error: any) {
      logger.error('Error in /api/groups Keycloak integration', error);
      return res.json({ success: true, groups: [] });
    }
  });

  // 3. User Active Session Metadata (OIDC Context mapping)
  app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }
    res.json({
      success: true,
      user: req.user,
    });
  });

  // 4. SMTP Alert Simulator Log Sync
  app.get('/api/admin/sync/smtp-logs', authenticateToken, (req, res) => {
    const db = getDb();
    res.json({ success: true, logs: db.mailLogs });
  });

  app.post('/api/admin/sync/smtp-logs', authenticateToken, (req, res) => {
    const { content } = req.body;
    const db = getDb();
    db.mailLogs.push(content);
    // Keep last 100 logs for system memory health
    if (db.mailLogs.length > 200) {
      db.mailLogs = db.mailLogs.slice(-100);
    }
    saveDb(db);
    res.json({ success: true });
  });

  // 5. Incident Ticket Operations
  app.get(
    '/api/tickets',
    authenticateToken,
    generalRateLimiter,
    async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.user!;

      // Resolves UUID / usernames to actual Keycloak display names dynamically
      const resolvedTickets = await resolveTicketsWithKeycloakNames(db.tickets);

      // Role-based filtering constraints
      if (user.role === 'Service Desk') {
        // Service Desk owners have full master dashboard vision
        return res.json({ success: true, tickets: resolvedTickets });
      } else {
        // Support Resolver group users only see incidents routed to their respective queue OR if they created them
        const filtered = resolvedTickets.filter(
          (t) => t.supportGroup === user.supportGroup || t.createdBy === user.samAccountName
        );
        return res.json({ success: true, tickets: filtered });
      }
    }
  );

  app.post(
    '/api/tickets',
    authenticateToken,
    ticketRateLimiter,
    validateTicketInput,
    async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.user!;

      const newTicket: P1Ticket = {
        id: `p1-ticket-${Date.now()}`,
        jiraId: req.body.jiraId,
        title: req.body.title,
        date: req.body.date || new Date().toISOString().split('T')[0],
        supportGroup: normalizeSupportGroup(req.body.supportGroup),
        status: req.body.status || 'Pending Resolution Details',
        resolutionDescription: req.body.resolutionDescription,
        outageStart: req.body.outageStart,
        outageEnd: req.body.outageEnd,
        comments: req.body.comments,
        updatedAt: new Date().toISOString(),
        updatedBy: user.cn,
        createdBy: user.samAccountName,
        createdByName: user.cn,
        resolvedBy: req.body.status === 'Completed' ? user.cn : undefined,
        resolvedAt: req.body.status === 'Completed' ? new Date().toISOString() : undefined,
      };

      db.tickets.unshift(newTicket);
      saveDb(db);

      logger.info(`TICKET CREATED: Ticket [${newTicket.jiraId}] created by user ${user.cn}`);

      const resolved = await resolveTicketsWithKeycloakNames([newTicket]);
      res.status(201).json({ success: true, ticket: resolved[0] });
    }
  );

  app.put(
    '/api/tickets/:id',
    authenticateToken,
    ticketRateLimiter,
    validateTicketInput,
    async (req: AuthenticatedRequest, res) => {
      const { id } = req.params;
      const db = getDb();
      const user = req.user!;

      const ticketIndex = db.tickets.findIndex((t) => t.id === id);
      if (ticketIndex === -1) {
        return res.status(404).json({ success: false, error: 'Incident card not found.' });
      }

      const exTicket = db.tickets[ticketIndex];

      // RBAC Security Safeguard: Support group resolvers are restricted to updating tickets inside their assigned queue
      if (user.role !== 'Service Desk' && exTicket.supportGroup !== user.supportGroup) {
        logger.security(
          `UNAUTHORIZED TICKET WRITE: Resolver team member ${user.cn} attempted to modify ticket [${exTicket.jiraId}] in outside support group [${exTicket.supportGroup}]`
        );
        return res.status(403).json({
          success: false,
          error:
            'Write denied. Resolver personnel are only permitted to resolve incidents inside their default assigned support group.',
        });
      }

      const isNowCompleted = req.body.status === 'Completed';
      const wasCompleted = exTicket.status === 'Completed';

      const updatedTicket: P1Ticket = {
        ...exTicket,
        title: req.body.title,
        jiraId: req.body.jiraId,
        supportGroup: normalizeSupportGroup(req.body.supportGroup),
        status: req.body.status,
        resolutionDescription: req.body.resolutionDescription,
        outageStart: req.body.outageStart,
        outageEnd: req.body.outageEnd,
        comments: req.body.comments,
        updatedAt: new Date().toISOString(),
        updatedBy: user.cn,
      };

      if (isNowCompleted) {
        if (
          !wasCompleted ||
          !exTicket.resolvedBy ||
          exTicket.resolutionDescription !== req.body.resolutionDescription
        ) {
          updatedTicket.resolvedBy = user.cn;
          updatedTicket.resolvedAt = new Date().toISOString();
        }
      } else {
        updatedTicket.resolvedBy = undefined;
        updatedTicket.resolvedAt = undefined;
      }

      db.tickets[ticketIndex] = updatedTicket;
      saveDb(db);

      logger.info(`TICKET UPDATED: Ticket [${updatedTicket.jiraId}] updated by user ${user.cn}`);

      const resolved = await resolveTicketsWithKeycloakNames([updatedTicket]);
      res.json({ success: true, ticket: resolved[0] });
    }
  );

  app.delete('/api/tickets/:id', authenticateToken, requireSD, (req, res) => {
    const { id } = req.params;
    const db = getDb();
    const lenBefore = db.tickets.length;
    db.tickets = db.tickets.filter((t) => t.id !== id);

    if (db.tickets.length === lenBefore) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }

    saveDb(db);
    logger.info(`TICKET REMOVED: Incident with ID ${id} deleted by Service Desk Owner`);
    res.json({ success: true, message: 'Ticket removed from databases successfully.' });
  });

  // Download System Audit Logs (SD exclusive access)
  app.get('/api/admin/logs', authenticateToken, requireSD, (req, res) => {
    const { file } = req.query;
    let target = 'application.log';
    if (file === 'errors') target = 'errors.log';
    if (file === 'security') target = 'security.log';

    const logPath = path.join(process.cwd(), 'logs', target);
    if (!fs.existsSync(logPath)) {
      return res.json({ success: true, logs: '--- End of Log File ---' });
    }

    try {
      const logs = fs.readFileSync(logPath, 'utf8');
      const lines = logs.trim().split('\n').slice(-150).join('\n');
      res.json({ success: true, logs: lines });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 6. Vite Integration Middleware for developer serving & asset pipeline fallback
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    // Serve static files with anti-caching for index.html but long-term caching for hashed assets
    app.use(
      express.static(distPath, {
        setHeaders: (res, filepath) => {
          if (filepath.endsWith('.html')) {
            res.setHeader(
              'Cache-Control',
              'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
            );
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          } else {
            // Keep hashed static files cached long-term to optimize performance
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );

    // Fallback SPA router: index.html must never be cached by the browser
    app.get('*', (req, res) => {
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ENTERPRISE ENGINE] Booted successfully. Running on http://localhost:${PORT}`);
    logger.info('System Master Express engine initialized on port 3000');
  });
}

startServer().catch((e) => {
  console.error('Fatal bootstrapping error:', e);
  logger.error('Fatal bootstrap shutdown', e);
});
