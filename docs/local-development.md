# Local Development

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker

## Environment

1. Copy `.env.example` to `.env`
2. Fill Google OAuth credentials
3. Keep `GOOGLE_REDIRECT_URI` as `http://localhost:4000/auth/google/callback`
4. Keep `GMAIL_PUBSUB_WORKER_INTERVAL_MS=15000` when you want automatic local Pub/Sub polling every 15 seconds
5. Add Twilio/OpenAI variables only when you want to pilot WhatsApp locally. `TWILIO_WHATSAPP_FROM`, `TWILIO_SERVICE_SID`, and `WHATSAPP_ALLOWED_TEST_NUMBERS` are only used to seed or backfill the initial `default` company channel:

```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=+1...
TWILIO_SERVICE_SID=
TWILIO_VALIDATE_SIGNATURE=false
WHATSAPP_ALLOWED_TEST_NUMBERS=+584121112233,+584141234567
OPENAI_API_KEY=...
OPENAI_VISION_MODEL=gpt-4o
```

## Database

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
```

`pnpm db:seed` resets the local database to demo fixtures. Do not run it during normal testing if you need to keep OAuth tokens, sender rules, or real ingested emails.

## Run apps

```bash
pnpm dev
```

Alternative commands by package:

```bash
pnpm --filter @ledgerlink/api dev
pnpm --filter @ledgerlink/web dev
```

## Manual test sequence

1. Connect Gmail from the web app.
2. Use `/companies/default/settings/gmail` or another company workspace; the old global routes still redirect to `default`.
3. Use `Sync recent inbox` from `/companies/<slug>/settings/gmail` to ingest the newest inbox messages directly from Gmail API.
4. Register the Gmail watch when you also want Pub/Sub-based ingestion.
5. Leave the local worker enabled for automatic polling, or pull Pub/Sub messages manually once `GOOGLE_APPLICATION_CREDENTIALS` is configured.
6. Inspect `/companies/<slug>/emails`.
7. Use `/companies/<slug>/verifications` to look up stored inbox evidence with `reference + amount + date` after the email already arrived; if the first lookup still has no exact candidate, the backend now does one Pub/Sub pull and retries automatically.
8. Use `POST /companies/:companySlug/verifications/authorize` to exercise the same exact yes/no decision an external checkout or backoffice flow would consume.
9. Create a tracked verification request only when you want to keep the case open for operator follow-up or manual confirmation.
10. Create an expected transfer when you want to manage the request directly from `/companies/<slug>/transfers`.
11. Inspect `/companies/<slug>/matches`.
12. Resolve ambiguous items in `/companies/<slug>/reviews`.

## WhatsApp pilot in local

1. Start the API with `pnpm --filter @ledgerlink/api dev`.
2. Expose port `4000` with a public tunnel such as `ngrok http 4000`.
3. In Twilio, point the WhatsApp webhook to `<your-public-url>/channels/whatsapp/twilio/webhook`.
4. Remember that this temporarily moves the line away from `cerebro`; the same line cannot deliver to both apps at once.
5. Send one of these to the WhatsApp line from an allowlisted number:
   - a screenshot/comprobante
   - text with `referencia`, `monto`, and optional `fecha`
   - or both together
6. Inspect persisted pilot traces with `GET /companies/:companySlug/channels/whatsapp/attempts`.

## Demo data

The seed includes:

- example allowed bank senders
- expected transfers
- parsed email fixtures
- review and audit samples

## End-to-end local walkthrough

1. Load the seed so the UI already shows emails, transfers, matches, reviews, and audit logs.
2. Add real Google OAuth credentials in `.env` when you want to test live Gmail connectivity.
3. Use `/companies/default/settings/gmail` or another company workspace to launch OAuth, sync recent inbox messages immediately, and then register the watch for Pub/Sub-based ingestion.
4. Use `/companies/<slug>/verifications` to test the exact post-email lookup flow your online payment system will call with `reference + amount + date`.
5. Wait for the local worker to ingest new Pub/Sub events automatically, or force it from `/companies/<slug>/settings/gmail` when you want an immediate refresh.
6. Call `POST /companies/:companySlug/verifications/authorize` to validate the binary authorization contract and chosen evidence email.
7. Review `/companies/<slug>/emails`, `/companies/<slug>/matches`, `/companies/<slug>/reviews`, and `/companies/<slug>/audit` to validate the full evidence trail, including emails marked `ignored`.
