import { createHmac, timingSafeEqual } from "node:crypto";

export function whatsappEnabled() {
  return String(process.env.WHATSAPP_ENABLED || "").toLowerCase() === "true";
}

export function whatsappTestMode() {
  return String(process.env.WHATSAPP_MODE || "test").toLowerCase() !== "live";
}

export function normalizeWhatsAppNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

export function isAllowedWhatsAppRecipient(value) {
  const recipient = normalizeWhatsAppNumber(value);
  if (!recipient) return false;
  if (!whatsappTestMode()) return true;
  const allowed = String(process.env.WHATSAPP_TEST_RECIPIENTS || "").split(",").map(normalizeWhatsAppNumber).filter(Boolean);
  return allowed.includes(recipient);
}

export function verifyWhatsAppSignature(rawBody, signatureHeader) {
  const secret = String(process.env.WHATSAPP_APP_SECRET || "");
  if (!secret || !signatureHeader || !String(signatureHeader).startsWith("sha256=")) return false;
  const supplied = Buffer.from(String(signatureHeader).slice(7), "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function sendWhatsAppText(to, body) {
  if (!whatsappEnabled()) return { configured: false, sent: false, providerStatus: "WhatsApp is disabled." };
  if (!isAllowedWhatsAppRecipient(to)) return { configured: true, sent: false, providerStatus: "Recipient is not allowlisted for the current WhatsApp mode." };
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "");
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || "");
  const apiVersion = String(process.env.WHATSAPP_API_VERSION || "");
  if (!phoneNumberId || !accessToken || !/^v\d+\.\d+$/.test(apiVersion)) {
    return { configured: false, sent: false, providerStatus: "WhatsApp Cloud API credentials or API version are not configured." };
  }
  try {
    const result = await fetch("https://graph.facebook.com/" + apiVersion + "/" + encodeURIComponent(phoneNumberId) + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeWhatsAppNumber(to),
        type: "text",
        text: { preview_url: false, body: String(body || "").slice(0, 4000) }
      }),
      signal: AbortSignal.timeout(10000)
    });
    const payload = await result.json().catch(() => ({}));
    const accepted = result.ok && Array.isArray(payload.messages) && payload.messages.length > 0;
    return { configured: true, sent: accepted, providerStatus: accepted ? "accepted" : "WhatsApp provider rejected the request (HTTP " + result.status + ")." };
  } catch {
    return { configured: true, sent: false, providerStatus: "WhatsApp provider unavailable." };
  }
}
