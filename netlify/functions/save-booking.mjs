import { getStore } from "@netlify/blobs";

const STORE_NAME = "appointment-requests";
const NAMESPACE = safeNamespace(process.env.BOOKING_DATA_NAMESPACE || "preview");
const REQUEST_PREFIX = "request-" + NAMESPACE + "-";

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
  const preferredDate = clean(data.preferred_date, 10);
  const preferredTime = clean(data.preferred_time, 20).toLowerCase();
  const confirmationChannel = clean(data.confirmation_channel, 12).toLowerCase();

  if (!name || !phone || !(suggestedVisit || service) || !concern || !preferredDate || !preferredTime || !feeling) {
    return response(400, {
      ok: false,
      error: "Please complete the required booking details."
    }, headers);
  }

  if (confirmationChannel !== "sms" && confirmationChannel !== "email") {
    return response(400, {
      ok: false,
      error: "Choose whether you would like confirmation by text message or email."
    }, headers);
  }

  if (confirmationChannel === "email" && !isValidEmail(email)) {
    return response(400, {
      ok: false,
      error: "Enter a valid email address to receive appointment confirmation by email."
    }, headers);
  }

  if (!isValidDate(preferredDate) || preferredDate < nairobiDate(new Date())) {
    return response(400, {
      ok: false,
      error: "Choose today or a future preferred date."
    }, headers);
  }

  if (!isValidPreferredTime(preferredTime)) {
    return response(400, {
      ok: false,
      error: "Choose a valid preferred appointment time."
    }, headers);
  }

  const requestId = REQUEST_PREFIX + crypto.randomUUID();
  const booking = {
    id: requestId,
    status: "pending_allocation",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name,
    phone,
    email,
    confirmationChannel,
    service,
    suggestedVisit,
    concern,
    preferredDate,
    preferredTime,
    feeling,
    message,
    source: "Lavington Green Dental Suite website",
    patientConfirmation: { sent: false, channel: confirmationChannel },
    clinicNotifications: {
      email: { configured: false, sent: false },
      whatsapp: { configured: false, sent: false }
    }
  };

  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(requestId, booking, {
      metadata: {
        status: booking.status,
        service: suggestedVisit || service,
        createdAt: booking.createdAt,
        namespace: NAMESPACE
      },
      onlyIfNew: true
    });
  } catch {
    return response(500, {
      ok: false,
      error: "We could not save your appointment request. Please try again or contact the clinic."
    }, headers);
  }

  // Notify the clinic only after the request is safely stored. Neither notification
  // confirms a patient's appointment.
  const alert = {
    requestId,
    name,
    phone,
    service: suggestedVisit || service,
    preferredDate,
    preferredTime,
    status: "Pending dentist allocation"
  };

  const [emailNotification, whatsappNotification] = await Promise.all([
    sendClinicEmail(alert),
    sendClinicWhatsApp(alert)
  ]);

  booking.clinicNotifications = {
    email: emailNotification,
    whatsapp: whatsappNotification
  };
  booking.updatedAt = new Date().toISOString();

  try {
    const store = getStore(STORE_NAME);
    await store.setJSON(requestId, booking, {
      metadata: {
        status: booking.status,
        service: suggestedVisit || service,
        createdAt: booking.createdAt,
        namespace: NAMESPACE
      }
    });
  } catch {
    // The original request was saved successfully. Return its reference even if
    // recording notification delivery status fails.
  }

  return response(200, {
    ok: true,
    saved: true,
    requestId,
    status: booking.status,
    confirmationChannel,
    clinicNotifications: {
      email: emailNotification,
      whatsapp: whatsappNotification
    }
  }, headers);
};

async function sendClinicEmail(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_EMAIL_FROM;
  const recipients = String(process.env.BOOKING_NOTIFICATION_EMAIL || "")
    .split(",").map((value) => value.trim()).filter(Boolean);

  if (!apiKey || !from || !recipients.length) {
    return { configured: false, sent: false };
  }

  const subject = "New dental appointment request — " + booking.name;
  const text = [
    "A new appointment request has been received from the website.",
    "",
    "Request reference: " + booking.requestId,
    "Patient: " + booking.name,
    "Phone: " + booking.phone,
    "Service: " + booking.service,
    "Preferred date: " + formatDate(booking.preferredDate),
    "Preferred time: " + booking.preferredTime,
    "Status: Pending dentist allocation",
    "",
    "Please review the request, allocate the dentist in Recordit, and confirm the appointment there before sending patient confirmation.",
    "The patient's concern and additional notes are available in the authorized booking request dashboard."
  ].join("\n");

  const html = "<p>A new appointment request has been received from the website.</p><dl>" +
    "<dt><strong>Request reference</strong></dt><dd>" + escapeHtml(booking.requestId) + "</dd>" +
    "<dt><strong>Patient</strong></dt><dd>" + escapeHtml(booking.name) + "</dd>" +
    "<dt><strong>Phone</strong></dt><dd>" + escapeHtml(booking.phone) + "</dd>" +
    "<dt><strong>Service</strong></dt><dd>" + escapeHtml(booking.service) + "</dd>" +
    "<dt><strong>Preferred date</strong></dt><dd>" + escapeHtml(formatDate(booking.preferredDate)) + "</dd>" +
    "<dt><strong>Preferred time</strong></dt><dd>" + escapeHtml(booking.preferredTime) + "</dd>" +
    "<dt><strong>Status</strong></dt><dd>Pending dentist allocation</dd>" +
    "</dl><p>Please review the request, allocate the dentist in Recordit, and confirm the appointment there before sending patient confirmation.</p>";

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

async function sendClinicWhatsApp(booking) {
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
  // Keep the existing six-parameter team template shape:
  // patient, phone, service, requested datetime, allocation status, request reference.
  const preferredDateTime = formatDate(booking.preferredDate) + " at " + booking.preferredTime;
  const parameters = [
    booking.name,
    booking.phone,
    booking.service,
    preferredDateTime,
    booking.status,
    booking.requestId
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
    acceptedRequests: outcomes.filter(Boolean).length
  };
}

function response(statusCode, body, headers) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function clean(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function safeNamespace(value) {
  return String(value || "preview").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "preview";
}

function normalizePhone(value) {
  const raw = String(value == null ? "" : value).replace(/[^\d+]/g, "");
  if (raw.startsWith("+254")) return raw.slice(1);
  if (raw.startsWith("254")) return raw;
  if (raw.startsWith("0")) return "254" + raw.slice(1);
  return raw.replace(/\D/g, "");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nairobiDate(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type).value;
  return part("year") + "-" + part("month") + "-" + part("day");
}

function isValidPreferredTime(value) {
  return [
    "9:00 am","9:30 am","10:00 am","10:30 am","11:00 am","11:30 am",
    "12:00 pm","12:30 pm","1:00 pm","1:30 pm","2:00 pm","2:30 pm",
    "3:00 pm","3:30 pm","4:00 pm","4:30 pm"
  ].includes(value);
}

function formatDate(value) {
  if (!isValidDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}
