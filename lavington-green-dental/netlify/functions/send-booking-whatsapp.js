exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "appointment_request_received";
  const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

  if (!accessToken || !phoneNumberId) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ configured: false, sent: false })
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const name = String(data.name || "").trim();
  const phone = normalizeKenyanPhone(data.phone);
  const service = String(data.service || "Dental appointment").trim();
  const preferredDate = String(data.preferred_date || "").trim();
  const preferredTime = String(data.preferred_time || "").trim();
  const feeling = String(data.feeling || "Not provided").trim();

  if (!name || !phone || !preferredDate || !preferredTime) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing booking details" }) };
  }

  const url = "https://graph.facebook.com/" + apiVersion + "/" + encodeURIComponent(phoneNumberId) + "/messages";

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: name },
            { type: "text", text: service },
            { type: "text", text: preferredDate },
            { type: "text", text: preferredTime },
            { type: "text", text: feeling }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          configured: true,
          sent: false,
          error: result?.error?.message || "WhatsApp message could not be sent"
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ configured: true, sent: true, messageId: result.messages?.[0]?.id || "" })
    };
  } catch {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ configured: true, sent: false, error: "WhatsApp service unavailable" })
    };
  }
};

function normalizeKenyanPhone(value) {
  const raw = String(value || "").replace(/[^\d+]/g, "");
  if (raw.startsWith("+254")) return raw.slice(1);
  if (raw.startsWith("254")) return raw;
  if (raw.startsWith("0")) return "254" + raw.slice(1);
  return raw;
}
