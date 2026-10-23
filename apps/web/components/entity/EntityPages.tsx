'use client'

import { Lock, LockOpen, Plus } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState, type FormEvent } from 'react'
import { api, errorText, refresh, useApi, type Account, type Entity, type JournalStatus, type Me } from '@/lib/api'
import { amount, date, dateTime, rupiah, today } from '@/lib/format'
import { PLANNED } from '@/lib/nav'
import { AuditTable, type AuditRow } from '../firm/FirmPages'
import { Amount, Badge, Empty, ErrorState, ErrorSummary, Field, Loading, Modal, PageHeader, StatCard, StatusBadge } from '../ui'

/* ============================== Dashboard ============================== */

interface Summary {
  cashBank: string
  receivable: string
  payable: string
  netIncomeMonth: string
  journalCounts: Partial<Record<JournalStatus, number>>
  cashAccounts: { accountId: string; code: string; name: string; balance: string }[]
}

export function EntityDashboard({ entityId }: { entityId: string }) {
  const t = today()
  const { data: entity, error } = useApi<Entity>(`/entities/${entityId}`)
  const { data: s } = useApi<Summary>(`/entities/${entityId}/reports/summary?asOf=${t}`)
  const { data: recent } = useApi<{ rows: { id: string; number: string; journal_date: string; status: JournalStatus; memo: string | null; total: string | null }[] }>(`/entities/${entityId}/journals?limit=8`)
  if (error) return <ErrorState error={error} />
  if (!entity || !s) return <Loading />
  const c = s.journalCounts
  return (
    <div>
      <PageHeader
        title={entity.name}
        subtitle={`${entity.client.name} · per ${date(t)} · angka dari jurnal yang sudah diposting`}
        actions={
          <Link href={`/e/${entityId}/journals/new`} className="btn-primary">
            <Plus size={16} aria-hidden /> Buat Jurnal
          </Link>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Kas & Bank" value={rupiah(s.cashBank)} href={`/e/${entityId}/reports/balance-sheet`} />
        <StatCard label="Piutang" value={rupiah(s.receivable)} tone="accent" href={`/e/${entityId}/reports/balance-sheet`} />
        <StatCard label="Hutang Usaha" value={rupiah(s.payable)} tone="danger" href={`/e/${entityId}/reports/balance-sheet`} />
        <StatCard label="Laba bersih bulan ini" value={rupiah(s.netIncomeMonth)} tone="success" href={`/e/${entityId}/reports/profit-loss`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">Jurnal terbaru</h2>
            <Link href={`/e/${entityId}/journals`} className="text-xs font-medium text-primary hover:underline">
              Lihat semua
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <tbody>
                {recent?.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{date(r.journal_date)}</td>
                    <td>
                      <Link className="link font-mono text-xs" href={`/e/${entityId}/journals/${r.id}`}>
                        {r.number}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate">{r.memo}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="num">{amount(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recent?.rows.length && <Empty title="Belum ada jurnal" />}
          </div>
        </div>
        <div className="space-y-5">
          <div className="card">
            <div className="border-b border-line px-4 py-3 font-semibold">Status jurnal</div>
            <dl className="grid grid-cols-2 gap-px bg-line text-sm">
              {(['draft', 'submitted', 'approved', 'posted'] as JournalStatus[]).map((k) => (
                <Link key={k} href={`/e/${entityId}/journals`} className="bg-surface p-3 hover:bg-canvas">
                  <dt>
                    <StatusBadge status={k} />
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">{c[k] ?? 0}</dd>
                </Link>
              ))}
            </dl>
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-3 font-semibold">Saldo Kas & Bank</div>
            <table className="tbl">
              <tbody>
                {s.cashAccounts.map((a) => (
                  <tr key={a.accountId}>
                    <td>
                      <Link className="link" href={`/e/${entityId}/reports/general-ledger?accountId=${a.accountId}`}>
                        {a.name}
                      </Link>
                    </td>
                    <td className="num">{amount(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================== Chart of accounts ============================== */

const CATEGORY_OPTIONS: [string, string][] = [
  ['cash_bank', 'Kas & Bank'],
  ['receivable', 'Akun Piutang'],
  ['inventory', 'Persediaan'],
  ['other_current_asset', 'Aktiva Lancar Lainnya'],
  ['fixed_asset', 'Aktiva Tetap'],
  ['depreciation', 'Depresiasi & Amortisasi'],
  ['other_asset', 'Aktiva Lainnya'],
  ['payable', 'Akun Hutang'],
  ['other_current_liability', 'Kewajiban Lancar Lainnya'],
  ['long_term_liability', 'Kewajiban Jangka Panjang'],
  ['equity', 'Ekuitas'],
  ['revenue', 'Pendapatan'],
  ['other_income', 'Pendapatan Lainnya'],
  ['cogs', 'Harga Pokok Penjualan'],
  ['expense', 'Beban'],
  ['other_expense', 'Beban Lainnya'],
]

export function Accounts({ entityId }: { entityId: string }) {
  const { data: me } = useApi<Me>('/me')
  const { data, error, mutate } = useApi<Account[]>(`/entities/${entityId}/accounts`)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [open, setOpen] = useState(false)
  const list = useMemo(
    () => (data ?? []).filter((a) => (!cat || a.category === cat) && (!q || `${a.code} ${a.name}`.toLowerCase().includes(q.toLowerCase()))),
    [data, q, cat],
  )
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />
  if (!data || !me) return <Loading />
  const canManage = me.permissions.includes('coa.manage')
  return (
    <div>
      <PageHeader
        title="Daftar Akun"
        subtitle={`${data.length} akun · saldo dari jurnal yang diposting`}
        actions={
          canManage && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus size={16} aria-hidden /> Buat Akun
            </button>
          )
        }
      />
      <div className="card">
        <div className="flex flex-wrap gap-2 p-3">
          <div className="w-64">
            <label htmlFor="aq" className="label">
              Cari
            </label>
            <input id="aq" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kode atau nama akun" />
          </div>
          <div className="w-60">
            <label htmlFor="acat" className="label">
              Kategori
            </label>
            <select id="acat" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Semua kategori</option>
              {CATEGORY_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama akun</th>
                <th>Kategori</th>
                <th>Saldo normal</th>
                <th className="text-right">Saldo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-xs">{a.code}</td>
                  <td>
                    <Link className="link" href={`/e/${entityId}/reports/general-ledger?accountId=${a.id}`}>
                      {a.name}
                    </Link>
                    {a.is_system && <span className="ml-2 text-[11px] text-muted-fg">sistem</span>}
                  </td>
                  <td className="text-muted-fg">{a.category_label}</td>
                  <td className="text-muted-fg">{a.normal_side === 'debit' ? 'Debit' : 'Kredit'}</td>
                  <td className="num">
                    <Amount value={a.balance} />
                  </td>
                  <td>
                    {canManage && !a.is_system ? (
                      <button
                        className="text-xs"
                        onClick={async () => {
                          await api.patch(`/entities/${entityId}/accounts/${a.id}`, { isActive: !a.is_active })
                          mutate()
                        }}
                        aria-label={`${a.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${a.name}`}
                      >
                        {a.is_active ? <Badge tone="success">Aktif</Badge> : <Badge>Nonaktif</Badge>}
                      </button>
                    ) : a.is_active ? (
                      <Badge tone="success">Aktif</Badge>
                    ) : (
                      <Badge>Nonaktif</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <Empty title="Tidak ada akun yang cocok" />}
        </div>
      </div>
      <NewAccountModal entityId={entityId} open={open} onClose={() => setOpen(false)} onDone={() => mutate()} />
    </div>
  )
}

function NewAccountModal({ entityId, open, onClose, onDone }: { entityId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ code: '', name: '', category: 'expense', description: '' })
  const [err, setErr] = useState<string[]>([])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.post(`/entities/${entityId}/accounts`, { ...f, description: f.description || null })
      onDone()
      setF({ code: '', name: '', category: 'expense', description: '' })
      setErr([])
      onClose()
    } catch (x) {
      setErr([errorText(x)])
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Buat Akun">
      <form onSubmit={submit} className="space-y-4">
        <ErrorSummary messages={err} />
        <Field label="Kategori" htmlFor="na-cat">
          <select id="na-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORY_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kode akun" htmlFor="na-code" hint="Mis. 6-60218 (unik per perusahaan)">
          <input id="na-code" className="input font-mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required />
        </Field>
        <Field label="Nama akun" htmlFor="na-name">
          <input id="na-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button className="btn-primary">Simpan</button>
        </div>
      </form>
    </Modal>
  )
}

/* ============================== Periods ============================== */

interface Period {
  id: string
  name: string
  start_date: string
  end_date: string
  status: 'open' | 'locked'
  locked_at: string | null
  locked_by_name: string | null
  posted_count: number
  open_count: number
}

export function Periods({ entityId }: { entityId: string }) {
  const { data: me } = useApi<Me>('/me')
  const { data, error, mutate } = useApi<Period[]>(`/entities/${entityId}/periods`)
  const [err, setErr] = useState<string[]>([])
  const [reopen, setReopen] = useState<Period | null>(null)
  const [reason, setReason] = useState('')
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />
  if (!data || !me) return <Loading />
  const can = (p: string) => me.permissions.includes(p)
  const years = [...new Set(data.map((p) => p.start_date.slice(0, 4)))]
  const nextYear = years.length ? Number(years[years.length - 1]) + 1 : new Date().getFullYear()

  const run = async (fn: () => Promise<unknown>) => {
    setErr([])
    try {
      await fn()
      await mutate()
    } catch (e) {
      setErr([errorText(e)])
    }
  }

  return (
    <div>
      <PageHeader
        title="Periode & Tutup Buku"
        subtitle="Periode yang dikunci menolak posting dan jurnal pembalik bertanggal di dalamnya. Membuka kembali hanya oleh Partner, dengan alasan tercatat."
        actions={
          can('period.lock') && (
            <button className="btn-secondary" onClick={() => run(() => api.post(`/entities/${entityId}/periods/generate`, { year: nextYear }))}>
              <Plus size={16} aria-hidden /> Buat periode {nextYear}
            </button>
          )
        }
      />
      <ErrorSummary messages={err} />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Rentang</th>
              <th className="text-right">Jurnal diposting</th>
              <th className="text-right">Belum diposting</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.name}</td>
                <td className="text-muted-fg">
                  {date(p.start_date)} – {date(p.end_date)}
                </td>
                <td className="num">{p.posted_count}</td>
                <td className="num">{p.open_count ? <Badge tone="accent">{p.open_count}</Badge> : 0}</td>
                <td>
                  {p.status === 'open' ? (
                    <Badge tone="success">Terbuka</Badge>
                  ) : (
                    <span title={`${p.locked_by_name} · ${dateTime(p.locked_at)}`}>
                      <Badge tone="danger">Dikunci</Badge>
                    </span>
                  )}
                </td>
                <td className="text-right">
                  {p.status === 'open' && can('period.lock') && (
                    <button className="btn-secondary" onClick={() => p.open_count && !confirm(`${p.open_count} jurnal di periode ini belum diposting. Tetap kunci?`) ? null : run(() => api.post(`/entities/${entityId}/periods/${p.id}/lock`))}>
                      <Lock size={14} aria-hidden /> Kunci
                    </button>
                  )}
                  {p.status === 'locked' && can('period.reopen') && (
                    <button className="btn-secondary" onClick={() => (setReopen(p), setReason(''))}>
                      <LockOpen size={14} aria-hidden /> Buka kembali
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!reopen} onClose={() => setReopen(null)} title={`Buka kembali ${reopen?.name}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            const p = reopen!
            setReopen(null)
            run(() => api.post(`/entities/${entityId}/periods/${p.id}/reopen`, { reason }))
          }}
        >
          <Field label="Alasan (wajib, tercatat di log audit)" htmlFor="reason">
            <textarea id="reason" className="input min-h-[80px] py-2" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} required />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setReopen(null)}>
              Batal
            </button>
            <button className="btn-danger">Buka kembali</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

/* ============================== Settings ============================== */

interface Branch {
  id: string
  code: string
  name: string
  address: string | null
  is_active: boolean
}

export function EntitySettings({ entityId }: { entityId: string }) {
  const { data: me } = useApi<Me>('/me')
  const { data: e, error, mutate } = useApi<Entity>(`/entities/${entityId}`)
  const { data: branches, mutate: mutateBranches } = useApi<Branch[]>(`/entities/${entityId}/branches`)
  const [form, setForm] = useState<Partial<Entity> | null>(null)
  const [msg, setMsg] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [nb, setNb] = useState({ code: '', name: '' })
  if (error) return <ErrorState error={error} />
  if (!e || !me || !branches) return <Loading />
  const f = form ?? e
  const canManage = me.permissions.includes('tenancy.manage')

  const save = async (ev: FormEvent) => {
    ev.preventDefault()
    try {
      await api.patch(`/entities/${entityId}`, { name: f.name, legalName: f.legal_name || null, npwp: f.npwp || null, address: f.address || null, requireApproval: f.require_approval })
      await mutate()
      await refresh('/me')
      setForm(null)
      setMsg([])
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (x) {
      setMsg([errorText(x)])
    }
  }

  return (
    <div>
      <PageHeader title="Perusahaan & Cabang" subtitle={`Klien: ${e.client.name}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <form className="card p-4 md:p-6" onSubmit={save}>
          <h2 className="mb-4 font-semibold">Profil perusahaan</h2>
          <ErrorSummary messages={msg} />
          <fieldset disabled={!canManage} className="space-y-4">
            <Field label="Nama perusahaan" htmlFor="s-name">
              <input id="s-name" className="input" value={f.name ?? ''} onChange={(x) => setForm({ ...f, name: x.target.value })} />
            </Field>
            <Field label="Nama legal" htmlFor="s-legal">
              <input id="s-legal" className="input" value={f.legal_name ?? ''} onChange={(x) => setForm({ ...f, legal_name: x.target.value })} />
            </Field>
            <Field label="NPWP" htmlFor="s-npwp">
              <input id="s-npwp" className="input" value={f.npwp ?? ''} onChange={(x) => setForm({ ...f, npwp: x.target.value })} />
            </Field>
            <Field label="Alamat" htmlFor="s-addr">
              <textarea id="s-addr" className="input min-h-[70px] py-2" value={f.address ?? ''} onChange={(x) => setForm({ ...f, address: x.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="label">Mata uang fungsional</div>
                {e.functional_currency}
              </div>
              <div>
                <div className="label">Awal tahun buku</div>
                Bulan ke-{e.fiscal_year_start_month}
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={!!f.require_approval} onChange={(x) => setForm({ ...f, require_approval: x.target.checked })} />
              <span>Jurnal wajib disetujui sebelum diposting (maker-checker)</span>
            </label>
          </fieldset>
          {canManage && (
            <div className="mt-5 flex items-center justify-end gap-3">
              {saved && <span className="text-sm text-success">Tersimpan</span>}
              <button className="btn-primary" disabled={!form}>
                Simpan
              </button>
            </div>
          )}
        </form>
        <div className="card self-start overflow-hidden">
          <div className="border-b border-line px-4 py-3 font-semibold">Cabang</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono text-xs">{b.code}</td>
                  <td>{b.name}</td>
                  <td>
                    <button
                      disabled={!canManage}
                      onClick={async () => {
                        await api.patch(`/entities/${entityId}/branches/${b.id}`, { isActive: !b.is_active })
                        mutateBranches()
                      }}
                      aria-label={`Ubah status ${b.name}`}
                    >
                      {b.is_active ? <Badge tone="success">Aktif</Badge> : <Badge>Nonaktif</Badge>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canManage && (
            <form
              className="flex flex-wrap gap-2 border-t border-line p-3"
              onSubmit={async (ev) => {
                ev.preventDefault()
                try {
                  await api.post(`/entities/${entityId}/branches`, nb)
                  setNb({ code: '', name: '' })
                  mutateBranches()
                } catch (x) {
                  setMsg([errorText(x)])
                }
              }}
            >
              <input aria-label="Kode cabang" className="input w-24 font-mono" placeholder="Kode" value={nb.code} onChange={(x) => setNb({ ...nb, code: x.target.value })} required />
              <input aria-label="Nama cabang" className="input flex-1" placeholder="Nama cabang" value={nb.name} onChange={(x) => setNb({ ...nb, name: x.target.value })} required minLength={2} />
              <button className="btn-secondary">Tambah</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================== Audit & planned ============================== */

export function EntityAudit({ entityId }: { entityId: string }) {
  const { data, error, mutate } = useApi<AuditRow[]>(`/entities/${entityId}/audit?limit=300`)
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />
  if (!data) return <Loading />
  return (
    <div>
      <PageHeader title="Log Audit Perusahaan" subtitle="Append-only: catatan tidak dapat diubah atau dihapus, termasuk oleh administrator database aplikasi" />
      <AuditTable rows={data} entityId={entityId} />
    </div>
  )
}

export function PlannedModulePage({ module }: { module: string }) {
  const m = PLANNED[module]
  if (!m) return <Empty title="Modul tidak dikenal" />
  return (
    <div className="max-w-3xl">
      <PageHeader title={m.title} subtitle={`${m.module} PRD · ${m.reference}`} />
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="accent">Belum tersedia</Badge>
          <span className="text-sm text-muted-fg">Dijadwalkan {m.sprint}</span>
        </div>
        <p className="mb-3 text-sm">Modul ini belum dibangun. Halaman ini sengaja tidak menampilkan data contoh atau tombol yang seolah-olah berfungsi. Cakupan yang direncanakan:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {m.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-fg">Semua modul akan memposting melalui mesin jurnal yang sama (seimbang, immutable, terkunci periode, ter-audit) yang sudah berjalan di Buku Besar.</p>
      </div>
    </div>
  )
}
