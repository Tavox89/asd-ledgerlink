# Domain Model

## Core entities

- `GmailAccount`: connected inbox metadata
- `GmailToken`: OAuth tokens for a Gmail account
- `GmailWatch`: watch lifecycle, latest `historyId`, expiration, and errors
- `InboundEmail`: normalized stored Gmail message
- `EmailHeader`: structured header records for authenticity analysis and debugging
- `ParsedBankNotification`: extracted banking signals from an inbound email
- `ExpectedTransfer`: operator-declared transfer expectation
- `TransferMatch`: explainable matching result between a parsed email and an expected transfer
- `ManualReview`: operator review workflow for ambiguous or risky cases
- `AllowedBankSender`: allowlist rules for sender/domain patterns used in authenticity scoring
- `AuditLog`: immutable record of important actions and status transitions

## Status principles

- Transfer lifecycle tracks evidence, not bank truth.
- Authenticity scoring can be `unknown` when headers do not contain enough information.
- Matching states separate weak hints from strong preconfirmation.
- Manual confirmation remains explicit and auditable.

## Relationship summary

- `GmailAccount` has one `GmailToken` and many `GmailWatch` records.
- `InboundEmail` belongs to one `GmailAccount` and stores many `EmailHeader` rows.
- `ParsedBankNotification` is a 1:1 structured projection of an `InboundEmail`.
- `ExpectedTransfer` can receive many `TransferMatch` records over time.
- `ManualReview` can point to an email, a transfer, a match, or all three when a human decision is required.
- `AuditLog` records the lifecycle around connection, ingestion, matching, and manual decisions.
