# Recon: Mekari ecosystem vs My Account (clean-room, public pages only)

Sources: public product page https://mekari.com/produk/ (fetched 2026-11-07). The Jurnal app screen `my.jurnal.id/v3/home` is behind login and was **not** accessed; the menu structure used for My Account comes from `docs/RESEARCH-modules.md` (public material) and the owner's own requirements. No code, assets, copy or logos from Mekari are reused; My Account has its own brand (Sand Elegance).

## Mekari products (public) → My Account mapping

| Mekari product | What it does | My Account equivalent | Status |
|---|---|---|---|
| Jurnal | Accounting, finance, supply chain | Buku Besar, Penjualan, Pembelian, Kas & Bank, Persediaan, Laporan | GL + reports live; rest planned |
| Talenta | HR & payroll | Penggajian | planned (S19–21) |
| Klikpajak | PPN/PPh, e-Faktur | Perpajakan | planned (S21–23) |
| Expense | Budgets, approvals, reimbursements | approval engine reuse | roadmap |
| Sign | Digital signatures, audit trail | attachments + maker-checker evidence | roadmap |
| POS / Desty | Cashier, omnichannel sales | sales import | roadmap |
| Pay | Payments (VA, QRIS) | bank reconciliation | roadmap |
| Qontak | CRM | customer data on invoices | roadmap |
| Capital, Flex, Officeless, Access, Airene | financing, benefits, low-code, IAM, AI support | out of scope for now | — |

Shown in the app as **Integrasi → Ekosistem** (a "Segera" roadmap page, no fake data).

## UX gaps found in the previous My Account UI and fixed in this slice
1. Brand: navy/gold "Accounting OS" → Sand Elegance 60/30/10, Plus Jakarta Sans, My Account logo.
2. No fast way to reach deep menus → Ctrl/⌘+K menu search.
3. Dashboard had no shortcuts → four quick actions to the live pages.
4. Status colours (amber/sky/emerald/rose) were off-brand and mixed → tokenised success/warning/info/danger with text labels.
5. Small terracotta text would fail contrast → links use deepened terracotta; contrast table in MASTER.md.
