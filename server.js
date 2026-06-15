const express = require("express");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data", "appointments.json");
const PRESCRIPTION_FILE = path.join(__dirname, "data", "prescriptions.json");
const SLOT_FILE = path.join(__dirname, "data", "appointment_slots.json");
const SETTINGS_FILE = path.join(__dirname, "data", "settings.json");
const USERS_FILE = path.join(__dirname, "data", "users.json");
const PATIENTS_FILE = path.join(__dirname, "data", "patients.json");
const NOTIFICATIONS_FILE = path.join(__dirname, "data", "notifications.json");
const DEFAULT_SLOT_TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"];
const DEFAULT_SLOT_MINUTES = 15;
const AUTH_SECRET = process.env.AUTH_SECRET || "careconnect-dev-secret-change-me";
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
app.use(express.static(PUBLIC_DIR));
app.use("/data", express.static(path.join(__dirname, "data")));

function readJsonCollection(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return { [key]: [] };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      return { [key]: [] };
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { [key]: parsed };
    }

    if (parsed && Array.isArray(parsed[key])) {
      return parsed;
    }
  } catch {
    return { [key]: [] };
  }

  return { [key]: [] };
}

function writeJsonCollection(filePath, store) {
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function createEntityId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "staff",
  };
}

function signAuthToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role || "staff",
      name: user.name,
    },
    AUTH_SECRET,
    { expiresIn: "12h" }
  );
}

function readBearerToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authHeader.slice(7).trim();
}

function requireSystemAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, AUTH_SECRET);
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Invalid or expired session." });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    const role = String(req.auth && req.auth.role ? req.auth.role : "").toLowerCase();
    const allowed = roles.map((entry) => String(entry).toLowerCase());
    if (!allowed.includes(role)) {
      return res.status(403).json({ ok: false, message: "Insufficient permission for this action." });
    }

    return next();
  };
}

function verifyUserPassword(user, password) {
  if (user.passwordHash) {
    return { valid: bcrypt.compareSync(password, user.passwordHash), migrated: false };
  }

  if (user.password && String(user.password) === String(password)) {
    user.passwordHash = bcrypt.hashSync(String(password), 10);
    delete user.password;
    return { valid: true, migrated: true };
  }

  return { valid: false, migrated: false };
}

app.use("/api/system", (req, res, next) => {
  if (req.path.startsWith("/auth/")) {
    return next();
  }

  return requireSystemAuth(req, res, next);
});

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

function readPrescriptionStore() {
  if (!fs.existsSync(PRESCRIPTION_FILE)) {
    return { requests: [] };
  }

  try {
    const raw = fs.readFileSync(PRESCRIPTION_FILE, "utf8");
    if (!raw.trim()) {
      return { requests: [] };
    }

    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return { requests: parsed };
    }

    if (parsed && Array.isArray(parsed.requests)) {
      return parsed;
    }
  } catch {
    return { requests: [] };
  }

  return { requests: [] };
}

