'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { api, errorText, refresh, useApi, type Me } from '@/lib/api'
import { amount, date, dateTime, ROLE_LABEL } from '@/lib/format'
import { Badge, Empty, ErrorState, ErrorSummary, Field, Loading, Modal, PageHeader, StatCard, StatusBadge } from '../ui'

interface ClientRow {
  id: string
  code: string
  name: string
  status: string
  entity_count: number
  drafts: number
  awaiting_approval: number
  awaiting_posting: number
  last_posted_at: string | null
}

/* ============================== Firm home / clients ============================== */

export function FirmHome({ listOnly = false }: { listOnly?: boolean }) {
  const { data: me } = useApi<Me>('/me')
  const { data, error, mutate } = useApi<{ clients: ClientRow[]; staffCount: number }>('/firm/overview')
  const [open, setOpen] = useState(false)
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />
  if (!data || !me) return <Loading />
  const canManage = me.permissions.includes('tenancy.manage')
  const sum = (k: keyof ClientRow) => data.clients.reduce((s, c) => s + Number(c[k] || 0), 0)

  return (
    <div>
      <PageHeader
        title={listOnly ? 'Klien' : 'Beranda Firma'}
        subtitle={listOnly ? 'Semua klien yang dapat Anda akses' : `${me.firm.name} · ringkasan seluruh klien`}
        actions={
          canManage && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus size={16} aria-hidden /> Tambah Klien
            </button>
          )
        }
      />
      {!listOnly && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Klien aktif" value={data.clients.filter((c) => c.status === 'active').length} hint={`${sum('entity_count')} perusahaan`} />
          <StatCard label="Menunggu persetujuan" value={sum('awaiting_approval')} tone="accent" href="/firm/approvals" hint="Jurnal diajukan" />
          <StatCard label="Menunggu posting" value={sum('awaiting_posting')} tone="success" href="/firm/approvals" hint="Sudah disetujui" />
          <StatCard label="Staf" value={data.staffCount} tone="primary" href="/firm/staff" />
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Klien</th>
                <th className="text-right">Perusahaan</th>
                <th className="text-right">Draf</th>
                <th className="text-right">Diajukan</th>
                <th className="text-right">Disetujui</th>
                <th>Posting terakhir</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.code}</td>
                  <td>
                    <Link className="link" href={`/firm/clients/${c.id}`}>
                      {c.name}
                    </Link>
                  </td>
                  <td className="num">{c.entity_count}</td>
                  <td className="num">{c.drafts}</td>
                  <td className="num">{c.awaiting_approval ? <Badge tone="accent">{c.awaiting_approval}</Badge> : 0}</td>
                  <td className="num">{c.awaiting_posting}</td>
                  <td className="text-muted-fg">{c.last_posted_at ? dateTime(c.last_posted_at) : '—'}</td>
                  <td>{c.status === 'active' ? <Badge tone="success">Aktif</Badge> : <Badge>Nonaktif</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.clients.length && (
            <Empty title="Belum ada klien">{canManage ? 'Tambahkan klien pertama untuk mulai membukukan.' : 'Minta Partner/Manajer menugaskan Anda ke klien.'}</Empty>
          )}
        </div>
      </div>
      <NewClientModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ code: '', name: '' })
  const [err, setErr] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/clients', f)
      await refresh('/firm')
      await refresh('/me')
      setF({ code: '', name: '' })
      setErr([])
      onClose()
    } catch (x) {
      setErr([errorText(x)])
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Tambah Klien">
      <form onSubmit={submit} className="space-y-4">
        <ErrorSummary messages={err} />
        <Field label="Kode klien" htmlFor="c-code" hint="Huruf/angka, mis. MAJU">
          <input id="c-code" className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required maxLength={30} />
        </Field>
        <Field label="Nama klien" htmlFor="c-name">
          <input id="c-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button className="btn-primary" disabled={busy}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ============================== Client detail ============================== */

interface ClientDetailData {
  id: string
  code: string
  name: string
  status: string
  entities: { id: string; name: string; legal_name: string | null; npwp: string | null; require_approval: boolean; created_at: string }[]
  members: { id: string; full_name: string; email: string; role: string }[]
}

export function ClientDetail({ clientId }: { clientId: string }) {
  const { data: me } = useApi<Me>('/me')
  const { data, error, mutate } = useApi<ClientDetailData>(`/clients/${clientId}`)
  const { data: staff } = useApi<{ id: string; full_name: string; role: string }[]>('/staff')
  const [open, setOpen] = useState(false)
  const [assign, setAssign] = useState('')
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />
  if (!data || !me) return <Loading />
  const canManage = me.permissions.includes('tenancy.manage')
  const assignable = (staff ?? []).filter((s) => ['accountant', 'auditor'].includes(s.role) && !data.members.some((m) => m.id === s.id))

  return (
    <div>
      <PageHeader
        title={data.name}
        subtitle={`Kode ${data.code}`}
        back={{ href: '/firm/clients', label: 'Klien' }}
        actions={
          canManage && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus size={16} aria-hidden /> Tambah Perusahaan
            </button>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="border-b border-line px-4 py-3 font-semibold">Perusahaan (entitas legal)</div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>NPWP</th>
                  <th>Persetujuan jurnal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.entities.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="font-medium">{e.name}</div>
                      {e.legal_name && e.legal_name !== e.name && <div className="text-xs text-muted-fg">{e.legal_name}</div>}
                    </td>
                    <td className="font-mono text-xs">{e.npwp || '—'}</td>
                    <td>{e.require_approval ? <Badge tone="primary">Wajib</Badge> : <Badge>Tidak wajib</Badge>}</td>
                    <td className="text-right">
                      <Link className="btn-secondary" href={`/e/${e.id}`}>
                        Buka
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.entities.length && <Empty title="Belum ada perusahaan">Perusahaan baru otomatis mendapat bagan akun standar, cabang Kantor Pusat dan 12 periode.</Empty>}
          </div>
        </div>
        <div className="card self-start">
          <div className="border-b border-line px-4 py-3 font-semibold">Staf yang ditugaskan</div>
          <ul className="divide-y divide-line">
            {data.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <div>
                  <div className="font-medium">{m.full_name}</div>
                  <div className="text-xs text-muted-fg">{ROLE_LABEL[m.role]}</div>
                </div>
                {canManage && (
                  <button
                    className="btn-ghost text-xs"
                    onClick={async () => {
                      await api.del(`/clients/${clientId}/members/${m.id}`)
                      mutate()
                    }}
                  >
                    Lepas
                  </button>
                )}
              </li>
            ))}
            {!data.members.length && <li className="px-4 py-3 text-sm text-muted-fg">Partner & Manajer selalu memiliki akses ke semua klien.</li>}
          </ul>
          {canManage && assignable.length > 0 && (
            <div className="flex gap-2 border-t border-line p-3">
              <label htmlFor="assign" className="sr-only">
                Tugaskan staf
              </label>
              <select id="assign" className="input" value={assign} onChange={(e) => setAssign(e.target.value)}>
                <option value="">Tugaskan staf…</option>
                {assignable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({ROLE_LABEL[s.role]})
                  </option>
                ))}
              </select>
              <button
                className="btn-secondary"
                disabled={!assign}
                onClick={async () => {
                  await api.post(`/clients/${clientId}/members`, { userId: assign })
                  setAssign('')
                  mutate()
                }}
              >
                Tambah
              </button>
            </div>
          )}
        </div>
      </div>
      <NewEntityModal clientId={clientId} open={open} onClose={() => setOpen(false)} onDone={() => mutate()} />
    </div>
  )
}

