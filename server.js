const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "appointments.json");

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/appointments", (req, res) => {
  const { name, email, type, format, notes } = req.body;

  if (!name || !email || !type || !format) {
    return res.status(400).json({
      ok: false,
      message: "name, email, type, and format are required",
    });
  }

  let existing = [];

  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    try {
      existing = JSON.parse(raw);
      if (!Array.isArray(existing)) {
        existing = [];
      }
    } catch {
      existing = [];
    }
  }

  const appointment = {
    id: Date.now(),
    name,
    email,
    type,
    format,
    notes: notes || "",
    submittedAt: new Date().toISOString(),
  };

  existing.push(appointment);
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

  return res.status(201).json({
    ok: true,
    message: "Appointment request recorded",
    appointment,
  });
});

app.listen(PORT, () => {
  console.log(`CareConnect server running on http://localhost:${PORT}`);
});
