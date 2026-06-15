const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");
const yearNode = document.querySelector("#year");
const cookieBanner = document.querySelector("#cookie-banner");
const cookieAcceptButton = document.querySelector("#cookie-accept");
const cookieSettingsButton = document.querySelector("#cookie-settings");
const form = document.querySelector("#appointment-form");
const feedback = document.querySelector("#form-feedback");
const cancelForm = document.querySelector("#cancel-form");
const cancelFeedback = document.querySelector("#cancel-feedback");
const prescriptionForm = document.querySelector("#prescription-form");
const prescriptionFeedback = document.querySelector("#prescription-feedback");
const revealNodes = document.querySelectorAll(".reveal");
const steps = form ? Array.from(form.querySelectorAll(".wizard-step")) : [];
const stepIndicator = document.querySelector("#step-indicator");
const prevButton = document.querySelector("#prev-step");
const nextButton = document.querySelector("#next-step");
const actionSelect = document.querySelector("#action");
const actionHelper = document.querySelector("#action-helper");
const patientType = document.querySelector("#patient-type");
const newPatientFields = form ? Array.from(form.querySelectorAll(".new-only")) : [];
const telehealthOk = document.querySelector("#telehealth-ok");
const formatSelect = document.querySelector("#format");
const coverageSelect = document.querySelector("#coverage");
const privatePayment = document.querySelector("#private-payment");
const reviewBox = document.querySelector("#review-box");
const dateSelect = document.querySelector("#slot-date");
const timeSelect = document.querySelector("#slot-time");
const slotHelper = document.querySelector("#slot-helper");
const availabilitySummary = document.querySelector("#availability-summary");
const availabilityBoard = document.querySelector("#availability-board");

let currentStep = 0;
let availabilityDates = [];
const AVAILABILITY_REFRESH_MS = 30000;
let availabilityRefreshTimer = null;

function toDisplayDate(dateValue) {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }

  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function toDisplayTime(timeValue) {
  const [hoursRaw, minutesRaw] = String(timeValue || "").split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return String(timeValue || "");
  }

  const normalizedHour = ((hours % 24) + 24) % 24;
  const period = normalizedHour >= 12 ? "PM" : "AM";
  const hour12 = normalizedHour % 12 || 12;
  const minutePart = String(minutes).padStart(2, "0");
  return `${hour12}:${minutePart} ${period}`;
}

function buildLocalAvailabilityResult(slots, appointments) {
  const bookingsBySlot = new Map();

  appointments
    .filter((item) => item && item.status !== "canceled")
    .forEach((item) => {
      const slotKey = `${item.date}|${item.time}`;
      bookingsBySlot.set(slotKey, (bookingsBySlot.get(slotKey) || 0) + 1);
    });

  const groupedByDate = new Map();
  let defaultSlotCapacity = 1;

  slots.forEach((slot) => {
    if (!slot || !slot.date || !slot.start_time) {
      return;
    }

    const slotCapacity = Number(slot.capacity) > 0 ? Number(slot.capacity) : 1;
    defaultSlotCapacity = slotCapacity;
    const slotKey = `${slot.date}|${slot.start_time}`;
    const booked = bookingsBySlot.get(slotKey) || 0;
    const remaining = Math.max(slotCapacity - booked, 0);
    const full = remaining === 0;

    const entry = {
      label: toDisplayTime(slot.start_time),
      time: slot.start_time,
      booked,
      capacity: slotCapacity,
      remaining,
      full,
      unavailable: false,
      available: !full,
      status: full ? "full" : "available",
    };

    if (!groupedByDate.has(slot.date)) {
      groupedByDate.set(slot.date, []);
    }

    groupedByDate.get(slot.date).push(entry);
  });

  const orderedDates = Array.from(groupedByDate.keys()).sort();
  const dates = orderedDates.map((dateValue) => {
    const slotsForDate = groupedByDate.get(dateValue).sort((a, b) => a.time.localeCompare(b.time));
    return {
      date: dateValue,
      displayDate: toDisplayDate(dateValue),
      slots: slotsForDate,
    };
  });

  let nextAvailable = null;
  for (const dateEntry of dates) {
    const firstOpen = dateEntry.slots.find((slot) => slot.available);
    if (firstOpen) {
      nextAvailable = {
        displayDate: dateEntry.displayDate,
        displayTime: firstOpen.label,
      };
      break;
    }
  }

  return {
    ok: true,
    slotCapacity: defaultSlotCapacity,
    dates,
    nextAvailable,
  };
}

