# Acceptance & Quality Gates

## Mandatory scenario coverage
1. Correct debit/credit including zero, negative, precision and multi-currency edge cases.
2. Idempotent duplicate posting and locking on concurrent posts.
3. Unauthorized user crossing firm/client/entity/branch boundary denied for reads, writes and exports.
4. Approved vs posted workflow state distinctions.
5. Journal correction only through authorized reverse+replacement.
6. Partial invoice receipt and AP installment, outstanding as-of prior date.
7. Bank import dedupe, debit/credit verification, partial/multi allocations and no auto journal.
8. FIFO two cost layers: receive 10 @100, receive 10 @120, issue 12 -> COGS 1,240, ending 8 @120 = 960 (excluding extra costs/taxes). Test same-day ordering, return, transfer, backdate and lock.
9. Stock on hand vs FIFO layer totals vs financial inventory account.
10. Payroll gross-to-net, allowances/deductions, overtime, statutory rule version, audit and privacy.
11. VAT/PPh document-to-register-to-GL exceptions, correct effective tax rule; do not hardcode rates as timeless facts.
12. TB, GL, P&L, BS cross-check and report as-of snapshots.
13. PDF/XLSX numeric totals, correct filters, no spreadsheet formula injection or PII leak.
14. Two-way Sheets staging, version conflicts, deleted-row behavior, retries, idempotency and unauthorized edits blocked.
15. Close period blocks posting; audited reopen with correct permissions.

## Completion criteria for every vertical slice
Real persistence and tenant authorization; consistent domain services and migrations; API validation; user-friendly working UI; deterministic fixtures; unit+integration tests; failure states; audit trail; source-linked reports; an honest completion summary. Mock/demo data allowed only in explicitly marked sandbox. No hardcoded fake real-world balances, approvals, or activity.

## Release standard
No open P0/P1 defects; zero unexplained trial balance, AR/AP-to-GL, inventory-to-GL and payroll liability differences on pilot data. Tax scenarios signed off by competent Indonesian tax reviewer and checked against current official guidance. Backup/restore, security, concurrency, permission, performance, export, and third-party failure tests must pass. Parallel-run with prior ledger and signed client acceptance before live cutover.

## Definition of Done template
Story ID; impacted modules; invariants; permissions; schema/migrations; API request/response; UI states; tested happy/error paths; report impact; sync impact; tests and commands actually run; accounting reconciliation result; unresolved gaps; next dependency.
