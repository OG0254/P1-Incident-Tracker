# AKU P1 Incident Governance Portal

An enterprise-grade governance and service-level agreement (SLA) verification platform built for the **Aga Khan University (AKU) ICT Core Enterprise Group**. This application provides Priority 1 (P1) incident orchestration, SLA tracking, and resolution auditing, fully integrated with Keycloak Identity Provider (IdP) for centralized Single Sign-On (SSO) and LDAP/Active Directory federation.

---

## 🚀 Key Features

* **Master Service Desk Dashboard**  
  Centralized oversight of active system outages, incident counts, mean time to resolve (MTTR), and SLA compliance percentage.
  
* **Role-Based Access Control (RBAC)**  
  Fine-grained security mapping:
  * **Service Desk Owners**: Complete admin controls, capability to log new P1s, delete records, process user registration approvals, and pull system security logs.
  * **Support Group Resolvers**: Read and resolve incidents restricted to their default-assigned Support Group queues (e.g., *Level 3 / AKU MIS*, *Networks*, *SysOps*).
  
* **Enterprise Keycloak SSO**  
  Implements OpenID Connect (OIDC) authentication using `keycloak-js` and backend cryptographic verification via JSON Web Key Sets (JWKS).
  
* **System Reliability Health Probes**  
  `/api/monitoring` endpoints exposing live metrics (Uptime, heap usage, memory footprint, and database connectivity checks).
  
* **Audit & Compliance Logging**  
  Writes separate structured log streams into local directories:
  * `application.log`: Operational workflows and routing.
  * `security.log`: Failed logins, authorization denials, and potential escalation attempts.
  * `errors.log`: Exception tracking and database failures.
  
* **SMTP Alert Simulator**  
  Tracks transactional alerts, SLA reminders, and closure dispatches.

---

## 🛠️ Architecture & Tech Stack

* **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, and Motion for sleek, professional UI micro-interactions.
* **Backend**: Node.js/Express, TypeScript (using `tsx` in development), and `esbuild` for production compilation.
* **Identity Management**: Keycloak (Docker-based Quay container distribution).
* **Database**: Lightweight JSON-based local document database with atomic transaction flushes.
* **Containerization**: Unified Docker Compose architecture for localized development and sandbox testing.

---

## 📂 Repository Structure

```text
.
├── .env.example                 # Example template for required environment variables
├── Dockerfile                   # Node production container specification
├── docker-compose.yml           # Multi-container setup for Keycloak, Postgres, and the App
├── package.json                 # Core dependencies and esbuild compilation scripts
├── server.ts                    # Express backend entry point
├── server/                      # Server-side components
│   ├── db.ts                    # Transactional storage engine
│   ├── logger.ts                # Winston-based segmented logs configuration
│   └── middleware.ts            # OIDC authentication, RBAC safeguards, rate limiters, & validators
├── src/                         # React SPA source code
│   ├── main.tsx                 # Client entry point
│   ├── App.tsx                  # Root application controller & tab navigator
│   ├── types.ts                 # Type definitions & AD support group dictionaries
│   ├── components/              # Modular UI components
│   │   ├── Login.tsx            # Login portal & sign-up request wizard
│   │   ├── Dashboard.tsx        # SLA gauges, MTTR cards, and group metrics
│   │   ├── TicketForm.tsx       # Incident logging form (Service Desk exclusive)
│   │   ├── P1TicketList.tsx     # Filterable active ticket table
│   │   ├── TicketModal.tsx      # SLA inspector & resolution form
│   │   ├── MonthlyReport.tsx    # SLA compliance monthly aggregate
│   │   └── IdentityHeader.tsx   # Active directory banner & logout mechanism
│   └── utils/
│       └── api.ts               # Fetch-based API client with auto-injected headers
└── keycloak/
    └── import/                  # Keycloak configuration blueprint for auto-import
```

---

## ⚙️ Prerequisites

Before starting, ensure you have the following installed:
* [Docker & Docker Compose](https://docs.docker.com/get-docker/)
* [Node.js (v22 or higher)](https://nodejs.org/)

---

## 🏁 Getting Started (Local Development)

### 1. Configure the Environment
Clone the `.env.example` file and create a `.env` file at the root:
```bash
cp .env.example .env
```
Ensure your environment contains correct administrative configurations:
```env
PORT=3000
NODE_ENV=development
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=AdminSuperSecretPassword123!
```

### 2. Boot Up Keycloak & Postgres Database
This project includes a pre-configured Docker Compose file that spins up Keycloak together with its Postgres database backend and automatically imports the `aku-realm` structure:
```bash
docker compose up -d
```
Verify the services are running:
* **Keycloak Portal**: `http://localhost:8080`
* **Admin console login**: `admin` / `AdminSuperSecretPassword123!`

### 3. Install Dependencies & Start the Application
Install all npm packages:
```bash
npm install
```

Start the application in development mode (which launches Express serving both the React app and API endpoints):
```bash
npm run dev
```
Open your browser to **`http://localhost:3000`**.

---

## 🛡️ Keycloak Realm & Identity Configuration

This portal relies on **Keycloak's OpenID Connect Realm (`aku-realm`)** to manage directory identities and roles.

### User Group & Role Setup Strategy
For a simple, highly maintainable integration, structure your Keycloak directory as follows:

1. **Realm Roles**  
   * Create a realm role named `Service Desk` for administrative owners.  
   * Users/Groups assigned this role will obtain full system permissions (logging, deleting, log viewing, and approval).
2. **Groups**  
   * Create groups matching the respective technical teams (e.g., `Level 3 / AKU MIS`, `Networks`, `SysOps`).  
   * By giving the respective groups the required realm roles, users within those groups will inherit those permissions automatically.
3. **SSO Sign-In**  
   * The portal implements the standard **OIDC Authorization Code Flow with PKCE**, ensuring password hashes are never exposed directly to the client browser.  
   * In a corporate setup, Keycloak can be connected directly to your institutional LDAP/Active Directory forest as a User Federation provider.

---

## 📦 Production Build & Deployment

To compile the application for a highly performant, production-ready Cloud Run or Kubernetes container:

1. **Build the Assets**
   ```bash
   npm run build
   ```
   This compiles the React single-page app via Vite into static files under `dist/` and bundles the TypeScript `server.ts` into a standalone, single-file CommonJS script `dist/server.cjs` using `esbuild`.

2. **Start the Production Server**
   ```bash
   npm run start
   ```
   This runs the optimized Express server on port `3000`.

---

## 📝 Compliance & Maintenance
This portal has been developed according to Aga Khan University's core enterprise standards. Security compliance audits should regularly check the `./logs/security.log` files for unauthorized access requests.

For technical inquiries or system configuration updates, contact the primary system administrator (**Brian Ogada**).
