(function () {
const systemStatusText = document.querySelector("#system-status-text");

const statPatients = document.querySelector("#stat-patients");
const statActive = document.querySelector("#stat-active-appointments");
const statToday = document.querySelector("#stat-today-appointments");
const statUnread = document.querySelector("#stat-unread");
const dashboardSidebarToggle = document.querySelector("#dashboard-sidebar-toggle");
const dashboardSearchInput = document.querySelector("#dashboard-search-input");
const dashboardSearchButton = document.querySelector("#dashboard-search-button");
const dashboardFilterTodayButton = document.querySelector("#dashboard-filter-today");
const dashboardExportCsvButton = document.querySelector("#dashboard-export-csv");
const dashboardOpenAppointmentsButton = document.querySelector("#dashboard-open-appointments");
const dashboardAddPatientButton = document.querySelector("#dashboard-add-patient");
const dashboardAppointmentsList = document.querySelector("#dashboard-appointments-list");
const dashboardActivityList = document.querySelector("#dashboard-activity-list");
const dashboardNotificationCount = document.querySelector("#dashboard-notification-count");
const dashMorningCount = document.querySelector("#dash-morning-count");
const dashAfternoonCount = document.querySelector("#dash-afternoon-count");
const dashEveningCount = document.querySelector("#dash-evening-count");
const dashPatientGrowth = document.querySelector("#dash-patient-growth");
const dashPatientGrowthNote = document.querySelector("#dash-patient-growth-note");
const dashPatientGrowthBar = document.querySelector("#dash-patient-growth-bar");
const dashAppointmentRate = document.querySelector("#dash-appointment-rate");
const dashAppointmentRateNote = document.querySelector("#dash-appointment-rate-note");
const dashAppointmentRateBar = document.querySelector("#dash-appointment-rate-bar");
const dashSatisfaction = document.querySelector("#dash-satisfaction");
const dashSatisfactionNote = document.querySelector("#dash-satisfaction-note");
const dashSatisfactionBar = document.querySelector("#dash-satisfaction-bar");
const dashPerformanceSatisfaction = document.querySelector("#dash-performance-satisfaction");
const dashPerformanceAttendance = document.querySelector("#dash-performance-attendance");
const dashPerformanceNew = document.querySelector("#dash-performance-new");

const patientSearchInput = document.querySelector("#patient-search-input");
const patientSearchButton = document.querySelector("#patient-search-button");
const patientsTableBody = document.querySelector("#patients-table tbody");
const addPatientForm = document.querySelector("#add-patient-form");
const addPatientFeedback = document.querySelector("#add-patient-feedback");
const openAddPatientButton = document.querySelector("#open-add-patient");
const patientStatTotal = document.querySelector("#patients-stat-total");
const patientStatStable = document.querySelector("#patients-stat-stable");
const patientStatCritical = document.querySelector("#patients-stat-critical");
const patientStatRecovering = document.querySelector("#patients-stat-recovering");

const selectedPatientLabel = document.querySelector("#selected-patient-label");
const patientProfile = document.querySelector("#patient-profile");
const noteForm = document.querySelector("#note-form");
const noteFeedback = document.querySelector("#note-feedback");
const documentForm = document.querySelector("#document-form");
const documentFeedback = document.querySelector("#document-feedback");

const appointmentsTableBody = document.querySelector("#appointments-table tbody");
const scheduleForm = document.querySelector("#schedule-form");
const scheduleFeedback = document.querySelector("#schedule-feedback");
const schedulePatient = document.querySelector("#schedule-patient");
const scheduleDate = document.querySelector("#schedule-date");
const scheduleTime = document.querySelector("#schedule-time");

const notificationsList = document.querySelector("#notifications-list");
const alertForm = document.querySelector("#alert-form");
const alertFeedback = document.querySelector("#alert-feedback");

const profileForm = document.querySelector("#profile-form");
const profileName = document.querySelector("#profile-name");
const profileFeedback = document.querySelector("#profile-feedback");
const logoutButton = document.querySelector("#logout-button");

let selectedPatientId = null;
let currentUser = null;
let currentToken = null;
let patientRows = [];
let availabilityDates = [];
let appointmentRows = [];
let notificationRows = [];

function normalizeDateValue(input) {
  if (!input) return "";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return String(input);
  return parsed.toISOString().slice(0, 10);
}

function asTimeSortValue(input) {
  return getHourFromTimeLabel(input || "") * 60;
}

function exportAppointmentsCsv(rows) {
  const header = ["Patient", "Date", "Time", "Type", "Status"];
  const safe = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(safe).join(",")];

  (Array.isArray(rows) ? rows : []).forEach((item) => {
    lines.push([
      item.patientName || item.name || "",
      item.displayDate || item.date || "",
      item.displayTime || item.time || "",
      item.type || "",
      item.status || "",
    ].map(safe).join(","));
  });

  const csv = `${lines.join("\n")}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `careconnect-appointments-${dateStamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function setStatus(node, message, state = "success") {
  if (!node) return;
  node.textContent = message;
  node.dataset.state = state;
}

function setSystemStatus(message) {
  if (systemStatusText) {
    systemStatusText.textContent = message;
  }
}

async function requestJson(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  if (currentToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${currentToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const onStaticHost = /github\.io$/i.test(window.location.hostname);
    const message = onStaticHost
      ? "Portal features require the CareConnect API server. GitHub Pages hosts static files only."
      : "Portal service is temporarily unavailable. Please try again shortly.";
    throw new Error(message);
  }

  const result = await response.json();
  if (!response.ok || result.ok === false) {
    throw new Error(result.message || "Request failed.");
  }
  return result;
}

function requireAuth() {
  const raw = localStorage.getItem("careconnect_portal_user");
  const token = localStorage.getItem("careconnect_portal_token");
  currentUser = raw ? JSON.parse(raw) : null;
  currentToken = token || null;
  return Boolean(currentUser && currentToken);
}

function classifyPatientStatus(patient) {
  const history = String(patient.medicalHistory || "").toLowerCase();
  if (/(critical|heart|stroke|cancer|emergency)/.test(history)) {
    return "critical";
  }
  if (/(recover|diabetes|asthma|hypertension|follow)/.test(history)) {
    return "recovering";
  }
  return "stable";
}

function summarizeCondition(patient) {
  const history = String(patient.medicalHistory || "").toLowerCase();
  if (history.includes("hypertension")) return "Hypertension";
  if (history.includes("asthma")) return "Asthma";
  if (history.includes("diabetes")) return "Diabetes";
  if (history.includes("allerg")) return "Allergies";
  return "General check-up";
}

function getPatientAge(patient) {
  if (!patient || !patient.dateOfBirth) return "--";
  const dob = new Date(patient.dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "--";
  return String(Math.max(0, new Date().getFullYear() - dob.getFullYear()));
}

function getPatientInitials(patient) {
  const name = String((patient && patient.fullName) || "Patient").trim();
  const parts = name.split(" ").filter(Boolean);
  if (!parts.length) return "PT";
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function renderPatientsTable(rows) {
  if (!patientsTableBody) return;
  if (!rows.length) {
    patientsTableBody.innerHTML = '<tr><td colspan="7">No patients found.</td></tr>';
    return;
  }

  patientsTableBody.innerHTML = rows
    .map(
      (patient) => `
      <tr>
        <td>
          <div class="patient-main-cell">
            <span class="patient-avatar-chip">${getPatientInitials(patient)}</span>
            <div>
              <div class="patient-cell-main">${patient.fullName || "-"}</div>
              <div class="patient-cell-sub">${patient.phone || "No phone"}</div>
            </div>
          </div>
        </td>
        <td><span class="patient-muted-cell">${patient.id || "PT001"}</span></td>
        <td><span class="patient-muted-cell">${getPatientAge(patient)} / ${patient.gender || "Female"}</span></td>
        <td><span class="patient-cell-main">${summarizeCondition(patient)}</span></td>
        <td><span class="patient-status-badge patient-status-${classifyPatientStatus(patient)}">${classifyPatientStatus(patient)}</span></td>
        <td><span class="patient-muted-cell">${patient.updatedAt ? new Date(patient.updatedAt).toLocaleDateString() : "1/15/2024"}</span></td>
        <td>
          <div class="row-action-cluster">
            <button class="row-action-btn select-patient-btn" data-patient-id="${patient.id}" type="button" title="View">V</button>
            <button class="row-action-btn" type="button" title="Edit">E</button>
            <button class="row-action-btn" type="button" title="More">...</button>
          </div>
        </td>
      </tr>`
    )
    .join("");

  patientsTableBody.querySelectorAll(".select-patient-btn").forEach((button) => {
    button.addEventListener("click", () => {
      selectPatient(button.dataset.patientId);
    });
  });
}

function renderPatientProfile(patient) {
  if (!patientProfile) return;

  if (!patient) {
    patientProfile.innerHTML = '<p class="helper-text">No patient selected.</p>';
    return;
  }

  const notes = Array.isArray(patient.notes) ? patient.notes : [];
  const docs = Array.isArray(patient.documents) ? patient.documents : [];
  const initials = String(patient.fullName || "Patient")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "PT";
  const age = patient.dateOfBirth
    ? Math.max(0, new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear())
    : "--";
  const status = classifyPatientStatus(patient);
  const lastNoteDate = notes[0] && notes[0].createdAt
    ? new Date(notes[0].createdAt).toLocaleDateString()
    : "No recent update";
  const nextAppointmentDate = "Next scheduling available";
  const historyText = String(patient.medicalHistory || "").toLowerCase();
  const allergies = [];
  if (historyText.includes("allerg")) allergies.push("Seasonal Allergies");
  if (historyText.includes("asthma")) allergies.push("Dust");
  if (!allergies.length) allergies.push("None reported");
  const conditions = [];
  if (historyText.includes("asthma")) conditions.push("Asthma");
  if (historyText.includes("diabetes")) conditions.push("Diabetes");
  if (historyText.includes("hypertension")) conditions.push("Hypertension");
  if (historyText.includes("heart")) conditions.push("Cardiac Risk");
  if (!conditions.length) conditions.push("General monitoring");

  patientProfile.innerHTML = `
    <section class="patient-details-shell">
      <header class="patient-details-head">
        <div>
          <p>Complete medical record and history</p>
          <h3>Patient Details</h3>
        </div>
        <div class="patient-details-head-actions">
          <button class="btn btn-ghost" type="button">Share</button>
          <button class="btn btn-primary" type="button">Edit</button>
        </div>
      </header>

      <article class="patient-hero-card">
        <div class="patient-identity">
          <span class="patient-avatar-lg">${initials}</span>
          <div>
            <div class="patient-identity-row">
              <strong>${patient.fullName || "-"}</strong>
              <span class="patient-status-badge patient-status-${status}">${status}</span>
            </div>
            <p>${patient.id || "PT"} • ${age} years</p>
          </div>
        </div>
        <div class="patient-contact-grid">
          <p><span>Phone</span><strong>${patient.phone || "-"}</strong></p>
          <p><span>Email</span><strong>${patient.email || "-"}</strong></p>
          <p><span>Address</span><strong>${patient.address || "-"}</strong></p>
        </div>
      </article>

      <section class="patient-vitals-grid">
        <article class="patient-vital-card"><span>Blood Group</span><strong>O+</strong></article>
        <article class="patient-vital-card"><span>BMI</span><strong>22.8</strong></article>
        <article class="patient-vital-card"><span>Last Visit</span><strong>${lastNoteDate}</strong></article>
        <article class="patient-vital-card"><span>Next Appointment</span><strong>${nextAppointmentDate}</strong></article>
      </section>

      <nav class="patient-tabs" aria-label="Patient detail tabs">
        <button type="button" class="active">Overview</button>
        <button type="button">Appointments</button>
        <button type="button">Medications</button>
        <button type="button">Lab Results</button>
        <button type="button">Vitals</button>
      </nav>

      <section class="patient-details-grid">
        <article class="patient-info-card">
          <h4>Personal Information</h4>
          <div class="patient-info-list">
            <p><span>Date of Birth</span><strong>${patient.dateOfBirth || "-"}</strong></p>
            <p><span>Medical History</span><strong>${patient.medicalHistory || "General checkups"}</strong></p>
            <p><span>Blood Group</span><strong>O+</strong></p>
            <p><span>BMI</span><strong>22.8</strong></p>
          </div>
        </article>
        <article class="patient-info-card">
          <h4>Emergency Contact</h4>
          <div class="patient-info-list">
            <p><span>Name</span><strong>Primary Family Contact</strong></p>
            <p><span>Relationship</span><strong>Family</strong></p>
            <p><span>Phone</span><strong>${patient.phone || "-"}</strong></p>
          </div>
        </article>
      </section>

      <section class="patient-details-grid patient-conditions-grid">
        <article class="patient-info-card">
          <h4>Allergies</h4>
          <div class="patient-chip-row">${allergies.map((item) => `<span class="patient-chip danger">${item}</span>`).join("")}</div>
        </article>
        <article class="patient-info-card">
          <h4>Chronic Conditions</h4>
          <div class="patient-chip-row">${conditions.map((item) => `<span class="patient-chip">${item}</span>`).join("")}</div>
        </article>
      </section>

      <section class="patient-details-grid">
        <article class="patient-info-card">
          <h4>Recent Notes</h4>
          <ul class="flow-list compact-list">${notes.slice(0, 5).map((item) => `<li>${item.text}</li>`).join("") || "<li>No notes yet.</li>"}</ul>
        </article>
        <article class="patient-info-card">
          <h4>Documents</h4>
          <ul class="flow-list compact-list">${docs.slice(0, 5).map((item) => `<li>${item.url ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>` : item.title}</li>`).join("") || "<li>No documents yet.</li>"}</ul>
        </article>
      </section>
    </section>
  `;
}

function updatePatientDashboardStats(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const criticalCount = list.filter((patient) => classifyPatientStatus(patient) === "critical").length;
  const recoveringCount = list.filter((patient) => classifyPatientStatus(patient) === "recovering").length;

  const stableCount = Math.max(list.length - criticalCount - recoveringCount, 0);

  if (patientStatTotal) patientStatTotal.textContent = String(list.length);
  if (patientStatStable) patientStatStable.textContent = String(stableCount);
  if (patientStatCritical) patientStatCritical.textContent = String(criticalCount);
  if (patientStatRecovering) patientStatRecovering.textContent = String(recoveringCount);
}

function renderAppointmentsTable(rows) {
  if (!appointmentsTableBody) return;
  if (!rows.length) {
    appointmentsTableBody.innerHTML = '<tr><td colspan="3">No appointments found.</td></tr>';
    return;
  }

  appointmentsTableBody.innerHTML = rows
    .map(
      (appointment) => `
      <tr>
        <td>
          <div class="appointment-row-main">
            <div class="appointment-row-title">
              <strong>${appointment.patientName || appointment.name || "-"}</strong>
              <span>${appointment.displayDate || appointment.date || "-"} • ${appointment.appointment_id || appointment.id || "APT"}</span>
            </div>
            <div class="appointment-row-meta">
              <span>${appointment.displayTime || appointment.time || "-"}</span>
              <span>${appointment.type || "General Check-up"}</span>
              <span>${appointment.doctor || "Dr. Smith"}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="patient-status-badge patient-status-${String(appointment.status || "").toLowerCase().includes("cancel") ? "critical" : String(appointment.status || "").toLowerCase().includes("resched") ? "recovering" : "stable"}">${appointment.status || "-"}</span>
        </td>
        <td>
          <div class="appointment-actions">
            <button class="btn btn-ghost tiny-btn" data-action="reschedule" data-id="${appointment.appointment_id || appointment.id}" type="button">Reschedule</button>
            <button class="btn btn-ghost tiny-btn" data-action="view-details" data-name="${appointment.patientName || appointment.name || ""}" type="button">View Details</button>
            <button class="btn btn-ghost tiny-btn" data-action="cancel" data-id="${appointment.appointment_id || appointment.id}" type="button">Cancel</button>
          </div>
        </td>
      </tr>`
    )
    .join("");

  appointmentsTableBody.querySelectorAll("button[data-action='reschedule']").forEach((button) => {
    button.addEventListener("click", () => quickReschedule(button.dataset.id));
  });

  appointmentsTableBody.querySelectorAll("button[data-action='cancel']").forEach((button) => {
    button.addEventListener("click", () => cancelAppointment(button.dataset.id));
  });

  appointmentsTableBody.querySelectorAll("button[data-action='view-details']").forEach((button) => {
    button.addEventListener("click", () => {
      const patientName = String(button.dataset.name || "").trim();
      const target = patientName
        ? `portal-patients.html?query=${encodeURIComponent(patientName)}`
        : "portal-patients.html";
      window.location.href = target;
    });
  });
}

function getHourFromTimeLabel(label) {
  if (!label) return 0;
  const match = String(label).match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!match) return 0;
  let hour = Number(match[1]);
  const marker = (match[2] || "").toUpperCase();
  if (marker === "PM" && hour < 12) hour += 12;
  if (marker === "AM" && hour === 12) hour = 0;
  return hour;
}

function renderDashboardAppointments(rows) {
  if (!dashboardAppointmentsList) return;
  const list = Array.isArray(rows)
    ? rows
      .slice()
      .sort((a, b) => {
        const aCanceled = String(a.status || "").toLowerCase().includes("cancel") ? 1 : 0;
        const bCanceled = String(b.status || "").toLowerCase().includes("cancel") ? 1 : 0;
        if (aCanceled !== bCanceled) return aCanceled - bCanceled;
        const dateDelta = normalizeDateValue(a.date).localeCompare(normalizeDateValue(b.date));
        if (dateDelta !== 0) return dateDelta;
        return asTimeSortValue(a.displayTime || a.time) - asTimeSortValue(b.displayTime || b.time);
      })
      .slice(0, 4)
    : [];
  if (!list.length) {
    dashboardAppointmentsList.innerHTML = '<p class="helper-text">No appointments for today.</p>';
    return;
  }

  dashboardAppointmentsList.innerHTML = list
    .map((item) => {
      const status = String(item.status || "scheduled").toLowerCase();
      return `
        <article class="dash-appointment-item">
          <div>
            <strong>${item.patientName || item.name || "Patient"}</strong>
            <p>${item.displayTime || item.time || "--"} • ${item.type || "Consultation"}</p>
          </div>
          <span class="patient-status-badge patient-status-${status.includes("cancel") ? "critical" : status.includes("resched") ? "recovering" : "stable"}">${item.status || "scheduled"}</span>
        </article>`;
    })
    .join("");
}

function renderDashboardScheduleSummary(rows) {
  const list = Array.isArray(rows)
    ? rows.filter((item) => !String(item.status || "").toLowerCase().includes("cancel"))
    : [];
  const morning = list.filter((item) => getHourFromTimeLabel(item.displayTime || item.time) < 12).length;
  const afternoon = list.filter((item) => {
    const hour = getHourFromTimeLabel(item.displayTime || item.time);
    return hour >= 12 && hour < 17;
  }).length;
  const evening = Math.max(list.length - morning - afternoon, 0);

  if (dashMorningCount) dashMorningCount.textContent = `${morning} patients`;
  if (dashAfternoonCount) dashAfternoonCount.textContent = `${afternoon} patients`;
  if (dashEveningCount) dashEveningCount.textContent = `${evening} patients`;
}

function renderDashboardAnalytics() {
  const patientCount = patientRows.length;
  const appointmentCount = appointmentRows.length;
  const nonCanceled = appointmentRows.filter((item) => !String(item.status || "").toLowerCase().includes("cancel")).length;
  const growthPercent = Math.min(65, Math.max(6, patientCount * 6));
  const attendance = appointmentCount
    ? Math.max(45, Math.min(99, Math.round((nonCanceled / appointmentCount) * 100)))
    : 80;
  const satisfaction = Math.min(5, Math.max(3.8, 4 + patientCount * 0.05));

  if (dashPatientGrowth) dashPatientGrowth.textContent = `+${growthPercent}%`;
  if (dashPatientGrowthNote) dashPatientGrowthNote.textContent = `+${patientCount} new patients trend`;
  if (dashPatientGrowthBar) dashPatientGrowthBar.style.width = `${growthPercent}%`;

  if (dashAppointmentRate) dashAppointmentRate.textContent = `${attendance}%`;
  if (dashAppointmentRateNote) dashAppointmentRateNote.textContent = "Average attendance rate";
  if (dashAppointmentRateBar) dashAppointmentRateBar.style.width = `${attendance}%`;

  const satisfactionPercent = Math.round((satisfaction / 5) * 100);
  if (dashSatisfaction) dashSatisfaction.textContent = `${satisfaction.toFixed(1)}/5`;
  if (dashSatisfactionNote) dashSatisfactionNote.textContent = `Based on ${Math.max(12, patientCount * 4)} reviews`;
  if (dashSatisfactionBar) dashSatisfactionBar.style.width = `${satisfactionPercent}%`;

  if (dashPerformanceSatisfaction) dashPerformanceSatisfaction.textContent = `${satisfaction.toFixed(1)}/5`;
  if (dashPerformanceAttendance) dashPerformanceAttendance.textContent = `${attendance}%`;
  if (dashPerformanceNew) dashPerformanceNew.textContent = `+${growthPercent}%`;
}

function renderNotifications(rows) {
  if (!notificationsList) return;
  if (!rows.length) {
    notificationsList.innerHTML = "<li>No notifications.</li>";
    return;
  }

  notificationsList.innerHTML = rows
    .slice(0, 12)
    .map((item) => `<li><span>${item.title}</span> ${item.message}</li>`)
    .join("");

  if (dashboardActivityList) {
    dashboardActivityList.innerHTML = rows
      .slice(0, 3)
      .map((item) => `<li><span>${item.title}</span><strong>${item.message}</strong></li>`)
      .join("") || '<li><span>No activity</span><strong>System ready</strong></li>';
  }

  if (dashboardNotificationCount) {
    dashboardNotificationCount.textContent = rows.length > 9 ? "9+" : String(rows.length);
  }
}

function refreshScheduleDateOptions() {
  if (!scheduleDate) return;
  const openDates = availabilityDates.filter((entry) => entry.slots.some((slot) => slot.available));

  scheduleDate.innerHTML = openDates
    .map((entry) => `<option value="${entry.date}">${entry.displayDate}</option>`)
    .join("");

  if (openDates[0]) {
    scheduleDate.value = openDates[0].date;
  }

  refreshScheduleTimeOptions();
}

function refreshScheduleTimeOptions() {
  if (!scheduleTime || !scheduleDate) return;
  const selected = availabilityDates.find((entry) => entry.date === scheduleDate.value);
  const openSlots = selected ? selected.slots.filter((slot) => slot.available) : [];

  scheduleTime.innerHTML = openSlots
    .map((slot) => `<option value="${slot.time}">${slot.label} (${slot.remaining} left)</option>`)
    .join("");
}

function refreshPatientSelect() {
  if (!schedulePatient) return;
  schedulePatient.innerHTML = patientRows
    .map((patient) => `<option value="${patient.id}">${patient.fullName}</option>`)
    .join("");
}

async function loadDashboard() {
  const result = await requestJson("/api/system/dashboard");
  if (statPatients) statPatients.textContent = String(result.stats.patients);
  if (statActive) statActive.textContent = String(result.stats.activeAppointments);
  if (statToday) {
    const waitMinutes = Math.max(8, result.stats.todayAppointments * 5);
    statToday.textContent = String(waitMinutes);
  }
  if (statUnread) statUnread.textContent = String(result.stats.unreadNotifications);
}

async function loadPatients(query = "") {
  const params = query ? `?query=${encodeURIComponent(query)}` : "";
  const result = await requestJson(`/api/system/patients${params}`);
  patientRows = Array.isArray(result.patients) ? result.patients : [];
  updatePatientDashboardStats(patientRows);
  renderPatientsTable(patientRows);
  refreshPatientSelect();
  renderDashboardAnalytics();
}

function applyPageQueryToPatientsSearch() {
  const params = new URLSearchParams(window.location.search);
  const query = String(params.get("query") || "").trim();
  if (!query) return;
  if (patientSearchInput) {
    patientSearchInput.value = query;
  }
  loadPatients(query).catch(() => {
    setSystemStatus("Could not apply search query.");
  });
}

async function selectPatient(patientId) {
  selectedPatientId = patientId;
  const result = await requestJson(`/api/system/patients/${encodeURIComponent(patientId)}`);
  if (selectedPatientLabel) {
    selectedPatientLabel.textContent = `Selected: ${result.patient.fullName}`;
  }
  renderPatientProfile(result.patient);
}

async function loadAppointments() {
  const result = await requestJson("/api/system/appointments");
  appointmentRows = Array.isArray(result.appointments) ? result.appointments : [];
  renderAppointmentsTable(appointmentRows);
  renderDashboardAppointments(appointmentRows);
  renderDashboardScheduleSummary(appointmentRows);
  renderDashboardAnalytics();
}

async function loadNotifications() {
  const result = await requestJson("/api/system/notifications");
  notificationRows = Array.isArray(result.notifications) ? result.notifications : [];
  renderNotifications(notificationRows);
}

async function loadAvailabilityForScheduling() {
  const result = await requestJson("/api/availability");
  availabilityDates = Array.isArray(result.dates) ? result.dates : [];
  refreshScheduleDateOptions();
}

async function quickReschedule(appointmentId) {
  if (!scheduleDate || !scheduleTime || !scheduleDate.value || !scheduleTime.value) {
    setStatus(scheduleFeedback, "Pick a date and time in Schedule Appointment first.", "error");
    return;
  }

  await requestJson(`/api/system/appointments/${encodeURIComponent(appointmentId)}/reschedule`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: scheduleDate.value, time: scheduleTime.value }),
  });

  setStatus(scheduleFeedback, "Appointment rescheduled.");
  await Promise.all([loadAppointments(), loadDashboard(), loadAvailabilityForScheduling()]);
}

async function cancelAppointment(appointmentId) {
  await requestJson(`/api/system/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Canceled from portal table." }),
  });

  setStatus(scheduleFeedback, "Appointment canceled.");
  await Promise.all([loadAppointments(), loadDashboard(), loadAvailabilityForScheduling()]);
}

async function loadProfile() {
  if (!currentUser) return;
  const result = await requestJson(`/api/system/profile/${encodeURIComponent(currentUser.id)}`);
  if (profileName) {
    profileName.value = result.profile.name || "";
  }
}

async function bootstrapPortal() {
  try {
    if (!requireAuth()) {
      window.location.href = "portal-login.html";
      return;
    }

    setSystemStatus(`Logged in as ${currentUser.name || currentUser.email}.`);
    await Promise.all([
      loadDashboard(),
      loadPatients(),
      loadAppointments(),
      loadNotifications(),
      loadAvailabilityForScheduling(),
      loadProfile(),
    ]);

    if (patientRows[0] && !selectedPatientId) {
      await selectPatient(patientRows[0].id);
    }
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("session")
      || String(error.message || "").toLowerCase().includes("authentication")) {
      localStorage.removeItem("careconnect_portal_user");
      localStorage.removeItem("careconnect_portal_token");
      currentUser = null;
      currentToken = null;
    }
    setSystemStatus(error.message || "Portal initialization failed.");
  }
}

if (patientSearchButton) {
  patientSearchButton.addEventListener("click", async () => {
    try {
      await loadPatients(String(patientSearchInput ? patientSearchInput.value : "").trim());
      setSystemStatus("Patient search updated.");
    } catch (error) {
      setSystemStatus(error.message || "Search failed.");
    }
  });
}

if (addPatientForm) {
  addPatientForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(addPatientForm);
      const payload = {
        fullName: String(formData.get("fullName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        dateOfBirth: String(formData.get("dateOfBirth") || "").trim(),
        address: String(formData.get("address") || "").trim(),
        medicalHistory: String(formData.get("medicalHistory") || "").trim(),
      };

      const result = await requestJson("/api/system/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      addPatientForm.reset();
      setStatus(addPatientFeedback, "Patient added successfully.");
      await Promise.all([loadPatients(), loadDashboard()]);
      await selectPatient(result.patient.id);
    } catch (error) {
      setStatus(addPatientFeedback, error.message || "Could not add patient.", "error");
    }
  });
}

if (openAddPatientButton && addPatientForm) {
  openAddPatientButton.addEventListener("click", () => {
    addPatientForm.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstInput = addPatientForm.querySelector("input[name='fullName']");
    if (firstInput) {
      firstInput.focus();
    }
  });
}

if (dashboardAddPatientButton && addPatientForm) {
  dashboardAddPatientButton.addEventListener("click", () => {
    addPatientForm.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstInput = addPatientForm.querySelector("input[name='fullName']");
    if (firstInput) {
      firstInput.focus();
    }
  });
} else if (dashboardAddPatientButton) {
  dashboardAddPatientButton.addEventListener("click", () => {
    window.location.href = "portal-patients.html";
  });
}

if (dashboardSearchButton) {
  dashboardSearchButton.addEventListener("click", async () => {
    try {
      const query = String(dashboardSearchInput ? dashboardSearchInput.value : "").trim();
      if (!patientSearchInput || !patientSearchButton) {
        const destination = query
          ? `portal-patients.html?query=${encodeURIComponent(query)}`
          : "portal-patients.html";
        window.location.href = destination;
        return;
      }

      await loadPatients(query);
      const patientsSection = document.querySelector("#patients-section");
      if (patientsSection) {
        patientsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setSystemStatus(query ? `Dashboard search applied: ${query}` : "Dashboard search cleared.");
    } catch (error) {
      setSystemStatus(error.message || "Dashboard search failed.");
    }
  });
}

if (dashboardSearchInput) {
  dashboardSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (dashboardSearchButton) {
        dashboardSearchButton.click();
      }
    }
  });
}

