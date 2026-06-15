# CareConnect Product Requirements Document (PRD)

## 1. Document Control
- Product: CareConnect GP Practice Platform
- Version: 2.0
- Status: Draft for implementation alignment
- Last Updated: 2026-06-15
- Owner: Product and Engineering

## 2. Product Vision
CareConnect provides a dependable digital front door for GP practices by combining patient self-service booking with staff operational tooling and configurable admin controls.

## 3. Problem Statement
GP practices often rely on fragmented systems and manual processes for appointments, cancellations, and patient communication, resulting in avoidable scheduling conflicts, delayed responses, and higher reception workload.

## 4. Goals and Objectives
### Business Goals
- Reduce avoidable reception call volume for booking and cancellation.
- Increase successful digital appointment completion.
- Improve operational visibility for staff and admin users.

### Product Goals
- Enable patients to book, cancel, and request prescriptions quickly.
- Provide secure role-based access for staff workflows.
- Allow admins to control booking windows, slot capacity, and schedules without code changes.

### Success Criteria
- Measurable increase in completed online bookings.
- Reduced slot overbooking events.
- Consistent usage of portal dashboards by staff.

## 5. Personas
### Patient
- Needs simple navigation and fast booking outcomes.
- Expects confirmation details and easy cancellation.

### Reception and Clinical Staff
- Needs daily workload visibility and patient context.
- Expects reliable filtering, scheduling, and notification tools.

### Practice Administrator
- Needs operational control of booking policies.
- Expects secure settings management and clear impact on availability.

## 6. Scope
### In Scope
- Public website pages for discovery and booking.
- Appointment booking with live slot availability.
- Appointment cancellation and slot release.
- Prescription request submission.
- Staff portal authentication and dashboard functions.
- Admin configuration for booking behavior.

### Out of Scope (Current Phase)
- Native mobile apps.
- External EHR integration.
- Multi-practice multi-tenant architecture.
- Billing and payment workflows.

## 7. User Journeys
### Journey A: Patient Booking
1. Patient lands on the public site.
2. Patient opens booking page and selects an available slot.
3. Patient enters required details and submits request.
4. System returns confirmation code and persists booking.
5. Optional confirmation email is sent when SMTP is configured.

### Journey B: Patient Cancellation
1. Patient opens cancellation page.
2. Patient submits cancellation with reference details.
3. System marks appointment as canceled.
4. Slot becomes available for future bookings.

### Journey C: Staff Operations
1. Staff authenticates through portal login.
2. Staff reviews dashboard metrics and appointments.
3. Staff searches patient records and schedules follow-ups.
4. Staff sends notifications where required.

### Journey D: Admin Configuration
1. Admin opens settings panel.
2. Admin adjusts slot capacity, booking window, and slot times.
3. System validates and saves configuration.
4. Updated settings affect generated availability.

## 8. Functional Requirements
### FR-1 Public Site Access
- The system shall serve public pages and static assets from a stable web path.
- The system shall display booking actions on public pages.

### FR-2 Slot Availability
- The system shall expose slot availability by date/time.
- The system shall prevent booking into full slots.

### FR-3 Appointment Booking
- The system shall create an appointment record with unique reference.
- The system shall return booking confirmation to the client.

### FR-4 Appointment Cancellation
- The system shall allow valid appointment cancellation requests.
- The system shall release canceled capacity back into availability.

### FR-5 Prescription Requests
- The system shall capture and store prescription requests.

### FR-6 Authentication and Authorization
- The system shall issue JWT tokens for authenticated portal users.
- The system shall enforce role-based access on protected routes.

### FR-7 Admin Settings
- The system shall allow admin updates to booking window, slot capacity, and slot times.
- The system shall validate settings ranges and formats before save.

### FR-8 Staff Portal Operations
- The system shall provide appointment, patient, and notification views in the portal.
- The system shall support search and basic scheduling actions.

## 9. Non-Functional Requirements
### Performance
- Typical page interactions should complete within acceptable user-perceived latency under normal local load.

### Reliability
- Invalid or malformed request payloads should not crash the server.
- Data writes should remain consistent with JSON schema expectations.

### Security
- Passwords must be hashed before persistent storage.
- Protected API routes must require valid authentication tokens.

### Usability
- Core user journeys must be usable on desktop and mobile layouts.

### Maintainability
- Project structure must remain clearly segmented by public assets, data, docs, and source scaffolding.

## 10. User Stories and Acceptance Criteria
### Epic E1: Patient Self-Service
#### US-1 Book Appointment
As a patient, I want to choose a date and time so I can secure a GP appointment online.

Acceptance Criteria:
- Given available slots, when I submit valid details, then a booking confirmation is returned.
- Given a full slot, when I attempt to book it, then the request is rejected with a clear message.

#### US-2 Cancel Appointment
As a patient, I want to cancel an appointment so another patient can use the slot.

Acceptance Criteria:
- Given a valid booking reference, when I cancel, then the appointment status becomes canceled.
- Given a canceled appointment, when availability is reloaded, then capacity reflects the released slot.

### Epic E2: Staff Productivity
#### US-3 View Daily Operations
As a staff user, I want dashboard visibility so I can prioritize patient and scheduling tasks.

Acceptance Criteria:
- Given a valid portal session, when I open the dashboard, then I can view appointment and notification summaries.

#### US-4 Manage Patients
As a staff user, I want patient search and details so I can support appointments efficiently.

Acceptance Criteria:
- Given existing patient records, when I search by text, then matching records are returned.

### Epic E3: Admin Control
#### US-5 Configure Booking Policy
As an admin, I want to adjust booking capacity and windows so system behavior matches practice policy.

Acceptance Criteria:
- Given valid settings inputs, when I save changes, then settings persist and are reflected in subsequent slot generation.
- Given invalid settings values, when I submit changes, then validation errors are returned and no update is saved.

## 11. Milestones
### M1: Baseline Platform (Completed)
- Public pages, server, booking/cancel flows, and initial portal/admin pages.

### M2: Documentation and Structure (Completed)
- GitHub-ready structure with PRD, roadmap, specification, docs, and src scaffold.

### M3: Quality Expansion (Planned)
- Broader automated tests for API and workflows.
- CI checks for test reliability.

### M4: Data Layer Upgrade (Planned)
- Migration from JSON files to production-grade database.

## 12. KPIs
- Booking completion rate: completed bookings / booking attempts.
- Cancellation processing accuracy: successful cancellations / cancellation requests.
- Slot utilization rate: booked slots / total available slots.
- Staff portal adoption: active staff sessions per week.
- Operational errors: number of booking conflicts or failed writes.

## 13. Risks and Mitigations
- Risk: JSON file persistence does not scale for concurrent production usage.
	Mitigation: Plan migration to transactional database in M4.

- Risk: Insufficient automated tests around API edge cases.
	Mitigation: Expand Jest/API coverage in M3 with regression scenarios.

- Risk: Authentication secret misconfiguration in deployment.
	Mitigation: Enforce environment configuration checks and secure secret management.

## 14. Dependencies
- Node.js runtime and npm packages.
- SMTP provider configuration for production email delivery.
- Practice-defined booking policy inputs (capacity, window, slot times).

## 15. Open Questions
- What are target SLA expectations for booking and cancellation APIs?
- Which audit fields are mandatory for clinical compliance in production?
- What integration priority should be assigned to EHR interoperability?
