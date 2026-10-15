# Lavington Green Dental: request-first appointment workflow

This branch is designed for the case where Recordit does not provide a suitable unassigned appointment/request endpoint.

## Workflow

1. The patient completes the website concierge. They do not choose a dentist. They enter their contact details, service/concern, preferred date and time, and choose whether appointment confirmation should be sent by SMS or email.
2. The \`save-booking\` Netlify Function saves the request to Netlify Blobs as \`pending_allocation\`. It does **not** create an appointment in Recordit.
3. The clinic receives an email alert and a WhatsApp alert (when those channels are configured). Alerts include a request reference, patient contact, service and preferred date/time; the patient's concern and additional notes are not included in these alerts.
4. The administrator opens the password-protected \`/admin-bookings.html\` dashboard and reviews the request. The administrator independently allocates the dentist and creates/confirms the actual appointment in Recordit.
5. After the administrator verifies the Recordit appointment, they enter the assigned dentist, final date/time and Recordit event number in the dashboard, then tick the confirmation checkbox and submit. The server marks the request confirmed and sends the patient an SMS or email according to the patient's preference.
6. If the patient notification fails, the request remains confirmed, the dashboard reports the failure, and the administrator can retry the notification. The retry does not create or change the appointment in Recordit.

The dashboard never creates or updates appointments in Recordit. Recordit remains the clinic's source of truth for the actual dentist allocation and confirmed appointment.

## Netlify environment variables

Configure these in **Project configuration > Environment variables**. They must be available to Netlify Functions at runtime. Use **Deploy Previews** for the initial sample-clinic tests and keep values/context separate from Production.

### Request data separation

- \`BOOKING_DATA_NAMESPACE\` — set to \`preview\` for Deploy Previews and \`production\` for Production. The code defaults to \`preview\`; explicitly set \`production\` before publishing this workflow to the live site, to keep the preview request list separate from live requests.
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

This request-first workflow deliberately does not call Recordit's \`save_appointment\` endpoint because doing so would assign a dentist before the administrator has reviewed the request. \`RECORDIT_API_KEY\` and \`RECORDIT_API_BASE_URL\` are not used by the website request-save or admin-confirmation functions in this design. The administrator uses Recordit manually before confirming the request in the dashboard.

## Preview test checklist

1. Configure \`BOOKING_DATA_NAMESPACE=preview\` and a random \`BOOKING_ADMIN_TOKEN\` in the Deploy Previews context.
2. Configure the Resend variables and the approved team WhatsApp template if testing clinic alerts.
3. Configure Africa's Talking credentials if testing patient SMS confirmation.
4. Open the Deploy Preview and submit a request using fictional details, choosing SMS or email as the patient confirmation method.
5. Verify the website states that the request has been received and is **not confirmed**.
6. Open \`/admin-bookings.html\` on the same preview host and sign in with the admin token. Confirm the new request appears under Pending dentist allocation.
7. In the sample clinic, select a dentist and confirm the final date/time in the admin dashboard. Submit the assignment once.
8. Verify the appointment appears under the selected planner in the sample Recordit clinic and that the dashboard displays the returned event number.
9. If Recordit returns `confirmed: false`, verify that no patient message is sent. Do not resubmit the assignment, because that could create a duplicate appointment.
10. If Recordit reports the appointment confirmed, verify the patient's chosen email/SMS notification. If notification delivery fails, configure the relevant provider and retry only the notification.
11. Keep Production untouched until this whole preview workflow is verified.

Use only fictional patient data for preview tests. Do not paste API tokens into GitHub, website JavaScript, or support messages.
