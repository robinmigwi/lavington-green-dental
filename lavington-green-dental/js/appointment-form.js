(() => {
  const form = document.getElementById("appointment-request-form");
  if (!form) return;

  const status = form.querySelector("[data-appointment-status]");
  const dateInput = form.elements.preferred_date;
  const timeInput = form.elements.preferred_time;
  const submitButton = form.querySelector('button[type="submit"]');

  const localDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  };
  dateInput.min = localDateString(new Date());

  const showStatus = (message, type) => {
    status.textContent = message;
    status.className = "appointment-form-status" + (type ? " is-" + type : "");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showStatus("", "");
    if (!form.reportValidity()) return;

    const preferredDate = dateInput.value;
    const preferredTime = timeInput.value;
    const localDate = new Date(preferredDate + "T12:00:00");
    const day = localDate.getDay();

    if (day === 0) {
      showStatus("Please choose a date from Monday to Saturday. The clinic's published hours are Monday to Saturday.", "error");
      dateInput.focus();
      return;
    }
    if (preferredTime < "09:00" || (day === 6 ? preferredTime > "13:00" : preferredTime > "17:00")) {
      showStatus(day === 6
        ? "Saturday requests need to be between 9:00am and 1:00pm."
        : "Please choose a weekday time between 9:00am and 5:00pm.", "error");
      timeInput.focus();
      return;
    }

    const payload = {
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      service: form.elements.service.value,
      concern: form.elements.concern.value.trim(),
      preferred_date: preferredDate,
      preferred_time: preferredTime,
      feeling: form.elements.feeling.value,
      message: form.elements.message.value.trim(),
      source: "Lavington Green Dental Suite website appointment form",
      booking_bot: ""
    };

    submitButton.disabled = true;
    submitButton.textContent = "Saving request…";
    showStatus("Saving your appointment request securely…", "");

    try {
      const response = await fetch("/.netlify/functions/save-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.saved) {
        throw new Error(result.error || "We could not save your request. Please try again.");
      }

      form.querySelectorAll("input, select, textarea, button").forEach((element) => {
        element.disabled = true;
      });

      const notificationMessage = result.adminNotified
        ? "The clinic has been notified and will review your preferred time before contacting you to confirm."
        : "Your request has been saved, but automatic clinic notification is not configured on this test site. Do not use this test form for real bookings until the notification settings are completed.";

      showStatus(
        "Your appointment request has been saved. " + notificationMessage +
        " This is not a confirmed appointment. Reference: " + (result.bookingId || "saved"),
        "success"
      );
    } catch (error) {
      submitButton.disabled = false;
      submitButton.textContent = "Send appointment request";
      showStatus(error && error.message ? error.message : "We could not save your request just now. Please try again.", "error");
    }
  });
})();
