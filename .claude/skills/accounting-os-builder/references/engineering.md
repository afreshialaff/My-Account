# Engineering Contracts — Accounting OS

## Core architecture
TypeScript Next.js web; NestJS API with clean domain modules, PostgreSQL with tenant/entity-aware policies and composite constraints; Redis/BullMQ workers; S3 object attachments; transactional outbox; OIDC with MFA; OpenAPI 3.1 contracts; migration+seed+test scripts. Preserve existing repo conventions when editing.

## Essential relational domains
Tenancy: firms, clients, legal_entities, branches, users, roles, memberships, grants, approval_policies.
Dimensions: accounts, fiscal_periods, dimensions, dimension_values, journal_line_dimensions.
GL: journal_entries, journal_lines, exchange_rates, posting_batches, reversal_links.
Contacts/AR/AP: contacts, sales_orders, sales_invoices, sales_invoice_lines, vendor_bills, vendor_bill_lines, receipts, payments, allocations, purchase_orders, goods_receipts, returns, GRNI.
Bank: bank_accounts, bank_statement_imports, bank_statement_lines, match_allocations, reconciliation_snapshots.
Inventory: products, units, warehouses, stock_movements, fifo_cost_layers, fifo_consumptions, cost_recalculations, stock_counts.
Payroll: employees, employment_compensation_history, payroll_periods, payroll_runs, payroll_lines, payroll_allocations, payroll_payments, statutory_parameters.
Tax: tax_codes, tax_rule_versions, tax_transactions, tax_documents, tax_matches, tax_exceptions, fiscal_adjustments.
Reports: report_datasets, report_definitions, report_runs, report_snapshots, export_jobs.
Governance: audit_events, attachments, document_sequences, close_tasks, approval_requests, outbox_events.
Sheets: google_connections, sheet_mappings, sync_jobs, sync_staging_rows, sync_conflicts, sync_versions.

Use immutable posted journal and source references. Financial lines carry entity_id, posting date, currency, exact decimal amounts, branch/project/dept/cost center as validated dimensions; business docs carry document date and state. Enforce duplicate-safe numbering and idempotency keys.

## Accounting correctness rules
- Posting lines: at least 2, neither double-sided per nonzero line nor negative, sum functional debits == functional credits; reject zero-only journals.
- Posting execution must be transactional with line-level tenant and account validation. No post in locked periods. Store actor and source reference.
- Posted record cannot be edited; reversal must link to original, book into valid open period, and retain provenance.
- Revenue recognition, delivery/COGS, purchase receipts/GRNI and VAT/PPh dates require configurable policies, not arbitrary invoice-date assumptions.
- AR/AP outstanding from allocations as-of selected cut-off; no over-allocation. Bank match direction and amount, no accidental adjustment journal.
- FIFO valuation scope explicitly configured (entity/warehouse); deterministic sequence for same-day movements; partial layer depletion; transfers maintain cost; backdates recalc affected layers with audited cost adjustments in open periods.
- Multi-currency: store document currency, FX source/date, functional amounts; ensure balanced functional journal by explicit FX lines where needed.
- Tax and payroll: effective dates, rule versions, nonpermanent worker classification and statutory exceptions. Validate current Indonesia regulations using authoritative sources before production release.

## Illustrative API surface (version all paths /api/v1)
Identity: GET /me; GET/POST /clients; GET/POST /entities/{id}/branches; POST /entities/{id}/memberships.
COA/GL: GET/POST /entities/{id}/accounts; GET/POST /entities/{id}/journals; POST /journals/{id}/submit|approve|post|reverse; POST /periods/{id}/lock|reopen.
Sales: GET/POST /entities/{id}/sales-invoices; POST /sales-invoices/{id}/post|receipts; GET /entities/{id}/ar-aging.
Purchases: GET/POST /entities/{id}/vendor-bills; POST /vendor-bills/{id}/post|payments; GET /entities/{id}/ap-aging.
Bank: POST /bank-accounts/{id}/statement-imports; POST /bank-accounts/{id}/match-suggestions; POST /bank-transactions/{id}/matches; GET /bank-accounts/{id}/reconciliation.
Inventory: POST /entities/{id}/stock-receipts|stock-issues|stock-transfers|stock-adjustments; GET /products/{id}/fifo-layers|stock-card; GET /entities/{id}/inventory-valuation.
Payroll/tax: POST /payroll-periods/{id}/calculate; POST /payroll-runs/{id}/approve|post; GET /entities/{id}/tax-reconciliation; POST /entities/{id}/tax-documents/imports|exports.
Reports: GET /entities/{id}/reports/catalog; POST /entities/{id}/reports/custom; POST /reports/{id}/runs; POST /report-runs/{id}/exports.
Sheets: POST /integrations/google/connect; GET/POST /entities/{id}/sheet-mappings; POST /sheet-mappings/{id}/sync; GET /sync-jobs/{id}/staging; POST /sync-jobs/{id}/validate|apply.

API security: bearer auth, idempotency key for financial writes, If-Match/version optimistic lock, sanitized inputs, cursor pagination, stable error codes, 403/404 on unauthorized resources, 409 on version/period conflicts, 422 on business invariant failure. Decimal amounts serialized as strings.

## Data migrations
Design schema incrementally with reversible developer migrations, use forward-only production migration discipline, indices by entity_id+date/reference/status, uniqueness scoped to tenant/legal entity, retain import source key and checksums. Do not put raw employee salary or tokens in logs.

## Reporting engine
Build read-only semantic datasets with entity/RLS security and controlled expressions, as-of-date calculations from ledger/allocation history, parameterized queries, source versions, snapshots, background PDF/XLSX generation, drill-down to source. Guard against formula injection in spreadsheets and unauthorized report columns.

## Sheets integration
Least-privilege OAuth; encrypt tokens; publish incrementally by stable external_id, version/checksum, upsert and retry queue. Inbound changes: staged preview, validate against scope/COA/period, detect conflicts, approve before applying to *draft* records. Never overwrite posted or approved journals/payroll. Deleting a row in Sheets does not authorize data deletion.

## Sprint map (2-week planning assumption, adjustable)
S01-06: product architecture, design system, tenancy/RLS/RBAC, COA, posting.
S07-12: GL reports, P&L/BS, AR/AP, bank and reconciliation.
S13-17: inventory/fifo/backdating/reconciliation.
S18-23: approvals/locks, payroll, tax, reconciliation.
S24-27: reporting semantic layer, custom reports, Sheets both directions.
S28-30: integration, security/performance, parallel pilot and go-live readiness.
All twelve modules required for v1.0; do not imply all production ready after first sprint.
