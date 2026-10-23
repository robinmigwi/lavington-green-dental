import { timingSafeEqual } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";

const STORE_NAME = "appointment-requests";
const NAMESPACE = safeNamespace(
  process.env.CONTEXT === "production"
    ? "production"
    : (process.env.BOOKING_DATA_NAMESPACE || "preview")
);
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

  if (event.httpMethod === "GET" &&
      String((event.queryStringParameters || {}).resource || "") === "planners") {
    try {
      const result = await loadRecorditPlanners();
      return response(200, {
        ok: true,
        planners: result.planners,
        diagnostics: result.diagnostics
      }, headers);
    } catch (error) {
      return response(error && error.statusCode ? error.statusCode : 502, {
        ok: false,
        error: error && error.message
          ? error.message
          : "Could not load dentists from Recordit. Check the preview Recordit configuration."
      }, headers);
    }
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

  const action = clean(data.action, 40);
  if (!["assign", "confirm"].includes(action) || typeof data.requestId !== "string" ||
      !data.requestId.startsWith(REQUEST_PREFIX) || data.requestId.length > 160) {
    return response(400, { ok: false, error: "Invalid appointment action request." }, headers);
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

  if (action === "assign") {
    return await assignBookingToRecordit(data, booking, store, headers);
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


class RecorditRequestError extends Error {
  constructor(message, statusCode, uncertain) {
    super(message);
    this.statusCode = statusCode || null;
    this.uncertain = Boolean(uncertain);
  }
}

async function requestRecordit(endpoint, body) {
  const apiKey = String(process.env.RECORDIT_API_KEY || "");
  const baseUrl = String(
    process.env.RECORDIT_API_BASE_URL || "https://api.recordit.ke/ai_assist"
  ).replace(/\/+$/, "");

  if (!apiKey) {
    throw new RecorditRequestError(
      "Recordit is not configured for this Deploy Preview. The clinic request is still saved.",
      503,
      false
    );
  }

  const headers = {
    "Authorization": "Bearer " + apiKey,
    "Accept": "application/json"
  };
  const options = { method: "POST", headers, signal: AbortSignal.timeout(12000) };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let result;
  try {
    result = await fetch(baseUrl + "/" + endpoint, options);
  } catch {
    throw new RecorditRequestError(
      endpoint === "save_appointment"
        ? "Recordit could not confirm the save result. The system has paused this request to avoid a duplicate appointment."
        : "Could not connect to Recordit. The booking request is still saved.",
      null,
      endpoint === "save_appointment"
    );
  }

  const payload = await result.json().catch(() => null);
  if (!result.ok) {
    const upstreamMessage = payload && typeof payload === "object"
      ? clean(payload.error || payload.message || payload.detail || "", 240)
      : "";
    const fallback = endpoint === "save_appointment" && result.status >= 500
      ? "Recordit returned a server error. The save result is uncertain, so this request has been paused to avoid a duplicate appointment."
      : "Recordit rejected the request (HTTP " + result.status + "). Check the selected dentist, date and time.";
    throw new RecorditRequestError(
      upstreamMessage || fallback,
      result.status,
      endpoint === "save_appointment" && result.status >= 500
    );
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload) &&
      (payload.error || payload.success === false)) {
    throw new RecorditRequestError(
      clean(payload.error || payload.message || "Recordit rejected the appointment.", 240),
      result.status,
      false
    );
  }

  return payload;
}

function normalizeRecorditPlanners(payload, rootIsPlannerCollection = false) {
  const normalized = [];
  const collectionKeys = new Set([
    "availableplanners", "planner", "planners", "plannerlist",
    "planneraccess", "plannerpermissions", "planneraccounts",
    "doctors", "dentists", "doctorlist", "dentistlist",
    "clinicians", "practitioners", "medicalstaff", "providers"
  ]);
  const idKeys = [
    "planner", "plannerId", "planner_id", "plannerID",
    "doctorId", "doctor_id", "dentistId", "dentist_id",
    "providerId", "provider_id", "calendarId", "calendar_id",
    "userId", "user_id", "employeeId", "employee_id",
    "id", "username", "code"
  ];
  const nameKeys = [
    "name", "label", "plannerName", "planner_name",
    "displayName", "display_name", "fullName", "full_name",
    "doctorName", "doctor_name", "dentistName", "dentist_name",
    "providerName", "provider_name", "doctor", "dentist",
    "display", "title"
  ];

  const cleanKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const scalar = (value) =>
    (typeof value === "string" || typeof value === "number") && String(value).trim()
      ? String(value).trim()
      : "";

  function field(row, candidates) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return "";
    const wanted = new Set(candidates.map(cleanKey));
    for (const [key, value] of Object.entries(row)) {
      if (wanted.has(cleanKey(key))) {
        const found = scalar(value);
        if (found) return found;
      }
    }
    return "";
  }

  function add(idValue, nameValue) {
    const id = clean(idValue, 100);
    const name = clean(nameValue || idValue, 160);
    if (!id || !name) return;
    if (!normalized.some((item) => item.id === id)) normalized.push({ id, name });
  }

  function looksLikeId(value) {
    const text = String(value || "").trim();
    const normalized = cleanKey(text);
    const reservedKeys = new Set([
      "name", "label", "displayname", "plannername", "plannerid",
      "doctorname", "doctorid", "dentistname", "dentistid",
      "clinicname", "slotduration", "status", "message", "error",
      "count", "total", "enabled", "active", "success",
      "availableplanners", "planners", "doctors", "dentists",
      "accesssettings", "settings"
    ]);
    return /^\d{1,12}$/.test(text) ||
      /^[a-f0-9]{8}-[a-f0-9-]{20,}$/i.test(text) ||
      /^(planner|doctor|dentist|provider|user|staff|calendar)(?:[_-][a-z0-9_-]+|[0-9]+)$/i.test(text) ||
      (/^[a-z0-9_-]{1,64}$/i.test(text) &&
        !reservedKeys.has(normalized) &&
        !/(name|label|duration|status|message|error|count|total|enabled|active|success|settings|email|phone|date|time|url|type|role|description|clinic|service)$/i.test(text));
  }

  function looksLikePersonName(value) {
    const text = String(value || "").trim();
    return /^(dr\.?\s|doctor\s|dentist\s|prof\.?\s)/i.test(text) ||
      /^[\p{L}][\p{L}.'’\-]+(?:\s+[\p{L}][\p{L}.'’\-]+)+$/u.test(text);
  }

  function visit(value, inPlannerCollection = false, mapKey = "", seen = new WeakSet()) {
    if (value == null) return;

    if (typeof value === "string" || typeof value === "number") {
      const primitive = scalar(value);
      if (inPlannerCollection && mapKey && primitive) {
        if (looksLikeId(mapKey)) add(mapKey, primitive);
        else if (looksLikeId(primitive)) add(primitive, mapKey);
        else if (/^(dr\.?\s|doctor\s|dentist\s)/i.test(primitive)) add(mapKey, primitive);
      } else if (inPlannerCollection && !mapKey && primitive) {
        // Some Recordit responses return a bare list of planner identifiers.
        add(primitive, primitive);
      }
      return;
    }

    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) visit(item, inPlannerCollection, "", seen);
      return;
    }

    const id = field(value, idKeys);
    const name = field(value, nameKeys);
    const explicitPlannerId = Object.keys(value).some((key) =>
      /planner|doctor|dentist|provider|calendar/i.test(key)
    );
    const role = field(value, ["role", "type", "category", "profession", "position"]);
    const clinicianRole = /planner|doctor|dentist|physician|clinician|practitioner/i.test(role);
    const isPlannerRow = Boolean(id && (name || inPlannerCollection || explicitPlannerId || clinicianRole));

    if (isPlannerRow) add(id, name || id);

    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = cleanKey(key);
      if (collectionKeys.has(normalizedKey) || /^(available)?(planner|doctor|dentist)(list|items|data)$/i.test(normalizedKey)) {
        visit(child, true, key, seen);
      } else if (child && typeof child === "object") {
        // Do not treat arbitrary properties on an already identified row as
        // separate planners, but continue looking for nested planner collections.
        visit(child, isPlannerRow ? false : inPlannerCollection, key, seen);
      } else if (inPlannerCollection && !isPlannerRow) {
        const primitive = scalar(child);
        if (!primitive || /^(success|status|message|error|count|total|enabled|active|true|false)$/i.test(key + ":" + primitive)) {
          continue;
        }

        // Recordit settings can expose either plannerId -> planner name or
        // planner name -> plannerId maps. Avoid treating ordinary settings such
        // as slotDuration as a clinician merely because they contain a number.
        if (looksLikeId(key) && looksLikePersonName(primitive)) add(key, primitive);
        else if (looksLikePersonName(key) && !looksLikePersonName(primitive)) add(primitive, key);
        else if (looksLikeId(key) && /^(dr\.?\s|doctor\s|dentist\s)/i.test(primitive)) add(key, primitive);
      }
    }
  }

  visit(payload, rootIsPlannerCollection);
  return normalized;
}

