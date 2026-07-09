# Aga Khan University Hospital — P1 Incident Management Portal
## Enterprise RESTful API Reference Guide

This document maps the complete production-hardened REST API implementation for the **Aga Khan University Hospital (AKU) P1 Incident Management Portal**. All endpoints are mapped inside the high-integrity Express server and protected by enterprise security rules.

---

### Global Configuration & Security Features

1. **Protocol Protection**: SSL/TLS requirement (enforced via Helmet headers).
2. **Standard Base URL Paths**: `/api/*`
3. **Authentication Scheme**: JSON Web Tokens (JWT) inside secure secure cookies (`token`).
4. **Rate Limiting**:
   - Authentication gateway: Max 5 attempts per 10 minutes per IP.
   - Core transactional portals (creating/updating incidents): Max 50 requests per hour per IP.
   - General telemetry: Max 150 requests per 15 minutes per IP.

---

### Request & Response Protocols

#### Content Type
All request bodies must be submitted as valid JSON:
- `Content-Type: application/json`

#### Response Envelope (JSON standard)
Successful responses compile data directly or enclosed under logical labels.

#### Standard Error Response Structure
```json
{
  "error": "Error descriptor",
  "details": "Helpful trace suggestions or missing params descriptions"
}
```

---

### Endpoint Reference Matrix

---

#### 1. System Health Telemetry Gate
Check system runtime state and active database connectivity.

* **URL Path**: `/api/health`
* **HTTP Method**: `GET`
* **Authentication Required**: `No`
* **Rate Limits**: General Limit
* **HTTP Status Codes**:
  - `200 OK`
