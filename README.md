# MyAccount — Software Akuntansi Online

Aplikasi akuntansi berbasis web (terinspirasi dari Jurnal.id) dengan mesin pembukuan **double-entry** lengkap. Dibangun dengan React + TypeScript + Vite + Tailwind CSS. Data disimpan di `localStorage` browser, jadi tidak perlu backend.

## Fitur

| Modul | Isi |
|---|---|
| **Beranda** | Saldo kas & bank, piutang, hutang, laba bulan ini, grafik laba rugi 6 bulan, arus kas, komposisi biaya, faktur belum lunas |
| **Penjualan** | Faktur penjualan (diskon, PPN 11%/12%, syarat pembayaran), status Lunas/Sebagian/Jatuh Tempo, terima pembayaran (parsial/multi-faktur) |
| **Pembelian** | Faktur pembelian, kirim pembayaran ke supplier |
| **Biaya** | Pencatatan biaya dibayar dari kas/bank, PPN Masukan |
| **Kas & Bank** | Saldo per rekening, mutasi rekening, Transfer Dana, Terima Uang, Kirim Uang |
| **Produk** | Persediaan perpetual, HPP **rata-rata bergerak** (moving average), saldo awal stok, produk jasa/non-stok |
| **Kontak** | Pelanggan, supplier, karyawan, saldo piutang/hutang per kontak |
| **Daftar Akun** | Bagan akun standar Indonesia (1-xxxxx s/d 9-xxxxx), 16 kategori akun seperti Jurnal |
| **Jurnal Umum** | Jurnal manual dengan validasi debit = kredit |
| **Laporan** | Neraca, Laba Rugi, Arus Kas (metode langsung), Perubahan Modal, Neraca Saldo, Buku Besar, Jurnal, Umur Piutang, Umur Hutang, Penjualan per Pelanggan, Pembelian per Supplier, Ringkasan Persediaan, Ringkasan PPN |
| **Pengaturan** | Profil perusahaan, backup/restore JSON, muat data demo, kosongkan data |

## Logika akuntansi

Setiap dokumen diterjemahkan otomatis menjadi jurnal yang seimbang (`src/lib/ledger.ts`), dan semua laporan dihitung dari jurnal tersebut:

| Transaksi | Debit | Kredit |
|---|---|---|
| Faktur penjualan | Piutang Usaha (total) | Pendapatan (neto setelah diskon), PPN Keluaran |
| ↳ produk berstok | Beban Pokok Pendapatan | Persediaan Barang (HPP rata-rata) |
| Terima pembayaran | Kas/Bank | Piutang Usaha |
| Faktur pembelian | Persediaan / akun biaya, PPN Masukan | Hutang Usaha |
| Bayar supplier | Hutang Usaha | Kas/Bank |
| Biaya | Akun beban, PPN Masukan | Kas/Bank |
| Transfer dana | Rekening tujuan | Rekening asal |
| Terima / kirim uang | Kas/Bank ↔ akun lawan | |
| Saldo awal persediaan | Persediaan Barang | Ekuitas Saldo Awal |

- **Neraca**: Aset = Kewajiban + Ekuitas. Ekuitas memuat "Pendapatan sampai tahun lalu" (laba ditahan) dan "Pendapatan periode ini" (laba tahun berjalan), dihitung otomatis tanpa perlu jurnal penutup.
- **Akun kontra** (Akumulasi Penyusutan, Diskon/Retur Penjualan) disajikan mengurangi kelompoknya.
- **Arus kas** metode langsung: setiap baris non-kas pada jurnal yang menyentuh kas diklasifikasikan ke aktivitas operasi, investasi, atau pendanaan berdasarkan kategori akunnya; saldo akhir selalu terekonsiliasi dengan saldo kas.

Unit test di `src/lib/ledger.test.ts` memverifikasi jurnal seimbang, HPP rata-rata, saldo persediaan = valuasi stok, neraca seimbang, neraca saldo, umur piutang, dan rekonsiliasi arus kas.

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit test logika akuntansi
npm run build    # build produksi ke dist/
```

## Deploy ke Vercel

Proyek ini adalah situs statis Vite. `vercel.json` sudah mengatur rewrite SPA.

1. Buka https://vercel.com/new dan import repository GitHub `My-Account`.
2. Framework preset: **Vite** (otomatis terdeteksi). Build command `npm run build`, output `dist`.
3. Klik **Deploy**. Setiap push ke `main` akan otomatis ter-deploy ulang.
