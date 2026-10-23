# Accounting OS — Product Scope and Workflow Reference

## Product intent
One accounting firm can manage many clients; each client can hold multiple separate legal entities, each with branches, warehouses, cost centers, departments, projects, and optional dynamic tags. Firm-wide command center presents approved summary only; entity workspace handles finance operations. Multi-entity consolidation is separately controlled.

## All 12 required v1.0 capabilities
1. Multi-client tenant isolation, user memberships, entity/branch scoped RBAC, maker-checker.
2. Client/company/branch setup, COA, fiscal periods, account mappings, dimension/tag rules per line.
3. Immutable balanced double-entry journals, reversals, close/reopen, journal preview, multi-currency readiness.
4. Sales (quotes, orders, invoice, credits, AR, receipts) and purchases (requests, PO, receipt, bills, vendor advances, AP, installments and pay-later) with partial allocations.
5. Bank statement import, normalization, duplicate detection, matching (1:1/1:many/many:1), unmatched queue, bank reconciliation and audit.
6. Trial Balance, GL, journal list, P&L, Balance Sheet; source traceability and dimension filters.
7. Consistent PDF/XLSX export, typed amounts/dates, branded layouts, export jobs and authorized download.
8. Audit trail, approvals, protected documents, locking, reopening authorization and close checklist.
9. Advanced perpetual FIFO inventory with multi-warehouse, batch/serial optional, UOM, goods movements, cost layers, backdating replay, valuation, stock-card, inventory/COGS/GL reconciliation.
10. Payroll for employee and nonpermanent worker types; earnings/deductions/overtime/allocations, payroll-to-GL, tax and statutory contributions; Indonesia tax center for VAT, PPh21/26, PPh23, PPh4(2), PPh25 and corporate fiscal reconciliation with statutory versioning.
11. Semantic-layer Custom Report Builder, restricted datasets, grouping, filters, formulas, drill-down, snapshots, historical as-of-date reports and scheduled exports.
12. Authorized two-way Google Sheets with staged inbound draft data, conflict review, revision markers, deterministic IDs, retries and sync logs.

## Required navigation
Firm: Home / Clients / Assigned Work / Approvals / Close Status / Tax Exceptions / Staff & Permissions.
Entity: Dashboard / Accounting / Sales & AR / Purchases & AP / Cash & Banking / Inventory / Payroll / Tax / Approval / Reports / Integrations / Settings / Audit.

## Mandatory operational flows
- Sales: sales order -> delivery/fulfillment -> invoice -> AR -> receipt -> bank match -> AR/GL reports; stock issue generates FIFO COGS under approved policy.
- Purchase: requisition -> approval -> purchase order -> goods receipt -> GRNI accrual where configured -> bill -> AP -> installment/full payment -> bank match.
- Bank: import staged statement -> normalize -> deduplicate -> propose candidates -> human review -> match (amount and direction) -> reconciliation snapshot. Do not auto-create adjustment journals.
- Stock: receipt -> FIFO cost layer -> stock issue/return/transfer/adjust -> valuation -> control reconciliation; permitted posting backdates trigger deterministic recalculation.
- Payroll: personnel/config effective dates -> attendance/input -> payroll calculate -> payroll review/approve -> accrue -> pay -> tax report/recon.
- Tax: source invoice/payroll + tax GL + external tax document -> compare -> exception queue -> follow-up -> verified WP; official XML/API only if current specifications/support verified.
- Period end: bank, AR, AP, inventory, payroll, tax, accruals -> closing review -> lock; reopen by authorized, logged approval.

## Report matrix (must exist in release coverage plan)
- Financial: TB, GL, journal listing, P&L, Balance Sheet, direct/indirect cash flow, changes in equity, comparative statements, budget-to-actual when budget module available.
- Sales: invoice register, customer balances/statements, AR aging as of date, revenue by item/branch/project, invoice-to-payment, sales-to-GL, returns and discounts.
- Purchases: bill register, PO/GRNI/receipt matching, supplier statement, AP aging as of date, vendor payment timeline, purchase-to-GL, tax register comparisons.
- Bank: register, deposits/withdrawals, match listing, unmatched, outstanding cheques/deposits, closing recon, bank-to-GL.
- Inventory: on hand/available/reserved, stock card, movement, FIFO layers, warehouse transfers, valuation as of date, aging, stock count, writeoff, inventory-to-GL, COGS breakdown.
- Payroll: register, gross-to-net, overtime, deductions, payment status, liability-to-GL, costs by project, PPh21/26.
- Tax: input/output VAT, VAT vs invoices vs GL, withholding documentation, GL reconciliation, fiscal commercial-to-tax bridge, exceptions, WP.
- Audits/WP: trial balance lead schedule, AR/AP/stock/bank/tax WPs, accruals, intercompany reconciliation, posting/change/approval logs, close signoff.

## User roles
Firm partner, firm manager, accountant, client finance admin, supervisor/approver, inventory controller, payroll specialist, tax specialist, auditor read-only, technical admin. Technical admin must not automatically view salary or confidential client data.

## UX fidelity
Friendly modern SaaS dashboard; ergonomic high density tables, freeze identifiers, filters, saved views, visible active company/branch, line-level tagging, keyboard workflows, validation summary, drill-through links, real transactions only in live view. Label all demo data distinctly.

## Excluded from 1.0 unless explicitly expanded
Advanced MRP/manufacturing planning, POS hardware, international tax countries, bank payment initiation, autonomous AI journal posting, native mobile apps, unsupported tax filing API, complex group FX consolidation.
