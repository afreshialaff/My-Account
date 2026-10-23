# Accounting OS

Software akuntansi multi-klien untuk kantor akuntan di Indonesia: satu firma mengelola banyak klien, tiap klien punya beberapa perusahaan (entitas legal) dan cabang. Struktur menunya mengikuti Mekari Jurnal dan Accurate Online. Mesin pembukuannya double-entry yang dapat diaudit.

> **Status:** fondasi Sprint 01–06 sudah berjalan end-to-end (tenancy, RBAC, COA, periode, mesin jurnal, laporan inti, log audit). Modul lain tampil di menu sebagai **Segera** dan belum memiliki fungsi. Rinciannya ada di [`docs/STATUS.md`](docs/STATUS.md).

| Folder | Isi |
|---|---|
| `apps/api` | NestJS 11 + PostgreSQL 16 dengan Row Level Security · `/api/v1` · Swagger di `/api/docs` |
| `apps/web` | Next.js 15 (App Router) + Tailwind · UI dari design system `design-system/accounting-os` |
| `apps/lite` | Aplikasi awal (Vite, localStorage, satu pengguna). Tetap dipertahankan dan di-deploy |
| `docs/` | [Arsitektur, ERD & kontrak API](docs/ARCHITECTURE.md) · [Status modul](docs/STATUS.md) · [Riset Jurnal/Accurate](docs/RESEARCH-modules.md) |
| `.claude/skills/` | Skill proyek: `accounting-os-builder` (spesifikasi) dan `ui-ux-pro-max` (desain UI/UX) |

## Menjalankan secara lokal

Prasyarat: Node 22 dan PostgreSQL 14+ (butuh ekstensi `btree_gist` dan `citext`).

```bash
npm install
cp apps/api/.env.example apps/api/.env          # sesuaikan DATABASE_URL / DATABASE_ADMIN_URL / JWT_SECRET
createdb accounting_os
npm run db:migrate -w @aos/api                  # migrasi + membuat role aplikasi non-superuser
npm run db:seed -w @aos/api                     # sandbox [DEMO], opsional
npm run start:dev -w @aos/api                   # http://localhost:4000/api/docs
npm run dev -w @aos/web                         # http://localhost:3000
```

Login demo (kata sandi `demo-password-123`): `partner@demo.accounting-os.local`, `manager@…`, `accountant@…`, `auditor@…`.

## Tes

```bash
npm test -w @aos/api     # 19 tes integrasi terhadap PostgreSQL sungguhan (isolasi tenant, saldo, idempotensi, maker-checker, immutability, reversal, kunci periode, laporan)
npm test -w @aos/lite    # 12 tes mesin akuntansi aplikasi lite
node e2e/journal-flow.mjs  # E2E browser (butuh web+api berjalan dengan data demo, dan playwright)
```

## Deploy (cara tercepat: satu project Vercel)

API NestJS berjalan di dalam Next.js (`apps/web/pages/api/v1/[...path].ts`), jadi cukup **satu project Vercel + database Neon**:

1. Vercel → **Add New → Project** → import repo `My-Account` → **Root Directory: `apps/web`** → Deploy.
2. Di project itu buka tab **Storage → Create Database → Neon** → hubungkan ke project (Vercel otomatis mengisi `DATABASE_URL`).
3. **Deployments → Redeploy**. Request pertama otomatis menjalankan migrasi dan membuat sandbox `[DEMO]`
   (login `partner@demo.accounting-os.local` / `demo-password-123`). Set `DEMO_SEED=false` untuk menonaktifkan data demo.

Opsional: set `JWT_SECRET` (≥32 karakter) dan `APP_DB_PASSWORD`; jika tidak diisi, keduanya diturunkan dari connection string database.
Aplikasi lite tetap di-deploy oleh project yang Root Directory-nya root repo (`vercel.json`).

Alternatif: API terpisah (Railway/Render/Fly, `apps/api/Dockerfile`) dan set `API_URL` di project web.
