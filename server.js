const express = require("express");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "appointments.json");
const SETTINGS_FILE = path.join(__dirname, "data", "settings.json");
const DEFAULT_SLOT_TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"];
const DEFAULT_SETTINGS = {
  slotCapacity: Number(process.env.SLOT_CAPACITY || 2),
  bookingWindowDays: Number(process.env.BOOKING_WINDOW_DAYS || 14),
  slotTimes: process.env.SLOT_TIMES
    ? process.env.SLOT_TIMES.split(",").map((entry) => entry.trim()).filter(Boolean)
    : DEFAULT_SLOT_TIMES,
};
const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

app.use(express.json());
app.use(express.static(__dirname));

function readStore() {
  if (!fs.existsSync(DATA_FILE)) {
    return { appointments: [] };
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw.trim()) {
      return { appointments: [] };
    }

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return { appointments: parsed };
    }

    if (parsed && Array.isArray(parsed.appointments)) {
      return parsed;
    }
  } catch {
    return { appointments: [] };
  }

  return { appointments: [] };
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function isValidTimeValue(time) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(time || ""));
}

function normalizeSettings(input) {
  const candidate = input || {};
  const slotCapacity = Number(candidate.slotCapacity);
  const bookingWindowDays = Number(candidate.bookingWindowDays);
  const slotTimesRaw = Array.isArray(candidate.slotTimes)
    ? candidate.slotTimes
    : DEFAULT_SETTINGS.slotTimes;

  const slotTimes = slotTimesRaw
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .filter((entry, index, array) => array.indexOf(entry) === index)
    .sort();

  if (!Number.isFinite(slotCapacity) || slotCapacity < 1 || slotCapacity > 20) {
    return { ok: false, message: "slotCapacity must be between 1 and 20." };
  }

  if (!Number.isFinite(bookingWindowDays) || bookingWindowDays < 1 || bookingWindowDays > 90) {
    return { ok: false, message: "bookingWindowDays must be between 1 and 90." };
  }

  if (!slotTimes.length || slotTimes.some((entry) => !isValidTimeValue(entry))) {
    return { ok: false, message: "slotTimes must include one or more times in HH:MM format." };
  }

  return {
    ok: true,
    settings: {
      slotCapacity,
      bookingWindowDays,
      slotTimes,
    },
  };
}

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    const fallback = normalizeSettings(DEFAULT_SETTINGS);
    if (fallback.ok) {
      fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(fallback.settings, null, 2)}\n`, "utf8");
      return fallback.settings;
    }
  }

  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = normalizeSettings(parsed);
    if (normalized.ok) {
      return normalized.settings;
    }
  } catch {
    // Fall through to defaults
  }

  const fallback = normalizeSettings(DEFAULT_SETTINGS);
  return fallback.ok ? fallback.settings : { slotCapacity: 2, bookingWindowDays: 14, slotTimes: DEFAULT_SLOT_TIMES };
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDisplayTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const sample = new Date(Date.UTC(2026, 0, 1, hours, minutes));
  return DISPLAY_TIME_FORMATTER.format(sample);
}

function buildSlots(appointments, settings) {
  const activeCounts = new Map();

  appointments
    .filter((appointment) => appointment.status !== "canceled")
    .forEach((appointment) => {
      const key = `${appointment.date}|${appointment.time}`;
      activeCounts.set(key, (activeCounts.get(key) || 0) + 1);
    });

  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < settings.bookingWindowDays; offset += 1) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + offset);

    const dateValue = toIsoDate(currentDate);
    const slots = settings.slotTimes.map((time) => {
      const key = `${dateValue}|${time}`;
      const booked = activeCounts.get(key) || 0;
      const remaining = Math.max(settings.slotCapacity - booked, 0);

      return {
        time,
        label: toDisplayTime(time),
        remaining,
        available: remaining > 0,
      };
    });

    dates.push({
      date: dateValue,
      displayDate: DISPLAY_DATE_FORMATTER.format(currentDate),
      slots,
    });
  }

  return dates;
}

function findSlotAvailability(appointments, date, time) {
  const settings = readSettings();
  const dates = buildSlots(appointments, settings);
  const day = dates.find((slotDate) => slotDate.date === date);
  if (!day) {
    return null;
  }

  return day.slots.find((slot) => slot.time === time) || null;
}

function createConfirmationCode() {
  return `CC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

