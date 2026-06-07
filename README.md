# Care-Connect-Medical-Practice

CareConnect Medical Practice Website

Type: Responsive business website for healthcare practice

Technologies: HTML5, CSS3, JavaScript, Node.js, Express

## Booking System

The appointment flow now uses live server-backed slot availability.

The booking, confirmation, and cancellation workflow is served from the dedicated `booking.html` page.

Booking rules are configurable from both:

- Admin UI page: `admin.html`
- Admin settings file: `data/settings.json`

- Available dates and times are loaded from the server.
- Each slot is capped and automatically locks when capacity is reached.
- Confirmed bookings receive a confirmation code.
- Canceling an appointment releases that slot back into availability.
- Confirmation emails are sent when SMTP is configured. Without SMTP credentials, the app automatically uses a test mailbox service for development.

## Run Locally

1. Install dependencies with `npm.cmd install` on Windows.
2. Start the server with `node server.js`.
3. Open `http://localhost:3000`.

## Optional Email Configuration

Set these environment variables to enable real confirmation emails:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`

You can place these in a `.env` file (see `.env.example`) and restart the server.

Without those variables, booking and cancellation still work and email messages are generated through the automatic test mailbox service.
