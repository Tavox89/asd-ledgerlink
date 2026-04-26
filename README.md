# LedgerLink by ASD Labs

LedgerLink is a fintech reconciliation workspace that connects one or more Gmail inboxes per company, ingests bank notification emails, evaluates basic authenticity evidence, extracts transfer signals, and matches them against expected transfers without overstating certainty.

Built by Tavox.

## Stack

- `apps/web`: Next.js App Router, Tailwind, React Query
- `apps/api`: Express, Prisma, Gmail API, Google Pub/Sub
- `packages/shared`: Zod DTOs, shared types and utilities
- PostgreSQL via Docker Compose
- TypeScript across the monorepo

## Company workspaces

- Each `CompanyProfile` owns one or more operational Gmail inboxes, one active WhatsApp channel, sender rules, expected transfers, matches, reviews, audit logs, and WhatsApp pilot traces.
- New workspace routes are company-scoped under `/companies/:companySlug/...`.
- Legacy global workspace routes still exist as transition aliases and redirect to the `default` company locally.

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Start PostgreSQL:

```bash
docker compose up -d
```

4. Run migrations:

```bash
pnpm db:migrate
```

5. Seed local data:

```bash
pnpm db:seed
```

6. Start web and API:

```bash
pnpm dev
```

Web runs on `http://localhost:3000` and API on `http://localhost:4000`.

If you deploy LedgerLink on a public domain, change `WEB_APP_URL`, `NEXT_PUBLIC_API_URL`, and `GOOGLE_REDIRECT_URI` away from `localhost` before building or restarting the services. Gmail OAuth can succeed and still bounce the browser back to `localhost` if `WEB_APP_URL` stays misconfigured.

## Exact local commands

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Local flow

1. Open `http://localhost:3000/companies`
2. Create or edit a company profile, or keep using the migrated `default` workspace
3. Open that workspace and connect one or more Gmail inboxes from `/companies/<slug>/settings/gmail`
4. Use the Gmail settings screen to sync all inboxes together or operate on one inbox at a time
5. Register Gmail watch for all connected inboxes
6. In development, the API also starts a background Pub/Sub pull worker by default
7. Run manual Pub/Sub pull from Settings when you want to force an immediate refresh or:

```bash
curl -X POST http://localhost:4000/gmail/pubsub/pull
```

8. Review stored emails in `/companies/<slug>/emails`
9. Create expected transfers in `/companies/<slug>/transfers/new`
10. Use `/companies/<slug>/verifications` to query stored inbox evidence with `name + amount + date` after the email arrives; `reference` is optional support data
11. Create a company integration token before connecting WordPress/OpenPOS or another external bridge
12. Use `POST /companies/:companySlug/verifications/authorize` when an external system needs a binary close/no-close authorization with evidence
13. Create a tracked verification request from the same screen only when you need manual follow-up
14. Point your Twilio WhatsApp webhook to `POST /channels/whatsapp/twilio/webhook` when you want to pilot inbound payment verification over WhatsApp
15. Inspect generated matches in `/companies/<slug>/matches`
16. Resolve edge cases in `/companies/<slug>/reviews`

## REST endpoints

Auth and Gmail:

- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /companies`
- `POST /companies`
- `GET /companies/:companySlug`
- `PATCH /companies/:companySlug`
- `GET /companies/:companySlug/integration-tokens`
- `POST /companies/:companySlug/integration-tokens`
- `POST /companies/:companySlug/integration-tokens/:id/revoke`
- `GET /companies/:companySlug/auth/google/start`
- `GET /companies/:companySlug/gmail/accounts/:id/auth/google/start`
- `GET /companies/:companySlug/gmail/profile`
- `GET /companies/:companySlug/gmail/messages`
- `POST /companies/:companySlug/gmail/messages/sync`
- `POST /companies/:companySlug/gmail/accounts/:id/messages/sync`
- `GET /companies/:companySlug/gmail/messages/:id`
- `GET /companies/:companySlug/verifications`
- `POST /companies/:companySlug/verifications/operator-lookup`
- `POST /companies/:companySlug/verifications/lookup`
- `POST /companies/:companySlug/verifications/authorize`
- `POST /companies/:companySlug/verifications/manual`
- `GET /companies/:companySlug/verifications/:id`
- `POST /companies/:companySlug/verifications/:id/confirm`
- `POST /companies/:companySlug/verifications/:id/reject`
- `POST /companies/:companySlug/gmail/watch/register`
- `POST /companies/:companySlug/gmail/accounts/:id/watch/register`
- `POST /companies/:companySlug/gmail/watch/renew`
- `POST /companies/:companySlug/gmail/accounts/:id/watch/renew`
- `POST /companies/:companySlug/gmail/pubsub/pull`
- `POST /channels/whatsapp/twilio/webhook`
- `GET /companies/:companySlug/channels/whatsapp/attempts`

Transfers and matches:

- `GET /companies/:companySlug/transfers`
- `POST /companies/:companySlug/transfers`
- `GET /companies/:companySlug/transfers/:id`
- `PATCH /companies/:companySlug/transfers/:id`
- `POST /companies/:companySlug/transfers/:id/confirm`
- `POST /companies/:companySlug/transfers/:id/reject`
- `GET /companies/:companySlug/matches`
- `GET /companies/:companySlug/matches/:id`
- `POST /companies/:companySlug/matches/:id/preconfirm`
- `POST /companies/:companySlug/matches/:id/review`
- `POST /companies/:companySlug/matches/:id/reject`

Operations:

- `GET /companies/:companySlug/settings/bank-senders`
- `POST /companies/:companySlug/settings/bank-senders`
- `PATCH /companies/:companySlug/settings/bank-senders/:id`
- `GET /companies/:companySlug/dashboard/summary`
- `GET /companies/:companySlug/reviews`
- `GET /companies/:companySlug/audit`
- `GET /health`
- `GET /ready`

Legacy aliases for Gmail, verifications, transfers, matches, reviews, audit, and settings still map to the `default` company during the transition.

## Local automation behavior

- In development, the API starts a background Gmail Pub/Sub pull worker when `GMAIL_PUBSUB_WORKER_INTERVAL_MS` is greater than `0`.
- Company-level Gmail sync, watch register/renew, and manual Pub/Sub pull now operate across every connected inbox in that company and return per-inbox results.
- `POST /companies/:companySlug/verifications/lookup` and `POST /companies/:companySlug/verifications/authorize` are now bearer-protected integration endpoints for external systems such as the ASD PayVerify Bridge.
- `POST /companies/:companySlug/verifications/operator-lookup` keeps the internal operator UI flow working without a bearer token until operator auth exists.
- Protected integration calls still do one automatic Pub/Sub pull and recheck when the first pass still has no exact candidate.
- Exact verification windows use the email arrival time in the inbox (`internalDate`, with stored `receivedAt` as fallback), not the transfer date parsed from the email body.

## Integration API tokens

- Create one or more company-scoped integration tokens with `POST /companies/:companySlug/integration-tokens`.
- The secret token value is returned only once at creation time.
- LedgerLink stores only `tokenPrefix` plus a SHA-256 hash of the secret.
- `POST /companies/:companySlug/verifications/authorize` requires scope `verifications:authorize`.
- `POST /companies/:companySlug/verifications/lookup` requires scope `verifications:lookup`.
- Missing, malformed, invalid, expired, or revoked bearer tokens return `401`.
- Tokens that belong to another company or do not include the required scope return `403`.
- `lastUsedAt` is updated only when the token passes company and scope validation.
- Current limitation: token management endpoints are not yet protected by operator login/RBAC. Do not expose the admin surface publicly until operator auth exists.

## WhatsApp pilot behavior

- The Twilio line can point to only one webhook at a time. If it points to LedgerLink, `cerebro` stops receiving that WhatsApp line during the pilot.
- The pilot accepts either free text, an image comprobante, or both in the same message.
- WhatsApp verification tries the verification moment first, then any extracted datetime, and finally a whole-day strategy when only the date is available.
- Text fields override image extraction when both are present.
- Allowed pilot phone numbers now live on each company's `WhatsAppChannel`; `WHATSAPP_ALLOWED_TEST_NUMBERS` is only used to seed or backfill the initial `default` channel.

## Sender allowlist behavior

- Every inbox email is still stored for audit/debugging.
- Only emails whose sender matches an exact `senderEmail` rule or an explicit `senderDomain` rule enter the payment-evidence path.
- Non-allowlisted emails are marked as `ignored`, kept visible in `/companies/<slug>/emails`, and excluded from parsing/matching/authorization.
- When an active sender rule is created or re-enabled, LedgerLink reprocesses a bounded batch of matching previously ignored emails so recent tests do not require resending the message.

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `pnpm db:migrate`
- `pnpm db:seed`

`pnpm db:seed` resets local operational data, including Gmail tokens, sender rules, and ingested emails.

## Documentation

- [docs/implementation-plan.md](docs/implementation-plan.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/google-setup.md](docs/google-setup.md)
- [docs/domain-model.md](docs/domain-model.md)
- [docs/parsers.md](docs/parsers.md)
- [docs/local-development.md](docs/local-development.md)
- [docs/final-summary.md](docs/final-summary.md)