async function loadAvailabilityFromLocalFiles() {
  const [slotResponse, appointmentResponse] = await Promise.all([
    fetch("data/appointment_slots.json", { cache: "no-store" }),
    fetch("data/appointments.json", { cache: "no-store" }),
  ]);

  if (!slotResponse.ok || !appointmentResponse.ok) {
    throw new Error("Local availability data is not available.");
  }

  const [slotData, appointmentData] = await Promise.all([
    slotResponse.json(),
    appointmentResponse.json(),
  ]);

  const slots = Array.isArray(slotData) ? slotData : [];
  const appointments = Array.isArray(appointmentData?.appointments) ? appointmentData.appointments : [];
  return buildLocalAvailabilityResult(slots, appointments);
}

function startAvailabilityAutoRefresh() {
  if (availabilityRefreshTimer) {
    return;
  }

  availabilityRefreshTimer = window.setInterval(() => {
    loadAvailability(dateSelect ? dateSelect.value : "");
  }, AVAILABILITY_REFRESH_MS);
}

function setStatus(node, message, state = "success") {
  if (!node) {
    return;
  }

  node.textContent = message;
  node.dataset.state = state;
}

function getSelectedLabel(select) {
  if (!select) {
    return "";
  }

  const selectedOption = select.options[select.selectedIndex];
  return selectedOption ? selectedOption.textContent : "";
}

function getSelectedDateEntry() {
  if (!dateSelect) {
    return null;
  }

  return availabilityDates.find((entry) => entry.date === dateSelect.value) || null;
}

function renderAvailabilityBoard(preferredDate = "") {
  if (!availabilityBoard) {
    return;
  }

  const selectedDateEntry =
    availabilityDates.find((entry) => entry.date === preferredDate)
    || getSelectedDateEntry()
    || availabilityDates[0]
    || null;

  if (!selectedDateEntry) {
    availabilityBoard.innerHTML = '<p class="helper-text">Availability will appear here once the server responds.</p>';
    return;
  }

  const slotStateLabel = (slot) => {
    if (slot.unavailable) {
      return "Unavailable";
    }

    if (slot.full) {
      return "Full";
    }

    return "Available";
  };

  availabilityBoard.innerHTML = `
    <p class="availability-board-heading">${selectedDateEntry.displayDate}</p>
    <div class="availability-board-table" aria-label="Live appointment slot availability">
      ${selectedDateEntry.slots
        .map((slot) => `
          <div class="slot-row ${slot.status}">
            <span class="slot-time">${slot.label}</span>
            <span class="slot-pill">${slotStateLabel(slot)}</span>
            <span class="slot-capacity">${slot.booked}/${slot.capacity} booked</span>
          </div>
        `)
        .join("")}
    </div>
  `;
}

function syncSlotHelper() {
  if (!slotHelper || !timeSelect) {
    return;
  }

  const selectedDate = getSelectedDateEntry();
  const selectedSlot = selectedDate
    ? selectedDate.slots.find((slot) => slot.time === timeSelect.value)
    : null;

  if (!selectedDate) {
    slotHelper.textContent = "Choose a date to see open times.";
    return;
  }

  if (!selectedSlot) {
    slotHelper.textContent = "Choose a time to lock a capped slot.";
    return;
  }

  slotHelper.textContent = `${selectedSlot.remaining} slot${selectedSlot.remaining === 1 ? "" : "s"} left for ${selectedSlot.label}.`;
}

function populateTimeOptions(preferredTime) {
  if (!timeSelect) {
    return;
  }

  const selectedDate = getSelectedDateEntry();
  const availableSlots = selectedDate
    ? selectedDate.slots.filter((slot) => slot.available)
    : [];

  timeSelect.innerHTML = "";

  if (!availableSlots.length) {
    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option value="">No open times for this date</option>';
    syncSlotHelper();
    return;
  }

  timeSelect.disabled = false;
  timeSelect.insertAdjacentHTML("beforeend", '<option value="">Select one</option>');

  availableSlots.forEach((slot) => {
    const selected = preferredTime && preferredTime === slot.time ? " selected" : "";
    timeSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${slot.time}"${selected}>${slot.label} (${slot.remaining} left)</option>`
    );
  });

  if (!availableSlots.some((slot) => slot.time === timeSelect.value)) {
    timeSelect.value = preferredTime && availableSlots.some((slot) => slot.time === preferredTime) ? preferredTime : "";
  }

  syncSlotHelper();
}

