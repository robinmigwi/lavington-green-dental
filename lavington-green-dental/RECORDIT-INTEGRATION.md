# Lavington Green Dental: request-first appointment workflow

This branch is designed for the case where Recordit does not provide a suitable unassigned appointment/request endpoint.

## Workflow

1. The patient completes the website concierge. They do not choose a dentist. They enter their contact details, service/concern, preferred date and time, and choose whether appointment confirmation should be sent by SMS or email.
2. The `save-booking` Netlify Function saves the request to Netlify Blobs as `pending_allocation`. It does not create an appointment in Recordit at this stage.
3. The clinic receives an email alert and a WhatsApp alert when those channels are configured. Alerts contain a request reference, patient contact, service and preferred date/time; the patient's concern and additional notes remain in the protected dashboard.
4. The administrator opens the password-protected `/admin-bookings.html` dashboard, chooses an available dentist, and sets the final appointment date and time.
5. On submission, the server calls Recordit's `save_appointment` endpoint. The dashboard stores the returned event number and whether Recordit reported the appointment as confirmed.
6. If Recordit reports the appointment as confirmed, the system sends the patient's chosen SMS or email confirmation. If Recordit saved the appointment but did not mark it confirmed, the patient is not notified. The administrator must verify the appointment in Recordit and then confirm it in the dashboard.
7. If the Recordit save result is uncertain, the request is paused to avoid a duplicate appointment. The administrator must check Recordit before taking further action. Patient notification failures can be retried without creating another appointment.

Recordit remains the source of truth for the appointment status. The dashboard creates an appointment only when an administrator explicitly submits the dentist assignment.
## Netlify environment variables

Configure these in **Project configuration > Environment variables**. They must be available to Netlify Functions at runtime. Use **Deploy Previews** for the initial sample-clinic tests and keep values/context separate from Production.

### Request data separation

- \`BOOKING_DATA_NAMESPACE\` — optional override for nonproduction contexts. Netlify Production always uses the \`production\` namespace; Deploy Previews use the configured value or default to \`preview\`. This keeps preview test requests separate from live requests even when the variable is not set.
- \`BOOKING_ADMIN_TOKEN\` — required for the private dashboard and administrator endpoint. Use a randomly generated secret of at least 32 characters. Set a different token for Deploy Previews and Production. This is **not** the Recordit API key.

Requests are stored in the site-wide \`appointment-requests\` Netlify Blobs store and are separated by namespace prefix. The dashboard's API only lists records for its current namespace. The administrator token must never be written into the repository or shared in the browser URL.

### Clinic email alert and patient email confirmation

The implementation uses the Resend email API for both clinic alerts and patient confirmations by email.

- \`RESEND_API_KEY\` — Resend API key.
- \`BOOKING_EMAIL_FROM\` — sender email address verified in Resend.
- \`BOOKING_NOTIFICATION_EMAIL\` — one or more clinic inboxes, separated by commas.

Clinic alerts are sent when a website request is stored. A patient confirmation email is sent only when the administrator marks a request confirmed in the dashboard, after making/confirming the appointment in Recordit.

### Clinic WhatsApp alert

The clinic team alert is sent using the WhatsApp Cloud API.

- \`WHATSAPP_ACCESS_TOKEN\` — WhatsApp Cloud API access token.
- \`WHATSAPP_PHONE_NUMBER_ID\` — WhatsApp Business phone-number ID.
- \`WHATSAPP_API_VERSION\` — optional; defaults to \`v23.0\`.
- \`BOOKING_TEAM_WHATSAPP_TO\` — one or more clinic team recipients in international digits-only format, separated by commas.
- \`BOOKING_TEAM_WHATSAPP_TEMPLATE_NAME\` — name of the approved WhatsApp template used for the clinic's internal request alert.
- \`BOOKING_TEAM_WHATSAPP_TEMPLATE_LANGUAGE\` — optional; defaults to \`en_US\`.

The approved six-parameter template body order must be:
1. Patient name
2. Patient phone
3. Service
4. Preferred date and time
5. Status (Pending dentist allocation)
6. Website request reference

Use a template intended for the clinic team alert. Do not reuse a patient-facing appointment confirmation template unless its approved parameter structure is identical.

### Patient SMS confirmation

SMS confirmation uses Africa's Talking. This is sent only after the administrator marks the request confirmed.

- \`AT_USERNAME\` — Africa's Talking application username.
- \`AT_API_KEY\` — Africa's Talking API key.
- \`AT_SENDER_ID\` — optional approved sender ID, if the account uses one.

An Africa's Talking account, available SMS balance and any required sender ID approval are needed. If these values are missing, the appointment can still be marked confirmed in the dashboard, but patient SMS delivery will be shown as unsuccessful so it can be configured and retried.

### Recordit key

- \`RECORDIT_API_KEY\` — API key for the target clinic's real Recordit account in Production and the intended test account in preview.
- \`RECORDIT_API_BASE_URL\` — optional API base URL override. The default is \`https://api.recordit.ke/ai_assist\`.
- \`RECORDIT_ADDITIONAL_PLANNERS\` — optional JSON array of additional clinician entries, each containing a verified Recordit planner ID and display name. Only use IDs confirmed in the target clinic's Recordit account. This does not create a planner or grant access in Recordit; it only provides a fallback if an endpoint omits a known, valid planner.

The admin endpoint uses the Recordit key to load available dentists and create appointments when the administrator submits an assignment. Never commit API keys to the repository.
## Preview test checklist

1. Configure \`BOOKING_ADMIN_TOKEN\` in the Deploy Previews context using a strong, randomly generated secret. Do not reuse a production token.
2. Configure the Recordit key and the email and messaging provider credentials needed for the channels being tested.
3. Submit one request with fictional patient details and confirm the website records it as pending, not confirmed.
4. Open \`/admin-bookings.html\` on the same preview host and confirm the request appears under Pending dentist allocation.
5. Select a dentist, choose a future date/time and submit once. Verify the appointment appears under the selected planner in the Recordit account and the dashboard records its event number.
6. If Recordit does not report the appointment as confirmed, verify that no patient confirmation is sent. If the save status is uncertain, check Recordit before doing anything else to avoid duplicates.
7. Verify the booking alerts arrive at both clinic inboxes and the link opens the same deployment host that received the request.
8. Before live release, verify the real clinic API key, a fresh independent production admin token, production email sender/recipients, and both dentists' planner access.

Use only fictional patient data for preview tests. Do not paste API tokens into GitHub, website JavaScript, emails, or support messages.
