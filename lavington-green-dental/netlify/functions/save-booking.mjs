import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: "Method not allowed" })
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: "Invalid request" })
    };
  }

  if (String(data.booking_bot || "").trim()) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: "Invalid request" })
    };
  }

  const name = clean(data.name, 120);
  const phone = normalizePhone(data.phone);
  const email = clean(data.email, 160);
  const service = clean(data.service, 160);
  const concern = clean(data.concern, 1200);
  const suggestedVisit = clean(data.suggested_visit, 160);
  const preferredDate = clean(data.preferred_date, 40);
  const preferredTime = clean(data.preferred_time, 40);
  const feeling = clean(data.feeling, 120);
  const message = clean(data.message, 1200);

  if (!name || !phone || !service || !concern || !preferredDate || !preferredTime || !feeling) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: "Please complete the required booking details." })
    };
  }


  try {
    const store = getStore("appointment-requests");
    const id = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "-" + crypto.randomUUID().slice(0, 8);

    const booking = {
      id,
      status: "requested",
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
      source: "Lavington Green Dental Suite website"
    };

    await store.setJSON(id, booking, {
      metadata: {
        status: "requested",
        service,
        createdAt: booking.createdAt
      }
    });

    const adminNotified = await notifyAdministrator(booking);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        saved: true,
        adminNotified,
        bookingId: id,
        booking
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "We could not save the appointment request.",
        detail: process.env.NODE_ENV === "development" ? String(error.message || error) : undefined
      })
    };
  }
};

function clean(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function normalizePhone(value) {
  const raw = String(value == null ? "" : value).replace(/[^\d+]/g, "");
  if (raw.startsWith("+254")) return raw.slice(1);
  if (raw.startsWith("254")) return raw;
  if (raw.startsWith("0")) return "254" + raw.slice(1);
  return raw;
}


async function notifyAdministrator(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BOOKING_ADMIN_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL;

  // Test deployments save requests without pretending that an administrator was notified.
  if (!apiKey || !to || !from) return false;

  const subject = "New dental appointment request";
  const text = [
    "A new appointment request has been saved for Lavington Green Dental Suite.",
    "",
    "Request reference: " + booking.id,
    "Name: " + booking.name,
    "Phone: " + booking.phone,
    "Email: " + (booking.email || "Not provided"),
    "Requested service: " + booking.service,
    "Preferred date: " + booking.preferredDate,
    "Preferred time: " + booking.preferredTime,
    "Patient comfort: " + booking.feeling,
    "Concern: " + booking.concern,
    "Additional notes: " + (booking.message || "None"),
    "",
    "This is a request only. Review availability and assign a dentist before confirming with the patient."
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to, subject, text })
    });
    return response.ok;
  } catch {
    return false;
  }
}
