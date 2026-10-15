import { timingSafeEqual } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";

const STORE_NAME = "appointment-requests";
const NAMESPACE = safeNamespace(process.env.BOOKING_DATA_NAMESPACE || "preview");
const REQUEST_PREFIX = "request-" + NAMESPACE + "-";

export const handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" }, headers);
  }

  if (!isAuthorized(event.headers || {})) {
    return response(401, { ok: false, error: "Administrator authentication required." }, headers);
  }

  const adminToken = String(process.env.BOOKING_ADMIN_TOKEN || "");
  if (adminToken.length < 24) {
    return response(503, { ok: false, error: "The administrator dashboard has not been configured." }, headers);
  }

  let store;
  try {
    // These functions use the Lambda-compatible handler signature. Initialize
    // Netlify Blobs from the incoming Lambda event before opening the store.
    connectLambda(event);
    store = getStore(STORE_NAME);
  } catch {
    return response(503, {
      ok: false,
      error: "Appointment storage could not be initialized. The administrator token passed authentication, but the booking storage service is unavailable. Check the Netlify function logs and Blobs configuration."
    }, headers);
  }

  if (event.httpMethod === "GET") {
    try {
      const result = await store.list({ prefix: REQUEST_PREFIX });
      const blobs = Array.isArray(result && result.blobs) ? result.blobs : [];
      const bookings = await Promise.all(blobs.map(async (blob) => {
        try {
          return await store.get(blob.key, { type: "json" });
        } catch {
          return null;
        }
      }));

      return response(200, {
        ok: true,
        bookings: bookings.filter(Boolean).sort((a, b) =>
          String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
        )
      }, headers);
    } catch {
      return response(502, { ok: false, error: "We could not load appointment requests." }, headers);
    }
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { ok: false, error: "Invalid request." }, headers);
  }

  if (data.action !== "confirm" || typeof data.requestId !== "string" ||
      !data.requestId.startsWith(REQUEST_PREFIX) || data.requestId.length > 160) {
    return response(400, { ok: false, error: "Invalid appointment confirmation request." }, headers);
  }

  let booking;
  try {
    booking = await store.get(data.requestId, { type: "json" });
  } catch {
    booking = null;
  }

  if (!booking) {
    return response(404, { ok: false, error: "Appointment request not found." }, headers);
  }

  if (booking.status !== "confirmed") {
    if (data.adminConfirmedInRecordit !== true) {
      return response(400, {
        ok: false,
        error: "Confirm the appointment in Recordit first, then tick the confirmation checkbox."
      }, headers);
    }

    const assignedDentist = clean(data.assignedDentist, 160);
    const confirmedDate = clean(data.confirmedDate, 10);
    const confirmedTime = clean(data.confirmedTime, 5);
    const recorditEventNo = clean(data.recorditEventNo, 80);

    if (!assignedDentist || !isValidDate(confirmedDate) ||
        confirmedDate < nairobiDate(new Date()) || !isValidTime(confirmedTime) || !recorditEventNo) {
      return response(400, {
        ok: false,
        error: "Enter the assigned dentist, confirmed date and time, and Recordit event number."
      }, headers);
    }

    booking.status = "confirmed";
    booking.updatedAt = new Date().toISOString();
    booking.confirmedAt = booking.updatedAt;
    booking.assignedDentist = assignedDentist;
    booking.confirmedDate = confirmedDate;
    booking.confirmedTime = confirmedTime;
    booking.recorditEventNo = recorditEventNo;
    booking.patientConfirmation = {
      channel: booking.confirmationChannel,
      configured: false,
      sent: false,
      attemptedAt: null
    };

    try {
      await saveBooking(store, booking);
    } catch {
      return response(500, {
        ok: false,
        error: "We could not save the confirmation status. Check the request before trying again."
      }, headers);
    }
  } else if (booking.patientConfirmation && booking.patientConfirmation.sent === true) {
    return response(200, {
      ok: true,
      status: booking.status,
      alreadySent: true,
      requestId: booking.id,
      patientConfirmation: booking.patientConfirmation
    }, headers);
  }

  const notification = await sendPatientConfirmation(booking);
  booking.patientConfirmation = {
    channel: booking.confirmationChannel,
    configured: notification.configured,
    sent: notification.sent,
    attemptedAt: new Date().toISOString(),
    providerStatus: notification.providerStatus || null
  };
  booking.updatedAt = new Date().toISOString();

  try {
    await saveBooking(store, booking);
  } catch {
    // Do not undo a confirmation already made in Recordit. The admin can check
    // delivery directly with the provider if persisting the delivery status fails.
  }

  return response(200, {
    ok: true,
    status: booking.status,
    requestId: booking.id,
    patientConfirmation: booking.patientConfirmation,
    message: notification.sent
      ? "The appointment is marked confirmed and the patient notification was accepted by the messaging provider."
      : "The appointment is marked confirmed, but the patient notification was not sent. Check the configured messaging provider and retry."
  }, headers);
};

