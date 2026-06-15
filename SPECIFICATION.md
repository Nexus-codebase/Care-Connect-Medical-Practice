# CareConnect Technical Specification

## 1. Document Metadata
- Product: CareConnect GP Practice Platform
- Version: 2.0
- Last Updated: 2026-06-15
- Status: Active engineering specification

## 2. System Overview
CareConnect is a web platform supporting patient appointment workflows and internal staff operations.

Core capabilities:
- Public appointment booking and cancellation.
- Prescription request capture.
- Staff portal workflows and notifications.
- Admin configuration of booking rules.

## 3. Architecture
### 3.1 Runtime Components
- Backend API: Node.js + Express application in server.js.
- Frontend: static HTML, CSS, JavaScript in public.
- Data persistence: JSON files in data (development/local mode).
- Documentation and planning artifacts in docs and root markdown files.

### 3.2 Logical Layers
- Presentation layer: public pages and browser-side scripts.
- Service/API layer: Express endpoints under /api.
- Persistence layer: file-based JSON read/write operations.

### 3.3 Static Asset Hosting
- Static assets are served from public.
- Data directory is exposed for read access where required by frontend data fetches.

## 4. Environment and Configuration
### 4.1 Runtime Configuration
- PORT: server port (default 3000).
- AUTH_SECRET: JWT signing secret.
- SLOT_CAPACITY: default appointment slot capacity.
- BOOKING_WINDOW_DAYS: default booking horizon.
- SLOT_TIMES: comma-separated slot times in HH:MM format.

### 4.2 Email Configuration
- SMTP_HOST
- SMTP_PORT
- SMTP_SECURE
- SMTP_USER
- SMTP_PASS
- MAIL_FROM

Behavior:
- If SMTP config is missing, the system falls back to non-production email behavior.

## 5. API Surface
### 5.1 Endpoint Groups
- Public booking/cancellation/prescription APIs.
- Admin settings and operational control APIs.
- System auth APIs for portal sessions.
- Portal APIs for patients, appointments, and notifications.

### 5.2 API Conventions
- Content type: application/json.
- Success responses include operation status and payload.
- Error responses include clear message fields for client display.

### 5.3 Auth Model
- Login/signup routes issue JWTs for authenticated users.
- Protected routes require Bearer token.
- Role checks enforce access controls for sensitive actions.

## 6. Data Model
### 6.1 Primary Stores
- data/appointments.json: appointment records and status values.
- data/appointment_slots.json: generated slot inventory.
- data/settings.json: booking policy settings.

### 6.2 Supporting Stores
- data/users.json: portal/system users.
- data/patients.json: patient details and profile attributes.
- data/notifications.json: notification payloads and read state.
- data/prescriptions.json: prescription request entries.

### 6.3 Data Integrity Rules
- Appointment status transitions must be controlled (for example active to canceled).
- Slot capacity must be positive and bounded.
- Booking window days must be within configured validation range.
- Slot times must conform to HH:MM format.

## 7. Security Requirements
- Passwords must be stored as hashes using bcryptjs.
- JWT validation required for protected routes.
- Least-privilege route access enforced via role middleware.
- Secrets must be provided via environment variables in non-local deployments.

## 8. Non-Functional Requirements
### 8.1 Performance
- Standard booking and portal interactions should remain responsive under normal operational load.

### 8.2 Reliability
- API errors must return structured JSON messages.
- Malformed inputs must be validated and rejected safely.

### 8.3 Maintainability
- Repository structure must keep public assets, docs, scripts, and source scaffolding clearly separated.
- Shared logic should be modularized under src as architecture evolves.

### 8.4 Compatibility
- Frontend must function across modern desktop and mobile browsers.

## 9. Testing Strategy
### 9.1 Current Baseline
- Jest configured through jest.config.js.
- Baseline sample test suite under __tests__.

### 9.2 Required Expansion
- Add API integration tests for booking, cancellation, auth, and settings.
- Add negative-path and validation-edge tests.
- Integrate automated test execution in CI pipeline.

## 10. Observability and Operations
### 10.1 Logging
- Capture API errors and high-value operational events.
- Add traceable logs for admin setting changes and appointment mutations.

### 10.2 Operational Runbook Essentials
- Startup checks for required environment variables.
- Health verification process for booking and portal routes.
- Backup and restore strategy for data files until database migration.

## 11. Deployment Specification
### 11.1 Build and Run
- Install dependencies: npm install.
- Start server: npm start.

### 11.2 Release Requirements
- Test suite passes on target branch.
- Environment configuration validated.
- Rollback approach documented for production releases.

## 12. Technical Debt and Planned Evolution
- Replace JSON persistence with managed database (planned roadmap phase).
- Introduce data access abstraction layer.
- Expand src to house modular components and services.

## 13. Traceability to Product Requirements
- Booking and cancellation requirements map to public workflow APIs and data stores.
- Staff productivity requirements map to portal endpoints and dashboard views.
- Admin control requirements map to settings APIs and slot generation behavior.

## 14. Change Log
- 2026-06-15: Expanded specification into formal architecture, API, data, security, operations, and traceability format.
