const settingsForm = document.querySelector("#admin-settings-form");
const slotCapacityInput = document.querySelector("#slot-capacity");
const bookingWindowInput = document.querySelector("#booking-window");
const slotTimesInput = document.querySelector("#slot-times");
const adminFeedback = document.querySelector("#admin-feedback");
const smtpStatus = document.querySelector("#smtp-status");
const kpiSlotCapacity = document.querySelector("#kpi-slot-capacity");
const kpiBookingWindow = document.querySelector("#kpi-booking-window");
const kpiSlotCount = document.querySelector("#kpi-slot-count");
const kpiSmtp = document.querySelector("#kpi-smtp");

const API_BASE = /github\.io$/i.test(window.location.hostname)
  ? "https://careconnect-api.onrender.com"
  : "";

function setAdminStatus(message, state = "success") {
  if (!adminFeedback) {
    return;
  }

  adminFeedback.textContent = message;
  adminFeedback.dataset.state = state;
}

function toTimesArray(timesText) {
  return String(timesText || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function updateSmtpStatus(email) {
  if (!smtpStatus || !email) {
    return;
  }

  if (email.smtpConfigured) {
    smtpStatus.textContent = `SMTP configured: ${email.host || "host"}:${email.port} (${email.secure ? "secure" : "starttls"}). Mail from: ${email.from}.`;
  } else {
    smtpStatus.textContent = "SMTP not configured. Email delivery is using the automatic test mailbox service.";
  }
}

function updateKpis(settings, email) {
  if (kpiSlotCapacity) {
    kpiSlotCapacity.textContent = String(settings.slotCapacity || "--");
  }

  if (kpiBookingWindow) {
    const days = Number(settings.bookingWindowDays || 0);
    kpiBookingWindow.textContent = days > 0 ? `${days} days` : "--";
  }

  if (kpiSlotCount) {
    const totalSlots = Array.isArray(settings.slotTimes) ? settings.slotTimes.length : 0;
    kpiSlotCount.textContent = totalSlots > 0 ? String(totalSlots) : "--";
  }

  if (kpiSmtp) {
    if (!email) {
      kpiSmtp.textContent = "Unknown";
      return;
    }
    kpiSmtp.textContent = email.smtpConfigured ? "Configured" : "Fallback mode";
  }
}

async function loadAdminSettings() {
  try {
    const response = await fetch(API_BASE + "/api/admin/settings");
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "Could not load admin settings.");
    }

    if (slotCapacityInput) {
      slotCapacityInput.value = String(result.settings.slotCapacity || "");
    }

    if (bookingWindowInput) {
      bookingWindowInput.value = String(result.settings.bookingWindowDays || "");
    }

    if (slotTimesInput) {
      slotTimesInput.value = Array.isArray(result.settings.slotTimes)
        ? result.settings.slotTimes.join(", ")
        : "";
    }

    updateSmtpStatus(result.email);
    updateKpis(result.settings || {}, result.email);
  } catch (error) {
    if (smtpStatus) {
      smtpStatus.textContent = "Could not load admin settings.";
    }
    updateKpis({}, null);
    setAdminStatus(error.message || "Could not load admin settings.", "error");
  }
}

if (settingsForm) {
  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      slotCapacity: Number(slotCapacityInput ? slotCapacityInput.value : 0),
      bookingWindowDays: Number(bookingWindowInput ? bookingWindowInput.value : 0),
      slotTimes: toTimesArray(slotTimesInput ? slotTimesInput.value : ""),
    };

    try {
      const response = await fetch(API_BASE + "/api/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Could not save booking settings.");
      }

      setAdminStatus("Booking settings saved. New slots are now live.");
      await loadAdminSettings();
    } catch (error) {
      setAdminStatus(error.message || "Could not save booking settings.", "error");
    }
  });

  loadAdminSettings();
}