async function sendConfirmationEmail(appointment, mode) {
  const from = process.env.MAIL_FROM || "careconnect@example.com";
  const subject =
    mode === "canceled"
      ? `Appointment canceled: ${appointment.displayDate} at ${appointment.displayTime}`
      : `Appointment confirmed: ${appointment.displayDate} at ${appointment.displayTime}`;
  const text =
    mode === "canceled"
      ? [
          `Hello ${appointment.name},`,
          "",
          `Your appointment on ${appointment.displayDate} at ${appointment.displayTime} has been canceled.`,
          `Confirmation code: ${appointment.confirmationCode}`,
          "The slot has been released for other patients.",
        ].join("\n")
      : [
          `Hello ${appointment.name},`,
          "",
          `Your ${appointment.type} appointment is confirmed for ${appointment.displayDate} at ${appointment.displayTime}.`,
          `Format: ${appointment.format}`,
          `Confirmation code: ${appointment.confirmationCode}`,
          "If you need to cancel, use the cancellation form with your email address and confirmation code.",
        ].join("\n");

  if (!process.env.SMTP_HOST) {
    console.log(`[email simulation] To: ${appointment.email}\nSubject: ${subject}\n\n${text}`);
    return { delivered: false, simulated: true };
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });

  await transport.sendMail({
    from,
    to: appointment.email,
    subject,
    text,
  });

  return { delivered: true, simulated: false };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/admin/settings", (_req, res) => {
  const settings = readSettings();
  res.json({
    ok: true,
    settings,
    email: {
      smtpConfigured: Boolean(process.env.SMTP_HOST),
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      userConfigured: Boolean(process.env.SMTP_USER),
      from: process.env.MAIL_FROM || "careconnect@example.com",
    },
  });
});

app.put("/api/admin/settings", (req, res) => {
  const candidate = {
    slotCapacity: req.body.slotCapacity,
    bookingWindowDays: req.body.bookingWindowDays,
    slotTimes: Array.isArray(req.body.slotTimes)
      ? req.body.slotTimes
      : String(req.body.slotTimes || "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
  };

  const normalized = normalizeSettings(candidate);
  if (!normalized.ok) {
    return res.status(400).json({ ok: false, message: normalized.message });
  }

  writeSettings(normalized.settings);
  return res.json({ ok: true, message: "Booking settings updated.", settings: normalized.settings });
});

app.get("/api/availability", (_req, res) => {
  const store = readStore();
  const settings = readSettings();
  const dates = buildSlots(store.appointments, settings);
  const nextAvailable = dates
    .flatMap((slotDate) =>
      slotDate.slots
        .filter((slot) => slot.available)
        .map((slot) => ({
          date: slotDate.date,
          displayDate: slotDate.displayDate,
          time: slot.time,
          displayTime: slot.label,
          remaining: slot.remaining,
        }))
    )
    .at(0);

  res.json({
    ok: true,
    slotCapacity: settings.slotCapacity,
    bookingWindowDays: settings.bookingWindowDays,
    nextAvailable,
    dates,
  });
});

app.post("/api/appointments", (req, res) => {
  const { name, email, type, format, notes, date, time } = req.body;

  if (!name || !email || !type || !format || !date || !time) {
    return res.status(400).json({
      ok: false,
      message: "name, email, type, format, date, and time are required",
    });
  }

  const store = readStore();
  const settings = readSettings();
  const slot = findSlotAvailability(store.appointments, date, time);

  if (!slot) {
    return res.status(400).json({
      ok: false,
      message: "Selected slot is not valid.",
    });
  }

  if (!slot.available) {
    return res.status(409).json({
      ok: false,
      message: "Selected slot is no longer available. Please choose another time.",
    });
  }

  const selectedDate = buildSlots(store.appointments, settings).find((slotDate) => slotDate.date === date);
  const displayDate = selectedDate ? selectedDate.displayDate : date;
  const displayTime = slot.label;

  const appointment = {
    id: Date.now(),
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    type: String(type).trim(),
    format: String(format).trim(),
    notes: notes || "",
    date,
    time,
    displayDate,
    displayTime,
    status: "confirmed",
    confirmationCode: createConfirmationCode(),
    submittedAt: new Date().toISOString(),
  };

  store.appointments.push(appointment);
  writeStore(store);

  return sendConfirmationEmail(appointment, "confirmed")
    .then((emailStatus) => {
      res.status(201).json({
        ok: true,
        message: "Appointment confirmed",
        emailStatus,
        appointment,
      });
    })
    .catch(() => {
      res.status(201).json({
        ok: true,
        message: "Appointment confirmed, but confirmation email could not be sent.",
        emailStatus: { delivered: false, simulated: false },
        appointment,
      });
    });
});

app.post("/api/appointments/cancel", (req, res) => {
  const { confirmationCode, email } = req.body;

  if (!confirmationCode || !email) {
    return res.status(400).json({
      ok: false,
      message: "confirmationCode and email are required",
    });
  }

  const store = readStore();
  const appointment = store.appointments.find(
    (entry) =>
      entry.confirmationCode === String(confirmationCode).trim().toUpperCase() &&
      entry.email === String(email).trim().toLowerCase() &&
      entry.status !== "canceled"
  );

  if (!appointment) {
    return res.status(404).json({
      ok: false,
      message: "No active appointment matched that email and confirmation code.",
    });
  }

  appointment.status = "canceled";
  appointment.canceledAt = new Date().toISOString();
  writeStore(store);

  return sendConfirmationEmail(appointment, "canceled")
    .then((emailStatus) => {
      res.json({
        ok: true,
        message: "Appointment canceled and slot released.",
        emailStatus,
      });
    })
    .catch(() => {
      res.json({
        ok: true,
        message: "Appointment canceled and slot released, but cancellation email could not be sent.",
        emailStatus: { delivered: false, simulated: false },
      });
    });
});

app.listen(PORT, () => {
  console.log(`CareConnect server running on http://localhost:${PORT}`);
});
