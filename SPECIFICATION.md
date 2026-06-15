# CareConnect Technical Specification

## 1. Architecture
- Backend: Node.js + Express API server.
- Frontend: Static HTML/CSS/JS served from public.
- Data store: JSON files under data for local/dev use.

## 2. Runtime
- Default server port: 3000 (configurable via PORT).
- Static assets served from public.
- API endpoints mounted under /api.

## 3. Data Contracts
- appointments.json: Appointment records and statuses.
- appointment_slots.json: Generated slot schedule data.
- settings.json: Booking configuration values.
- users.json, patients.json, notifications.json, prescriptions.json as supporting stores.

## 4. Security
- JWT-based portal/system authentication.
- Password hashing through bcryptjs.
- Protected routes enforced by role middleware.

## 5. Testing
- Jest test runner configured via jest.config.js.
- Baseline sample tests in __tests__.

## 6. Deployment Notes
- Install dependencies with npm install.
- Start with npm start.
- Configure SMTP variables for live email delivery.
