import { randomUUID } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";
import {
  isAllowedWhatsAppRecipient,
  normalizeWhatsAppNumber,
  sendWhatsAppText,
  verifyWhatsAppSignature,
  whatsappEnabled
} from "./_shared/whatsapp.mjs";

const STORE_NAME = "appointment-requests";
const NAMESPACE = String(process.env.BOOKING_DATA_NAMESPACE || "preview").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32) || "preview";
const REQUEST_PREFIX = "request-" + NAMESPACE + "-";
const MESSAGE_PREFIX = "whatsapp-message-" + NAMESPACE + "-";
const CONVERSATION_PREFIX = "whatsapp-conversation-" + NAMESPACE + "-";

export const handler = async (event) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    const expected = String(process.env.WHATSAPP_VERIFY_TOKEN || "");
    if (q["hub.mode"] === "subscribe" && expected && q["hub.verify_token"] === expected && q["hub.challenge"]) {
      return { statusCode: 200, headers: { "Content-Type": "text/plain" }, body: String(q["hub.challenge"]) };
    }
    return reply(403, { ok: false, error: "Webhook verification failed." }, headers);
  }
  if (event.httpMethod !== "POST") return reply(405, { ok: false, error: "Method not allowed." }, headers);
  if (!whatsappEnabled()) return reply(200, { ok: true, ignored: true }, headers);

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : Buffer.from(event.body || "", "utf8");
  const incomingHeaders = event.headers || {};
  const signature = incomingHeaders["x-hub-signature-256"] || incomingHeaders["X-Hub-Signature-256"];
  if (!verifyWhatsAppSignature(rawBody, signature)) return reply(401, { ok: false, error: "Invalid webhook signature." }, headers);

  let payload;
  try { payload = JSON.parse(rawBody.toString("utf8")); }
  catch { return reply(400, { ok: false, error: "Invalid webhook payload." }, headers); }
  if (payload.object !== "whatsapp_business_account") return reply(404, { ok: false, error: "Unsupported webhook object." }, headers);

  try {
    connectLambda(event);
    const store = getStore(STORE_NAME);
    for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        if (change.field !== "messages") continue;
        const messages = Array.isArray(change.value && change.value.messages) ? change.value.messages : [];
        for (const message of messages) {
          if (!message || !message.id || !message.from || message.type !== "text") continue;
          const sender = normalizeWhatsAppNumber(message.from);
          if (!isAllowedWhatsAppRecipient(sender)) continue;
          const messageKey = MESSAGE_PREFIX + Buffer.from(String(message.id)).toString("base64url").slice(0, 150);
          if (await store.get(messageKey, { type: "json" }).catch(() => null)) continue;
          await store.setJSON(messageKey, { id: message.id, status: "processing", receivedAt: new Date().toISOString() });

          const conversationKey = CONVERSATION_PREFIX + sender;
          const conversation = await store.get(conversationKey, { type: "json" }).catch(() => null);
          const outcome = await processMessage(store, sender, String(message.text && message.text.body || "").trim(), conversation);
          await store.setJSON(messageKey, { id: message.id, status: outcome.bookingCreated ? "booking_created" : "handled", receivedAt: new Date().toISOString() });
          if (outcome.reply) await sendWhatsAppText(sender, outcome.reply);
        }
      }
    }
    return reply(200, { ok: true }, headers);
  } catch {
    return reply(500, { ok: false, error: "Webhook processing failed." }, headers);
  }
};

async function processMessage(store, sender, text, current) {
  const message = text.slice(0, 1000);
  if (!message) return { reply: "Please send a message so we can help with your appointment." };
  if (/^(stop|cancel|restart|start over|menu)$/i.test(message)) {
    await store.delete(CONVERSATION_PREFIX + sender).catch(() => {});
    return { reply: "No problem. We have reset this booking conversation. To start again, tell us what dental service or concern you would like help with." };
  }
  if (/\b(urgent|emergency|severe pain|swelling|uncontrolled bleeding|can't breathe|cannot breathe)\b/i.test(message)) {
    await store.delete(CONVERSATION_PREFIX + sender).catch(() => {});
    return { reply: "Thank you for letting us know. This WhatsApp service cannot assess emergencies. Please call Lavington Green Dental Suite on 0706 820 099. If you have difficulty breathing, severe facial swelling, or uncontrolled bleeding, seek emergency medical care now." };
  }
  if (!current || !current.step) {
    await store.setJSON(CONVERSATION_PREFIX + sender, { step: "service", startedAt: new Date().toISOString(), service: "", preferredDate: "", name: "" });
    return { reply: "Hello, welcome to Lavington Green Dental Suite. I can help you send an appointment request. What dental service or concern would you like help with? Please avoid sharing detailed medical information here." };
  }
  if (current.step === "service") {
    current.service = message.slice(0, 180);
    current.step = "preferredDate";
    await store.setJSON(CONVERSATION_PREFIX + sender, current);
    return { reply: "Thank you. What day or date would you prefer to visit? This is a preference only; the clinic will confirm availability before your appointment is booked." };
  }
  if (current.step === "preferredDate") {
    current.preferredDate = message.slice(0, 100);
    current.step = "name";
    await store.setJSON(CONVERSATION_PREFIX + sender, current);
    return { reply: "What name should we attach to your appointment request?" };
  }
  if (current.step === "name") {
    const name = message.replace(/[<>\u0000-\u001f]/g, "").slice(0, 120);
    if (name.length < 2) return { reply: "Please enter the name you would like the clinic to use for this request." };
    const id = REQUEST_PREFIX + randomUUID();
    const now = new Date().toISOString();
    const booking = {
      id, name, phone: sender, email: "",
      service: current.service || "Dental appointment",
      suggestedVisit: current.service || "Dental appointment",
      concern: current.service || "",
      preferredDate: current.preferredDate || "",
      preferredTime: "",
      source: "WhatsApp",
      confirmationChannel: "whatsapp",
      status: "pending_allocation",
      createdAt: now,
      updatedAt: now,
      notes: "Appointment request received through WhatsApp test integration. Preferred date: " + (current.preferredDate || "Not provided") + ". Staff must verify availability and confirm in Recordit before sending confirmation."
    };
    await store.setJSON(id, booking, { metadata: { status: booking.status, service: booking.suggestedVisit, createdAt: now, namespace: NAMESPACE } });
    await store.delete(CONVERSATION_PREFIX + sender).catch(() => {});
    return { bookingCreated: true, reply: "Thank you, " + name + ". Your appointment request has been received. Your preferred date is " + (current.preferredDate || "not specified") + ". This is not yet a confirmed appointment. Our clinic team will check availability and contact you once your appointment is confirmed. You can call 0706 820 099 if you need help sooner." };
  }
  await store.delete(CONVERSATION_PREFIX + sender).catch(() => {});
  return { reply: "Let's start again. What dental service or concern would you like help with?" };
}

function reply(statusCode, body, headers) {
  return { statusCode, headers, body: JSON.stringify(body) };
}
