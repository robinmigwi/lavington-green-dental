const API_ROOT = (process.env.RECORDIT_API_BASE_URL || "https://api.recordit.ke/ai_assist").replace(/\/+$/, "");

export const handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  if (event.httpMethod !== "POST") {
    return response(405, { ok: false, error: "Method not allowed" }, headers);
  }

  const apiKey = process.env.RECORDIT_API_KEY;
  if (!apiKey) {
    return response(503, {
      ok: false,
      error: "Live appointment availability is not configured yet. Please contact the clinic."
    }, headers);
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { ok: false, error: "Invalid request" }, headers);
  }

  const date = String(data.date || "").trim();
  if (!isValidDate(date)) {
    return response(400, { ok: false, error: "Choose a valid appointment date." }, headers);
  }

  const today = nairobiDate(new Date());
  if (date < today) {
    return response(400, { ok: false, error: "Choose today or a future date." }, headers);
  }

  try {
    const [settings, availability] = await Promise.all([
      recorditPost("access_settings", apiKey),
      recorditPost("available_slots", apiKey, {
        startInclusive: date + " 00:00:00",
        endExclusive: addDays(date, 1) + " 00:00:00"
      })
    ]);

    const daysAvailable = Number(settings.daysAvailable) || 21;
    const maxDate = addDays(today, daysAvailable);

    if (date > maxDate) {
      return response(400, {
        ok: false,
        error: "That date is outside the clinic's current booking window.",
        maxDate
      }, headers);
    }

    if (!Array.isArray(availability)) {
      throw new Error("Recordit returned an unexpected availability response.");
    }

    const slots = [];
    availability.forEach((planner) => {
      const plannerId = String(planner && planner.id || "").trim();
      const plannerLabel = String(planner && planner.label || "").trim();
      if (!plannerId || !Array.isArray(planner.slots)) return;

      planner.slots.forEach((slot) => {
        const start = toSqlTime(slot && slot.start);
        const end = toSqlTime(slot && slot.end);
        const localStart = formatNairobiTime(start);
        const localEnd = formatNairobiTime(end);
        if (!start || !end || !localStart || !localEnd) return;

        slots.push({
          start,
          end,
          planner: plannerId,
          plannerLabel,
          localStart,
          localEnd
        });
      });
    });

    slots.sort((a, b) => {
      const timeDifference = a.start.localeCompare(b.start);
      return timeDifference || a.plannerLabel.localeCompare(b.plannerLabel);
    });

    return response(200, {
      ok: true,
      clinicName: String(settings.clinicName || ""),
      date,
      daysAvailable,
      maxDate,
      slotDuration: Number(settings.slotDuration) || 60,
      configuredPlanners: Array.isArray(settings.availablePlanners)
        ? settings.availablePlanners.map((planner) => ({
            id: String(planner && planner.id || ""),
            label: String(planner && planner.label || "")
          }))
        : [],
      returnedPlanners: availability.map((planner) => ({
        id: String(planner && planner.id || ""),
        label: String(planner && planner.label || "")
      })),
      slots
    }, headers);
  } catch {
    return response(502, {
      ok: false,
      error: "We could not load appointment availability. Please try again or contact the clinic."
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
    const message = payload && payload.error ? String(payload.error) : "Recordit request failed.";
    throw new Error(message);
  }

  return payload;
}

function response(statusCode, body, headers) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(value, amount) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
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

function toSqlTime(value) {
  const time = String(value || "").trim().replace("T", " ").replace(/Z$/, "").replace(/\.\d+$/, "");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time) ? time : "";
}

function formatNairobiTime(value) {
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    hour: "numeric",
    minute: "2-digit"
  }).format(date).toLowerCase();
}
