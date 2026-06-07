# CareConnect Architecture

## Overview

CareConnect is a small server-rendered healthcare booking site with a Node.js backend and static frontend pages. The system centers on live appointment slots, appointment creation, cancellation, and practice settings.

## Layers

### Frontend

- Static pages: `index.html`, `booking.html`, `cancel.html`, `about.html`, `services.html`, `contact.html`, `prescriptions.html`, `admin.html`
- Shared client logic: `script.js`, `admin.js`
- Shared styling: `styles.css`

The frontend:

- Loads live availability from the API
- Lets patients book appointments in a step-by-step flow
- Lets patients cancel appointments
- Shows current slot availability and the next available time
- Supports admin updates for slot capacity and booking windows

### Backend

- `server.js` runs an Express application
- Serves static files
- Exposes the booking and availability APIs
- Persists appointments and settings to JSON files in `data/`
- Sends confirmation and cancellation emails

## Data Model

### `data/appointment_slots.json`

Generated slot table used by the live availability system.

Typical fields:

- `slot_id`
- `date`
- `start_time`
- `end_time`
- `capacity`
- `practitioner_id`
- `appointment_type`

### `data/appointments.json`

Stores booking records and cancellations.

Typical fields:

- `id`
- `appointment_id`
- `slot_id`
- `patient_id`
- `name`
- `email`
- `type`
- `format`
- `date`
- `time`
- `status`
- `confirmationCode`
- `submittedAt`
- `canceledAt`
- `history`

### `data/settings.json`

Stores booking rules.

Typical fields:

- `slotCapacity`
- `bookingWindowDays`
- `slotTimes`

## Main APIs

### `GET /api/availability`

Returns live availability, including:

- current slots
- booked count
- remaining capacity
- available/full/unavailable state
- next available slot

Optional query:

- `date=YYYY-MM-DD`

### `POST /api/appointments`

Creates a new appointment if the selected slot has capacity.

### `POST /api/appointments/cancel`

Cancels an appointment and releases its slot.

### `PUT /api/admin/settings`

Updates slot capacity, booking window, and configured slot times.

### `POST /api/portal/login`

Returns a patient appointment view for portal access.

### `POST /api/portal/appointments/:id/cancel`

Cancels a portal appointment after credential validation.

## Booking Flow

1. The UI requests availability from the backend.
2. The backend counts existing active bookings per slot.
3. The UI shows available, full, and unavailable slots.
4. A patient submits a booking.
5. The server stores the appointment and sends confirmation email.
6. The availability API refreshes and reflects the new capacity.
7. If the patient cancels, the server marks the appointment canceled and frees the slot.

## Cancellation Rule

Online cancellation is blocked inside 24 hours of the appointment start time.

If the appointment is too close, the UI and API direct the user to call reception.

## Deployment Notes

- Works locally with `node server.js` or `npm start`
- Requires Node.js and dependencies installed from `package.json`
- Email delivery is optional and controlled by environment variables
- Data is file-based for simplicity, so the app is easy to run without a database server
