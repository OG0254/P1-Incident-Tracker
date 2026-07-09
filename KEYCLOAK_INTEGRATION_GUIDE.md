# AKU P1 Incident Operations Portal: Keycloak Integration Guide

This guide details the end-to-end architecture and implementation blueprint to replace the current custom, mock-database authentication engine in your **Aga Khan University (AKU) P1 Incident Operations Portal** with **Keycloak**. 

Keycloak is a leading open-source, enterprise-grade Identity and Access Management (IAM) solution. It satisfies all your operational constraints:
* **Zero Licensing Cost**: Completely free and open-source.
* **Active Directory (AD) / LDAP Ready**: Connects out-of-the-box as a federated provider to AKU's real Active Directory once you obtain credential access, requiring zero changes to your application's source code.
* **Enforced Workflows**: Out-of-the-box support for "Update Password on First Login", multi-factor authentication (MFA), and token-based secure sessions.
* **Role-Based Access Control (RBAC)**: Maps directory security groups directly into application roles (`Service Desk` and `Support Group Users`).

---

## 1. Integration Architecture & Flow

### 1.1 Where Keycloak Fits in the System
Keycloak acts as the **centralized Identity Provider (IdP)**. Instead of your Express backend maintaining user password hashes and credentials, authentication is outsourced to Keycloak.

```
+------------------+         (1) Auth Request (Authorization Code Flow + PKCE)         +------------------+
|                  | ----------------------------------------------------------------> |                  |
|   React Client   | <---------------------------------------------------------------- |     Keycloak     |
|                  |                  (2) Returns JWT Access & ID Token                |   (IdP Server)   |
+------------------+                                                                   +------------------+
         |                                                                                      |
         | (3) Send API Request with Bearer Token                                               | (Allows future
         v                                                                                      | sync)
+------------------+                                                                            v
|   Express API    |                                                                   +------------------+
|     Backend      | -- (4) Decodes & verifies JWT signature locally via JWKS --------> |  Active Directory|
+------------------+                                                                   |  / LDAP Server   |
                                                                                       +------------------+
```

### 1.2 Components That Must Change
1. **React Authentication Shell**: 
   * Replace the login, registration, and reset password UI screens with the **Keycloak JS adapter** (`keycloak-js`).
   * When unauthenticated, redirect users to Keycloak's secure login portal.
2. **Express Auth Middleware**: 
   * Replace local `/api/auth/login` and `/api/auth/register` endpoints.
   * Update the backend `authenticateToken` middleware to verify JSON Web Tokens (JWTs) cryptographically using Keycloak's **JSON Web Key Set (JWKS)** instead of a local database check.
3. **User Creation & Directory Management**:
   * Outsource registration and profile creation to Keycloak or its administrator console.

### 1.3 Components That Remain Unchanged
* **Core P1 Incident State & Operations**: The state machine tracking P1 tickets, log creation, PDF report compiler, and operational verification dashboards remains completely unchanged.
* **Database Models (PostgreSQL)**: The tables managing ticket entities, system logs, and monthly reports remain identical. The database merely links incident resolver entries to the user's stable Keycloak ID (`sub` claim) instead of manual username fields.

---

## 2. Docker-Based Infrastructure Deployment

Here is the unified `docker-compose.yml` to spin up Keycloak along with its highly available PostgreSQL storage engine, fully integrated next to your incident tracking portal.

Save this content or update your root `docker-compose.yml`:

```yaml
version: '3.8'

services:
  # 1. PostgreSQL Database: Stores Keycloak configurations, users, and app state
  postgres-db:
    image: postgres:15-alpine
    container_name: aku-portal-postgres
    environment:
      POSTGRES_DB: keycloak_db
      POSTGRES_USER: keycloak_admin
      POSTGRES_PASSWORD: SecretSecurePassword123!
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak_admin -d keycloak_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # 2. Keycloak: Open-Source Identity Provider
  keycloak:
    image: quay.io/keycloak/keycloak:22.0.5
    container_name: aku-keycloak-idp
    command: start-dev --import-realm
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: AdminSuperSecretPassword123!
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-db:5432/keycloak_db
      KC_DB_USERNAME: keycloak_admin
      KC_DB_PASSWORD: SecretSecurePassword123!
      KC_FEATURES: token-exchange
    ports:
      - "8080:8080"
    depends_on:
      postgres-db:
        condition: service_healthy
    volumes:
      - ./keycloak/import:/opt/keycloak/data/import
    restart: unless-stopped

  # 3. Existing P1 Incident Operations Portal
  incident-portal:
    build:
      context: .
      dockerfile: Dockerfile
    image: aku-incident-portal:latest
    container_name: p1-incident-management
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - KEYCLOAK_REALM_URL=http://keycloak:8080/realms/aku-realm
      - KEYCLOAK_CLIENT_ID=aku-portal
      - DB_CONNECTION_STRING=postgresql://keycloak_admin:SecretSecurePassword123!@postgres-db:5432/keycloak_db
    depends_on:
      - keycloak
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M

volumes:
  postgres_data:
    driver: local
```

