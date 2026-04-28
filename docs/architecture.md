# Architecture

LedgerLink is split into a web client, an API service, and a shared package for domain contracts.

## Monorepo layout

- `apps/web`: operator-facing UI
- `apps/api`: Gmail integration, parsing, matching, persistence, and REST API
- `packages/shared`: shared enums, DTOs, and formatting helpers
- `prisma`: schema and migrations

## Core flows

1. Gmail OAuth starts in the backend and stores one or more inbox tokens per company in PostgreSQL.
2. Each connected inbox maintains its own Gmail watch, `historyId`, expiration, and sync state.
3. A manual or scheduled Pub/Sub pull retrieves Gmail history updates from the configured subscription and routes them by `emailAddress` to the correct inbox context.
4. New Gmail messages are fetched, normalized, persisted with both `companyId` and `gmailAccountId`, sender-classified, and only then allowed into parsing/matching when they come from an exact allowlisted sender or an explicit allowlisted company domain.
5. Operators review the consolidated evidence trail in the UI and move transfers through explicit evidence states.

## Evidence model

Expected transfers move through explicit evidence-oriented statuses:

- `pending`
- `email_received`
- `authenticity_high`
- `match_found`
- `preconfirmed`
- `requires_review`
- `rejected`
- `confirmed_manual`

This model is intentionally conservative: the product helps operators reason about incoming transfer evidence, but it does not claim objective bank settlement truth from email alone.

## Authenticity scoring

The MVP authenticity evaluator uses configurable weights in code:

- sender allowlist match: `+40`
- DKIM pass detected: `+15`
- SPF pass detected: `+15`
- DMARC pass detected: `+15`
- reply-to mismatch: `-20`
- suspicious free-mail domain: `-30`
- forwarded or resent signal: `-15`

If a header is missing, the evaluator records `unknown` instead of inventing certainty.

Policy nuance:

- an exact `senderEmail` allowlist entry is treated as a trusted sender override, even if the mailbox domain is public
- a broad `senderDomain` rule on a public mailbox provider does not get that override by itself

## Sender gate

- Inbox storage is broader than payment evidence: all emails are stored, but non-allowlisted emails are marked `ignored`.
- `senderMatchType` is explicit on stored emails: `none`, `email`, or `domain`.
- Exact payment authorization only considers emails with `senderMatchType` equal to `email` or `domain`.
- Activating a sender rule triggers a bounded reprocesing pass over recent matching `ignored` emails so newly allowlisted senders can be tested without resending every message.

## Matching rules

The matching engine scores these signals:

- exact reference
- exact amount
- bank consistency
- currency consistency
- expected time window
- destination account last four digits
- customer or originator name overlap

`preconfirmed` is only assigned when the top candidate is unique, the amount is exact, the authenticity status is high, the match signal is strong, and no critical authenticity flags exist.

## Exact authorization flow

- `/verifications/lookup` remains the rich operator summary.
- `/verifications/authorize` is the binary API used by external systems to decide whether a transaction may be closed.
- Authorization is stricter than general matching: it requires sender allowlist pass, exact reference, exact amount, and the inbox arrival timestamp (`internalDate`, with stored `receivedAt` as fallback) within the expected window.
- Binance V1 runs as a parallel authorization flow with its own endpoints (`/verifications/binance/*`) and uses the official Binance Pay history API as the authority. The Gmail/parser evidence (`bankName/parserName = Binance`) remains useful for ingestion and operator traceability, but the close/no-close decision checks Binance Pay transaction history by order id/name, amount, receiver and date.
- The shared WhatsApp ingress classifies each inbound message or capture as `zelle`, `binance`, or `unknown` before calling the corresponding verification flow.

## Architectural decisions

- Company-scoped workspaces: each `CompanyProfile` can own multiple operational Gmail accounts and one active WhatsApp channel in this phase, and all evidence, sender rules, transfers, reviews, and audit trails stay isolated by `companyId`.
- Evidence-first status model: the system never treats email presence as definitive settlement proof.
- Parser registry: bank-specific parsers can be added without touching the ingestion pipeline.
- Matching is deterministic and explainable: every score includes reasons and critical flags.
- Auditability is first-class: status changes, watch registration, Gmail connection, and manual actions produce audit records.

## Deployment notes

- Secrets remain server-side in `.env` and database token storage.
- The frontend only receives normalized operational data.
- Pub/Sub pull is implemented as an API-triggerable worker so local development does not require a background scheduler.
