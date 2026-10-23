# Delivery status — 12 PRD modules

Last updated: 2026-10-23 (Sprint 01–06 foundation slice). Labels: **Implemented & tested**, **Partial**, **Planned** (no code, shown in the UI as "Segera hadir").

| # | Module | Status | What exists | Gaps |
|---|---|---|---|---|
| 1 | Multi-client access & roles | **Implemented & tested** | Firm workspace, registration, login, 4 roles, client assignment, firm-level RLS, cross-tenant 404 | OIDC + MFA, per-entity RLS (enforced in API today), password reset, invitation emails, session revocation |
| 2 | Entities / branches / COA / dimensions | **Partial** | Clients → legal entities → branches; standard Indonesian COA (113 accounts, 16 categories) on company creation; fiscal periods | Dimensions (project, department, cost center, tags), account hierarchy UI, account mappings, multi-currency |
| 3 | Double-entry GL, immutable journals | **Implemented & tested** | Draft/submitted/approved/posted/reversed, preview, DB-enforced balance & immutability, reversal, idempotency, optimistic locking, period lock | Recurring journals, attachments, FX lines |
| 4 | Sales, purchasing, AR/AP | Planned (S09–12) | — | Entire module |
| 5 | Cash, bank import & reconciliation | Planned (S12) | — | Entire module |
| 6 | TB, GL, P&L, Balance Sheet | **Implemented & tested** | As-of / period reports from posted ledger, drill-down to journals, prior-year earnings roll-forward | Cash flow, equity statement, comparatives, dimension filters, snapshots |
| 7 | PDF / XLSX export | Planned (S24) | Browser print only | Export jobs, branded PDF, typed XLSX, formula-injection guard |
| 8 | Audit, approvals, locking | **Partial** | Append-only audit log, maker-checker journal approval, approval inbox, period lock/reopen with reason | Configurable approval policies, close checklist, approval for other documents |
| 9 | FIFO inventory | Planned (S13–17) | — | Entire module |
| 10 | Payroll & Indonesian tax | Planned (S19–23) | — | Entire module; rules must be verified against current official sources before release |
| 11 | Custom report builder | Planned (S24–25) | — | Entire module |
| 12 | Google Sheets two-way sync | Planned (S26–27) | — | Entire module |

## Tests actually run

| Suite | Command | Result |
|---|---|---|
| API integration (real PostgreSQL 16, app role under RLS) | `npm test -w @aos/api` | 19 / 19 passed |
| Lite app accounting engine | `npm test -w @aos/lite` | 12 / 12 passed |
| Web production build + type check | `npm run build -w @aos/web` | passed |
| Browser E2E (Chromium): accountant creates & submits → manager approves → accountant posts → manager reverses; all report & menu pages; mobile 390px | `node e2e/journal-flow.mjs` | passed, 0 console errors, no horizontal overflow |

Covered quality gates (`quality-gates.md`): #1 debit/credit edge cases incl. precision, #2 idempotent duplicate & concurrent posting, #3 cross-tenant & cross-client denial, #4 approved ≠ posted, #5 correction only by reversal, #12 TB/P&L/BS cross-check, #15 locked period blocks posting & audited reopen. Not yet applicable: #6–#11, #13, #14.

## Deployment
- Single Vercel project (root `apps/web`) hosts web + API (`apps/api/src/serverless.ts`); first request migrates (advisory-locked) and seeds the [DEMO] firm. Verified locally against an empty database with only `DATABASE_URL` set: migration + seed + boot ≈ 4.7 s, full browser E2E passed. Not yet verified on Vercel/Neon itself (the build sandbox cannot reach Vercel).

## Known issues / decisions
- Login uses email + password with JWT cookies; OIDC/MFA is required by the spec and not done yet.
- Entity-level isolation inside a firm is enforced by the API (`assertEntity`) and covered by tests, not by RLS.
- Offset pagination on journal list (cursor pagination planned).
- `fonts.googleapis.com` is loaded at runtime for Fira Sans/Code; falls back to system fonts if blocked.

## Next high-value slice
**Sprint 05–08**: dimensions (project/department/cost center/tag on journal lines) + report filters, cash-flow & equity statements, XLSX/PDF export of the four reports, then Sales & AR (invoice → receipt with partial allocation → AR aging as-of) posting through the existing engine.