---

## 3. Keycloak Realm, User, & Role Design

To configure Keycloak to reflect AKU's actual operations:

### 3.1 Realm Design
* Create a dedicated realm named **`aku-realm`**.

### 3.2 Client Design (OIDC)
* Create a Client with ID **`aku-portal`**.
* **Client Protocol**: `openid-connect`.
* **Access Type**: `public` (suitable for single-page applications like React).
* **Valid Redirect URIs**: `http://localhost:3000/*` (or your production domain).
* **Web Origins**: `http://localhost:3000`.
* **Standard Flow Enabled**: `true` (enables OIDC Authorization Code Flow).
* **Proof Key for Code Exchange (PKCE)**: Force `S256` as PKCE challenge method.

### 3.3 Application Roles (Realm Roles)
Create two critical Realm Roles inside your Keycloak realm:
1. **`Service Desk`**: Access rights to administer user requests, re-verify ticket hashes, and finalize monthly reports.
2. **`Support Group User`**: Access rights to register resolved tickets under specific divisions.

### 3.4 Operational User Groups
Create matching Keycloak Groups:
* **`ICT Service Desk Owners`**: Automatically assigns the realm role `Service Desk`.
* **`ICT Support Groups`**: Automatically assigns the realm role `Support Group User`.

### 3.5 First-Time Login Password Policy
1. Go to **Authentication** > **Required Actions**.
2. Ensure **Update Password** is active.
3. When creating a temporary account for an employee, assign the **`Update Password`** action. 
4. Keycloak will force them to establish a personalized, secure password on their very first check-in before letting them enter your application.

---

## 4. Frontend Integration Blueprint (React)

Add the standard open-source library:
```bash
npm install keycloak-js
```

### 4.1 Integration Wrapper (`src/index.tsx` or `src/main.tsx`)
Initialize Keycloak at boot time so that authentication wraps your entire application:

```tsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Keycloak from 'keycloak-js';

// Configuration referencing local or production Keycloak URL
const keycloakConfig = {
  url: 'http://localhost:8080', // Replace with production external URL
  realm: 'aku-realm',
  clientId: 'aku-portal',
};

const keycloak = new Keycloak(keycloakConfig);

function Root() {
  const [authenticated, setAuthenticated] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    keycloak.init({ 
      onLoad: 'login-required', // Forces authentication before rendering app
      pkceMethod: 'S256'
    }).then((auth) => {
      setAuthenticated(auth);
      setInitialized(true);
      if (auth) {
        // Save token for Axios / Fetch Bearer header injection
        localStorage.setItem('keycloak_token', keycloak.token || '');
      }
    }).catch(() => {
      console.error("Keycloak initialization failed");
    });
  }, []);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-100 font-sans">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Verifying secure AKU directory session...</p>
        </div>
      </div>
    );
  }

  // Keycloak provides reactive state, pass it to your React App
  return <App keycloak={keycloak} />;
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<Root />);
```

### 4.2 Consuming Roles Inside React UI
In your React components, use Keycloak's embedded claims to dynamically enforce view access:

```tsx
interface AppProps {
  keycloak: any;
}

export function MainLayout({ keycloak }: AppProps) {
  // Extract user parameters directly from Keycloak JWT claims
  const fullName = keycloak.tokenParsed?.name || "AKU Employee";
  const username = keycloak.tokenParsed?.preferred_username || "anonymous";
  
  // Extract assigned Realm Roles
  const isServiceDesk = keycloak.hasRealmRole('Service Desk');
  const isSupportGroup = keycloak.hasRealmRole('Support Group User');

  return (
    <div className="p-6">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-lg font-bold">Welcome, {fullName}</h1>
          <p className="text-xs text-slate-400">Username: @{username}</p>
        </div>
        <button 
          onClick={() => keycloak.logout()}
          className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold"
        >
          Secure Log Out
        </button>
      </header>

      {isServiceDesk && (
        <section className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
          <h3 className="font-bold text-emerald-800 text-sm">Service Desk Control Panel</h3>
          <p className="text-xs text-emerald-600">Authorized for incident compile audits.</p>
        </section>
      )}
    </div>
  );
}
```