async function saveBooking(store, booking) {
  await store.setJSON(booking.id, booking, {
    metadata: {
      status: booking.status,
      service: clean(booking.suggestedVisit || booking.service, 160),
      createdAt: booking.createdAt,
      namespace: NAMESPACE
    }
  });
}

function isAuthorized(headers) {
  const expected = String(process.env.BOOKING_ADMIN_TOKEN || "");
  const authHeader = headers.authorization || headers.Authorization || "";
  const match = String(authHeader).match(/^Bearer\s+(.+)$/i);
  if (!match || expected.length < 24) return false;

  let provided;
  try {
    // The browser percent-encodes the token so Unicode characters are never
    // placed directly in an HTTP header. Decode before comparing with the secret.
    provided = decodeURIComponent(match[1]);
  } catch {
    return false;
  }

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function sendPatientConfirmation(booking) {
  if (booking.confirmationChannel === "email") {
    return sendConfirmationEmail(booking);
  }
  return sendConfirmationSms(booking);
}

async function sendConfirmationEmail(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_EMAIL_FROM;
  const to = clean(booking.email, 160);

  if (!apiKey || !from || !isValidEmail(to)) {
    return { configured: false, sent: false, providerStatus: "Email confirmation is not configured." };
  }

  const confirmedDate = formatDate(booking.confirmedDate);
  const confirmedTime = formatTime(booking.confirmedTime);
  const subject = "Your appointment is confirmed — Lavington Green Dental Suite";
  const text = [
    "Hello " + booking.name + ",",
    "",
    "Your appointment at Lavington Green Dental Suite has been confirmed.",
    "Date: " + confirmedDate,
    "Time: " + confirmedTime + " EAT",
    "Dentist: " + booking.assignedDentist,
    "Reference: " + booking.recorditEventNo,
    "",
    "If you need to make a change, please contact the clinic.",
    "Lavington Green Dental Suite"
  ].join("\n");
  const html = "<p>Hello " + escapeHtml(booking.name) + ",</p>" +
    "<p>Your appointment at Lavington Green Dental Suite has been confirmed.</p><dl>" +
    "<dt><strong>Date</strong></dt><dd>" + escapeHtml(confirmedDate) + "</dd>" +
    "<dt><strong>Time</strong></dt><dd>" + escapeHtml(confirmedTime) + " EAT</dd>" +
    "<dt><strong>Dentist</strong></dt><dd>" + escapeHtml(booking.assignedDentist) + "</dd>" +
    "<dt><strong>Reference</strong></dt><dd>" + escapeHtml(booking.recorditEventNo) + "</dd>" +
    "</dl><p>If you need to make a change, please contact the clinic.</p><p>Lavington Green Dental Suite</p>";

  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to, subject, text, html }),
      signal: AbortSignal.timeout(10000)
    });
    return {
      configured: true,
      sent: result.ok,
      providerStatus: result.ok ? "accepted" : "email provider rejected the request"
    };
  } catch {
    return { configured: true, sent: false, providerStatus: "email provider unavailable" };
  }
}

async function sendConfirmationSms(booking) {
  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  const senderId = process.env.AT_SENDER_ID;
  const to = normalizePhone(booking.phone);

  if (!username || !apiKey || !to) {
    return { configured: false, sent: false, providerStatus: "SMS confirmation is not configured." };
  }

  const confirmedDate = formatDate(booking.confirmedDate);
  const confirmedTime = formatTime(booking.confirmedTime);
  const message = "Lavington Green Dental Suite: Your appointment is confirmed for " +
    confirmedDate + " at " + confirmedTime + " EAT with " + booking.assignedDentist +
    ". Reference: " + booking.recorditEventNo + ". Contact the clinic if you need to make a change.";

  const form = new URLSearchParams({
    username,
    to,
    message
  });
  if (senderId) form.set("from", senderId);

  try {
    const result = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        "apiKey": apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10000)
    });
    const payload = await result.json().catch(() => ({}));
    const recipients = payload && payload.SMSMessageData && Array.isArray(payload.SMSMessageData.Recipients)
      ? payload.SMSMessageData.Recipients
      : [];
    const accepted = result.ok && (
      recipients.some((recipient) => [100, 101, 102].includes(Number(recipient.statusCode))) ||
      (recipients.length === 0 && result.status >= 200 && result.status < 300)
    );
    return {
      configured: true,
      sent: accepted,
      providerStatus: accepted ? "accepted" : "SMS provider rejected the request"
    };
  } catch {
    return { configured: true, sent: false, providerStatus: "SMS provider unavailable" };
  }
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

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function nairobiDate(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Nairobi",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type).value;
  return part("year") + "-" + part("month") + "-" + part("day");
}

function formatDate(value) {
  if (!isValidDate(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Nairobi"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatTime(value) {
  if (!isValidTime(value)) return value;
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "pm" : "am";
  const adjusted = hour % 12 || 12;
  return adjusted + ":" + minute.toString().padStart(2, "0") + " " + suffix;
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}