function NewEntityModal({ clientId, open, onClose, onDone }: { clientId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', legalName: '', npwp: '', fiscalYearStartMonth: 1, requireApproval: true })
  const [err, setErr] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post(`/clients/${clientId}/entities`, { ...f, legalName: f.legalName || null, npwp: f.npwp || null })
      await refresh('/me')
      onDone()
      setErr([])
      onClose()
    } catch (x) {
      setErr([errorText(x)])
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Tambah Perusahaan">
      <form onSubmit={submit} className="space-y-4">
        <ErrorSummary messages={err} />
        <Field label="Nama perusahaan" htmlFor="e-name">
          <input id="e-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <Field label="Nama legal" htmlFor="e-legal">
          <input id="e-legal" className="input" value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="NPWP" htmlFor="e-npwp">
            <input id="e-npwp" className="input" value={f.npwp} onChange={(e) => setF({ ...f, npwp: e.target.value })} />
          </Field>
          <Field label="Awal tahun buku" htmlFor="e-fy">
            <select id="e-fy" className="input" value={f.fiscalYearStartMonth} onChange={(e) => setF({ ...f, fiscalYearStartMonth: Number(e.target.value) })}>
              {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={f.requireApproval} onChange={(e) => setF({ ...f, requireApproval: e.target.checked })} />
          <span>
            Jurnal wajib disetujui sebelum diposting <span className="block text-xs text-muted-fg">Disarankan. Penyusun jurnal tidak dapat menyetujui jurnalnya sendiri.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button className="btn-primary" disabled={busy}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ============================== Approvals ============================== */

interface ApprovalRow {
  id: string
  number: string
  journal_date: string
  status: 'submitted' | 'approved'
  memo: string | null
  entity_id: string
  entity_name: string
  client_name: string
  created_by_name: string
  created_by: string
  submitted_at: string | null
  total: string
}

export function Approvals() {
  const { data, error, mutate } = useApi<ApprovalRow[]>('/approvals')
  const { data: me } = useApi<Me>('/me')
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />
  if (!data || !me) return <Loading />
  return (
    <div>
      <PageHeader title="Kotak Persetujuan" subtitle="Jurnal yang menunggu persetujuan atau posting di seluruh klien Anda" />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Status</th>
              <th>Nomor</th>
              <th>Tanggal</th>
              <th>Perusahaan</th>
              <th>Keterangan</th>
              <th>Penyusun</th>
              <th className="text-right">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="font-mono text-xs">{r.number}</td>
                <td>{date(r.journal_date)}</td>
                <td>
                  <div>{r.entity_name}</div>
                  <div className="text-xs text-muted-fg">{r.client_name}</div>
                </td>
                <td className="max-w-xs truncate">{r.memo}</td>
                <td>
                  {r.created_by_name}
                  {r.created_by === me.user.id && <span className="ml-1 text-xs text-muted-fg">(Anda)</span>}
                </td>
                <td className="num">{amount(r.total)}</td>
                <td className="text-right">
                  <Link className="btn-secondary" href={`/e/${r.entity_id}/journals/${r.id}`}>
                    Tinjau
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && <Empty title="Tidak ada antrian">Semua jurnal sudah ditinjau.</Empty>}
      </div>
    </div>
  )
}

/* ============================== Staff ============================== */

interface StaffRow {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  clients: { id: string; name: string }[]
}

export function Staff() {
  const { data, error, mutate } = useApi<StaffRow[]>('/staff')
  const { data: me } = useApi<Me>('/me')
  const [open, setOpen] = useState(false)
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />
  if (!data || !me) return <Loading />
  const canManage = me.permissions.includes('staff.manage')
  return (
    <div>
      <PageHeader
        title="Staf & Hak Akses"
        subtitle="Partner & Manajer mengakses semua klien; Akuntan & Auditor hanya klien yang ditugaskan"
        actions={
          canManage && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus size={16} aria-hidden /> Tambah Staf
            </button>
          )
        }
      />
      <div className="mb-4 grid gap-3 text-xs text-muted-fg md:grid-cols-4">
        {[
          ['Partner', 'Semua hak, kelola staf, buka kembali periode'],
          ['Manajer', 'Kelola klien, setujui & balik jurnal, kunci periode'],
          ['Akuntan', 'Buat, ajukan & posting jurnal (setelah disetujui)'],
          ['Auditor', 'Baca saja + log audit'],
        ].map(([r, d]) => (
          <div key={r} className="card p-3">
            <div className="font-semibold text-primary-strong">{r}</div>
            {d}
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Email</th>
              <th>Peran</th>
              <th>Klien ditugaskan</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td className="font-medium">{s.full_name}</td>
                <td>{s.email}</td>
                <td>
                  {canManage && s.id !== me.user.id ? (
                    <select
                      aria-label={`Peran ${s.full_name}`}
                      className="input py-0"
                      value={s.role}
                      onChange={async (e) => {
                        await api.patch(`/staff/${s.id}`, { role: e.target.value })
                        mutate()
                      }}
                    >
                      {Object.entries(ROLE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABEL[s.role]
                  )}
                </td>
                <td className="text-muted-fg">{['partner', 'manager'].includes(s.role) ? 'Semua klien' : s.clients.map((c) => c.name).join(', ') || '—'}</td>
                <td>{s.is_active ? <Badge tone="success">Aktif</Badge> : <Badge>Nonaktif</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewStaffModal open={open} onClose={() => setOpen(false)} onDone={() => mutate()} />
    </div>
  )
}

function NewStaffModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ fullName: '', email: '', role: 'accountant', password: '' })
  const [err, setErr] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/staff', f)
      onDone()
      setF({ fullName: '', email: '', role: 'accountant', password: '' })
      setErr([])
      onClose()
    } catch (x) {
      setErr([errorText(x)])
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Tambah Staf">
      <form onSubmit={submit} className="space-y-4">
        <ErrorSummary messages={err} />
        <Field label="Nama lengkap" htmlFor="s-name">
          <input id="s-name" className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required />
        </Field>
        <Field label="Email" htmlFor="s-email">
          <input id="s-email" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </Field>
        <Field label="Peran" htmlFor="s-role">
          <select id="s-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kata sandi awal" htmlFor="s-pass" hint="Minimal 10 karakter; sampaikan secara aman">
          <input id="s-pass" type="password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={10} autoComplete="new-password" />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button className="btn-primary" disabled={busy}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ============================== Audit ============================== */

export interface AuditRow {
  id: string
  action: string
  object_type: string
  object_id: string | null
  data: Record<string, unknown> | null
  created_at: string
  actor: string | null
}

export const ACTION_LABEL: Record<string, string> = {
  'firm.created': 'Firma dibuat',
  'user.login': 'Masuk',
  'client.created': 'Klien dibuat',
  'client.updated': 'Klien diubah',
  'client.member_added': 'Staf ditugaskan',
  'client.member_removed': 'Penugasan dicabut',
  'entity.created': 'Perusahaan dibuat',
  'entity.updated': 'Perusahaan diubah',
  'branch.created': 'Cabang dibuat',
  'branch.updated': 'Cabang diubah',
  'staff.created': 'Staf ditambahkan',
  'staff.updated': 'Staf diubah',
  'account.created': 'Akun dibuat',
  'account.updated': 'Akun diubah',
  'period.generated': 'Periode dibuat',
  'period.locked': 'Periode dikunci',
  'period.reopened': 'Periode dibuka kembali',
  'journal.created': 'Jurnal dibuat',
  'journal.updated': 'Jurnal diubah',
  'journal.deleted': 'Draf jurnal dihapus',
  'journal.submitted': 'Jurnal diajukan',
  'journal.returned': 'Jurnal dikembalikan',
  'journal.approved': 'Jurnal disetujui',
  'journal.posted': 'Jurnal diposting',
  'journal.reversed': 'Jurnal dibalik',
}

export function AuditTable({ rows, entityId }: { rows: AuditRow[]; entityId?: string }) {
  return (
    <div className="card overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Pengguna</th>
            <th>Aktivitas</th>
            <th>Rincian</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-muted-fg">{dateTime(r.created_at)}</td>
              <td>{r.actor ?? '—'}</td>
              <td>
                {entityId && r.object_type === 'journal' && r.object_id ? (
                  <Link className="link" href={`/e/${entityId}/journals/${r.object_id}`}>
                    {ACTION_LABEL[r.action] ?? r.action}
                  </Link>
                ) : (
                  ACTION_LABEL[r.action] ?? r.action
                )}
              </td>
              <td className="max-w-md truncate font-mono text-xs text-muted-fg" title={r.data ? JSON.stringify(r.data) : ''}>
                {r.data ? summarize(r.data) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty title="Belum ada aktivitas" />}
    </div>
  )
}

function summarize(d: Record<string, unknown>): string {
  const keys = ['number', 'name', 'reason', 'reversal', 'from', 'email', 'role', 'debit']
  const parts = keys.filter((k) => d[k] !== undefined && d[k] !== null).map((k) => `${k}: ${String(d[k])}`)
  return parts.length ? parts.join(' · ') : JSON.stringify(d)
}

export function FirmAudit() {
  const { data, error, mutate } = useApi<AuditRow[]>('/audit?limit=200')
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />
  if (!data) return <Loading />
  return (
    <div>
      <PageHeader title="Log Audit Firma" subtitle="Catatan tidak dapat diubah (append-only) atas seluruh aktivitas" />
      <AuditTable rows={data} />
    </div>
  )
}