---

## 5. Backend Integration Blueprint (Express.js)

Verify signatures securely **locally** on your Express server without contacting Keycloak on every API request. Add these packages:

```bash
npm install jwks-rsa jsonwebtoken
```

### 5.1 Symmetric JWT Verification Middleware
Implement this standard middleware inside your `server.ts` file to replace the current custom, mock password check:

```ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const KEYCLOAK_REALM_URL = process.env.KEYCLOAK_REALM_URL || 'http://localhost:8080/realms/aku-realm';

// Create a JWKS client pointing to Keycloak's standard public certificates endpoint
const client = jwksClient({
  jwksUri: `${KEYCLOAK_REALM_URL}/protocol/openid-connect/certs`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

// Helper function to extract and retrieve signing keys dynamically
function getSignKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err, undefined);
    } else {
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    }
  });
}

export interface AuthenticatedUser {
  sub: string;             // Stable internal Keycloak ID
  username: string;
  email: string;
  name: string;
  roles: string[];         // Extracted realm roles
}

export interface SecureRequest extends Request {
  user?: AuthenticatedUser;
}

// Cryptographically robust, non-blocking authentication token middleware
export function authenticateKeycloakToken(req: SecureRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized. No security token attached.' });
  }

  jwt.verify(token, getSignKey, {
    algorithms: ['RS256'],
    issuer: KEYCLOAK_REALM_URL
  }, (err, decoded: any) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Access token has expired or is invalid.' });
    }

    // Keycloak stores realm roles under "realm_access.roles" in the OIDC JWT standard
    const realmRoles = decoded.realm_access?.roles || [];

    req.user = {
      sub: decoded.sub,
      username: decoded.preferred_username,
      email: decoded.email,
      name: decoded.name,
      roles: realmRoles
    };

    next();
  });
}

// Role Authorization Guards
export function requireRealmRole(role: string) {
  return (req: SecureRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.roles.includes(role)) {
      return res.status(403).json({ 
        success: false, 
        error: `Forbidden. This operation requires the official '${role}' credential.` 
      });
    }
    next();
  };
}
```

### 5.2 Protecting API Endpoints
Apply the Keycloak verification guards directly to your express service routes:

```ts
import express from 'express';
import { authenticateKeycloakToken, requireRealmRole, SecureRequest } from './middleware/auth';

const router = express.Router();

// 1. Get current authenticated user profile details safely
router.get('/me', authenticateKeycloakToken, (req: SecureRequest, res) => {
  res.json({ success: true, profile: req.user });
});

// 2. Protect Admin operations - Exclusive to Service Desk personnel
router.get('/admin/audit', authenticateKeycloakToken, requireRealmRole('Service Desk'), (req, res) => {
  res.json({ success: true, message: "Authorized: Entering secure integrity logs console." });
});

// 3. Protect Resolver submissions - Exclusive to Support Group Users
router.post('/incidents', authenticateKeycloakToken, requireRealmRole('Support Group User'), (req, res) => {
  res.json({ success: true, message: "Incident record committed to stable PostgreSQL storage." });
});
```

---

## 6. Future LDAP / Active Directory Federation Integration

Once you are ready to publish this system into AKU's production infrastructure, you can sync users directly with AKU's real Active Directory server. Keycloak acts as the federator:

```
[ AKU Portal App ] -> [ Keycloak Server ] -> Secure LDAP -> [ AKU Active Directory ]
```

### Configuration Steps (Admin Console)
1. Log in to the **Keycloak Admin Console** as `admin`.
2. Navigate to **User Federation** > **Add Provider** > Select **`ldap`**.
3. **Connection Settings**:
   * **Edit Mode**: `READ_ONLY` (protects hospital directory records).
   * **Vendor**: `Active Directory`.
   * **Connection URL**: `ldaps://your-aku-ad-domain.edu:636` (secure LDAPS with certificates).
4. **Active Directory Sync & Credentials**:
   * **Bind DN**: Enter your service account credentials (e.g., `CN=SvcP1Portal,OU=ServiceAccounts,DC=aku,DC=edu`).
   * **Bind Credential**: Enter the account's password.
5. **LDAP User Mapper Config**:
   * Map `sAMAccountName` from AD to Keycloak's `username`.
   * Map `mail` from AD to Keycloak's `email`.
   * Map AD security groups (e.g., `ICT-Service-Desk`) directly to Keycloak realm roles (`Service Desk`).

This architecture keeps your application's front-end and back-end code **completely clean of LDAP protocols**. Keycloak abstracts all directory mapping into clean OIDC JWT standards.
