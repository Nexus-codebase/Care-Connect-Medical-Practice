const express = require("express");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "appointments.json");
const SLOT_FILE = path.join(__dirname, "data", "appointment_slots.json");
const SETTINGS_FILE = path.join(__dirname, "data", "settings.json");
const DEFAULT_SLOT_TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"];
const DEFAULT_SLOT_MINUTES = 15;
const RECEPTION_MESSAGE = "Please call reception: Cromwell Medical Centre 01992 624732 or Wormley Medical Centre 01992 440877.";
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
let cachedMailTransportPromise;

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

function writeSlotStore(slots) {
  fs.writeFileSync(SLOT_FILE, `${JSON.stringify(slots, null, 2)}\n`, "utf8");
}

function isValidTimeValue(time) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(time || ""));
}

function parseTimeValue(time) {
  const [hours, minutes] = String(time || "").split(":").map(Number);
  return (hours * 60) + minutes;
}

function addMinutesToTime(time, minutesToAdd) {
  const totalMinutes = parseTimeValue(time) + minutesToAdd;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildSlotId(date, startTime, practitionerId = "") {
  return `${date}|${startTime}|${practitionerId || "general"}`;
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
  writeSlotStore(generateAppointmentSlots(settings));
}

function generateAppointmentSlots(settings) {
  const slots = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < settings.bookingWindowDays; offset += 1) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + offset);
    const dateValue = toIsoDate(currentDate);

    settings.slotTimes.forEach((startTime) => {
      slots.push({
        slot_id: buildSlotId(dateValue, startTime),
        date: dateValue,
        start_time: startTime,
        end_time: addMinutesToTime(startTime, DEFAULT_SLOT_MINUTES),
        capacity: settings.slotCapacity,
        practitioner_id: null,
        appointment_type: null,
      });
    });
  }

  return slots;
}

function readSlotStore(settings) {
  const generatedSlots = generateAppointmentSlots(settings);

  if (!fs.existsSync(SLOT_FILE)) {
    writeSlotStore(generatedSlots);
    return generatedSlots;
  }

  try {
    const raw = fs.readFileSync(SLOT_FILE, "utf8");
    if (!raw.trim()) {
      writeSlotStore(generatedSlots);
      return generatedSlots;
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed;
    }
  } catch {
    // Fall back to a fresh generated table.
  }

  writeSlotStore(generatedSlots);
  return generatedSlots;
}

function getActiveAppointmentCounts(appointments) {
  const counts = new Map();

  appointments
    .filter((appointment) => String(appointment.status || "").toLowerCase() !== "canceled"
      && String(appointment.status || "").toLowerCase() !== "cancelled")
    .forEach((appointment) => {
      const slotId = appointment.slot_id
        || buildSlotId(appointment.date, appointment.time, appointment.practitioner_id || "");
      counts.set(slotId, (counts.get(slotId) || 0) + 1);
    });

  return counts;
}

