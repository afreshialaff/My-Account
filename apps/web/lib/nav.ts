/**
 * Navigation for the firm and company workspaces. The menu mirrors the module structure of
 * Mekari Jurnal and Accurate Online (Buku Besar, Penjualan, Pembelian, Kas & Bank, Persediaan,
 * Aset Tetap, Penggajian, Perpajakan, Laporan) mapped onto the 12 Accounting OS modules.
 * Items not built yet are marked `planned` with their sprint and render an honest roadmap page.
 */

export type NavStatus = 'live' | 'planned'

export interface NavItem {
  label: string
  href: string // relative to the workspace root
  status: NavStatus
}

export interface NavGroup {
  key: string
  label: string
  icon: string
  items: NavItem[]
}

export interface PlannedModule {
  title: string
  sprint: string
  module: string // PRD module number(s)
  reference: string
  features: string[]
}

export const PLANNED: Record<string, PlannedModule> = {
  sales: {
    title: 'Penjualan & Piutang',
    sprint: 'Sprint 09–10',
    module: 'Modul 4',
    reference: 'Jurnal: Penjualan · Accurate: Penjualan',
    features: [
      'Penawaran → Pesanan → Pengiriman → Faktur Penjualan',
      'Penerimaan pembayaran parsial/penuh dan alokasi multi-faktur',
      'Retur & nota kredit, diskon, uang muka penjualan',
      'Umur piutang per tanggal (as-of) dari riwayat alokasi',
      'Jurnal otomatis ke Piutang/Pendapatan/PPN Keluaran lewat mesin posting yang sama',
    ],
  },
  purchases: {
    title: 'Pembelian & Hutang',
    sprint: 'Sprint 11–12',
    module: 'Modul 4',
    reference: 'Jurnal: Pembelian · Accurate: Pembelian',
    features: [
      'Permintaan pembelian → persetujuan → Pesanan Pembelian',
      'Penerimaan barang dengan akrual GRNI (opsional)',
      'Faktur pembelian, bayar nanti, cicilan (installments)',
      'Retur pembelian, uang muka pemasok',
      'Umur hutang per tanggal',
    ],
  },
  cash: {
    title: 'Kas & Bank',
    sprint: 'Sprint 12',
    module: 'Modul 5',
    reference: 'Jurnal: Kas & Bank · Accurate: Kas & Bank',
    features: [
      'Penerimaan, pengeluaran dan transfer antar rekening',
      'Impor rekening koran CSV/XLSX ke staging, normalisasi & deduplikasi',
      'Saran pencocokan (nominal, arah, tanggal, referensi), 1:n dan n:1',
      'Rekonsiliasi bank & laporan transaksi belum cocok — tanpa membuat jurnal otomatis',
    ],
  },
  inventory: {
    title: 'Persediaan (FIFO)',
    sprint: 'Sprint 13–17',
    module: 'Modul 9',
    reference: 'Jurnal: Produk & Gudang · Accurate: Persediaan',
    features: [
      'Barang & jasa, satuan (UOM), batch/serial opsional, multi gudang',
      'Lapisan biaya FIFO, konsumsi parsial, urutan deterministik',
      'Penyesuaian, pemindahan gudang, stok opname, retur',
      'Rekalkulasi backdate terkontrol, kartu stok, valuasi as-of, rekonsiliasi persediaan-GL',
    ],
  },
  'fixed-assets': {
    title: 'Aset Tetap',
    sprint: 'Sprint 17',
    module: 'Modul 3 & 6',
    reference: 'Jurnal: Aset Tetap · Accurate: Aset Tetap',
    features: ['Daftar & kategori aset', 'Penyusutan garis lurus / saldo menurun otomatis per periode', 'Pelepasan & penjualan aset dengan laba/rugi', 'Saat ini penyusutan dapat dicatat lewat Jurnal Umum'],
  },
  payroll: {
    title: 'Penggajian',
    sprint: 'Sprint 19–21',
    module: 'Modul 10',
    reference: 'Mekari Talenta · Accurate Payroll',
    features: [
      'Karyawan tetap & tidak tetap, komponen gaji berlaku per tanggal',
      'Lembur, tunjangan, potongan, BPJS dengan versi aturan',
      'Pratinjau → persetujuan → posting → pembayaran',
      'Akses gaji dibatasi per peran',
    ],
  },
  tax: {
    title: 'Perpajakan',
    sprint: 'Sprint 21–23',
    module: 'Modul 10',
    reference: 'Jurnal: Pajak · Accurate: e-Faktur / PPh',
    features: [
      'Register PPN, PPh 21/26, PPh 23, PPh 4(2), PPh 25 dengan aturan berversi',
      'Rekonsiliasi pajak vs GL dan antrian pengecualian',
      'Rekonsiliasi fiskal komersial-ke-fiskal',
      'Format Coretax divalidasi terhadap spesifikasi resmi sebelum dirilis — tidak ada klaim integrasi langsung ke DJP',
    ],
  },
  'reports-more': {
    title: 'Laporan Lanjutan & Custom Report Builder',
    sprint: 'Sprint 07–08 & 24–25',
    module: 'Modul 6, 7 & 11',
    reference: 'Jurnal: 40+ laporan · Accurate: Laporan',
    features: [
      'Arus kas langsung/tidak langsung, perubahan ekuitas, laporan komparatif',
      'Ekspor PDF/XLSX bermerek dengan tipe angka & tanggal yang benar',
      'Custom Report Builder berbasis semantic layer: kolom, filter, grouping, formula, snapshot',
      'Filter cabang/proyek/departemen/tag',
    ],
  },
  integrations: {
    title: 'Integrasi Google Sheets',
    sprint: 'Sprint 26–27',
    module: 'Modul 12',
    reference: '—',
    features: [
      'OAuth dengan scope minimum, token terenkripsi',
      'Sinkronisasi keluar terjadwal dengan ID stabil dan checksum',
      'Data masuk lewat staging, validasi, pratinjau konflik dan persetujuan maker-checker',
      'Tidak pernah mengubah dokumen yang sudah diposting',
    ],
  },
  dimensions: {
    title: 'Dimensi: Proyek, Departemen, Cost Center, Tag',
    sprint: 'Sprint 05–06',
    module: 'Modul 2',
    reference: 'Jurnal: Tag · Accurate: Departemen & Proyek',
    features: ['Nilai dimensi per perusahaan', 'Aturan dimensi wajib per akun', 'Filter dimensi di semua laporan'],
  },
  close: {
    title: 'Status Tutup Buku & Checklist',
    sprint: 'Sprint 18',
    module: 'Modul 8',
    reference: 'Accurate: Tutup Buku',
    features: ['Checklist tutup buku per perusahaan (bank, AR, AP, persediaan, pajak, akrual)', 'Tanda tangan review & kunci periode', 'Ringkasan status seluruh klien'],
  },
  'tax-exceptions': {
    title: 'Pengecualian Pajak (seluruh klien)',
    sprint: 'Sprint 22–23',
    module: 'Modul 10',
    reference: '—',
    features: ['Antrian pengecualian pajak lintas klien', 'Tindak lanjut & kertas kerja'],
  },
}