async function loadRecorditPlanners() {
  let availablePayload = null;
  let availableError = null;
  let settingsPayload = null;
  let planners = [];

  try {
    availablePayload = await requestRecordit("available_planners");
    planners = normalizeRecorditPlanners(availablePayload, true);
  } catch (error) {
    availableError = error;
  }

  // The two Recordit endpoints may return different response structures.
  // Search access_settings recursively for the configured clinic planner roster,
  // including nested arrays and ID-to-name maps, instead of only reading a
  // top-level "planners" property.
  let settingPlanners = [];
  try {
    settingsPayload = await requestRecordit("access_settings");
    settingPlanners = normalizeRecorditPlanners(settingsPayload, true);
  } catch {
    // Preserve the usable list from available_planners if settings are restricted.
  }

  const mergedById = new Map();
  for (const planner of [...planners, ...settingPlanners]) {
    const prior = mergedById.get(planner.id);
    if (!prior) {
      mergedById.set(planner.id, planner);
    } else if (planner.name && (!prior.name || prior.name === prior.id)) {
      mergedById.set(planner.id, { ...prior, name: planner.name });
    }
  }

  const configuredPlanners = parseConfiguredRecorditPlanners(
    process.env.RECORDIT_ADDITIONAL_PLANNERS || ""
  );
  for (const planner of configuredPlanners) {
    const prior = mergedById.get(planner.id);
    if (!prior) {
      mergedById.set(planner.id, planner);
    } else if ((!prior.name || prior.name === prior.id) && planner.name) {
      mergedById.set(planner.id, { ...prior, name: planner.name });
    }
  }

  const merged = [...mergedById.values()];
  if (!merged.length) {
    throw new RecorditRequestError(
      availableError && availableError.message
        ? availableError.message
        : "Recordit did not return a usable dentist list. Check the account's planner access settings.",
      availableError && availableError.statusCode ? availableError.statusCode : 502,
      false
    );
  }

  // Return safe shape diagnostics (keys and counts only, never values or secrets)
  // so an unexpectedly incomplete roster can be diagnosed without exposing API data.
  const topLevelKeys = (payload) =>
    payload && typeof payload === "object" ? Object.keys(payload).slice(0, 40) : [];
  const keyPaths = (payload) => {
    const paths = [];
    const seen = new WeakSet();
    function walk(value, prefix, depth) {
      if (!value || typeof value !== "object" || depth > 4 || seen.has(value) || paths.length >= 80) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        const path = prefix ? prefix + "." + key : key;
        paths.push(path);
        if (paths.length >= 80) break;
        if (child && typeof child === "object") walk(child, path, depth + 1);
      }
    }
    walk(payload, "", 0);
    return paths;
  };
  return {
    planners: merged,
    diagnostics: {
      availableCount: planners.length,
      settingsCount: settingPlanners.length,
      availableTopLevelKeys: topLevelKeys(availablePayload),
      settingsTopLevelKeys: topLevelKeys(settingsPayload),
      availableKeyPaths: keyPaths(availablePayload),
      settingsKeyPaths: keyPaths(settingsPayload),
      configuredPlannerCount: configuredPlanners.length
    }
  };
}

