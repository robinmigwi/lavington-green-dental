import { getStore } from "@netlify/blobs";

const API_ROOT = (process.env.RECORDIT_API_BASE_URL || "https://api.recordit.ke/ai_assist").replace(/\/+$/, "");

export const handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" }, headers);
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { ok: false, error: "Invalid request" }, headers);
  }

  if (String(data.booking_bot || "").trim()) {
    return response(400, { ok: false, error: "Invalid request" }, headers);
  }

  const name = clean(data.name, 120);
  const phone = normalizePhone(data.phone);
  const email = clean(data.email, 160);
  const service = clean(data.service, 160);
  const suggestedVisit = clean(data.suggested_visit, 160);
  const concern = clean(data.concern, 1200);
  const message = clean(data.message, 1200);
  const feeling = clean(data.feeling, 120);
  const preferredDate = clean(data.preferred_date, 40);
  const preferredTime = clean(data.preferred_time, 40);
  const start = toSqlTime(data.start);
  const end = toSqlTime(data.end);
  const planner = clean(data.planner, 120);

  if (!name || !phone || !service || !concern || !preferredDate || !preferredTime || !feeling) {
    return response(400, { ok: false, error: "Please complete the required booking details." }, headers);
  }

  if (!start || !end || !planner) {
    return response(400, { ok: false, error: "Please choose an available appointment time before submitting." }, headers);
  }

  const apiKey = process.env.RECORDIT_API_KEY;
  if (!apiKey) {
    return response(503, {
      ok: false,
      error: "Online booking is not configured yet. Please contact the clinic directly."
    }, headers);
  }

  try {
    const date = start.slice(0, 10);
    const availability = await recorditPost("available_slots", apiKey, {
      startInclusive: date + " 00:00:00",
      endExclusive: addDays(date, 1) + " 00:00:00",
      plannerId: planner
    });

    const plannerRecord = Array.isArray(availability)
      ? availability.find((item) => String(item && item.id || "") === planner)
      : null;
    const availableSlots = plannerRecord && Array.isArray(plannerRecord.slots) ? plannerRecord.slots : [];
    const slotStillAvailable = availableSlots.some((slot) =>
      toSqlTime(slot && slot.start) === start && toSqlTime(slot && slot.end) === end
    );

    if (!slotStillAvailable) {
      return response(409, {
        ok: false,
        error: "That time has just become unavailable. Please choose another available appointment."
      }, headers);
    }

    const purpose = clean([
      "Service: " + (suggestedVisit || service),
      concern ? "Patient concern: " + concern : "",
      message ? "Additional note: " + message : ""
    ].filter(Boolean).join(". "), 1000);

    let appointment;
    try {
      appointment = await recorditPost("save_appointment", apiKey, {
        start,
        end,
        planner,
        name,
        phone,
        purpose
      });
    } catch (error) {
      const conflict = /double booking|already booked|slot.*unavailable|not available/i.test(String(error.message || ""));
      return response(conflict ? 409 : 502, {
        ok: false,
        error: conflict
          ? "That time has just become unavailable. Please choose another available appointment."
          : "Recordit could not save the appointment. Please try again or contact the clinic."
      }, headers);
    }

    if (!appointment || !appointment.eventNo) {
      return response(502, {
        ok: false,
        error: "Recordit did not return an appointment reference. Please contact the clinic before submitting again."
      }, headers);
    }

    const eventNo = appointment.eventNo;
    const confirmed = appointment.confirmed === true;
    const plannerLabel = String(plannerRecord && plannerRecord.label || planner);
    const localDateTime = formatNairobiDateTime(start);
    const bookingId = String(eventNo);
    const booking = {
      id: bookingId,
      recorditEventNo: eventNo,
      status: confirmed ? "confirmed" : "pending_confirmation",
      confirmed,
      createdAt: new Date().toISOString(),
      name,
      phone,
      email,
      service,
      suggestedVisit,
      concern,
      preferredDate,
      preferredTime,
      feeling,
      message,
      planner,
      plannerLabel,
      start,
      end,
      source: "Lavington Green Dental Suite website"
    };

    try {
      const store = getStore("appointment-requests");
      await store.setJSON(bookingId, booking, {
        metadata: {
          status: booking.status,
          service,
          createdAt: booking.createdAt,
          recorditEventNo: String(eventNo)
        }
      });
    } catch {
      // Recordit already owns the appointment. A local audit-store failure must not
      // make the website report failure or encourage a duplicate submission.
    }

    const alertDetails = {
      eventNo: String(eventNo),
      name,
      phone,
      service: suggestedVisit || service,
      localDateTime,
      plannerLabel
    };

    const [emailNotification, whatsappNotification] = await Promise.all([
      sendTeamEmail(alertDetails),
      sendTeamWhatsApp(alertDetails)
    ]);

    return response(200, {
      ok: true,
      saved: true,
      bookingId,
      recorditEventNo: eventNo,
      confirmed,
      plannerLabel,
      notificationStatus: {
        clinicEmail: emailNotification,
        clinicWhatsApp: whatsappNotification
      }
    }, headers);
  } catch {
    return response(502, {
      ok: false,
      error: "We could not complete the booking with Recordit. Please try again or contact the clinic."
    }, headers);
  }
};

