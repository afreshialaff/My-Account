# Module research: Mekari Jurnal & Accurate Online → Accounting OS

The vendor sites (jurnal.id, accurate.id) could not be opened from the build environment (DNS blocked), so this mapping is based on web search results plus general product knowledge. Verify details against the live products before using them as acceptance criteria.

Sources consulted: jurnal.id feature/blog pages on sales-purchase, inventory and fixed assets; accurate.id "Semua Fitur" page; university training modules on Accurate Online (UAD, UNIKOM) via search snippets.

| Area | Mekari Jurnal | Accurate Online | Accounting OS module / menu |
|---|---|---|---|
| General ledger | Daftar Akun, Jurnal Umum, Tutup Buku | Buku Besar: Akun Perkiraan, Jurnal Umum, Anggaran, Tutup Buku | **Buku Besar** (live): Daftar Akun, Jurnal Umum, Periode & Tutup Buku |
| Sales | Penawaran, Pemesanan, Pengiriman, Faktur, Pembayaran, Retur, Uang Muka, transaksi berulang | Penawaran, Pesanan, Pengiriman, Faktur, Penerimaan, Retur, Uang Muka | **Penjualan** (planned S09–10) |
| Purchases | Penawaran, Pemesanan, Pengiriman, Faktur, Pembayaran, Retur | Permintaan Barang, Pesanan, Penerimaan Barang, Faktur, Pembayaran, Retur | **Pembelian** (planned S11–12) incl. GRNI & installments |
| Cash & bank | Kas & Bank: terima/kirim/transfer, rekonsiliasi | Kas & Bank: penerimaan, pembayaran, transfer, rekonsiliasi | **Kas & Bank** (planned S12) with statement import & matching |
| Inventory | Produk, multi gudang, transfer, penyesuaian stok, kartu persediaan, stok minimum | Barang & Jasa, Gudang, Penyesuaian, Pemindahan, Stok Opname | **Persediaan** (planned S13–17) — FIFO layers (Jurnal/Accurate default to average) |
| Fixed assets | Aset Tetap: umur ekonomis, nilai buku, penyusutan | Aset Tetap: penyusutan otomatis bulanan, disposisi | **Aset Tetap** (planned S17) |
| Production | Produksi: perintah kerja, biaya produksi | Manufaktur | Out of v1.0 scope (spec excludes MRP) |
| Tags / dimensions | Tag (proyek, biaya) | Departemen, Proyek | **Dimensi & Tag** (planned S05–06) |
| Tax | PPN, PPh pada transaksi | e-Faktur, PPh | **Perpajakan** (planned S21–23), Coretax formats to be verified |
| Payroll | via Mekari Talenta | Accurate Payroll | **Penggajian** (planned S19–21) |
| Reports | 40+ reports: Neraca, Laba Rugi, Arus Kas, Buku Besar, Neraca Saldo, umur piutang/hutang… | Laporan keuangan, penjualan, pembelian, persediaan | **Laporan** (4 live, rest planned) |
| Multi-company | Separate company subscriptions | Multi-database | **Firm → Client → Company → Branch** (live) — the key difference: one workspace for an accounting firm |
