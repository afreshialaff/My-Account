'use client'

import { CheckCircle2, Plus, Trash2, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { api, errorText, refresh, useApi, type Account, type Journal, type JournalStatus, type Me } from '@/lib/api'
import { amount, date, dateTime, fromCents, parseAmountInput, sumAmounts, toCents, today } from '@/lib/format'
import { ACTION_LABEL } from '../firm/FirmPages'
import { Badge, Empty, ErrorState, ErrorSummary, Field, Loading, Modal, PageHeader, StatusBadge } from '../ui'

/* ============================== List ============================== */

interface ListRow {
  id: string
  number: string
  journal_date: string
  status: JournalStatus
  memo: string | null
  source_type: string
  created_by_name: string
  total: string | null
}

const TABS: { value: JournalStatus | ''; label: string }[] = [
  { value: '', label: 'Semua' },
  { value: 'draft', label: 'Draf' },
  { value: 'submitted', label: 'Diajukan' },
  { value: 'approved', label: 'Disetujui' },
  { value: 'posted', label: 'Diposting' },
  { value: 'reversed', label: 'Dibalik' },
]

export function JournalList({ entityId }: { entityId: string }) {
  const [status, setStatus] = useState<JournalStatus | ''>('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const params = new URLSearchParams({ limit: '50', offset: String(page * 50) })
  if (status) params.set('status', status)
  if (q) params.set('q', q)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const { data, error, mutate, isLoading } = useApi<{ total: number; rows: ListRow[] }>(`/entities/${entityId}/journals?${params}`, { keepPreviousData: true })

  return (
    <div>
      <PageHeader
        title="Jurnal Umum"
        subtitle="Draf → Diajukan → Disetujui → Diposting. Jurnal yang sudah diposting hanya dapat dikoreksi dengan jurnal pembalik."
        actions={
          <Link href={`/e/${entityId}/journals/new`} className="btn-primary">
            <Plus size={16} aria-hidden /> Buat Jurnal
          </Link>
        }
      />
      <div className="card">
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={status === t.value}
              onClick={() => {
                setStatus(t.value)
                setPage(0)
              }}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${status === t.value ? 'border-primary text-primary' : 'border-transparent text-muted-fg hover:text-primary-strong'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 p-3">
          <div className="w-64">
            <label htmlFor="jq" className="label">
              Cari nomor / keterangan
            </label>
            <input id="jq" className="input" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} />
          </div>
          <div>
            <label htmlFor="jfrom" className="label">
              Dari
            </label>
            <input id="jfrom" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="jto" className="label">
              Sampai
            </label>
            <input id="jto" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {error ? (
          <ErrorState error={error} onRetry={() => mutate()} />
        ) : !data ? (
          <Loading />
        ) : (
          <>
            <div className={`overflow-x-auto ${isLoading ? 'opacity-60' : ''}`}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Nomor</th>
                    <th>Keterangan</th>
                    <th>Status</th>
                    <th>Dibuat oleh</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{date(r.journal_date)}</td>
                      <td>
                        <Link className="link font-mono text-xs" href={`/e/${entityId}/journals/${r.id}`}>
                          {r.number}
                        </Link>
                      </td>
                      <td className="max-w-sm truncate">
                        {r.memo}
                        {r.source_type === 'reversal' && <Badge tone="danger">Pembalik</Badge>}
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="text-muted-fg">{r.created_by_name}</td>
                      <td className="num">{amount(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.rows.length && <Empty title="Tidak ada jurnal">Ubah filter atau buat jurnal baru.</Empty>}
            </div>
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-sm text-muted-fg">
              <span>
                {data.total} jurnal · halaman {page + 1} dari {Math.max(1, Math.ceil(data.total / 50))}
              </span>
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Sebelumnya
                </button>
                <button className="btn-secondary" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>
                  Berikutnya
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ============================== Editor ============================== */

interface Line {
  key: string
  accountId: string
  description: string
  debit: string // raw user text
  credit: string
}

let k = 0
const blank = (): Line => ({ key: `l${++k}`, accountId: '', description: '', debit: '', credit: '' })

interface Preview {
  totals: { debit: string; credit: string; difference: string; balanced: boolean }
  period: { name: string; status: string } | null
  problems: string[]
  postable: boolean
}

export function JournalEditor({ entityId, journalId }: { entityId: string; journalId?: string }) {
  const router = useRouter()
  const { data: accounts } = useApi<Account[]>(`/entities/${entityId}/accounts`)
  const { data: branches } = useApi<{ id: string; code: string; name: string; is_active: boolean }[]>(`/entities/${entityId}/branches`)
  const { data: existing } = useApi<Journal>(journalId ? `/entities/${entityId}/journals/${journalId}` : null)
  const [jDate, setJDate] = useState(today())
  const [memo, setMemo] = useState('')
  const [branchId, setBranchId] = useState('')
  const [lines, setLines] = useState<Line[]>([blank(), blank()])
  const [errors, setErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const idemKey = useRef(`je-${crypto.randomUUID()}`)
  const loaded = useRef(false)

  useEffect(() => {
    if (!existing || loaded.current) return
    loaded.current = true
    setJDate(existing.journal_date)
    setMemo(existing.memo ?? '')
    setBranchId(existing.branch_id ?? '')
    setLines(existing.lines.map((l) => ({ key: `l${++k}`, accountId: l.account_id, description: l.description ?? '', debit: l.debit === '0.00' ? '' : amount(l.debit), credit: l.credit === '0.00' ? '' : amount(l.credit) })))
  }, [existing])

  const parsed = lines.map((l) => ({ ...l, d: l.debit ? parseAmountInput(l.debit) : '0.00', c: l.credit ? parseAmountInput(l.credit) : '0.00' }))
  const used = parsed.filter((l) => l.accountId || l.d !== '0.00' || l.c !== '0.00')
  const totalD = sumAmounts(parsed.map((l) => l.d ?? '0'))
  const totalC = sumAmounts(parsed.map((l) => l.c ?? '0'))
  const diff = fromCents(toCents(totalD) - toCents(totalC))

  const payload = () => ({
    journalDate: jDate,
    memo: memo || null,
    branchId: branchId || null,
    lines: used.map((l) => ({ accountId: l.accountId, description: l.description || null, debit: l.d ?? '0', credit: l.c ?? '0' })),
  })

  const localProblems = () => {
    const p: string[] = []
    used.forEach((l, i) => {
      if (!l.accountId) p.push(`Baris ${i + 1}: pilih akun.`)
      if (l.d === null || l.c === null) p.push(`Baris ${i + 1}: format nominal tidak valid.`)
      else if (l.d !== '0.00' && l.c !== '0.00') p.push(`Baris ${i + 1}: isi debit ATAU kredit, bukan keduanya.`)
      else if (l.d === '0.00' && l.c === '0.00') p.push(`Baris ${i + 1}: isi nominal debit atau kredit.`)
    })
    if (!used.length) p.push('Tambahkan minimal satu baris.')
    return p
  }

  // Live server preview (period status, account validity, balance) — debounced.
  const body = JSON.stringify(payload())
  useEffect(() => {
    if (localProblems().length) return setPreview(null)
    const t = setTimeout(async () => {
      try {
        setPreview(await api.post<Preview>(`/entities/${entityId}/journals/preview`, JSON.parse(body)))
      } catch {
        setPreview(null)
      }
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, entityId])

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const save = async (then?: 'submit' | 'post') => {
    const p = localProblems()
    setErrors(p)
    if (p.length) return
    setBusy(true)
    try {
      let j: Journal
      if (journalId && existing) j = await api.put<Journal>(`/entities/${entityId}/journals/${journalId}`, payload(), { 'If-Match': String(existing.version) })
      else j = await api.post<Journal>(`/entities/${entityId}/journals`, payload(), { 'Idempotency-Key': idemKey.current })
      if (then) {
        try {
          await api.post(`/entities/${entityId}/journals/${j.id}/${then}`)
        } catch (e) {
          await refresh(`/entities/${entityId}`)
          router.push(`/e/${entityId}/journals/${j.id}?error=${encodeURIComponent(errorText(e))}`)
          return
        }
      }
      await refresh(`/entities/${entityId}`)
      router.push(`/e/${entityId}/journals/${j.id}`)
    } catch (e) {
      setErrors([errorText(e)])
      setBusy(false)
    }
  }

  // Keyboard: Enter on the last row's amount adds a new row.
  const onAmountKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (i === lines.length - 1) setLines((ls) => [...ls, blank()])
      setTimeout(() => document.getElementById(`acc-${i + 1}`)?.focus(), 0)
    }
  }

  if (!accounts || (journalId && !existing)) return <Loading />
  if (existing && existing.status !== 'draft') return <ErrorState error={new Error('Hanya jurnal berstatus Draf yang dapat diubah.')} />

  return (
    <div>
      <PageHeader title={journalId ? `Ubah Jurnal ${existing?.number}` : 'Buat Jurnal Umum'} back={{ href: `/e/${entityId}/journals`, label: 'Jurnal Umum' }} />
      <div className="card p-4 md:p-6">
        <ErrorSummary messages={errors} />
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Tanggal transaksi" htmlFor="j-date">
            <input id="j-date" type="date" className="input" value={jDate} onChange={(e) => setJDate(e.target.value)} />
          </Field>
          <Field label="Cabang" htmlFor="j-branch">
            <select id="j-branch" className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">— Tanpa cabang —</option>
              {branches?.filter((b) => b.is_active).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Keterangan" htmlFor="j-memo" className="md:col-span-2">
            <input id="j-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} />
          </Field>
        </div>

        <div className="-mx-4 mt-6 overflow-x-auto md:-mx-6">
          <table className="tbl min-w-[820px]">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th className="w-[34%]">Akun</th>
                <th>Deskripsi</th>
                <th className="w-44 text-right">Debit</th>
                <th className="w-44 text-right">Kredit</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const p = parsed[i]
                return (
                  <tr key={l.key} className="align-top">
                    <td className="pt-4 text-xs text-muted-fg">{i + 1}</td>
                    <td>
                      <AccountPicker id={`acc-${i}`} accounts={accounts} value={l.accountId} onChange={(accountId) => setLine(i, { accountId })} />
                    </td>
                    <td>
                      <input aria-label={`Deskripsi baris ${i + 1}`} className="input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    </td>
                    <td>
                      <input
                        aria-label={`Debit baris ${i + 1}`}
                        inputMode="decimal"
                        className="input text-right font-mono"
                        value={l.debit}
                        aria-invalid={p.d === null}
                        onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })}
                        onBlur={() => p.d && p.d !== '0.00' && setLine(i, { debit: amount(p.d) })}
                        onKeyDown={onAmountKey(i)}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Kredit baris ${i + 1}`}
                        inputMode="decimal"
                        className="input text-right font-mono"
                        value={l.credit}
                        aria-invalid={p.c === null}
                        onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })}
                        onBlur={() => p.c && p.c !== '0.00' && setLine(i, { credit: amount(p.c) })}
                        onKeyDown={onAmountKey(i)}
                      />
                    </td>
                    <td>
                      <button className="btn-ghost px-2" aria-label={`Hapus baris ${i + 1}`} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}>
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td />
                <td className="px-3 py-2">
                  <button className="btn-secondary" onClick={() => setLines((ls) => [...ls, blank()])}>
                    <Plus size={15} aria-hidden /> Tambah baris
                  </button>
                </td>
                <td className="px-3 py-2 text-right">Total</td>
                <td className="num px-3 py-2">{amount(totalD, { zero: '0' })}</td>
                <td className="num px-3 py-2">{amount(totalC, { zero: '0' })}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={3} className="px-3 py-1 text-right text-xs text-muted-fg">
                  Selisih
                </td>
                <td colSpan={2} className={`num px-3 py-1 ${diff === '0.00' ? 'text-success' : 'text-danger'}`}>
                  {diff === '0.00' ? 'Seimbang' : amount(diff)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-fg">Tips: ketik nominal seperti 1.250.000 atau 1250000,50 · tekan Enter di kolom nominal untuk ke baris berikutnya.</p>

        <div className="mt-5 rounded-md border border-line bg-canvas p-3 text-sm" aria-live="polite">
          <div className="font-semibold">Pratinjau posting</div>
          {!preview ? (
            <div className="text-muted-fg">Lengkapi baris untuk melihat pratinjau.</div>
          ) : preview.postable ? (
            <div className="flex items-center gap-1.5 text-success">
              <CheckCircle2 size={16} aria-hidden /> Siap diposting · periode {preview.period?.name} terbuka
            </div>
          ) : (
            <ul className="list-disc pl-5 text-danger">
              {preview.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Link href={journalId ? `/e/${entityId}/journals/${journalId}` : `/e/${entityId}/journals`} className="btn-secondary">
            Batal
          </Link>
          <button className="btn-secondary" disabled={busy} onClick={() => save()}>
            Simpan Draf
          </button>
          <button className="btn-primary" disabled={busy || !preview?.postable} onClick={() => save('submit')}>
            Simpan & Ajukan
          </button>
        </div>
      </div>
    </div>
  )
}

/** Searchable, keyboard-operable account combobox (code or name). */
function AccountPicker({ id, accounts, value, onChange }: { id: string; accounts: Account[]; value: string; onChange: (id: string) => void }) {
  const selected = accounts.find((a) => a.id === value)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const options = useMemo(() => {
    const s = q.trim().toLowerCase()
    return accounts.filter((a) => a.is_active && a.is_postable && (!s || a.code.includes(s) || a.name.toLowerCase().includes(s))).slice(0, 50)
  }, [accounts, q])
  const pick = (a: Account) => {
    onChange(a.id)
    setQ('')
    setOpen(false)
  }
  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-label="Akun"
        className="input"
        placeholder="Cari kode / nama akun"
        value={open ? q : selected ? `${selected.code} · ${selected.name}` : ''}
        onFocus={() => {
          setOpen(true)
          setHi(0)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value)
          setHi(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setHi((h) => Math.min(h + 1, options.length - 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)))
          else if (e.key === 'Enter' && open && options[hi]) (e.preventDefault(), pick(options[hi]))
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full min-w-[320px] overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {options.map((a, i) => (
            <li
              key={a.id}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => (e.preventDefault(), pick(a))}
              onMouseEnter={() => setHi(i)}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm ${i === hi ? 'bg-primary-soft' : ''}`}
            >
              <span className="w-16 shrink-0 font-mono text-xs text-muted-fg">{a.code}</span>
              <span className="flex-1">{a.name}</span>
              <span className="text-[11px] text-muted-fg">{a.category_label}</span>
            </li>
          ))}
          {!options.length && <li className="px-3 py-2 text-sm text-muted-fg">Akun tidak ditemukan</li>}
        </ul>
      )}
    </div>
  )
}

/* ============================== Detail ============================== */

export function JournalDetail({ entityId, journalId, initialError }: { entityId: string; journalId: string; initialError?: string }) {
  const router = useRouter()
  const { data: me } = useApi<Me>('/me')
  const { data: entity } = useApi<{ require_approval: boolean }>(`/entities/${entityId}`)
  const { data: j, error, mutate } = useApi<Journal>(`/entities/${entityId}/journals/${journalId}`)
  const [err, setErr] = useState<string[]>(initialError ? [initialError] : [])
  const [busy, setBusy] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [revDate, setRevDate] = useState(today())
  const [revMemo, setRevMemo] = useState('')

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />
  if (!j || !me || !entity) return <Loading />
  const can = (p: string) => me.permissions.includes(p)
  const mine = j.created_by === me.user.id

  const act = async (action: string, body?: object) => {
    setBusy(true)
    setErr([])
    try {
      const r = await api.post<Journal>(`/entities/${entityId}/journals/${journalId}/${action}`, body)
      await refresh(`/entities/${entityId}`)
      await refresh('/approvals')
      if (action === 'reverse') router.push(`/e/${entityId}/journals/${r.id}`)
      else mutate(r, { revalidate: false })
    } catch (e) {
      setErr([errorText(e)])
    } finally {
      setBusy(false)
      setReverseOpen(false)
    }
  }

  const actions = (
    <>
      {j.status === 'draft' && can('journal.write') && (
        <>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`Hapus draf ${j.number}?`)) return
              await api.del(`/entities/${entityId}/journals/${journalId}`)
              await refresh(`/entities/${entityId}`)
              router.push(`/e/${entityId}/journals`)
            }}
          >
            <Trash2 size={15} aria-hidden /> Hapus
          </button>
          <Link className="btn-secondary" href={`/e/${entityId}/journals/${journalId}/edit`}>
            Ubah
          </Link>
          <button className="btn-primary" disabled={busy} onClick={() => act('submit')}>
            Ajukan
          </button>
        </>
      )}
      {['submitted', 'approved'].includes(j.status) && can('journal.approve') && (
        <button className="btn-secondary" disabled={busy} onClick={() => act('return', { reason: prompt('Alasan dikembalikan ke draf?') ?? undefined })}>
          <Undo2 size={15} aria-hidden /> Kembalikan ke Draf
        </button>
      )}
      {j.status === 'submitted' && can('journal.approve') && (
        <button className="btn-primary" disabled={busy || mine} title={mine ? 'Anda tidak dapat menyetujui jurnal yang Anda susun sendiri' : undefined} onClick={() => act('approve')}>
          Setujui
        </button>
      )}
      {(j.status === 'approved' || (!entity.require_approval && ['draft', 'submitted'].includes(j.status))) && can('journal.post') && (
        <button className="btn-primary" disabled={busy} onClick={() => act('post')}>
          Posting ke Buku Besar
        </button>
      )}
      {j.status === 'posted' && can('journal.reverse') && (
        <button className="btn-danger" disabled={busy} onClick={() => setReverseOpen(true)}>
          <Undo2 size={15} aria-hidden /> Balik Jurnal
        </button>
      )}
    </>
  )

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Jurnal <span className="font-mono">{j.number}</span> <StatusBadge status={j.status} />
          </span>
        }
        subtitle={`${date(j.journal_date)}${j.branch_name ? ` · ${j.branch_name}` : ''}${j.memo ? ` · ${j.memo}` : ''}`}
        back={{ href: `/e/${entityId}/journals`, label: 'Jurnal Umum' }}
        actions={actions}
      />
      <ErrorSummary messages={err} />
      {j.status === 'submitted' && mine && can('journal.approve') && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Pemisahan tugas: jurnal ini harus disetujui oleh pengguna lain.</div>
      )}
      {j.reversal_of && (
        <div className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Jurnal pembalik untuk{' '}
          <Link className="link" href={`/e/${entityId}/journals/${j.reversal_of}`}>
            {j.reversal_of_number}
          </Link>
        </div>
      )}
      {j.reversed_by && (
        <div className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Jurnal ini telah dibalik oleh{' '}
          <Link className="link" href={`/e/${entityId}/journals/${j.reversed_by}`}>
            {j.reversed_by_number}
          </Link>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="card overflow-hidden xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Akun</th>
                  <th>Deskripsi</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {j.lines.map((l) => (
                  <tr key={l.id}>
                    <td className={l.credit !== '0.00' ? 'pl-8' : ''}>
                      <span className="mr-2 font-mono text-xs text-muted-fg">{l.account_code}</span>
                      {l.account_name}
                    </td>
                    <td className="text-muted-fg">{l.description}</td>
                    <td className="num">{l.debit !== '0.00' ? amount(l.debit) : ''}</td>
                    <td className="num">{l.credit !== '0.00' ? amount(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-3 py-2" colSpan={2}>
                    Total {j.totals.balanced ? <Badge tone="success">Seimbang</Badge> : <Badge tone="danger">Selisih {amount(j.totals.difference)}</Badge>}
                  </td>
                  <td className="num px-3 py-2">{amount(j.totals.debit)}</td>
                  <td className="num px-3 py-2">{amount(j.totals.credit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className="card self-start">
          <div className="border-b border-line px-4 py-3 font-semibold">Alur & jejak audit</div>
          <ol className="space-y-3 p-4 text-sm">
            {j.history.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                <div>
                  <div className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</div>
                  <div className="text-xs text-muted-fg">
                    {h.actor} · {dateTime(h.created_at)}
                  </div>
                  {typeof h.data?.reason === 'string' && <div className="text-xs">Alasan: {h.data.reason}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <Modal open={reverseOpen} onClose={() => setReverseOpen(false)} title={`Balik jurnal ${j.number}`}>
        <p className="mb-4 text-sm text-muted-fg">Sistem akan memposting jurnal baru dengan debit/kredit ditukar. Jurnal asli tetap tersimpan dan ditandai “Dibalik”.</p>
        <div className="space-y-4">
          <Field label="Tanggal jurnal pembalik" htmlFor="rev-date" hint="Harus berada di periode yang terbuka">
            <input id="rev-date" type="date" className="input" value={revDate} min={j.journal_date} onChange={(e) => setRevDate(e.target.value)} />
          </Field>
          <Field label="Keterangan" htmlFor="rev-memo">
            <input id="rev-memo" className="input" value={revMemo} placeholder={`Pembalik ${j.number}`} onChange={(e) => setRevMemo(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setReverseOpen(false)}>
              Batal
            </button>
            <button className="btn-danger" disabled={busy} onClick={() => act('reverse', { date: revDate, memo: revMemo || null })}>
              Posting Jurnal Pembalik
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
