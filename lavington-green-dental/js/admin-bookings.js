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
  let availablePlanners = [];
  let plannerLoadError = "";

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
    const raw = String(value || "");
    const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (twelveHour) return twelveHour[1] + ":" + twelveHour[2] + " " + twelveHour[3].toLowerCase();
    const twentyFourHour = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!twentyFourHour) return raw || "Not provided";
    const hour = Number(twentyFourHour[1]);
    return (hour % 12 || 12) + ":" + twentyFourHour[2] + " " + (hour >= 12 ? "pm" : "am");
  }

  function todayInNairobi() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Nairobi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const part = (type) => parts.find((item) => item.type === type).value;
    return part("year") + "-" + part("month") + "-" + part("day");
  }

  function toInputTime(value) {
    const raw = String(value || "").trim();
    const twentyFourHour = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (twentyFourHour) return raw;
    const match = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
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

  async function apiRequest(method, body, queryString) {
    const options = {
      method,
      headers: {
        "Authorization": "Bearer " + encodeURIComponent(token),
        "Accept": "application/json"
      }
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const result = await fetch(API + (queryString || ""), options);
    const data = await result.json().catch(() => ({}));
    if (result.status === 401) {
      token = "";
      sessionStorage.removeItem(STORAGE_KEY);
      setAuthenticated(false);
      throw new Error("Your administrator token was not accepted. Please sign in again.");
    }
    if (!result.ok || !data.ok) {
      const fallback = "The booking service returned HTTP " + result.status +
        " without a readable error. Check the Netlify function logs for admin-bookings.";
      throw new Error(data.error || fallback);
    }
    return data;
  }

  async function loadPlannerChoices() {
    try {
      const data = await apiRequest("GET", undefined, "?resource=planners");
      availablePlanners = Array.isArray(data.planners) ? data.planners : [];
      plannerLoadError = availablePlanners.length
        ? ""
        : "Recordit did not return any available dentists.";
    } catch (error) {
      availablePlanners = [];
      plannerLoadError = error.message || "Could not load the dentist list from Recordit.";
    }
  }

  function showPlannerLoadMessage() {
    if (plannerLoadError) {
      showMessage(
        pageMessage,
        "Appointment requests are available, but the dentist list could not be loaded from Recordit. Assignment is disabled until the connection is restored.",
        "error"
      );
    }
  }

  async function signIn(value) {
    token = value.trim();
    if (!token) throw new Error("Enter the administrator access token.");
    const data = await apiRequest("GET");
    await loadPlannerChoices();
    sessionStorage.setItem(STORAGE_KEY, token);
    loginToken.value = "";
    loginMessage.innerHTML = "";
    setAuthenticated(true);
    renderBookings(data.bookings || []);
    showPlannerLoadMessage();
  }

  async function loadBookings() {
    pageMessage.innerHTML = "";
    list.innerHTML = '<div class="admin-panel">Loading appointment requests…</div>';
    try {
      const data = await apiRequest("GET");
      await loadPlannerChoices();
      setAuthenticated(true);
      renderBookings(data.bookings || []);
      showPlannerLoadMessage();
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
    const savedInRecordit = booking.status === "recordit_saved";
    const saveCheckRequired = booking.status === "recordit_save_check_required";
    const savingInRecordit = booking.status === "recordit_saving";
    const sent = booking.patientConfirmation && booking.patientConfirmation.sent === true;
    const preference = booking.confirmationChannel === "email"
      ? "Email: " + (booking.email || "not provided")
      : "SMS text message to " + (booking.phone || "not provided");
    const statusText = confirmed
      ? "Confirmed in Recordit"
      : savedInRecordit
        ? "Saved in Recordit, awaiting confirmation"
        : saveCheckRequired
          ? "Recordit status needs checking"
          : savingInRecordit
            ? "Saving to Recordit"
            : "Pending dentist allocation";

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
          : "Appointment is confirmed in Recordit, but the patient notification has not been recorded as sent. Check notification settings and retry.") +
        '</div><div class="admin-request-grid">' +
        dataBlock("Assigned dentist", booking.assignedDentist) +
        dataBlock("Confirmed date", formatDate(booking.confirmedDate)) +
        dataBlock("Confirmed time", formatTime(booking.confirmedTime) + " EAT") +
        dataBlock("Recordit event number", booking.recorditEventNo) +
        '</div>';
      if (!sent) {
        html += '<form class="admin-confirm-form" data-confirm-form data-request-id="' + escapeHtml(booking.id) + '">' +
          '<p>Retry the patient notification after confirming the appointment details.</p>' +
          '<label class="admin-check"><input type="checkbox" name="adminConfirmedInRecordit" required><span>I have checked that this appointment is confirmed in Recordit.</span></label>' +
          '<div class="admin-actions"><button type="submit" class="btn btn-primary">Retry patient confirmation</button></div>' +
          '<div class="admin-form-message" aria-live="polite"></div></form>';
      }
    } else if (savedInRecordit) {
      html += '<div class="admin-notice error">Recordit saved this appointment, but its response did not mark it as confirmed. No patient confirmation has been sent yet.</div>' +
        '<div class="admin-request-grid">' +
        dataBlock("Assigned dentist", booking.assignedDentist) +
        dataBlock("Appointment date", formatDate(booking.confirmedDate)) +
        dataBlock("Appointment time", formatTime(booking.confirmedTime) + " EAT") +
        dataBlock("Recordit event number", booking.recorditEventNo) +
        '</div>' +
        '<form class="admin-confirm-form" data-confirm-form data-request-id="' + escapeHtml(booking.id) + '">' +
        '<p>First, open this appointment in Recordit and confirm it there. Only use this step after Recordit shows the appointment as confirmed. The patient will then receive the selected confirmation method.</p>' +
        '<label class="admin-check"><input type="checkbox" name="adminConfirmedInRecordit" required><span>I have verified that this appointment is confirmed in Recordit.</span></label>' +
        '<div class="admin-actions"><button type="submit" class="btn btn-primary">Mark confirmed and send patient notification</button></div>' +
        '<div class="admin-form-message" aria-live="polite"></div></form>';
    } else if (saveCheckRequired || savingInRecordit) {
      html += '<div class="admin-notice error">' +
        (saveCheckRequired
          ? "Recordit could not confirm the save result. To avoid a duplicate appointment, this request is paused and cannot be submitted again until its Recordit status is checked."
          : "The appointment save is marked as in progress. Refresh the dashboard before doing anything else; do not submit this request again.") +
        '</div>' +
        '<div class="admin-request-grid">' +
        dataBlock("Selected dentist", booking.assignedDentist) +
        dataBlock("Appointment date", formatDate(booking.confirmedDate)) +
        dataBlock("Appointment time", formatTime(booking.confirmedTime) + " EAT") +
        dataBlock("Recordit event number", booking.recorditEventNo) +
        '</div>';
    } else {
      html += '<div class="admin-confirm-form"><h3>Assign a dentist</h3>' +
        '<p class="admin-muted admin-small">Choose the dentist and final appointment date and time. The system will create the appointment in Recordit. If Recordit rejects the selected time, you can choose another dentist or time. The patient is notified only if Recordit reports the appointment as confirmed.</p>' +
        '<form data-assignment-form data-request-id="' + escapeHtml(booking.id) + '">' +
        '<div class="admin-request-grid">' +
        '<div class="admin-field"><label>Assigned dentist</label><select name="plannerId" data-planner-select required><option value="">Loading dentists from Recordit…</option></select></div>' +
        '<div class="admin-field"><label>Appointment date</label><input name="confirmedDate" type="date" min="' + escapeHtml(todayInNairobi()) + '" value="' + escapeHtml(booking.preferredDate || "") + '" required></div>' +
        '<div class="admin-field"><label>Appointment time</label><input name="confirmedTime" type="time" step="1800" value="' + escapeHtml(toInputTime(booking.preferredTime)) + '" required></div>' +
        '</div>' +
        '<div class="admin-actions"><button type="submit" class="btn btn-primary">Assign dentist and save to Recordit</button></div>' +
        '<div class="admin-form-message" aria-live="polite"></div></form></div>';
    }

    card.innerHTML = html;

    const plannerSelect = card.querySelector("[data-planner-select]");
    if (plannerSelect) {
      const selectedPlanner = booking.plannerId || "";
      plannerSelect.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.disabled = true;
      placeholder.selected = !selectedPlanner;
      placeholder.textContent = plannerLoadError ? "Dentist list unavailable" : "Choose a dentist";
      plannerSelect.appendChild(placeholder);
      availablePlanners.forEach((planner) => {
        const option = document.createElement("option");
        option.value = planner.id;
        option.textContent = planner.name;
        plannerSelect.appendChild(option);
      });
      if (selectedPlanner) plannerSelect.value = selectedPlanner;
      const submitButton = card.querySelector("[data-assignment-form] button[type='submit']");
      if (submitButton && (plannerLoadError || !availablePlanners.length)) submitButton.disabled = true;
    }

    const form = card.querySelector("[data-confirm-form], [data-assignment-form]");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        const message = form.querySelector(".admin-form-message");
        const values = new FormData(form);
        const isAssignment = form.hasAttribute("data-assignment-form");

        if (!isAssignment && values.get("adminConfirmedInRecordit") !== "on") {
          showMessage(message, "Confirm the appointment in Recordit first.", "error");
          return;
        }
        if (isAssignment && !values.get("plannerId")) {
          showMessage(message, "Choose a dentist before assigning this request.", "error");
          return;
        }

        button.disabled = true;
        button.textContent = isAssignment ? "Saving to Recordit…" : "Processing…";
        message.innerHTML = "";

        const payload = isAssignment ? {
          action: "assign",
          requestId: booking.id,
          plannerId: values.get("plannerId"),
          confirmedDate: values.get("confirmedDate") || "",
          confirmedTime: values.get("confirmedTime") || ""
        } : {
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
          let notice;
          let kind;
          if (isAssignment && data.status === "recordit_saved") {
            notice = "The appointment was saved to Recordit, but Recordit did not mark it as confirmed. No patient confirmation has been sent.";
            kind = "error";
          } else if (data.patientConfirmation && data.patientConfirmation.sent) {
            notice = "The appointment is confirmed and the patient notification was accepted by the provider.";
            kind = "success";
          } else if (isAssignment && data.status === "confirmed") {
            notice = "Recordit confirmed the appointment, but the patient notification was not sent. Check the provider settings.";
            kind = "error";
          } else if (isAssignment) {
            notice = data.message || "The assignment request was processed.";
            kind = "success";
          } else {
            notice = "The appointment status was saved, but the patient notification was not sent. Check notification settings.";
            kind = "error";
          }
          await loadBookings();
          showMessage(pageMessage, notice, kind);
        } catch (error) {
          showMessage(message, error.message || "Could not process this request.", "error");
          button.disabled = false;
          button.textContent = isAssignment
            ? "Assign dentist and save to Recordit"
            : (booking.status === "confirmed" ? "Retry patient confirmation" : "Mark confirmed and notify patient");
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
