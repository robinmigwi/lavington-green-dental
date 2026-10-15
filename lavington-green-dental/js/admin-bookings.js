(() => {
  const API = "/.netlify/functions/admin-bookings";
  const STORAGE_KEY = "lavingtonBookingAdminToken";
  const loginPanel = document.getElementById("login-panel");
  const loginForm = document.getElementById("login-form");
  const loginToken = document.getElementById("admin-token");
  const loginButton = document.getElementById("login-button");
  const loginMessage = document.getElementById("login-message");
  const requestsPanel = document.getElementById("requests-panel");
  const list = document.getElementById("request-list");
  const count = document.getElementById("request-count");
  const pageMessage = document.getElementById("page-message");
  const refreshButton = document.getElementById("refresh-button");
  const logoutButton = document.getElementById("logout-button");
  let token = sessionStorage.getItem(STORAGE_KEY) || "";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return String(value || "Not provided");
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-KE", {
      day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi"
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }

  function formatTime(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (!match) return String(value || "Not provided");
    return match[1] + ":" + match[2] + " " + match[3].toLowerCase();
  }

  function toInputTime(value) {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (!match) return "";
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const suffix = match[3].toLowerCase();
    if (suffix === "pm" && hour !== 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  }

  function fromInputTime(value) {
    const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return "";
    let hour = Number(match[1]);
    const minute = match[2];
    const suffix = hour >= 12 ? "pm" : "am";
    hour = hour % 12 || 12;
    return hour + ":" + minute + " " + suffix;
  }

  function showMessage(container, message, kind) {
    container.innerHTML = "";
    if (!message) return;
    const el = document.createElement("div");
    el.className = "admin-notice" + (kind ? " " + kind : "");
    el.textContent = message;
    container.appendChild(el);
  }

  function setAuthenticated(isAuthenticated) {
    loginPanel.hidden = isAuthenticated;
    requestsPanel.hidden = !isAuthenticated;
    refreshButton.hidden = !isAuthenticated;
    logoutButton.hidden = !isAuthenticated;
  }

  async function apiRequest(method, body) {
    const options = {
      method,
      headers: {
        "Authorization": "Bearer " + token,
        "Accept": "application/json"
      }
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const result = await fetch(API, options);
    const data = await result.json().catch(() => ({}));
    if (result.status === 401) {
      token = "";
      sessionStorage.removeItem(STORAGE_KEY);
      setAuthenticated(false);
      throw new Error("Your administrator token was not accepted. Please sign in again.");
    }
    if (!result.ok || !data.ok) {
      throw new Error(data.error || "The request could not be completed.");
    }
    return data;
  }

  async function signIn(value) {
    token = value.trim();
    if (!token) throw new Error("Enter the administrator access token.");
    const data = await apiRequest("GET");
    sessionStorage.setItem(STORAGE_KEY, token);
    loginToken.value = "";
    loginMessage.innerHTML = "";
    setAuthenticated(true);
    renderBookings(data.bookings || []);
  }

  async function loadBookings() {
    pageMessage.innerHTML = "";
    list.innerHTML = '<div class="admin-panel">Loading appointment requests…</div>';
    try {
      const data = await apiRequest("GET");
      setAuthenticated(true);
      renderBookings(data.bookings || []);
    } catch (error) {
      showMessage(pageMessage, error.message || "Could not load appointment requests.", "error");
      if (!token) setAuthenticated(false);
      list.innerHTML = "";
    }
  }

  function dataBlock(label, value) {
    return '<div class="admin-data"><strong>' + escapeHtml(label) + '</strong><p>' +
      escapeHtml(value || "Not provided") + '</p></div>';
  }

  function renderBookings(bookings) {
    count.textContent = bookings.length + (bookings.length === 1 ? " request" : " requests");
    if (!bookings.length) {
      list.innerHTML = '<div class="admin-panel admin-empty"><h2>No requests yet</h2><p class="admin-muted">New website appointment requests will appear here.</p></div>';
      return;
    }
    list.innerHTML = "";
    bookings.forEach((booking) => list.appendChild(renderBooking(booking)));
  }

  function renderBooking(booking) {
    const card = document.createElement("article");
    card.className = "admin-panel";
    const confirmed = booking.status === "confirmed";
    const sent = booking.patientConfirmation && booking.patientConfirmation.sent === true;
    const preference = booking.confirmationChannel === "email"
      ? "Email: " + (booking.email || "not provided")
      : "SMS text message to " + (booking.phone || "not provided");
    const statusText = confirmed ? "Confirmed in Recordit" : "Pending dentist allocation";

    let html = '<div class="admin-heading"><div><span class="eyebrow">Request</span><h2>' +
      escapeHtml(booking.name || "Patient request") + '</h2><p class="admin-muted admin-small">' +
      escapeHtml(booking.id) + ' · Received ' + escapeHtml(booking.createdAt ? new Date(booking.createdAt).toLocaleString("en-KE") : "date unavailable") +
      '</p></div><span class="admin-status ' + (confirmed ? "confirmed" : "pending") + '">' +
      escapeHtml(statusText) + '</span></div>' +
      '<div class="admin-request-grid">' +
      dataBlock("Service requested", booking.suggestedVisit || booking.service) +
      dataBlock("Preferred date", formatDate(booking.preferredDate)) +
      dataBlock("Preferred time", booking.preferredTime) +
      dataBlock("Contact", (booking.phone || "") + (booking.email ? " · " + booking.email : "")) +
      dataBlock("Confirmation method", preference) +
      dataBlock("Patient comfort", booking.feeling) +
      dataBlock("Patient concern", booking.concern) +
      dataBlock("Additional notes", booking.message);
    html += "</div>";

    if (confirmed) {
      html += '<div class="admin-notice ' + (sent ? "success" : "error") + '">' +
        (sent
          ? "Patient confirmation accepted for delivery by " + escapeHtml(booking.confirmationChannel === "email" ? "email" : "SMS") + "."
          : "Appointment is marked confirmed, but the patient notification has not been recorded as sent. Check the messaging credentials below, then retry.") +
        '</div><div class="admin-request-grid">' +
        dataBlock("Assigned dentist", booking.assignedDentist) +
        dataBlock("Confirmed date", formatDate(booking.confirmedDate)) +
        dataBlock("Confirmed time", formatTime(booking.confirmedTime) + " EAT") +
        dataBlock("Recordit event number", booking.recorditEventNo) +
        '</div>';
      if (!sent) {
        html += '<form class="admin-confirm-form" data-confirm-form data-request-id="' + escapeHtml(booking.id) + '">' +
          '<p>Once the clinic has verified the booking in Recordit, retry sending the patient confirmation.</p>' +
          '<label class="admin-check"><input type="checkbox" name="adminConfirmedInRecordit" required><span>I have checked that this appointment is confirmed in Recordit.</span></label>' +
          '<div class="admin-actions"><button type="submit" class="btn btn-primary">Retry patient confirmation</button></div>' +
          '<div class="admin-form-message" aria-live="polite"></div></form>';
      }
    } else {
      html += '<div class="admin-confirm-form"><h3>Confirm after Recordit</h3>' +
        '<p class="admin-muted admin-small">First open Recordit, allocate the appointment to a dentist, and confirm it there. Then enter the confirmed details below. This dashboard does not create or change Recordit appointments.</p>' +
        '<form data-confirm-form data-request-id="' + escapeHtml(booking.id) + '">' +
        '<div class="admin-request-grid">' +
        '<div class="admin-field"><label>Assigned dentist</label><input name="assignedDentist" required maxlength="160" placeholder="Dentist assigned in Recordit"></div>' +
        '<div class="admin-field"><label>Recordit event number</label><input name="recorditEventNo" required maxlength="80" placeholder="Reference from Recordit"></div>' +
        '<div class="admin-field"><label>Confirmed appointment date</label><input name="confirmedDate" type="date" min="' + escapeHtml(new Date().toLocaleDateString("en-CA")) + '" value="' + escapeHtml(booking.preferredDate || "") + '" required></div>' +
        '<div class="admin-field"><label>Confirmed appointment time</label><input name="confirmedTime" type="time" step="1800" value="' + escapeHtml(toInputTime(booking.preferredTime)) + '" required></div>' +
        '</div>' +
        '<label class="admin-check"><input type="checkbox" name="adminConfirmedInRecordit" required><span>I have already allocated and confirmed this appointment in Recordit. I understand that submitting this form will send the patient a confirmation message.</span></label>' +
        '<div class="admin-actions"><button type="submit" class="btn btn-primary">Mark confirmed and notify patient</button></div>' +
        '<div class="admin-form-message" aria-live="polite"></div></form></div>';
    }

    card.innerHTML = html;
    const form = card.querySelector("[data-confirm-form]");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        const message = form.querySelector(".admin-form-message");
        const values = new FormData(form);
        if (values.get("adminConfirmedInRecordit") !== "on") {
          showMessage(message, "Confirm the appointment in Recordit first.", "error");
          return;
        }

        button.disabled = true;
        button.textContent = "Processing…";
        message.innerHTML = "";
        const payload = {
          action: "confirm",
          requestId: booking.id,
          adminConfirmedInRecordit: true,
          assignedDentist: values.get("assignedDentist") || booking.assignedDentist || "",
          recorditEventNo: values.get("recorditEventNo") || booking.recorditEventNo || "",
          confirmedDate: values.get("confirmedDate") || booking.confirmedDate || "",
          confirmedTime: values.get("confirmedTime")
            ? values.get("confirmedTime")
            : toInputTime(booking.confirmedTime || booking.preferredTime)
        };

        try {
          const data = await apiRequest("POST", payload);
          const notice = data.patientConfirmation && data.patientConfirmation.sent
            ? "Appointment confirmed and patient notification accepted by the provider."
            : "Appointment is marked confirmed, but the patient notification was not sent. Check notification settings and retry.";
          showMessage(message, notice, data.patientConfirmation && data.patientConfirmation.sent ? "success" : "error");
          await loadBookings();
        } catch (error) {
          showMessage(message, error.message || "Could not confirm this request.", "error");
          button.disabled = false;
          button.textContent = confirmed ? "Retry patient confirmation" : "Mark confirmed and notify patient";
        }
      });
    }
    return card;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    loginButton.textContent = "Checking…";
    showMessage(loginMessage, "", "");
    try {
      await signIn(loginToken.value);
    } catch (error) {
      showMessage(loginMessage, error.message || "Could not sign in.", "error");
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = "Open requests";
    }
  });

  refreshButton.addEventListener("click", loadBookings);
  logoutButton.addEventListener("click", () => {
    token = "";
    sessionStorage.removeItem(STORAGE_KEY);
    list.innerHTML = "";
    count.textContent = "";
    pageMessage.innerHTML = "";
    setAuthenticated(false);
  });

  if (token) {
    signIn(token).catch(() => {
      token = "";
      sessionStorage.removeItem(STORAGE_KEY);
      setAuthenticated(false);
    });
  }
})();