* **Response Body Example**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-06-22T11:00:00.000Z",
    "db": "connected"
  }
  ```

---

#### 2. Directory Authentication SSO Handshake
Attempts directory verification on raw sAMAccountName matches and hashes the corporate password securely to issue JWT cookies.

* **URL Path**: `/api/auth/login`
* **HTTP Method**: `POST`
* **Authentication Required**: `No` (Anonymous)
* **Rate Limits**: Auth Gate limiter (5 attempts / 10 minutes)
* **Request Headers**:
  - `Content-Type: application/json`
* **Request Body Fields**:
  - `username` (string, required): Corresponds to Active Directory sAMAccountName.
  - `password` (string, required): Password hash. Default baseline is `Password123` for seeded personnel roster.
* **Response Body Example (`200 OK`)**:
  ```json
  {
    "message": "Authenticated successfully",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30...",
    "user": {
      "samAccountName": "bogada",
      "cn": "Brian Ogada",
      "mail": "ogada.brian@aku.edu",
      "adGroup": "CN=AKU-ICT-ServiceDesk,OU=Groups,DC=aku,DC=local",
      "simulatedRights": "Service Desk Owner (Full System Permissions)",
      "role": "Service Desk",
      "supportGroup": "Level 1/AKU Service Desk",
      "isActive": true
    }
  }
  ```
* **Error Response Codes**:
  - `400 Bad Request`: Mandatory parameters are missing or values are empty.
  - `401 Unauthorized`: Invalid credentials, or the targeted actor has been marked suspended or inoperable.

---

#### 3. Self-Service Portal Access Registration
Permits local corporate users to file tickets to join the portal. Once filed, requests land in the Service Desk Owner's Access Settings panel for group routing approval.

* **URL Path**: `/api/auth/register`
* **HTTP Method**: `POST`
* **Authentication Required**: `No`
* **Rate Limits**: Auth Gate limiter
* **Request Body Fields**:
  - `fullName` (string, required): Employee's legal full name. Minimum length: 3 characters.
  - `email` (string, required): Must strictly end with authorized corporate domain `@aku.edu`.
  - `username` (string, required): Corporate identifier (sAMAccountName matching). No spaces allowed.
  - `proposedRole` (string, required): Must be strictly `'Service Desk'` or `'Support Group User'`.
  - `proposedGroup` (string, required): Targeted support queue (e.g., `'Level 3/AKU PACS'`).
* **Response Body Example (`201 Created`)**:
  ```json
  {
    "message": "Access request successfully registered",
    "request": {
      "id": "req-1719393848",
      "fullName": "Zunaira Jafri",
      "email": "zunaira.jafri@aku.edu",
      "username": "zjafri",
      "proposedRole": "Support Group User",
      "proposedGroup": "Level 1/AKU Service Desk",
      "requestDate": "2026-06-22T11:00:00.000Z",
      "status": "Pending"
    }
  }
  ```
* **Error Response Codes**:
  - `400 Bad Request`: Domain check failed, or password matches are structurally invalid.

---

#### 4. Active OIDC Identity Query (WHOAMI)
Inquires about the active, authenticated user's profile and validates active JWT sessions.

* **URL Path**: `/api/auth/me`
* **HTTP Method**: `GET`
* **Authentication Required**: `Yes` (Injected JWT token from cookie or Auth Bearer header)
* **Response Body Example**:
  ```json
  {
    "samAccountName": "bogada",
    "cn": "Brian Ogada",
    "mail": "ogada.brian@aku.edu",
    "role": "Service Desk",
    "supportGroup": "Level 1/AKU Service Desk"
  }
  ```
* **Error Response Codes**:
  - `401 Unauthorized`: Active credential signature has expired or is invalid.

---

#### 5. List Active Telemetry Incidents
Returns all verified P1 Tickets safely logged in the secure JSON-based persistent database.

* **URL Path**: `/api/tickets`
* **HTTP Method**: `GET`
* **Authentication Required**: `Yes`
* **Response Body Example**:
  ```json
  [
    {
      "id": "p1-rec-171",
      "jiraId": "SD-91280",
      "summary": "AKU Core ERP Outage",
      "serviceAffected": "ERP Portal",
      "supportGroup": "Level 2/AKU Application Support",
      "status": "Pending Resolution Details",
      "createdAt": "2026-06-22T10:00:00.000Z"
    }
  ]
  ```

---

#### 6. Register a New P1 incident ticket
Initiates a high-integrity P1 Incident ticket in the registry.

* **URL Path**: `/api/tickets`
* **HTTP Method**: `POST`
* **Authentication Required**: `Yes` (Service Desk role strictly enforced)
* **Request Body Fields**:
  - `jiraId` (string, required): Format must match `^[A-Z1-9]+-\\d+$` (e.g. `SD-10492`).
  - `summary` (string, required): Short descriptive summary (min length 10).
  - `serviceAffected` (string, required): Enterprise application impacted.
  - `supportGroup` (string, required): Assignee support group payload.
* **Response Body Example (`221 Created`)**:
  ```json
  {
    "id": "p1-rec-1718392",
    "jiraId": "SD-10492",
    "summary": "AKU Core ERP Outage",
    "serviceAffected": "ERP Portal",
    "supportGroup": "Level 2/AKU Application Support",
    "status": "Pending Resolution Details"
  }
  ```

---

#### 7. Resolve Incident or Submit Audit Details
Allows resolving Support Groups or Service Desk operators to record ticket actions, outage timings, and submit completed resolutions.

* **URL Path**: `/api/tickets/:id`
* **HTTP Method**: `PUT`
* **Authentication Required**: `Yes`
* **Request Body Fields**:
  - `resolutionDescription` (string, required): Root cause analysis and resolution description.
  - `outageStart` (string, required): ISO Outage timestamp.
  - `outageEnd` (string, required): ISO Restoration completion timestamp.
  - `comments` (string, optional): Supplementary comments.

---

#### 8. Administrative Roster Management
- **Add User**: `POST /api/roster` (Admin only)
- **Delete User**: `DELETE /api/roster/:username` (Admin only)
- **Approve Request**: `POST /api/requests/:id/approve` (Admin only)
- **Reject Request**: `POST /api/requests/:id/reject` (Admin only)

All errors trigger standard structured JSON returns and audit logs on server consoles.
