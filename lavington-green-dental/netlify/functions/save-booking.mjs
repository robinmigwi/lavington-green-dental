import { connectLambda, getStore } from "@netlify/blobs";

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
  const preferredDate = clean(data.preferred_date, 40);
  const preferredTime = clean(data.preferred_time, 40);
  const feeling = clean(data.feeling, 120);
  const message = clean(data.message, 1200);

  if (!name || !phone || !service || !preferredDate || !preferredTime || !feeling) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: "Please complete the required booking details." })
    };
  }

  connectLambda(event);

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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        saved: true,
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