export const ENTITY_NAV: NavGroup[] = [
  { key: 'dashboard', label: 'Dasbor', icon: 'LayoutDashboard', items: [{ label: 'Dasbor', href: '', status: 'live' }] },
  {
    key: 'ledger',
    label: 'Buku Besar',
    icon: 'BookOpen',
    items: [
      { label: 'Daftar Akun', href: '/accounts', status: 'live' },
      { label: 'Jurnal Umum', href: '/journals', status: 'live' },
      { label: 'Periode & Tutup Buku', href: '/periods', status: 'live' },
      { label: 'Dimensi & Tag', href: '/m/dimensions', status: 'planned' },
    ],
  },
  {
    key: 'sales',
    label: 'Penjualan',
    icon: 'Receipt',
    items: ['Penawaran', 'Pesanan Penjualan', 'Pengiriman', 'Faktur Penjualan', 'Penerimaan Pembayaran', 'Retur Penjualan', 'Uang Muka'].map((label) => ({ label, href: '/m/sales', status: 'planned' as const })),
  },
  {
    key: 'purchases',
    label: 'Pembelian',
    icon: 'ShoppingCart',
    items: ['Permintaan Pembelian', 'Pesanan Pembelian', 'Penerimaan Barang', 'Faktur Pembelian', 'Pembayaran Pembelian', 'Retur Pembelian'].map((label) => ({ label, href: '/m/purchases', status: 'planned' as const })),
  },
  {
    key: 'cash',
    label: 'Kas & Bank',
    icon: 'Landmark',
    items: ['Penerimaan & Pengeluaran', 'Transfer Bank', 'Impor Rekening Koran', 'Rekonsiliasi Bank'].map((label) => ({ label, href: '/m/cash', status: 'planned' as const })),
  },
  {
    key: 'inventory',
    label: 'Persediaan',
    icon: 'Boxes',
    items: ['Barang & Jasa', 'Gudang', 'Penyesuaian & Pemindahan', 'Stok Opname', 'Kartu Stok FIFO'].map((label) => ({ label, href: '/m/inventory', status: 'planned' as const })),
  },
  { key: 'assets', label: 'Aset Tetap', icon: 'Building2', items: [{ label: 'Aset Tetap', href: '/m/fixed-assets', status: 'planned' }] },
  { key: 'payroll', label: 'Penggajian', icon: 'Users', items: [{ label: 'Penggajian', href: '/m/payroll', status: 'planned' }] },
  { key: 'tax', label: 'Perpajakan', icon: 'Percent', items: [{ label: 'PPN & PPh', href: '/m/tax', status: 'planned' }] },
  {
    key: 'reports',
    label: 'Laporan',
    icon: 'BarChart3',
    items: [
      { label: 'Semua Laporan', href: '/reports', status: 'live' },
      { label: 'Neraca', href: '/reports/balance-sheet', status: 'live' },
      { label: 'Laba Rugi', href: '/reports/profit-loss', status: 'live' },
      { label: 'Neraca Saldo', href: '/reports/trial-balance', status: 'live' },
      { label: 'Buku Besar', href: '/reports/general-ledger', status: 'live' },
      { label: 'Laporan Lanjutan & Ekspor', href: '/m/reports-more', status: 'planned' },
    ],
  },
  { key: 'integrations', label: 'Integrasi', icon: 'Sheet', items: [{ label: 'Google Sheets', href: '/m/integrations', status: 'planned' }] },
  {
    key: 'settings',
    label: 'Pengaturan',
    icon: 'Settings',
    items: [
      { label: 'Perusahaan & Cabang', href: '/settings', status: 'live' },
      { label: 'Log Audit', href: '/audit', status: 'live' },
    ],
  },
]

export const FIRM_NAV: NavGroup[] = [
  {
    key: 'firm',
    label: 'Firma',
    icon: 'Briefcase',
    items: [
      { label: 'Beranda Firma', href: '', status: 'live' },
      { label: 'Klien', href: '/clients', status: 'live' },
      { label: 'Kotak Persetujuan', href: '/approvals', status: 'live' },
      { label: 'Status Tutup Buku', href: '/m/close', status: 'planned' },
      { label: 'Pengecualian Pajak', href: '/m/tax-exceptions', status: 'planned' },
      { label: 'Staf & Hak Akses', href: '/staff', status: 'live' },
      { label: 'Log Audit', href: '/audit', status: 'live' },
    ],
  },
]
