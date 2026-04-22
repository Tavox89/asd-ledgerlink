# Google Setup

LedgerLink expects Google Cloud and OAuth setup to already exist. The implementation reads everything from environment variables.

## Required environment variables

- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_GMAIL_ACCOUNT`
- `GOOGLE_APPLICATION_CREDENTIALS` for Pub/Sub pull and other server-to-server Google Cloud calls
- `GMAIL_PUBSUB_TOPIC`
- `GMAIL_PUBSUB_SUBSCRIPTION`
- `GMAIL_PUBSUB_PULL_MAX_MESSAGES`
- `GMAIL_PUBSUB_WORKER_INTERVAL_MS`

## Callback URI used by this implementation

Primary callback:

- `http://localhost:4000/auth/google/callback`

Public deployment example:

- `https://ledgerlink.asdlabs.com.ve/auth/google/callback`

Important:

- `GOOGLE_REDIRECT_URI` must match one of the OAuth client's authorized redirect URIs exactly.
- `WEB_APP_URL` must point to the public web origin. If it stays as `http://localhost:3000`, Gmail OAuth may complete successfully and still redirect the browser back to `localhost` after consent.
- `NEXT_PUBLIC_API_URL` should also use the public API origin when the web app is no longer running locally.

## Gmail OAuth scope

The OAuth flow is implemented for Gmail read-only access.

Expected scope:

- `https://www.googleapis.com/auth/gmail.readonly`

## Manual local verification

1. Fill `.env` with valid Google credentials.
2. Start the API on port `4000`.
3. Open `/settings/gmail` or `/login`.
4. Trigger `GET /auth/google/start`.
5. Complete OAuth in the browser.
6. Confirm `GET /gmail/profile` returns the connected mailbox.
7. Register the watch with `POST /gmail/watch/register`.
8. Trigger `POST /gmail/pubsub/pull` to consume subscription messages, or let the local background worker poll automatically when `GMAIL_PUBSUB_WORKER_INTERVAL_MS` is enabled.

Example commands:

```bash
curl http://localhost:4000/gmail/profile
curl -X POST http://localhost:4000/gmail/watch/register
curl -X POST http://localhost:4000/gmail/pubsub/pull
```

## Pub/Sub local credentials

For local pull access, create or use a Google Cloud service account in `miproyectovision-clubsams` with at least the `Pub/Sub Subscriber` role.

Recommended local handling:

1. Download a JSON key for that service account.
2. Move it outside the repository, for example to `~/keys/ledgerlink-pubsub.json`.
3. Set `.env` with:

```env
GOOGLE_APPLICATION_CREDENTIALS=/Users/<your-user>/keys/ledgerlink-pubsub.json
```

4. Restart `pnpm dev`.
5. Trigger `POST /gmail/pubsub/pull`, or just wait for the local worker interval to consume the queue.

Notes:

- The OAuth client JSON downloaded from Google Auth Platform is not valid for Pub/Sub ADC.
- The service account JSON must contain `type: "service_account"`.
- Keep service account JSON files out of the repository and rotate them if they were ever exposed.

## Notes

- Tokens are stored only in the backend database.
- No client secret or refresh token is exposed to the frontend.
- Gmail OAuth credentials and Pub/Sub credentials are different concerns:
  - OAuth client ID/secret authenticate the Gmail user consent flow.
  - `GOOGLE_APPLICATION_CREDENTIALS` authenticates the backend against Google Cloud Pub/Sub.
- If Pub/Sub access is not available locally, the route remains implemented and will fail with a structured integration error instead of a silent no-op.
- Verification lookups now do one best-effort Pub/Sub pull and retry automatically when the first lookup still has no exact candidate.
