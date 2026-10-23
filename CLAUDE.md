# Accounting OS — instructions for Claude sessions

Primary spec: `.claude/skills/accounting-os-builder` (load it for any accounting/backend work; its `references/master-prompt.md` is the main instruction).
UI work: use `.claude/skills/ui-ux-pro-max` and follow `design-system/accounting-os/MASTER.md` (read it before building a page; page overrides go in `design-system/accounting-os/pages/`).

## Layout
- `apps/api` NestJS 11 + PostgreSQL (raw SQL migrations in `apps/api/migrations`, never edit an applied migration — add a new file).
- `apps/web` Next.js 15 App Router; pages are thin server wrappers, interactive parts live in `components/` as client components.
- `apps/lite` the original single-user Vite app; keep it building (`vercel.json` at the root deploys it).

## Non-negotiables
- Every financial write goes through `JournalsService`; ledger invariants are enforced by DB triggers — do not bypass or weaken them.
- Amounts are decimal strings; never use JS floats for money (API: `decimal.js`, web: BigInt cents in `lib/format.ts`).
- Every tenant table needs `firm_id`, RLS policy, and composite FKs to its parent; return 404 for other tenants' ids.
- Unfinished modules stay listed as `planned` in `apps/web/lib/nav.ts`; never ship mock data as if it were real.
- Update `docs/STATUS.md` after each slice with what was implemented, the tests actually run, and gaps.

## Commands
```
npm install
npm run db:migrate -w @aos/api && npm run db:seed -w @aos/api   # needs apps/api/.env (see .env.example)
npm test -w @aos/api        # integration tests, creates/drops database accounting_os_test
npm run start:dev -w @aos/api ; npm run dev -w @aos/web
```
