# CareConnect GP Practice

CareConnect is a responsive GP practice website with a server-backed appointment flow, live slot availability, booking confirmation, cancellation handling, and basic admin controls.

## Project Structure

```text
careconnect/
├── server.js
├── README.md
├── PRD.md
├── ROADMAP.md
├── SPECIFICATION.md
├── package.json
├── jest.config.js
├── public/
│   ├── *.html
│   ├── styles.css
│   ├── script.js
│   ├── admin.js
│   ├── portal.js
│   ├── portal-auth.js
│   ├── site.webmanifest
│   └── images/
├── scripts/
│   └── care_connect_flow.js
├── docs/
│   └── architecture.md
├── src/
│   ├── README.md
│   └── components/
│       └── README.md
├── data/
│   ├── appointments.json
│   ├── appointment_slots.json
│   └── settings.json
└── __tests__/
```

### Key files

- `public/index.html`: Home page with live appointment availability.
- `public/booking.html`: Booking workflow and live slot selector.
- `public/cancel.html`: Appointment cancellation page and call-reception guidance.
- `public/admin.html` and `public/admin.js`: Admin settings and booking controls.
- `server.js`: Express server, availability API, appointment storage, and email flow.
- `public/script.js`: Shared frontend logic for booking, cancellation, and live updates.
- `public/styles.css`: Shared site styling.
- `data/appointments.json`: Stored appointments and cancellations.
- `data/appointment_slots.json`: Generated live slot table used by the API.
- `data/settings.json`: Slot capacity, booking window, and slot times.

## Booking System

The appointment flow uses live server-backed slot availability.

- Available dates and times are loaded from the server.
- Each slot has a fixed capacity and locks when full.
- Bookings receive a confirmation code.
- Cancellations release the slot back into availability.
- Confirmation emails are sent when SMTP is configured.

## Run Locally

1. Install dependencies with `npm.cmd install` on Windows.
2. Start the server with `node server.js` or `npm start`.
3. Open `http://localhost:3000`.

## Environment Variables

Set these in a `.env` file to enable real email delivery:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`

Without those variables, booking and cancellation still work and email messages are generated through the test mailbox service.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the system design, API endpoints, data model, and booking flow.