function parseAppointmentDateTime(date, time) {
  if (!date || !time) {
    return null;
  }

  const candidate = new Date(`${date}T${time}:00`);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function isPastSlot(date, startTime) {
  const slotDateTime = parseAppointmentDateTime(date, startTime);
  if (!slotDateTime) {
    return false;
  }

  return slotDateTime.getTime() < Date.now();
}

function decorateSlot(slot, bookedCount) {
  const capacity = Number(slot.capacity || 0);
  const remaining = Math.max(capacity - bookedCount, 0);
  const past = isPastSlot(slot.date, slot.start_time);
  const available = !past && remaining > 0;
  const full = !past && remaining <= 0;
  const status = past ? "unavailable" : available ? "available" : "full";

  return {
    slot_id: slot.slot_id,
    date: slot.date,
    start_time: slot.start_time,
    end_time: slot.end_time,
    time: slot.start_time,
    label: toDisplayTime(slot.start_time),
    capacity,
    booked: bookedCount,
    remaining,
    available,
    full,
    unavailable: past,
    status,
    practitioner_id: slot.practitioner_id || null,
    appointment_type: slot.appointment_type || null,
  };
}

function buildSlots(appointments, settings) {
  const slotRows = readSlotStore(settings);
  const activeCounts = getActiveAppointmentCounts(appointments);
  const grouped = new Map();

  slotRows.forEach((slot) => {
    const bookedCount = activeCounts.get(slot.slot_id) || 0;
    const decorated = decorateSlot(slot, bookedCount);
    const displayDate = DISPLAY_DATE_FORMATTER.format(new Date(`${slot.date}T00:00:00`));

    if (!grouped.has(slot.date)) {
      grouped.set(slot.date, {
        date: slot.date,
        displayDate,
        slots: [],
      });
    }

    grouped.get(slot.date).slots.push(decorated);
  });

  return Array.from(grouped.values());
}

function getAvailabilityPayload(appointments, settings, requestedDate = "") {
  const dates = buildSlots(appointments, settings);
  const requestedDay = requestedDate ? dates.find((day) => day.date === requestedDate) : null;
  const slots = requestedDay ? requestedDay.slots : (dates[0] ? dates[0].slots : []);

  const nextAvailable = dates
    .flatMap((day) =>
      day.slots
        .filter((slot) => slot.available)
        .map((slot) => ({
          date: day.date,
          displayDate: day.displayDate,
          time: slot.time,
          displayTime: slot.label,
          remaining: slot.remaining,
        }))
    )
    .at(0) || null;

  return {
    slotCapacity: settings.slotCapacity,
    bookingWindowDays: settings.bookingWindowDays,
    nextAvailable,
    dates,
    slots,
  };
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

function findSlotAvailability(appointments, date, time, practitionerId = "") {
  const settings = readSettings();
  const dates = buildSlots(appointments, settings);
  const day = dates.find((slotDate) => slotDate.date === date);
  if (!day) {
    return null;
  }

  const slotMatch = day.slots.find((slot) => {
    if (slot.time !== time) {
      return false;
    }

    if (!practitionerId) {
      return true;
    }

    return String(slot.practitioner_id || "") === String(practitionerId);
  });

  return slotMatch || null;
}

function createConfirmationCode() {
  return `CC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

function buildSmtpTransport() {
  return nodemailer.createTransport({
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
}

async function getMailTransport() {
  if (process.env.SMTP_HOST) {
    return {
      mode: "smtp",
      from: process.env.MAIL_FROM || "careconnect@example.com",
      transport: buildSmtpTransport(),
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
    };
  }

  if (!cachedMailTransportPromise) {
    cachedMailTransportPromise = nodemailer.createTestAccount().then((account) => ({
      mode: "test",
      from: process.env.MAIL_FROM || "careconnect@example.com",
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      transport: nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: account.user,
          pass: account.pass,
        },
      }),
    }));
  }

  return cachedMailTransportPromise;
}

async function sendConfirmationEmail(appointment, mode) {
  const mailTransport = await getMailTransport();
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
          "If you need to cancel, use the cancellation form with your name, email address, and appointment date.",
        ].join("\n");

  const info = await mailTransport.transport.sendMail({
    from: mailTransport.from,
    to: appointment.email,
    subject,
    text,
  });

  return {
    delivered: true,
    simulated: false,
    mode: mailTransport.mode,
    previewUrl: mailTransport.mode === "test" ? nodemailer.getTestMessageUrl(info) : null,
  };
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
      testMailboxEnabled: !process.env.SMTP_HOST,
      mode: process.env.SMTP_HOST ? "smtp" : "test",
      host: process.env.SMTP_HOST || "smtp.ethereal.email",
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

app.get("/api/availability", (req, res) => {
  const requestedDate = String(req.query.date || "").trim();
  if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return res.status(400).json({ ok: false, message: "date must use YYYY-MM-DD format." });
  }

  const store = readStore();
  const settings = readSettings();
  const payload = getAvailabilityPayload(store.appointments, settings, requestedDate);

  res.json({
    ok: true,
    date: requestedDate || null,
    slotCapacity: payload.slotCapacity,
    bookingWindowDays: payload.bookingWindowDays,
    nextAvailable: payload.nextAvailable,
    slots: payload.slots,
    dates: payload.dates,
  });
});

app.post("/api/appointments", (req, res) => {
  const { name, email, type, format, notes, date, time } = req.body;
  const practitionerId = String(req.body.practitionerId || req.body.practitioner || "").trim();

  if (!name || !email || !type || !format || !date || !time) {
    return res.status(400).json({
      ok: false,
      message: "name, email, type, format, date, and time are required",
    });
  }

  const store = readStore();
  const settings = readSettings();
  const slot = findSlotAvailability(store.appointments, date, time, practitionerId);

  if (!slot) {
    return res.status(400).json({
      ok: false,
      message: "Selected slot is not valid.",
    });
  }

  if (!slot.available) {
    return res.status(409).json({
      ok: false,
      message: slot.unavailable
        ? "Selected slot is unavailable right now. Please choose another time."
        : "Selected slot is full. Please choose another time.",
    });
  }

  const selectedDate = buildSlots(store.appointments, settings).find((slotDate) => slotDate.date === date);
  const displayDate = selectedDate ? selectedDate.displayDate : date;
  const displayTime = slot.label;

  const appointment = {
    id: Date.now(),
    appointment_id: `APT-${Date.now().toString(36).toUpperCase()}`,
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    patient_id: String(email).trim().toLowerCase(),
    type: String(type).trim(),
    format: String(format).trim(),
    notes: notes || "",
    date,
    time,
    slot_id: slot.slot_id,
    practitioner_id: slot.practitioner_id || practitionerId || null,
    displayDate,
    displayTime,
    status: "booked",
    confirmationCode: createConfirmationCode(),
    submittedAt: new Date().toISOString(),
    history: [
      {
        event: "booked",
        at: new Date().toISOString(),
        details: "Appointment created through the booking system.",
      },
    ],
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
  const { fullName, email, appointmentDate, appointmentTime } = req.body;

  if (!fullName || !email || !appointmentDate) {
    return res.status(400).json({
      ok: false,
      message: "fullName, email, and appointmentDate are required",
    });
  }

  const store = readStore();
  const targetName = String(fullName).trim().toLowerCase();
  const targetEmail = String(email).trim().toLowerCase();
  const targetDate = String(appointmentDate).trim();
  const targetTime = String(appointmentTime || "").trim().toLowerCase();

  const matches = store.appointments.filter((entry) => {
    if (entry.status === "canceled") {
      return false;
    }

    const nameMatches = String(entry.name || "").trim().toLowerCase() === targetName;
    const emailMatches = String(entry.email || "").trim().toLowerCase() === targetEmail;
    const dateMatches = String(entry.date || "").trim() === targetDate;

    if (!nameMatches || !emailMatches || !dateMatches) {
      return false;
    }

    if (!targetTime) {
      return true;
    }

    const rawTime = String(entry.time || "").trim().toLowerCase();
    const displayTime = String(entry.displayTime || "").trim().toLowerCase();
    return rawTime === targetTime || displayTime === targetTime;
  });

  const appointment = matches.at(0);

  if (!appointment) {
    return res.status(404).json({
      ok: false,
      message: "No active appointment matched those cancellation details.",
    });
  }

  const appointmentDateTime = parseAppointmentDateTime(
    String(appointment.date || targetDate),
    String(appointment.time || targetTime || "09:00")
  );
  const hoursUntilAppointment = appointmentDateTime
    ? appointmentDateTime.getTime() - Date.now()
    : Number.POSITIVE_INFINITY;

  if (hoursUntilAppointment < 24 * 60 * 60 * 1000) {
    return res.status(403).json({
      ok: false,
      message: `Online cancellation is not available within 24 hours of your appointment. ${RECEPTION_MESSAGE}`,
    });
  }

  appointment.status = "canceled";
  appointment.canceledAt = new Date().toISOString();
  appointment.history = Array.isArray(appointment.history) ? appointment.history : [];
  appointment.history.push({
    event: "canceled",
    at: appointment.canceledAt,
    details: "Appointment canceled through the online cancellation form.",
  });
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

const startupSettings = readSettings();
readSlotStore(startupSettings);

app.listen(PORT, () => {
  console.log(`CareConnect server running on http://localhost:${PORT}`);
});
