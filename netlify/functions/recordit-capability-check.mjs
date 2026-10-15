import { timingSafeEqual } from "node:crypto";

const API_ROOT = (process.env.RECORDIT_API_BASE_URL || "https://api.recordit.ke/ai_assist").replace(/\\/+$/, "");
const CANDIDATES = [
  "get_appointments",
  "list_appointments",
  "appointment_list",
  "get_appointment_list",
  "get_appointments_by_planner",
  "appointments_by_planner",
  "planner_appointments",
  "booked_appointments",
  "appointments_report",
  "appointment_report",
  "appointment_details"
];

export const handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  if (event.httpMethod !== "GET") {
    return response(405, { ok: false, error: "Method not allowed" }, headers);
  }

  if (!isAuthorized(event.headers || {})) {
    return response(401, { ok: false, error: "Administrator authentication required." }, headers);
  }

  const apiKey = process.env.RECORDIT_API_KEY;
  if (!apiKey) {
    return response(503, {
      ok: false,
      error: "Recordit API key is not configured in this deploy context."
    }, headers);
  }

  // Probe only read/list-style candidate names. Send an empty object so a
  // candidate that does not exist or requires filters cannot create a booking.
  const results = await Promise.all(CANDIDATES.map(async (endpoint) => {
    try {
      const result = await fetch(API_ROOT + "/" + endpoint, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: "{}",
        signal: AbortSignal.timeout(8000)
      });

      const raw = await result.text();
      let payload = null;
      try { payload = JSON.parse(raw); } catch {}

      const keys = payload && typeof payload === "object" && !Array.isArray(payload)
        ? Object.keys(payload).slice(0, 30)
        : [];
      const isArray = Array.isArray(payload);
      const statusText = payload && typeof payload === "object" && !Array.isArray(payload)
        ? String(payload.error || payload.message || payload.detail || "")
        : "";

      return {
        endpoint,
        httpStatus: result.status,
        routeLikelyExists: result.status !== 404,
        responseType: isArray ? "array" : (payload === null ? "non-json" : typeof payload),
        arrayCount: isArray ? payload.length : null,
        objectKeys: keys,
        message: statusText.slice(0, 240)
      };
    } catch {
      return {
        endpoint,
        httpStatus: null,
        routeLikelyExists: null,
        responseType: "network-error",
        message: "Request timed out or the Recordit API could not be reached."
      };
    }
  }));

  return response(200, {
    ok: true,
    purpose: "Read-only capability discovery. No appointment was created, changed, or deleted.",
    apiRoot: API_ROOT,
    results
  }, headers);
};

function isAuthorized(headers) {
  const expected = String(process.env.BOOKING_ADMIN_TOKEN || "");
  const authHeader = headers.authorization || headers.Authorization || "";
  const match = String(authHeader).match(/^Bearer\\s+(.+)$/i);
  if (!match || expected.length < 24) return false;

  let provided;
  try { provided = decodeURIComponent(match[1]); } catch { return false; }
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function response(statusCode, body, headers) {
  return { statusCode, headers, body: JSON.stringify(body) };
}