function populateDateOptions(preferredDate, preferredTime) {
  if (!dateSelect) {
    return;
  }

  const openDates = availabilityDates.filter((entry) => entry.slots.some((slot) => slot.available));
  dateSelect.innerHTML = "";

  if (!openDates.length) {
    dateSelect.disabled = true;
    timeSelect.disabled = true;
    dateSelect.innerHTML = '<option value="">No dates currently available</option>';
    timeSelect.innerHTML = '<option value="">No times currently available</option>';
    syncSlotHelper();
    return;
  }

  dateSelect.disabled = false;
  dateSelect.insertAdjacentHTML("beforeend", '<option value="">Select one</option>');

  openDates.forEach((entry) => {
    const totalRemaining = entry.slots.reduce((count, slot) => count + slot.remaining, 0);
    const selected = preferredDate && preferredDate === entry.date ? " selected" : "";
    dateSelect.insertAdjacentHTML(
      "beforeend",
      `<option value="${entry.date}"${selected}>${entry.displayDate} (${totalRemaining} open)</option>`
    );
  });

  if (!openDates.some((entry) => entry.date === dateSelect.value)) {
    if (preferredDate && openDates.some((entry) => entry.date === preferredDate)) {
      dateSelect.value = preferredDate;
    } else {
      dateSelect.value = openDates[0].date;
    }
  }

  populateTimeOptions(preferredTime);
}

async function loadAvailability(preferredDate = "", preferredTime = "") {
  const apiBase = /github\.io$/i.test(window.location.hostname)
    ? "https://careconnect-api.onrender.com"
    : "";
  try {
    let result;

    try {
      const response = await fetch(apiBase + "/api/availability", { cache: "no-store" });
      const apiResult = await response.json();

      if (!response.ok || !apiResult.ok) {
        throw new Error(apiResult.message || "Could not load availability.");
      }

      result = apiResult;
    } catch (_apiError) {
      result = await loadAvailabilityFromLocalFiles();
    }

    const refreshedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    availabilityDates = Array.isArray(result.dates) ? result.dates : [];
    if (dateSelect && timeSelect) {
      populateDateOptions(preferredDate, preferredTime);
    }
    renderAvailabilityBoard(preferredDate || (dateSelect ? dateSelect.value : ""));

    if (availabilitySummary) {
      if (result.nextAvailable) {
        availabilitySummary.textContent = `Next available: ${result.nextAvailable.displayDate} at ${result.nextAvailable.displayTime}. Each slot holds ${result.slotCapacity} booking${result.slotCapacity === 1 ? "" : "s"}. Updated ${refreshedAt}.`;
      } else {
        availabilitySummary.textContent = `All current slots are full. Check back after a cancellation or expand the booking window. Updated ${refreshedAt}.`;
      }
    }
  } catch (_error) {
    if (dateSelect && timeSelect) {
      dateSelect.disabled = true;
      timeSelect.disabled = true;
      dateSelect.innerHTML = '<option value="">Availability unavailable</option>';
      timeSelect.innerHTML = '<option value="">Availability unavailable</option>';
      setStatus(slotHelper, "Could not load live availability right now.", "error");
    }
    if (availabilitySummary) {
      availabilitySummary.textContent = "Live availability is temporarily unavailable. Please refresh or run the server to enable live updates.";
    }
    if (availabilityBoard) {
      availabilityBoard.innerHTML = '<p class="helper-text">Availability could not be loaded.</p>';
    }
  }
}

function syncStepVisibility() {
  if (!steps.length) {
    return;
  }

  steps.forEach((step, index) => {
    step.hidden = index !== currentStep;
  });

  if (stepIndicator) {
    stepIndicator.textContent = `Step ${currentStep + 1} of ${steps.length}`;
  }

  if (prevButton) {
    prevButton.disabled = currentStep === 0;
  }

  if (nextButton) {
    nextButton.hidden = currentStep === steps.length - 1;
  }
}

function toggleNewPatientFields() {
  const isNew = patientType && patientType.value === "New";
  newPatientFields.forEach((field) => {
    field.hidden = !isNew;
    const input = field.querySelector("input");
    if (input && input.name !== "nhsNumber") {
      input.required = isNew;
    }
  });
}

function syncFormatByTelehealth() {
  if (!formatSelect || !telehealthOk) {
    return;
  }

  const options = Array.from(formatSelect.options);
  options.forEach((option) => {
    if (option.text.includes("Video") || option.text.includes("Telephone")) {
      option.hidden = !telehealthOk.checked;
    }
  });

  if (!telehealthOk.checked && formatSelect.value !== "In-clinic") {
    formatSelect.value = "In-clinic";
  }
}

