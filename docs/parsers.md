# Parsers

LedgerLink uses a parser registry so bank-specific logic can be added without changing the ingestion pipeline.

## Current parser set

- `generic-bank-parser`: fallback parser using common banking notification patterns
- `banesco-parser`: example bank-specific parser tuned for common Banesco email phrasing
- `mercantil-parser`: example bank-specific parser tuned for Mercantil-style references and amounts

## Contract

Each parser:

- declares when it supports an email
- extracts structured fields when possible
- returns confidence signals and parser metadata
- does not fabricate missing values

## Output fields

- reference
- amount
- currency
- transfer date and time
- bank
- sender
- subject
- destination account last four digits
- originator name

## Current implementation notes

- The generic parser uses regex extraction over merged `text/plain` and `text/html` content.
- Bank-specific parsers extend the generic baseline and override confidence or reference heuristics when they detect a known institution.
- The parser layer is prepared for future PDF or OCR adapters by keeping the output contract separate from the source medium.
