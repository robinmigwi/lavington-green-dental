# Recordit website booking integration

This branch connects the appointment concierge to Recordit through Netlify Functions. The Recordit API key stays on the server and must never be placed in browser JavaScript.

## Netlify environment variables

Configure these in the Netlify site settings. Use the **Deploy previews** scope for the initial sample-clinic test. Do not put a sample-clinic token in the Production scope.

### Recordit

- \`RECORDIT_API_KEY\` — required; the Bearer token for the clinic being tested.
- \`RECORDIT_API_BASE_URL\` — optional; defaults to \`https://api.recordit.ke/ai_assist\`. If supplied, use the base path ending in \`/ai_assist\`, without an individual endpoint.

### Clinic email alert

The implementation uses Resend's email API.

- \`RESEND_API_KEY\` — Resend API key.
- \`BOOKING_EMAIL_FROM\` — sender address verified in Resend, for example a bookings address on the clinic's domain.
- \`BOOKING_NOTIFICATION_EMAIL\` — one or more clinic inboxes, separated by commas.

If these variables are not configured, the appointment can still be saved in Recordit, but the response reports that the email alert was not configured or sent.

### Clinic WhatsApp alert

The WhatsApp alert is separate from the existing patient WhatsApp message.

- \`WHATSAPP_ACCESS_TOKEN\` — existing WhatsApp Cloud API access token.
- \`WHATSAPP_PHONE_NUMBER_ID\` — WhatsApp Business phone-number ID used by the Cloud API.
- \`WHATSAPP_API_VERSION\` — optional; defaults to \`v23.0\`.
- \`BOOKING_TEAM_WHATSAPP_TO\` — one or more team recipients in international digits-only format, separated by commas, for example \`2547XXXXXXXX\`.
- \`BOOKING_TEAM_WHATSAPP_TEMPLATE_NAME\` — name of a separately approved WhatsApp message template for internal clinic alerts.
- \`BOOKING_TEAM_WHATSAPP_TEMPLATE_LANGUAGE\` — optional; defaults to \`en_US\`.

The approved template must have six body text parameters in this order:

1. Patient name
2. Patient phone number
3. Service
4. Appointment date and time in East Africa Time
5. Assigned planner or doctor
6. Recordit event number

Create and approve this template in WhatsApp Manager before enabling the alert. Do not reuse the patient-facing appointment confirmation template unless it has exactly this parameter structure.

## What the integration does

1. The booking form requests live available slots from Recordit for the selected date.
2. The patient chooses a slot showing the doctor and local appointment time.
3. On submission, the server checks that the exact slot is still available.
4. The server creates the appointment through Recordit's \`save_appointment\` endpoint.
5. After Recordit returns an event number, the server best-effort stores a local audit copy and attempts the clinic email and WhatsApp alerts.
6. The existing patient-facing WhatsApp confirmation flow remains separate.

Only the appointment reference and minimal booking details are included in clinic alerts. The patient's concern and extra notes are sent to the Recordit appointment purpose, not the WhatsApp or email alerts.

Recordit may return \`confirmed: false\`. In that case the website should describe the submission as received or awaiting confirmation, not as a confirmed appointment. A failed notification does not reverse a successful Recordit booking; the function response includes notification status fields.

## Sample-clinic test sequence

1. Add the sample-clinic token to the Netlify **Deploy previews** environment variable scope.
2. Configure the Resend variables and the approved WhatsApp team template if testing notifications.
3. Open the Netlify deploy preview and select a date. Confirm the time options are fetched live and include the doctor.
4. Submit fictional patient details for a slot returned by Recordit.
5. Confirm the appointment appears in the sample clinic, and check the email and WhatsApp recipients.
6. Confirm the page says the appointment is awaiting confirmation when Recordit returns \`confirmed: false\`.
7. Only after the sample-clinic test passes, configure the appropriate production Recordit token in the Production scope and test under the clinic's approval.

Do not use real patient data for the initial preview test.