function syncCoverageFields() {
  if (!privatePayment || !coverageSelect) {
    return;
  }

  const isPrivate = coverageSelect.value === "Private";
  privatePayment.hidden = !isPrivate;
  const paymentSelect = privatePayment.querySelector("select");
  if (paymentSelect) {
    paymentSelect.required = isPrivate;
  }
}

function validateCurrentStep() {
  const step = steps[currentStep];
  if (!step) {
    return true;
  }

  const controls = Array.from(step.querySelectorAll("input, select, textarea"));
  for (const control of controls) {
    if (!control.checkValidity()) {
      control.reportValidity();
      return false;
    }
  }

  return true;
}

function buildReview() {
  if (!form || !reviewBox) {
    return;
  }

  const data = new FormData(form);
  const rows = [
    ["Action", data.get("action")],
    ["Appointment type", data.get("type")],
    ["Practitioner", data.get("practitioner")],
    ["Format", data.get("format")],
    ["Date", getSelectedLabel(dateSelect)],
    ["Time", getSelectedLabel(timeSelect)],
    ["Patient type", data.get("patientType")],
    ["Name", data.get("name")],
    ["Email", data.get("email")],
    ["Coverage", data.get("coverage")],
  ];

  reviewBox.innerHTML = rows
    .filter(([, value]) => value)
    .map(([label, value]) => `<p><strong>${label}:</strong> ${value}</p>`)
    .join("");
}

if (menuToggle && siteNav) {
  const mobileQuery = window.matchMedia("(max-width: 900px)");

  function syncMobileMenuState() {
    if (mobileQuery.matches) {
      siteNav.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  }

  syncMobileMenuState();

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", syncMobileMenuState);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(syncMobileMenuState);
  }

  window.addEventListener("resize", syncMobileMenuState);

  menuToggle.addEventListener("click", () => {
    const opened = siteNav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(opened));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      siteNav.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

if (yearNode) {
  yearNode.textContent = String(new Date().getFullYear());
}

if (cookieBanner) {
  const storedChoice = localStorage.getItem("careconnect_cookie_choice");
  if (storedChoice) {
    cookieBanner.hidden = true;
  }

  if (cookieAcceptButton) {
    cookieAcceptButton.addEventListener("click", () => {
      localStorage.setItem("careconnect_cookie_choice", "accepted");
      cookieBanner.hidden = true;
    });
  }

  if (cookieSettingsButton) {
    cookieSettingsButton.addEventListener("click", () => {
      localStorage.setItem("careconnect_cookie_choice", "custom");
      cookieBanner.hidden = true;
    });
  }
}

if (form && feedback) {
  if (actionSelect && actionHelper) {
    actionSelect.addEventListener("change", () => {
      if (!actionSelect.value) {
        actionHelper.textContent = "";
        return;
      }

      if (actionSelect.value === "Register as New Patient") {
        if (patientType) {
          patientType.value = "New";
          toggleNewPatientFields();
        }
        actionHelper.textContent = "New patient mode enabled: please complete all patient registration details.";
        return;
      }

      if (actionSelect.value === "Book Appointment") {
        actionHelper.textContent = "";
        return;
      }

      actionHelper.textContent = "Continue to the next step to complete your booking.";
    });
  }

  if (patientType) {
    patientType.addEventListener("change", toggleNewPatientFields);
    toggleNewPatientFields();
  }

  if (telehealthOk) {
    telehealthOk.addEventListener("change", syncFormatByTelehealth);
    syncFormatByTelehealth();
  }

  if (coverageSelect) {
    coverageSelect.addEventListener("change", syncCoverageFields);
    syncCoverageFields();
  }

  if (dateSelect) {
    dateSelect.addEventListener("change", () => {
      populateTimeOptions();
      renderAvailabilityBoard(dateSelect.value);
      if (currentStep === steps.length - 1) {
        buildReview();
      }
    });
  }

  if (timeSelect) {
    timeSelect.addEventListener("change", () => {
      syncSlotHelper();
      if (currentStep === steps.length - 1) {
        buildReview();
      }
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (!validateCurrentStep()) {
        return;
      }
      currentStep = Math.min(currentStep + 1, steps.length - 1);
      if (currentStep === steps.length - 1) {
        buildReview();
      }
      syncStepVisibility();
    });
  }

  if (prevButton) {
    prevButton.addEventListener("click", () => {
      currentStep = Math.max(currentStep - 1, 0);
      syncStepVisibility();
    });
  }

  syncStepVisibility();
  loadAvailability();
  startAvailabilityAutoRefresh();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (currentStep !== steps.length - 1) {
      feedback.textContent = "Please complete all steps before confirming.";
      return;
    }

    if (!validateCurrentStep()) {
      feedback.textContent = "Please review missing required details.";
      return;
    }

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      type: String(formData.get("type") || "").trim(),
      format: String(formData.get("format") || "").trim(),
      notes: String(formData.get("notes") || "").trim(),
      action: String(formData.get("action") || "").trim(),
      practitioner: String(formData.get("practitioner") || "").trim(),
      date: String(formData.get("date") || "").trim(),
      time: String(formData.get("time") || "").trim(),
      patientType: String(formData.get("patientType") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      duration: String(formData.get("duration") || "").trim(),
      coverage: String(formData.get("coverage") || "").trim(),
      paymentMethod: String(formData.get("paymentMethod") || "").trim(),
    };

    try {
      const response = await fetch(apiBase + "/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to submit appointment right now.");
      }

      const appointment = result.appointment || {};
      let emailNote = "Confirmation email status is unavailable.";
      if (result.emailStatus && result.emailStatus.delivered) {
        emailNote = result.emailStatus.mode === "test"
          ? "A confirmation email has been generated using the server test mailbox."
          : "A confirmation email has been sent."
      }

      setStatus(
        feedback,
        `Appointment confirmed for ${appointment.displayDate || payload.date} at ${appointment.displayTime || payload.time}. Confirmation code: ${appointment.confirmationCode || "pending"}. ${emailNote}`
      );
      form.reset();
      currentStep = 0;
      toggleNewPatientFields();
      syncFormatByTelehealth();
      syncCoverageFields();
      syncStepVisibility();
      await loadAvailability();
      if (reviewBox) {
        reviewBox.innerHTML = "";
      }
    } catch (error) {
      setStatus(feedback, error.message || "Submission failed. Please try again in a moment.", "error");
      await loadAvailability(payload.date, payload.time);
    }
  });
}