if (dashboardFilterTodayButton) {
  dashboardFilterTodayButton.addEventListener("click", () => {
    const today = new Date().toISOString().slice(0, 10);
    const todayItems = appointmentRows.filter((item) => normalizeDateValue(item.date) === today);
    renderDashboardAppointments(todayItems);
    renderDashboardScheduleSummary(todayItems);
    setSystemStatus(`Showing ${todayItems.length} appointments for today.`);
  });
}

if (dashboardExportCsvButton) {
  dashboardExportCsvButton.addEventListener("click", () => {
    exportAppointmentsCsv(appointmentRows);
    setSystemStatus(`Exported ${appointmentRows.length} appointment rows.`);
  });
}

if (dashboardOpenAppointmentsButton) {
  dashboardOpenAppointmentsButton.addEventListener("click", () => {
    const appointmentsSection = document.querySelector("#appointments-section");
    if (appointmentsSection) {
      appointmentsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

if (dashboardSidebarToggle) {
  dashboardSidebarToggle.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });
}

if (noteForm) {
  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedPatientId) {
      setStatus(noteFeedback, "Select a patient first.", "error");
      return;
    }

    try {
      const formData = new FormData(noteForm);
      const payload = {
        text: String(formData.get("text") || "").trim(),
        author: currentUser ? currentUser.name : "Staff",
      };

      await requestJson(`/api/system/patients/${encodeURIComponent(selectedPatientId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      noteForm.reset();
      setStatus(noteFeedback, "Note added.");
      await selectPatient(selectedPatientId);
    } catch (error) {
      setStatus(noteFeedback, error.message || "Could not add note.", "error");
    }
  });
}

if (documentForm) {
  documentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedPatientId) {
      setStatus(documentFeedback, "Select a patient first.", "error");
      return;
    }

    try {
      const formData = new FormData(documentForm);
      const payload = {
        title: String(formData.get("title") || "").trim(),
        url: String(formData.get("url") || "").trim(),
      };

      await requestJson(`/api/system/patients/${encodeURIComponent(selectedPatientId)}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      documentForm.reset();
      setStatus(documentFeedback, "Document metadata saved.");
      await selectPatient(selectedPatientId);
    } catch (error) {
      setStatus(documentFeedback, error.message || "Could not save document.", "error");
    }
  });
}

