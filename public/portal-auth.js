(function () {
  // On GitHub Pages use the deployed Render API; locally use relative paths
  const API_BASE = /github\.io$/i.test(window.location.hostname)
    ? "https://careconnect-api.onrender.com"
    : "";

  const loginForm = document.querySelector("#portal-login-form");
  const signupForm = document.querySelector("#portal-signup-form");
  const authFeedback = document.querySelector("#portal-auth-feedback");
  const signupFeedback = document.querySelector("#portal-signup-feedback");

  function setStatus(node, message, state = "success") {
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      const onStaticHost = /github\.io$/i.test(window.location.hostname);
      const message = onStaticHost
        ? "Portal sign-in requires the CareConnect API server. The GitHub Pages site is static-only."
        : "Portal service is temporarily unavailable. Please try again shortly.";
      throw new Error(message);
    }

    const result = await response.json();
    if (!response.ok || result.ok === false) {
      throw new Error(result.message || "Request failed.");
    }
    return result;
  }

  function hasPortalSession() {
    const rawUser = localStorage.getItem("careconnect_portal_user");
    const token = localStorage.getItem("careconnect_portal_token");
    return Boolean(rawUser && token);
  }

  if (hasPortalSession() && !signupForm) {
    window.location.href = "portal.html";
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const formData = new FormData(loginForm);
        const payload = {
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || "").trim(),
        };

        const result = await requestJson(API_BASE + "/api/system/auth/login", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        localStorage.setItem("careconnect_portal_user", JSON.stringify(result.user));
        localStorage.setItem("careconnect_portal_token", result.token || "");
        setStatus(authFeedback, "Login successful. Redirecting...");
        window.location.href = "portal.html";
      } catch (error) {
        setStatus(authFeedback, error.message || "Login failed.", "error");
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const formData = new FormData(signupForm);
        const payload = {
          name: String(formData.get("name") || "").trim(),
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || "").trim(),
        };

        await requestJson(API_BASE + "/api/system/auth/signup", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        signupForm.reset();
        setStatus(signupFeedback, "Account created. Redirecting to login...");
        window.setTimeout(() => {
          window.location.href = "portal-login.html";
        }, 700);
      } catch (error) {
        setStatus(signupFeedback, error.message || "Signup failed.", "error");
      }
    });
  }
})();
