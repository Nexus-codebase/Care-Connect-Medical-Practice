const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");
const yearNode = document.querySelector("#year");
const form = document.querySelector("#appointment-form");
const feedback = document.querySelector("#form-feedback");
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

let currentStep = 0;

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

  if (currentStep === 0 && actionSelect && actionSelect.value !== "Book Appointment") {
    if (actionHelper) {
      actionHelper.textContent = "For this flow, please choose Book Appointment to continue.";
    }
    return false;
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
    ["Date", data.get("date")],
    ["Time window", data.get("timeWindow")],
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

if (form && feedback) {
  if (actionSelect && actionHelper) {
    actionSelect.addEventListener("change", () => {
      if (actionSelect.value && actionSelect.value !== "Book Appointment") {
        actionHelper.textContent = "This wizard currently handles Book Appointment only.";
      } else {
        actionHelper.textContent = "";
      }
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
      timeWindow: String(formData.get("timeWindow") || "").trim(),
      patientType: String(formData.get("patientType") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      duration: String(formData.get("duration") || "").trim(),
      coverage: String(formData.get("coverage") || "").trim(),
      paymentMethod: String(formData.get("paymentMethod") || "").trim(),
    };

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Unable to submit appointment right now.");
      }

      feedback.textContent = `Thanks ${payload.name || "Patient"}, your appointment request has been recorded.`;
      form.reset();
      currentStep = 0;
      toggleNewPatientFields();
      syncFormatByTelehealth();
      syncCoverageFields();
      syncStepVisibility();
      if (reviewBox) {
        reviewBox.innerHTML = "";
      }
    } catch (_error) {
      feedback.textContent = "Submission failed. Please try again in a moment.";
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