if (availabilitySummary && (!form || !feedback)) {
  loadAvailability();
  startAvailabilityAutoRefresh();
}

if (cancelForm) {
  cancelForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!cancelForm.checkValidity()) {
      cancelForm.reportValidity();
      setStatus(cancelFeedback, "Please complete all required cancellation details.", "error");
      return;
    }

    const formData = new FormData(cancelForm);
    const payload = {
      fullName: String(formData.get("fullName") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      appointmentDate: String(formData.get("appointmentDate") || "").trim(),
      appointmentTime: String(formData.get("appointmentTime") || "").trim(),
      practiceLocation: String(formData.get("practiceLocation") || "").trim(),
      changeReason: String(formData.get("changeReason") || "").trim(),
      email: String(formData.get("email") || "").trim(),
    };

    if (!payload.fullName || !payload.email || !payload.appointmentDate) {
      setStatus(cancelFeedback, "Full name, email, and appointment date are required.", "error");
      return;
    }

    try {
      const response = await fetch(apiBase + "/api/appointments/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Could not cancel that appointment.");
      }

      setStatus(cancelFeedback, result.message || "Appointment canceled.");
      cancelForm.reset();
      await loadAvailability();
    } catch (error) {
      setStatus(cancelFeedback, error.message || "Could not cancel that appointment.", "error");
    }
  });
}

if (prescriptionForm) {
  prescriptionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!prescriptionForm.checkValidity()) {
      prescriptionForm.reportValidity();
      setStatus(prescriptionFeedback, "Please complete all required prescription details.", "error");
      return;
    }

    const formData = new FormData(prescriptionForm);
    const payload = {
      fullName: String(formData.get("fullName") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      dateOfBirth: String(formData.get("dateOfBirth") || "").trim(),
      medicationName: String(formData.get("medicationName") || "").trim(),
      strength: String(formData.get("strength") || "").trim(),
      dose: String(formData.get("dose") || "").trim(),
      quantity: Number(formData.get("quantity") || 0),
      collectionSite: String(formData.get("collectionSite") || "").trim(),
      reason: String(formData.get("reason") || "").trim(),
      notes: String(formData.get("notes") || "").trim(),
    };

    try {
      const response = await fetch(apiBase + "/api/prescriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Could not submit prescription request.");
      }

      const request = result.request || {};
      setStatus(
        prescriptionFeedback,
        `Prescription request received for ${request.medicationName || payload.medicationName}. Reference: ${request.requestCode || "pending"}.`
      );
      prescriptionForm.reset();
    } catch (error) {
      setStatus(prescriptionFeedback, error.message || "Could not submit prescription request.", "error");
    }
  });
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealNodes.forEach((node) => observer.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add("is-visible"));
}
