# CareConnect Product Requirements Document (PRD)

## 1. Product Overview
CareConnect is a healthcare web platform for GP practice operations, including appointment booking, cancellation, prescriptions, and staff portal management.

## 2. Goals
- Provide a reliable booking and cancellation experience for patients.
- Give staff a secure portal for patient and appointment administration.
- Keep scheduling rules configurable by admins.

## 3. Primary Users
- Patients booking and managing appointments.
- Reception and clinical staff using portal tools.
- Admin users configuring booking rules and operational settings.

## 4. Core Features
- Live appointment slot availability.
- Booking confirmation and cancellation handling.
- Prescription request capture.
- Staff portal authentication and dashboards.
- Admin settings for slot capacity, booking window, and slot times.

## 5. Non-Functional Requirements
- Responsive UI for desktop and mobile.
- JSON-backed persistence for local development.
- Basic test coverage with Jest.

## 6. Success Metrics
- Booking completion rate.
- Cancellation handling accuracy.
- Portal usage by staff.
- Reduction of scheduling conflicts.

## 7. Constraints
- Current stack is Node.js + Express with static frontend pages.
- Local JSON storage is used instead of production database.

## 8. Out of Scope (Current Phase)
- Native mobile app.
- Full EHR integration.
- Multi-tenant clinic support.