function parseConfiguredRecorditPlanners(rawValue) {
  if (!String(rawValue || "").trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(String(rawValue));
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : (parsed && Array.isArray(parsed.planners) ? parsed.planners : []);
  const byId = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const id = clean(
      row.id || row.plannerId || row.planner_id || row.planner ||
      row.doctorId || row.doctor_id || row.dentistId || row.dentist_id || "",
      100
    );
    const name = clean(
      row.name || row.label || row.displayName || row.display_name ||
      row.doctorName || row.doctor_name || row.dentistName || row.dentist_name || "",
      160
    );
    if (id && name && !byId.has(id)) byId.set(id, { id, name });
  }
  return [...byId.values()];
}

function recorditUtcDateTime(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  // Recordit expects UTC. Nairobi is UTC+3 throughout the year.
  const instant = new Date(Date.UTC(year, month - 1, day, hour - 3, minute, 0));
  const pad = (value) => String(value).padStart(2, "0");
  return instant.getUTCFullYear() + "-" +
    pad(instant.getUTCMonth() + 1) + "-" +
    pad(instant.getUTCDate()) + " " +
    pad(instant.getUTCHours()) + ":" +
    pad(instant.getUTCMinutes()) + ":00";
}

function isPastNairobiDateTime(date, time) {
  const start = recorditUtcDateTime(date, time).replace(" ", "T") + "Z";
  return new Date(start).getTime() <= Date.now();
}

