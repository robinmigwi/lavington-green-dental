# WhatsApp Cloud API test setup

This integration is deliberately disabled unless `WHATSAPP_ENABLED=true`. Keep it in test mode until the clinic explicitly approves production setup.

## Netlify Deploy Preview environment variables

Set these only on the Deploy Preview environment for the WhatsApp feature branch:

- `WHATSAPP_ENABLED=true`
- `WHATSAPP_MODE=test`
- `WHATSAPP_PHONE_NUMBER_ID`: the Phone Number ID shown by Meta API Setup
- `WHATSAPP_ACCESS_TOKEN`: Meta's current test access token; never commit it or paste it into chat
- `WHATSAPP_API_VERSION`: a currently supported Graph API version in `vNN.N` format, chosen from Meta's app/API setup
- `WHATSAPP_VERIFY_TOKEN`: a random secret string you create and enter in Meta's webhook configuration
- `WHATSAPP_APP_SECRET`: the app secret from Meta App Settings > Basic, used to verify webhook signatures
- `WHATSAPP_TEST_RECIPIENTS`: comma-separated test recipient numbers in international digits-only format, without a plus sign
- `BOOKING_DATA_NAMESPACE=preview`: keep preview booking records separate from production data

Do not put credentials in GitHub, browser code, or logs. If any token is exposed, rotate it in Meta.

## Meta webhook setup

1. Use the Deploy Preview function URL ending in `/.netlify/functions/whatsapp-webhook`.
2. Configure the callback URL and the exact same `WHATSAPP_VERIFY_TOKEN` value.
3. Subscribe the app webhook to the WhatsApp Business Account `messages` field.
4. Send a message from an allowlisted test recipient and inspect the Deploy Preview function logs.
5. The first message receives a greeting. The conversation asks for the service or concern, preferred date, and name.
6. A request is saved as `pending_allocation` in the existing `appointment-requests` Blobs store and appears in the existing admin dashboard.
7. Staff must allocate the dentist and verify the appointment in Recordit. WhatsApp confirmation is only attempted after the existing workflow marks the appointment confirmed.

## Safety behavior

- The webhook returns Meta's challenge only when the verify token matches.
- Incoming POST requests must pass `X-Hub-Signature-256` verification using the Meta app secret.
- In test mode, incoming messages and outbound replies are restricted to `WHATSAPP_TEST_RECIPIENTS`.
- WhatsApp processing is disabled unless `WHATSAPP_ENABLED=true`.
- Duplicate Meta message IDs are deduplicated in Netlify Blobs.
- The conversation does not offer diagnosis. Urgent symptoms are directed to the clinic or emergency care.
- Website email booking remains available and unchanged.
- Do not connect the clinic's live number or change production environment variables before explicit approval.

## Current test scope and limitations

This first iteration handles text messages only. It creates pending requests and does not promise slot availability. Interactive buttons, templates, reminders, inbound attachments, and live clinic traffic require separate testing and approval.