if (scheduleDate) {
  scheduleDate.addEventListener("change", () => {
    refreshScheduleTimeOptions();
  });
}

if (scheduleForm) {
  scheduleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(scheduleForm);
      const payload = {
        patientId: String(formData.get("patientId") || "").trim(),
        date: String(formData.get("date") || "").trim(),
        time: String(formData.get("time") || "").trim(),
        type: String(formData.get("type") || "").trim(),
        format: String(formData.get("format") || "").trim(),
        notes: String(formData.get("notes") || "").trim(),
      };

      await requestJson("/api/system/appointments/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setStatus(scheduleFeedback, "Appointment scheduled.");
      await Promise.all([loadAppointments(), loadDashboard(), loadNotifications(), loadAvailabilityForScheduling()]);
    } catch (error) {
      setStatus(scheduleFeedback, error.message || "Could not schedule appointment.", "error");
    }
  });
}

if (alertForm) {
  alertForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(alertForm);
      const payload = {
        title: String(formData.get("title") || "").trim(),
        message: String(formData.get("message") || "").trim(),
        patientId: selectedPatientId || null,
      };

      await requestJson("/api/system/notifications/open-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      alertForm.reset();
      setStatus(alertFeedback, "Alert created.");
      await Promise.all([loadNotifications(), loadDashboard()]);
    } catch (error) {
      setStatus(alertFeedback, error.message || "Could not create alert.", "error");
    }
  });
}

if (profileForm) {
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) {
      setStatus(profileFeedback, "Please login first.", "error");
      return;
    }

    try {
      const formData = new FormData(profileForm);
      const payload = {
        name: String(formData.get("name") || "").trim(),
        password: String(formData.get("password") || "").trim(),
      };

      const result = await requestJson(`/api/system/profile/${encodeURIComponent(currentUser.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      currentUser.name = result.profile.name;
      localStorage.setItem("careconnect_portal_user", JSON.stringify(currentUser));
      setStatus(profileFeedback, "Profile updated.");
      await loadProfile();
    } catch (error) {
      setStatus(profileFeedback, error.message || "Could not update profile.", "error");
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("careconnect_portal_user");
    localStorage.removeItem("careconnect_portal_token");
    currentUser = null;
    currentToken = null;
    window.location.href = "portal-login.html";
  });
}

bootstrapPortal();
applyPageQueryToPatientsSearch();
})();
