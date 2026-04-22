# Implementation Plan

## Scope

Build a production-ready MVP monorepo for LedgerLink with Gmail OAuth, Gmail watch registration, Pub/Sub pull processing, bank email parsing, authenticity scoring, expected transfer matching, auditability, and a polished fintech web UI.

## Execution Order

1. Create monorepo foundations, shared config, environment contract, and root scripts.
2. Model the domain in Prisma, add Dockerized PostgreSQL, migrations, and a seed with demo records.
3. Implement the Express API modules for auth, Gmail, Pub/Sub, transfers, matches, reviews, settings, audit, dashboard, and health endpoints.
4. Implement email normalization, bank parser registry, authenticity scoring, and the matching engine.
5. Build the Next.js web application with dashboard, Gmail settings, email review, transfers, matches, manual reviews, and audit screens.
6. Add focused tests for DTOs, parsers, authenticity logic, matching logic, and core API routes.
7. Finish operational documentation and final implementation summary.

## Assumptions

- A single operational Gmail inbox is connected for the MVP.
- OAuth credentials and Google Cloud resources already exist and are supplied through `.env`.
- The frontend calls the backend directly in local development.
- The system produces evidence states and operator workflows, not irreversible payment truth claims.