function recorditConfirmed(value) {
  return value === true || value === 1 || String(value).toLowerCase() === "true";
}

async function assignBookingToRecordit(data, booking, store, headers) {
  if (booking.recorditEventNo ||
      ["recordit_saved", "confirmed", "recordit_saving", "recordit_save_check_required"].includes(booking.status)) {
    return response(409, {
      ok: false,
      error: "A Recordit save has already been started for this request. Refresh the dashboard before taking any further action to avoid creating a duplicate."
    }, headers);
  }

  if (booking.status !== "pending_allocation") {
    return response(409, {
      ok: false,
      error: "This request is not waiting for dentist allocation."
    }, headers);
  }

  const plannerId = clean(data.plannerId, 100);
  const confirmedDate = clean(data.confirmedDate, 10);
  const confirmedTime = clean(data.confirmedTime, 5);

  if (!plannerId || !isValidDate(confirmedDate) ||
      confirmedDate < nairobiDate(new Date()) || !isValidTime(confirmedTime) ||
      isPastNairobiDateTime(confirmedDate, confirmedTime)) {
    return response(400, {
      ok: false,
      error: "Choose a dentist and a future appointment date and time."
    }, headers);
  }

  let planners;
  let settings;
  try {
    const plannerResult = await loadRecorditPlanners();
    planners = plannerResult.planners;
    settings = await requestRecordit("access_settings");
  } catch (error) {
    return response(error && error.statusCode && error.statusCode < 500 ? error.statusCode : 502, {
      ok: false,
      error: error && error.message
        ? error.message
        : "Could not check the Recordit dentist list and appointment settings."
    }, headers);
  }

  const planner = planners.find((item) => item.id === plannerId);
  if (!planner) {
    return response(400, {
      ok: false,
      error: "That dentist is no longer available in Recordit. Refresh the dashboard and choose from the updated list."
    }, headers);
  }

  const slotDuration = Number(settings && settings.slotDuration);
  if (!Number.isFinite(slotDuration) || slotDuration < 1 || slotDuration > 240) {
    return response(502, {
      ok: false,
      error: "Recordit did not return a valid appointment duration. No appointment was created."
    }, headers);
  }

  const start = recorditUtcDateTime(confirmedDate, confirmedTime);
  const [year, month, day, hour, minute] = start.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):00$/).slice(1).map(Number);
  const endInstant = new Date(Date.UTC(year, month - 1, day, hour, minute + slotDuration, 0));
  const pad = (value) => String(value).padStart(2, "0");
  const end = endInstant.getUTCFullYear() + "-" +
    pad(endInstant.getUTCMonth() + 1) + "-" +
    pad(endInstant.getUTCDate()) + " " +
    pad(endInstant.getUTCHours()) + ":" +
    pad(endInstant.getUTCMinutes()) + ":00";

  booking.status = "recordit_saving";
  booking.assignedDentist = planner.name;
  booking.plannerId = planner.id;
  booking.confirmedDate = confirmedDate;
  booking.confirmedTime = confirmedTime;
  booking.recorditSaveStartedAt = new Date().toISOString();
  booking.recorditSaveError = null;
  booking.updatedAt = booking.recorditSaveStartedAt;

  try {
    await saveBooking(store, booking);
  } catch {
    return response(500, {
      ok: false,
      error: "We could not lock this request before sending it to Recordit. No appointment was sent. Refresh the dashboard and check the request state."
    }, headers);
  }

  let saved;
  try {
    saved = await requestRecordit("save_appointment", {
      start,
      end,
      planner: planner.id,
      name: clean(booking.name, 120),
      phone: normalizePhone(booking.phone),
      purpose: clean(booking.suggestedVisit || booking.service, 200)
    });
  } catch (error) {
    if (!error || !error.uncertain) {
      booking.status = "pending_allocation";
      booking.recorditSaveError = error && error.message ? error.message : "Recordit rejected the appointment.";
      booking.updatedAt = new Date().toISOString();
      try { await saveBooking(store, booking); } catch {}
      return response(error && error.statusCode && error.statusCode < 500 ? error.statusCode : 502, {
        ok: false,
        error: booking.recorditSaveError
      }, headers);
    }

    booking.status = "recordit_save_check_required";
    booking.recorditSaveError = error.message;
    booking.updatedAt = new Date().toISOString();
    try { await saveBooking(store, booking); } catch {}
    return response(502, {
      ok: false,
      status: booking.status,
      requestId: booking.id,
      error: "Recordit could not confirm whether it saved this appointment. The system has paused retries to avoid a duplicate. Do not assign this request again until its Recordit status has been checked."
    }, headers);
  }

  const eventNo = saved && saved.eventNo;
  if (eventNo === undefined || eventNo === null || String(eventNo).trim() === "") {
    booking.status = "recordit_save_check_required";
    booking.recorditSaveError = "Recordit returned no appointment reference.";
    booking.updatedAt = new Date().toISOString();
    try { await saveBooking(store, booking); } catch {}
    return response(502, {
      ok: false,
      status: booking.status,
      requestId: booking.id,
      error: "Recordit returned no appointment reference. Its save result may be incomplete, so retries are paused to avoid a duplicate."
    }, headers);
  }

  const isConfirmed = recorditConfirmed(saved.confirmed);
  booking.recorditEventNo = String(eventNo);
  booking.recorditConfirmed = isConfirmed;
  booking.status = isConfirmed ? "confirmed" : "recordit_saved";
  booking.confirmedAt = isConfirmed ? new Date().toISOString() : null;
  booking.updatedAt = new Date().toISOString();
  booking.patientConfirmation = {
    channel: booking.confirmationChannel,
    configured: false,
    sent: false,
    attemptedAt: null,
    providerStatus: isConfirmed ? null : "Not sent because Recordit did not report the appointment as confirmed."
  };

  try {
    await saveBooking(store, booking);
  } catch {
    // The Recordit appointment exists. Keep the record in its saved/locked state
    // so the dashboard cannot create a second appointment on a blind retry.
    return response(500, {
      ok: false,
      status: booking.status,
      requestId: booking.id,
      recorditEventNo: booking.recorditEventNo,
      error: "Recordit saved the appointment, but the booking dashboard could not update its local record. Do not submit the assignment again; refresh and check the request."
    }, headers);
  }

  if (isConfirmed) {
    const notification = await sendPatientConfirmation(booking);
    booking.patientConfirmation = {
      channel: booking.confirmationChannel,
      configured: notification.configured,
      sent: notification.sent,
      attemptedAt: new Date().toISOString(),
      providerStatus: notification.providerStatus || null
    };
    booking.updatedAt = new Date().toISOString();
    try { await saveBooking(store, booking); } catch {}
  }

  return response(200, {
    ok: true,
    status: booking.status,
    requestId: booking.id,
    assignedDentist: booking.assignedDentist,
    confirmedDate: booking.confirmedDate,
    confirmedTime: booking.confirmedTime,
    recorditEventNo: booking.recorditEventNo,
    recorditConfirmed: isConfirmed,
    patientConfirmation: booking.patientConfirmation,
    message: isConfirmed
      ? (booking.patientConfirmation && booking.patientConfirmation.sent
        ? "Recordit confirmed the appointment and the patient notification was accepted by the provider."
        : "Recordit confirmed the appointment, but the patient notification was not sent. Check the notification provider and retry.")
      : "The appointment was saved to Recordit, but Recordit did not mark it as confirmed. No patient confirmation has been sent."
  }, headers);
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
  const patientName = escapeHtml(booking.name);
  const dentistName = escapeHtml(booking.assignedDentist);
  const reference = escapeHtml(booking.recorditEventNo);
  const text = [
    "LAVINGTON GREEN DENTAL SUITE",
    "APPOINTMENT CONFIRMED",
    "",
    "Hello " + booking.name + ",",
    "Your appointment has been confirmed by our clinic.",
    "",
    "APPOINTMENT DETAILS",
    "Date: " + confirmedDate,
    "Time: " + confirmedTime + " EAT",
    "Dentist: " + booking.assignedDentist,
    "Reference: " + booking.recorditEventNo,
    "",
    "Please keep this email for your records. If you need to change your appointment, contact Lavington Green Dental Suite.",
    "",
    "We look forward to welcoming you.",
    "Lavington Green Dental Suite"
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Appointment confirmed</title></head>
<body style="margin:0;padding:0;background-color:#F7F1E8;font-family:Arial,Helvetica,sans-serif;color:#231714;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your appointment at Lavington Green Dental Suite is confirmed.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F7F1E8;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #EEE4D7;">
        <tr><td style="background-color:#ffffff;padding:22px 32px 18px;text-align:center;border-bottom:1px solid #EEE4D7;">
          <img src="https://raw.githubusercontent.com/robinmigwi/lavington-green-dental/main/lavington-green-dental/assets/logo.png" alt="Lavington Green Dental Suite" width="180" style="display:block;width:180px;max-width:100%;height:auto;margin:0 auto;border:0;">
        </td></tr>
        <tr><td style="background-color:#65070F;padding:30px 32px 26px;text-align:left;">
          <h1 style="margin:0;color:#ffffff;font-size:25px;line-height:1.25;font-weight:700;">Your appointment is confirmed</h1>
          <p style="margin:10px 0 0;color:#F7F1E8;font-size:14px;line-height:1.6;">Thank you for choosing Lavington Green Dental Suite.</p>
        </td></tr>
        <tr><td style="padding:28px 32px 12px;">
          <p style="margin:0 0 8px;font-size:16px;line-height:1.6;">Hello ${patientName},</p>
          <p style="margin:0;color:#6D5B54;font-size:14px;line-height:1.75;">Your appointment has been confirmed by our clinic. Here are the details for your visit.</p>
        </td></tr>
        <tr><td style="padding:14px 32px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FFFDFC;border:1px solid #EEE4D7;border-radius:12px;">
            <tr><td style="padding:20px 22px 8px;">
              <p style="margin:0;color:#65070F;font-size:11px;letter-spacing:1.5px;font-weight:bold;">YOUR APPOINTMENT</p>
              <p style="margin:12px 0 4px;color:#4B0A12;font-size:19px;font-weight:bold;">${escapeHtml(confirmedDate)}</p>
              <p style="margin:0;color:#D68A22;font-size:16px;font-weight:bold;">${escapeHtml(confirmedTime)} EAT</p>
            </td></tr>
            <tr><td style="padding:12px 22px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="padding:12px 0;border-top:1px solid #EEE4D7;color:#6D5B54;font-size:12px;width:100px;">Dentist</td><td style="padding:12px 0;border-top:1px solid #EEE4D7;color:#231714;font-size:14px;font-weight:bold;">${dentistName}</td></tr>
                <tr><td style="padding:12px 0 0;border-top:1px solid #EEE4D7;color:#6D5B54;font-size:12px;">Reference</td><td style="padding:12px 0 0;border-top:1px solid #EEE4D7;color:#231714;font-size:14px;font-weight:bold;">${reference}</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          <div style="height:3px;background:#D68A22;width:48px;margin-bottom:18px;"></div>
          <p style="margin:0 0 10px;color:#231714;font-size:14px;font-weight:bold;">Need to make a change?</p>
          <p style="margin:0;color:#6D5B54;font-size:13px;line-height:1.75;">Please contact Lavington Green Dental Suite if you need to reschedule or have any questions about your visit.</p>
          <p style="margin:18px 0 0;color:#231714;font-size:14px;line-height:1.7;">We look forward to welcoming you.</p>
        </td></tr>
        <tr><td style="background:#65070F;padding:20px 32px;text-align:center;">
          <p style="margin:0;color:#ffffff;font-size:13px;font-weight:bold;">Lavington Green Dental Suite</p>
          <p style="margin:6px 0 0;color:#F7F1E8;font-size:11px;">Your smile, cared for.</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:#6D5B54;font-size:11px;line-height:1.5;text-align:center;">This email confirms the appointment details shown above. Please keep it for your records.</p>
    </td></tr>
  </table>
</body>
</html>`;

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