function writePrescriptionStore(store) {
  fs.writeFileSync(PRESCRIPTION_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function readUsersStore() {
  return readJsonCollection(USERS_FILE, "users");
}

function writeUsersStore(store) {
  writeJsonCollection(USERS_FILE, store);
}

function readPatientsStore() {
  return readJsonCollection(PATIENTS_FILE, "patients");
}

function writePatientsStore(store) {
  writeJsonCollection(PATIENTS_FILE, store);
}

function readNotificationsStore() {
  return readJsonCollection(NOTIFICATIONS_FILE, "notifications");
}

function writeNotificationsStore(store) {
  writeJsonCollection(NOTIFICATIONS_FILE, store);
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

function createPrescriptionCode() {
  return `RX-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
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

async function sendPrescriptionEmail(request) {
  const mailTransport = await getMailTransport();
  const info = await mailTransport.transport.sendMail({
    from: mailTransport.from,
    to: request.email,
    subject: `Prescription request received: ${request.medicationName}`,
    text: [
      `Hello ${request.fullName},`,
      "",
      "We have received your prescription request.",
      `Reference: ${request.requestCode}`,
      `Medication: ${request.medicationName} ${request.strength}`,
      `Dose: ${request.dose}`,
      `Quantity: ${request.quantity}`,
      `Collection: ${request.collectionSite}`,
      "Please allow up to 3 working days for processing.",
    ].join("\n"),
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

app.post("/api/prescriptions", (req, res) => {
  const {
    fullName,
    email,
    phone,
    dateOfBirth,
    medicationName,
    strength,
    dose,
    quantity,
    collectionSite,
    reason,
    notes,
  } = req.body;

  if (!fullName || !email || !dateOfBirth || !medicationName || !strength || !dose || !collectionSite || !reason) {
    return res.status(400).json({
      ok: false,
      message: "fullName, email, dateOfBirth, medicationName, strength, dose, collectionSite, and reason are required",
    });
  }

  const normalizedQuantity = Number(quantity);
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity < 1 || normalizedQuantity > 999) {
    return res.status(400).json({
      ok: false,
      message: "quantity must be a number between 1 and 999",
    });
  }

  const prescriptionStore = readPrescriptionStore();
  const request = {
    id: Date.now(),
    requestCode: createPrescriptionCode(),
    fullName: String(fullName).trim(),
    email: String(email).trim().toLowerCase(),
    phone: String(phone || "").trim(),
    dateOfBirth: String(dateOfBirth).trim(),
    medicationName: String(medicationName).trim(),
    strength: String(strength).trim(),
    dose: String(dose).trim(),
    quantity: normalizedQuantity,
    collectionSite: String(collectionSite).trim(),
    reason: String(reason).trim(),
    notes: String(notes || "").trim(),
    status: "submitted",
    submittedAt: new Date().toISOString(),
  };

  prescriptionStore.requests.push(request);
  writePrescriptionStore(prescriptionStore);

  return sendPrescriptionEmail(request)
    .then((emailStatus) => {
      res.status(201).json({
        ok: true,
        message: "Prescription request submitted.",
        emailStatus,
        request,
      });
    })
    .catch(() => {
      res.status(201).json({
        ok: true,
        message: "Prescription request submitted, but email confirmation could not be sent.",
        emailStatus: { delivered: false, simulated: false },
        request,
      });
    });
});

app.post("/api/system/auth/signup", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "").trim();

  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, message: "name, email, and password are required." });
  }

  if (password.length < 6) {
    return res.status(400).json({ ok: false, message: "password must be at least 6 characters." });
  }

  const usersStore = readUsersStore();
  const exists = usersStore.users.some((user) => String(user.email || "").toLowerCase() === email);
  if (exists) {
    return res.status(409).json({ ok: false, message: "An account with this email already exists." });
  }

  const user = {
    id: createEntityId("USR"),
    name,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "staff",
    createdAt: new Date().toISOString(),
  };

  usersStore.users.push(user);
  writeUsersStore(usersStore);
  return res.status(201).json({ ok: true, user: sanitizeUser(user) });
});

app.post("/api/system/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "").trim();

  if (!email || !password) {
    return res.status(400).json({ ok: false, message: "email and password are required." });
  }

  const usersStore = readUsersStore();
  const user = usersStore.users.find((entry) => String(entry.email || "").toLowerCase() === email);

  if (!user) {
    return res.status(401).json({ ok: false, message: "Invalid email or password." });
  }

  const passwordCheck = verifyUserPassword(user, password);
  if (!passwordCheck.valid) {
    return res.status(401).json({ ok: false, message: "Invalid email or password." });
  }

  user.lastLoginAt = new Date().toISOString();
  if (!user.role) {
    user.role = "staff";
  }
  writeUsersStore(usersStore);
  const safeUser = sanitizeUser(user);
  const token = signAuthToken(user);
  return res.json({ ok: true, user: safeUser, token });
});

app.get("/api/system/dashboard", (_req, res) => {
  const patientsStore = readPatientsStore();
  const store = readStore();
  const notificationsStore = readNotificationsStore();
  const today = toIsoDate(new Date());

  const activeAppointments = store.appointments.filter(
    (appointment) => String(appointment.status || "").toLowerCase() !== "canceled"
      && String(appointment.status || "").toLowerCase() !== "cancelled"
  );

  const todayAppointments = activeAppointments.filter((appointment) => String(appointment.date || "") === today);
  const unread = notificationsStore.notifications.filter((item) => !item.read).length;

  return res.json({
    ok: true,
    stats: {
      patients: patientsStore.patients.length,
      activeAppointments: activeAppointments.length,
      todayAppointments: todayAppointments.length,
      unreadNotifications: unread,
    },
  });
});

app.get("/api/system/patients", (req, res) => {
  const query = String(req.query.query || "").trim().toLowerCase();
  const patientsStore = readPatientsStore();

  const rows = query
    ? patientsStore.patients.filter((patient) => [patient.fullName, patient.email, patient.phone]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(query)))
    : patientsStore.patients;

  return res.json({ ok: true, patients: rows });
});

app.post("/api/system/patients", requireRoles("admin", "staff"), (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!fullName || !email) {
    return res.status(400).json({ ok: false, message: "fullName and email are required." });
  }

  const patientsStore = readPatientsStore();
  const patient = {
    id: createEntityId("PAT"),
    fullName,
    email,
    phone: String(req.body.phone || "").trim(),
    dateOfBirth: String(req.body.dateOfBirth || "").trim(),
    address: String(req.body.address || "").trim(),
    medicalHistory: String(req.body.medicalHistory || "").trim(),
    notes: [],
    documents: [],
    createdAt: new Date().toISOString(),
  };

  patientsStore.patients.push(patient);
  writePatientsStore(patientsStore);
  return res.status(201).json({ ok: true, patient });
});

app.get("/api/system/patients/:id", (req, res) => {
  const patientsStore = readPatientsStore();
  const patient = patientsStore.patients.find((entry) => String(entry.id) === String(req.params.id));
  if (!patient) {
    return res.status(404).json({ ok: false, message: "Patient not found." });
  }

  return res.json({ ok: true, patient });
});

app.put("/api/system/patients/:id", requireRoles("admin", "staff"), (req, res) => {
  const patientsStore = readPatientsStore();
  const patient = patientsStore.patients.find((entry) => String(entry.id) === String(req.params.id));
  if (!patient) {
    return res.status(404).json({ ok: false, message: "Patient not found." });
  }

  patient.fullName = String(req.body.fullName || patient.fullName || "").trim();
  patient.email = String(req.body.email || patient.email || "").trim().toLowerCase();
  patient.phone = String(req.body.phone || patient.phone || "").trim();
  patient.dateOfBirth = String(req.body.dateOfBirth || patient.dateOfBirth || "").trim();
  patient.address = String(req.body.address || patient.address || "").trim();
  patient.medicalHistory = String(req.body.medicalHistory || patient.medicalHistory || "").trim();
  patient.updatedAt = new Date().toISOString();

  writePatientsStore(patientsStore);
  return res.json({ ok: true, patient });
});

app.get("/api/system/patients/:id/notes", (req, res) => {
  const patientsStore = readPatientsStore();
  const patient = patientsStore.patients.find((entry) => String(entry.id) === String(req.params.id));
  if (!patient) {
    return res.status(404).json({ ok: false, message: "Patient not found." });
  }

  return res.json({ ok: true, notes: Array.isArray(patient.notes) ? patient.notes : [] });
});

app.post("/api/system/patients/:id/notes", requireRoles("admin", "staff"), (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) {
    return res.status(400).json({ ok: false, message: "text is required." });
  }

  const patientsStore = readPatientsStore();
  const patient = patientsStore.patients.find((entry) => String(entry.id) === String(req.params.id));
  if (!patient) {
    return res.status(404).json({ ok: false, message: "Patient not found." });
  }

  const note = {
    id: createEntityId("NOTE"),
    text,
    author: String(req.body.author || "Staff").trim(),
    createdAt: new Date().toISOString(),
  };

  patient.notes = Array.isArray(patient.notes) ? patient.notes : [];
  patient.notes.unshift(note);
  writePatientsStore(patientsStore);
  return res.status(201).json({ ok: true, note });
});

app.post("/api/system/patients/:id/documents", requireRoles("admin", "staff"), (req, res) => {
  const title = String(req.body.title || "").trim();
  if (!title) {
    return res.status(400).json({ ok: false, message: "title is required." });
  }

  const patientsStore = readPatientsStore();
  const patient = patientsStore.patients.find((entry) => String(entry.id) === String(req.params.id));
  if (!patient) {
    return res.status(404).json({ ok: false, message: "Patient not found." });
  }

  const document = {
    id: createEntityId("DOC"),
    title,
    url: String(req.body.url || "").trim(),
    createdAt: new Date().toISOString(),
  };

  patient.documents = Array.isArray(patient.documents) ? patient.documents : [];
  patient.documents.unshift(document);
  writePatientsStore(patientsStore);
  return res.status(201).json({ ok: true, document });
});

app.get("/api/system/appointments", (req, res) => {
  const patientId = String(req.query.patientId || "").trim();
  const status = String(req.query.status || "").trim().toLowerCase();
  const patientsStore = readPatientsStore();
  const store = readStore();

  let rows = store.appointments.map((appointment) => {
    const patient = patientsStore.patients.find((entry) => String(entry.id) === String(appointment.patientRef || ""));
    return {
      ...appointment,
      patientName: patient ? patient.fullName : appointment.name,
      patientRef: appointment.patientRef || null,
    };
  });

  if (patientId) {
    rows = rows.filter((entry) => String(entry.patientRef || "") === patientId);
  }

  if (status) {
    rows = rows.filter((entry) => String(entry.status || "").toLowerCase() === status);
  }

  return res.json({ ok: true, appointments: rows });
});

app.post("/api/system/appointments/schedule", requireRoles("admin", "staff"), (req, res) => {
  const patientId = String(req.body.patientId || "").trim();
  const date = String(req.body.date || "").trim();
  const time = String(req.body.time || "").trim();
  const type = String(req.body.type || "General Consultation").trim();
  const format = String(req.body.format || "In-clinic").trim();
  const practitionerId = String(req.body.practitionerId || "").trim();
  const notes = String(req.body.notes || "").trim();

  if (!patientId || !date || !time) {
    return res.status(400).json({ ok: false, message: "patientId, date, and time are required." });
  }

  const patientsStore = readPatientsStore();
  const patient = patientsStore.patients.find((entry) => String(entry.id) === patientId);
  if (!patient) {
    return res.status(404).json({ ok: false, message: "Patient not found." });
  }

  const store = readStore();
  const settings = readSettings();
  const slot = findSlotAvailability(store.appointments, date, time, practitionerId);
  if (!slot || !slot.available) {
    return res.status(409).json({ ok: false, message: "Selected slot is unavailable." });
  }

  const selectedDate = buildSlots(store.appointments, settings).find((slotDate) => slotDate.date === date);
  const displayDate = selectedDate ? selectedDate.displayDate : date;

  const appointment = {
    id: Date.now(),
    appointment_id: `APT-${Date.now().toString(36).toUpperCase()}`,
    patientRef: patient.id,
    name: patient.fullName,
    email: patient.email,
    patient_id: patient.email,
    type,
    format,
    notes,
    date,
    time,
    slot_id: slot.slot_id,
    practitioner_id: slot.practitioner_id || practitionerId || null,
    displayDate,
    displayTime: slot.label,
    status: "booked",
    confirmationCode: createConfirmationCode(),
    submittedAt: new Date().toISOString(),
    history: [
      {
        event: "booked",
        at: new Date().toISOString(),
        details: "Appointment created via system portal.",
      },
    ],
  };

  store.appointments.push(appointment);
  writeStore(store);

  const notificationsStore = readNotificationsStore();
  notificationsStore.notifications.unshift({
    id: createEntityId("NTF"),
    type: "appointment",
    title: "New appointment scheduled",
    message: `${patient.fullName} booked ${displayDate} at ${slot.label}.`,
    appointmentId: appointment.appointment_id,
    patientId: patient.id,
    read: false,
    createdAt: new Date().toISOString(),
  });
  writeNotificationsStore(notificationsStore);

  return res.status(201).json({ ok: true, appointment });
});

app.put("/api/system/appointments/:id/reschedule", requireRoles("admin", "staff"), (req, res) => {
  const date = String(req.body.date || "").trim();
  const time = String(req.body.time || "").trim();
  if (!date || !time) {
    return res.status(400).json({ ok: false, message: "date and time are required." });
  }

  const store = readStore();
  const target = store.appointments.find((entry) => String(entry.appointment_id || entry.id) === String(req.params.id));
  if (!target) {
    return res.status(404).json({ ok: false, message: "Appointment not found." });
  }

  if (String(target.status || "").toLowerCase() === "canceled") {
    return res.status(400).json({ ok: false, message: "Canceled appointments cannot be rescheduled." });
  }

  const sameSlot = String(target.date) === date && String(target.time) === time;
  if (!sameSlot) {
    const slot = findSlotAvailability(store.appointments, date, time, String(target.practitioner_id || ""));
    if (!slot || !slot.available) {
      return res.status(409).json({ ok: false, message: "Selected slot is unavailable." });
    }

    target.date = date;
    target.time = time;
    target.slot_id = slot.slot_id;
    target.displayTime = slot.label;
  }

  const settings = readSettings();
  const selectedDate = buildSlots(store.appointments, settings).find((slotDate) => slotDate.date === date);
  target.displayDate = selectedDate ? selectedDate.displayDate : date;
  target.history = Array.isArray(target.history) ? target.history : [];
  target.history.push({
    event: "rescheduled",
    at: new Date().toISOString(),
    details: `Appointment moved to ${target.displayDate} ${target.displayTime || target.time}.`,
  });

  writeStore(store);
  return res.json({ ok: true, appointment: target });
});

app.put("/api/system/appointments/:id/cancel", requireRoles("admin", "staff"), (req, res) => {
  const store = readStore();
  const target = store.appointments.find((entry) => String(entry.appointment_id || entry.id) === String(req.params.id));
  if (!target) {
    return res.status(404).json({ ok: false, message: "Appointment not found." });
  }

  if (String(target.status || "").toLowerCase() === "canceled") {
    return res.json({ ok: true, appointment: target });
  }

  target.status = "canceled";
  target.canceledAt = new Date().toISOString();
  target.history = Array.isArray(target.history) ? target.history : [];
  target.history.push({
    event: "canceled",
    at: target.canceledAt,
    details: String(req.body.reason || "Canceled by staff from portal."),
  });

  writeStore(store);
  return res.json({ ok: true, appointment: target });
});

app.get("/api/system/notifications", (req, res) => {
  const unreadOnly = String(req.query.unread || "").toLowerCase() === "true";
  const store = readNotificationsStore();
  const rows = unreadOnly ? store.notifications.filter((entry) => !entry.read) : store.notifications;
  return res.json({ ok: true, notifications: rows });
});

app.post("/api/system/notifications/open-alert", requireRoles("admin", "staff"), (req, res) => {
  const title = String(req.body.title || "").trim();
  const message = String(req.body.message || "").trim();
  if (!title || !message) {
    return res.status(400).json({ ok: false, message: "title and message are required." });
  }

  const store = readNotificationsStore();
  const notification = {
    id: createEntityId("NTF"),
    type: "alert",
    title,
    message,
    patientId: String(req.body.patientId || "").trim() || null,
    appointmentId: String(req.body.appointmentId || "").trim() || null,
    read: false,
    createdAt: new Date().toISOString(),
  };

  store.notifications.unshift(notification);
  writeNotificationsStore(store);
  return res.status(201).json({ ok: true, notification });
});

app.get("/api/system/profile/:userId", (req, res) => {
  const requesterId = String(req.auth && req.auth.sub ? req.auth.sub : "");
  const requesterRole = String(req.auth && req.auth.role ? req.auth.role : "").toLowerCase();
  const targetId = String(req.params.userId || "");
  if (requesterRole !== "admin" && requesterId !== targetId) {
    return res.status(403).json({ ok: false, message: "You can only access your own profile." });
  }

  const usersStore = readUsersStore();
  const user = usersStore.users.find((entry) => String(entry.id) === String(req.params.userId));
  if (!user) {
    return res.status(404).json({ ok: false, message: "User not found." });
  }

  return res.json({ ok: true, profile: sanitizeUser(user) });
});

app.put("/api/system/profile/:userId", (req, res) => {
  const requesterId = String(req.auth && req.auth.sub ? req.auth.sub : "");
  const requesterRole = String(req.auth && req.auth.role ? req.auth.role : "").toLowerCase();
  const targetId = String(req.params.userId || "");
  if (requesterRole !== "admin" && requesterId !== targetId) {
    return res.status(403).json({ ok: false, message: "You can only update your own profile." });
  }

  const usersStore = readUsersStore();
  const user = usersStore.users.find((entry) => String(entry.id) === String(req.params.userId));
  if (!user) {
    return res.status(404).json({ ok: false, message: "User not found." });
  }

  if (req.body.name) {
    user.name = String(req.body.name).trim();
  }

  if (req.body.password) {
    const password = String(req.body.password).trim();
    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: "password must be at least 6 characters." });
    }
    user.passwordHash = bcrypt.hashSync(password, 10);
    delete user.password;
  }

  user.updatedAt = new Date().toISOString();
  writeUsersStore(usersStore);
  return res.json({ ok: true, profile: sanitizeUser(user) });
});

const startupSettings = readSettings();
readSlotStore(startupSettings);

app.listen(PORT, () => {
  console.log(`CareConnect server running on http://localhost:${PORT}`);
});