async function recorditPost(endpoint, apiKey, body) {
  const options = {
    method: "POST",
    headers: { "Authorization": "Bearer " + apiKey }
  };

  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const result = await fetch(API_ROOT + "/" + endpoint, {
    ...options,
    signal: AbortSignal.timeout(12000)
  });

  let payload;
  try {
    payload = await result.json();
  } catch {
    payload = null;
  }

  if (!result.ok) {
    const error = new Error(payload && payload.error ? String(payload.error) : "Recordit request failed.");
    error.statusCode = result.status;
    throw error;
  }

  return payload;
}

async function sendTeamEmail(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_EMAIL_FROM;
  const recipients = String(process.env.BOOKING_NOTIFICATION_EMAIL || "")
    .split(",").map((value) => value.trim()).filter(Boolean);

  if (!apiKey || !from || !recipients.length) {
    return { configured: false, sent: false };
  }

  const subject = "New dental appointment request — " + booking.name;
  const text = [
    "A new website appointment has been saved in Recordit.",
    "",
    "Recordit reference: " + booking.eventNo,
    "Patient: " + booking.name,
    "Phone: " + booking.phone,
    "Service: " + booking.service,
    "Requested appointment: " + booking.localDateTime,
    "Planner: " + booking.plannerLabel,
    "",
    "Recordit currently marks this appointment as unconfirmed."
  ].join("\n");

  const html = "<p>A new website appointment has been saved in Recordit.</p><dl>" +
    "<dt><strong>Recordit reference</strong></dt><dd>" + escapeHtml(booking.eventNo) + "</dd>" +
    "<dt><strong>Patient</strong></dt><dd>" + escapeHtml(booking.name) + "</dd>" +
    "<dt><strong>Phone</strong></dt><dd>" + escapeHtml(booking.phone) + "</dd>" +
    "<dt><strong>Service</strong></dt><dd>" + escapeHtml(booking.service) + "</dd>" +
    "<dt><strong>Requested appointment</strong></dt><dd>" + escapeHtml(booking.localDateTime) + "</dd>" +
    "<dt><strong>Planner</strong></dt><dd>" + escapeHtml(booking.plannerLabel) + "</dd>" +
    "</dl><p>Recordit currently marks this appointment as unconfirmed.</p>";

  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to: recipients, subject, text, html }),
      signal: AbortSignal.timeout(10000)
    });
    return { configured: true, sent: result.ok };
  } catch {
    return { configured: true, sent: false };
  }
}

async function sendTeamWhatsApp(booking) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.BOOKING_TEAM_WHATSAPP_TEMPLATE_NAME;
  const templateLanguage = process.env.BOOKING_TEAM_WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const recipients = String(process.env.BOOKING_TEAM_WHATSAPP_TO || "")
    .split(",").map(normalizePhone).filter(Boolean);

  if (!accessToken || !phoneNumberId || !templateName || !recipients.length) {
    return { configured: false, sent: false };
  }

  const url = "https://graph.facebook.com/" + apiVersion + "/" +
    encodeURIComponent(phoneNumberId) + "/messages";
  const parameters = [
    booking.name,
    booking.phone,
    booking.service,
    booking.localDateTime,
    booking.plannerLabel,
    booking.eventNo
  ].map((value) => ({ type: "text", text: String(value || "-").slice(0, 200) }));

  const outcomes = await Promise.all(recipients.map(async (recipient) => {
    try {
      const result = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + accessToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: [{ type: "body", parameters }]
          }
        }),
        signal: AbortSignal.timeout(10000)
      });
      return result.ok;
    } catch {
      return false;
    }
  }));

  return {
    configured: true,
    sent: outcomes.some(Boolean),
    recipientCount: recipients.length,
    deliveredRequests: outcomes.filter(Boolean).length
  };
}

function response(statusCode, body, headers) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function clean(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function normalizePhone(value) {
  const raw = String(value == null ? "" : value).replace(/[^\d+]/g, "");
  if (raw.startsWith("+254")) return raw.slice(1);
  if (raw.startsWith("254")) return raw;
  if (raw.startsWith("0")) return "254" + raw.slice(1);
  return raw.replace(/\D/g, "");
}

function toSqlTime(value) {
  const time = String(value || "").trim().replace("T", " ").replace(/Z$/, "").replace(/\.\d+$/, "");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time) ? time : "";
}

function addDays(value, amount) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatNairobiDateTime(value) {
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  const datePart = new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    hour: "numeric",
    minute: "2-digit"
  }).format(date).toLowerCase();
  return datePart + " at " + timePart + " EAT";
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}
