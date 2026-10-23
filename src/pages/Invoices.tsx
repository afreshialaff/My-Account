import { Plus, Printer, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AccountSelect,
  ContactSelect,
  Empty,
  Field,
  JournalPreview,
  NumInput,
  PageHeader,
  StatCard,
  StatusBadge,
  Tabs,
  confirmDelete,
} from '../components/ui'
import { addDays, daysBetween, fmtDate, money, round2, today, uid } from '../lib/format'
import { docTotals, invoicePaid, invoiceStatus, lineAmounts, type InvoiceStatus } from '../lib/ledger'
import { nextNumber } from '../lib/seed'
import type { AccountCategory, ContactType, DocLine, Invoice, Payment } from '../lib/types'
import { useLookups, useStore } from '../store/store'

export type Kind = 'sales' | 'purchase'

interface Cfg {
  collection: 'salesInvoices' | 'purchaseInvoices'
  title: string
  doc: string
  prefix: string
  payPrefix: string
  payKind: Payment['kind']
  payLabel: string
  base: string
  contactLabel: string
  contactTypes: ContactType[]
  lineAccounts: AccountCategory[]
}

export const CFG: Record<Kind, Cfg> = {
  sales: {
    collection: 'salesInvoices',
    title: 'Penjualan',
    doc: 'Faktur Penjualan',
    prefix: 'INV-',
    payPrefix: 'RP-',
    payKind: 'receive',
    payLabel: 'Terima Pembayaran',
    base: '/penjualan',
    contactLabel: 'Pelanggan',
    contactTypes: ['customer', 'other'],
    lineAccounts: ['revenue', 'other_income'],
  },
  purchase: {
    collection: 'purchaseInvoices',
    title: 'Pembelian',
    doc: 'Faktur Pembelian',
    prefix: 'PI-',
    payPrefix: 'PP-',
    payKind: 'pay',
    payLabel: 'Kirim Pembayaran',
    base: '/pembelian',
    contactLabel: 'Supplier',
    contactTypes: ['supplier', 'other'],
    lineAccounts: ['inventory', 'other_current_asset', 'fixed_asset', 'cogs', 'expense', 'other_expense'],
  },
}

/* ------------------------------------------------------------------ */

export function InvoiceList({ kind }: { kind: Kind }) {
  const cfg = CFG[kind]
  const { data } = useStore()
  const { contact, account } = useLookups()
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices')
  const [status, setStatus] = useState<InvoiceStatus | 'all' | 'open'>('all')
  const [q, setQ] = useState('')
  const now = today()

  const rows = useMemo(
    () =>
      data[cfg.collection]
        .map((inv) => ({ inv, ...invoiceStatus(data, inv, now) }))
        .sort((a, b) => (a.inv.date === b.inv.date ? b.inv.createdAt - a.inv.createdAt : a.inv.date < b.inv.date ? 1 : -1)),
    [data, cfg.collection, now],
  )
  const payments = data.payments
    .filter((p) => p.kind === cfg.payKind)
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))

  const open = rows.filter((r) => r.due > 0)
  const overdue = rows.filter((r) => r.status === 'overdue')
  const paid30 = payments
    .filter((p) => daysBetween(p.date, now) <= 30)
    .reduce((s, p) => s + p.allocations.reduce((x, a) => x + a.amount, 0), 0)

  const filtered = rows.filter((r) => {
    if (status === 'open' && r.due <= 0) return false
    if (status !== 'all' && status !== 'open' && r.status !== status) return false
    if (q) {
      const s = q.toLowerCase()
      return r.inv.number.toLowerCase().includes(s) || (contact.get(r.inv.contactId)?.name ?? '').toLowerCase().includes(s)
    }
    return true
  })

  return (
    <div>
      <PageHeader
        title={cfg.title}
        actions={
          <>
            <Link to={`${cfg.base}/pembayaran/new`} className="btn-secondary">
              {cfg.payLabel}
            </Link>
            <Link to={`${cfg.base}/new`} className="btn-primary">
              <Plus size={16} /> Buat {cfg.doc}
            </Link>
          </>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label={kind === 'sales' ? 'Piutang belum dibayar' : 'Hutang belum dibayar'} value={money(open.reduce((s, r) => s + r.due, 0))} tone="blue" hint={`${open.length} faktur`} />
        <StatCard label="Jatuh tempo" value={money(overdue.reduce((s, r) => s + r.due, 0))} tone="red" hint={`${overdue.length} faktur`} />
        <StatCard label={kind === 'sales' ? 'Pembayaran diterima (30 hari)' : 'Pembayaran dikirim (30 hari)'} value={money(paid30)} tone="green" />
      </div>
      <div className="card">
        <div className="px-4 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'invoices', label: 'Faktur', count: rows.length },
              { value: 'payments', label: 'Pembayaran', count: payments.length },
            ]}
          />
        </div>
        {tab === 'invoices' ? (
          <>
            <div className="flex flex-wrap gap-2 p-4">
              <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="all">Semua status</option>
                <option value="open">Belum lunas</option>
                <option value="unpaid">Belum dibayar</option>
                <option value="partial">Dibayar sebagian</option>
                <option value="overdue">Jatuh tempo</option>
                <option value="paid">Lunas</option>
              </select>
              <input className="input max-w-xs" placeholder={`Cari nomor / ${cfg.contactLabel.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Nomor</th>
                    <th>{cfg.contactLabel}</th>
                    <th>Jatuh Tempo</th>
                    <th>Status</th>
                    <th className="num">Sisa Tagihan</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.inv.id}>
                      <td>{fmtDate(r.inv.date)}</td>
                      <td>
                        <Link className="font-medium text-brand-700 hover:underline" to={`${cfg.base}/${r.inv.id}`}>
                          {r.inv.number}
                        </Link>
                      </td>
                      <td>{contact.get(r.inv.contactId)?.name}</td>
                      <td>{fmtDate(r.inv.dueDate)}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="num">{money(r.due)}</td>
                      <td className="num">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && <Empty>Belum ada faktur.</Empty>}
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Nomor</th>
                  <th>{cfg.contactLabel}</th>
                  <th>Akun</th>
                  <th className="num">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.date)}</td>
                    <td>
                      <Link className="font-medium text-brand-700 hover:underline" to={`${cfg.base}/pembayaran/${p.id}`}>
                        {p.number}
                      </Link>
                    </td>
                    <td>{contact.get(p.contactId)?.name}</td>
                    <td>{account.get(p.accountId)?.name}</td>
                    <td className="num">{money(p.allocations.reduce((s, a) => s + a.amount, 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!payments.length && <Empty>Belum ada pembayaran.</Empty>}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const TAX_OPTIONS = [
  { v: 0, l: 'Tanpa Pajak' },
  { v: 11, l: 'PPN 11%' },
  { v: 12, l: 'PPN 12%' },
]

function blankLine(): DocLine {
  return { id: uid('ln'), description: '', qty: 1, price: 0, discountPct: 0, taxPct: 0 }
}

export function InvoiceForm({ kind }: { kind: Kind }) {
  const cfg = CFG[kind]
  const { id } = useParams()
  const nav = useNavigate()
  const { data, upsert } = useStore()
  const { product } = useLookups()
  const existing = id ? data[cfg.collection].find((x) => x.id === id) : undefined
  const paid = existing ? invoicePaid(data, existing.id) : 0

  const [inv, setInv] = useState<Invoice>(
    () =>
      existing ?? {
        id: uid(kind === 'sales' ? 'si' : 'pi'),
        number: nextNumber(cfg.prefix, data[cfg.collection]),
        contactId: '',
        date: today(),
        dueDate: addDays(today(), 30),
        lines: [blankLine()],
        memo: '',
        createdAt: Date.now(),
      },
  )
  const [error, setError] = useState('')
  const set = (patch: Partial<Invoice>) => setInv((x) => ({ ...x, ...patch }))
  const setLine = (i: number, patch: Partial<DocLine>) => setInv((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const totals = docTotals(inv.lines)
  const terms = daysBetween(inv.date, inv.dueDate)

  const pickProduct = (i: number, pid: string) => {
    const p = product.get(pid)
    if (!p) return setLine(i, { productId: undefined })
    setLine(i, { productId: p.id, accountId: undefined, description: p.name, price: kind === 'sales' ? p.sellPrice : p.buyPrice })
  }

  const save = () => {
    if (!inv.contactId) return setError(`Pilih ${cfg.contactLabel.toLowerCase()} terlebih dahulu.`)
    const lines = inv.lines.filter((l) => l.productId || l.accountId || l.description || l.price)
    if (!lines.length) return setError('Tambahkan minimal satu baris.')
    if (lines.some((l) => !l.productId && !l.accountId)) return setError('Setiap baris harus memiliki produk atau akun.')
    if (lines.some((l) => l.qty <= 0)) return setError('Kuantitas harus lebih dari 0.')
    if (inv.dueDate < inv.date) return setError('Tanggal jatuh tempo tidak boleh sebelum tanggal transaksi.')
    if (docTotals(lines).total < paid) return setError(`Total tidak boleh lebih kecil dari pembayaran yang sudah diterima (${money(paid)}).`)
    if (data[cfg.collection].some((x) => x.number === inv.number && x.id !== inv.id)) return setError('Nomor transaksi sudah digunakan.')
    upsert(cfg.collection, { ...inv, lines })
    nav(`${cfg.base}/${inv.id}`)
  }

  return (
    <div>
      <PageHeader title={`${existing ? 'Ubah' : 'Buat'} ${cfg.doc}`} back={{ to: cfg.base, label: cfg.title }} />
      <div className="card p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label={cfg.contactLabel} className="md:col-span-2">
            <ContactSelect value={inv.contactId} onChange={(contactId) => set({ contactId })} types={cfg.contactTypes} placeholder={`Pilih ${cfg.contactLabel.toLowerCase()}`} />
          </Field>
          <Field label="Nomor Transaksi">
            <input className="input" value={inv.number} onChange={(e) => set({ number: e.target.value })} />
          </Field>
          <div />
          <Field label="Tanggal Transaksi">
            <input type="date" className="input" value={inv.date} onChange={(e) => set({ date: e.target.value, dueDate: addDays(e.target.value, Math.max(terms, 0)) })} />
          </Field>
          <Field label="Syarat Pembayaran">
            <select className="input" value={[0, 15, 30, 45, 60].includes(terms) ? terms : 'custom'} onChange={(e) => e.target.value !== 'custom' && set({ dueDate: addDays(inv.date, Number(e.target.value)) })}>
              <option value={0}>Tunai / COD</option>
              <option value={15}>Net 15</option>
              <option value={30}>Net 30</option>
              <option value={45}>Net 45</option>
              <option value={60}>Net 60</option>
              <option value="custom">Kustom</option>
            </select>
          </Field>
          <Field label="Tanggal Jatuh Tempo">
            <input type="date" className="input" value={inv.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </Field>
        </div>

        <div className="-mx-4 mt-6 overflow-x-auto md:-mx-6">
          <table className="table min-w-[900px]">
            <thead>
              <tr>
                <th className="w-56">Produk / Akun</th>
                <th>Deskripsi</th>
                <th className="w-20">Kuantitas</th>
                <th className="w-32">Harga Satuan</th>
                <th className="w-20">Diskon %</th>
                <th className="w-32">Pajak</th>
                <th className="w-36 num">Jumlah</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => {
                const p = l.productId ? product.get(l.productId) : undefined
                return (
                  <tr key={l.id} className="align-top">
                    <td>
                      <select className="input" value={l.productId ?? ''} onChange={(e) => pickProduct(i, e.target.value)}>
                        <option value="">— Tanpa produk (pilih akun) —</option>
                        {data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} · {p.name}
                          </option>
                        ))}
                      </select>
                      {!l.productId && (
                        <AccountSelect className="input mt-1" value={l.accountId ?? ''} onChange={(accountId) => setLine(i, { accountId })} categories={cfg.lineAccounts} />
                      )}
                    </td>
                    <td>
                      <input className="input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    </td>
                    <td>
                      <NumInput value={l.qty} onChange={(qty) => setLine(i, { qty })} min={0} />
                      {p && <div className="mt-0.5 text-right text-[11px] text-slate-400">{p.unit}</div>}
                    </td>
                    <td>
                      <NumInput value={l.price} onChange={(price) => setLine(i, { price })} />
                    </td>
                    <td>
                      <NumInput value={l.discountPct} onChange={(discountPct) => setLine(i, { discountPct })} />
                    </td>
                    <td>
                      <select className="input" value={l.taxPct} onChange={(e) => setLine(i, { taxPct: Number(e.target.value) })}>
                        {TAX_OPTIONS.map((t) => (
                          <option key={t.v} value={t.v}>
                            {t.l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num pt-3.5 font-medium">{money(lineAmounts(l).net, false)}</td>
                    <td>
                      <button className="p-1.5 text-slate-400 hover:text-red-600" onClick={() => setInv((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} aria-label="Hapus baris">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button className="btn-secondary mt-3" onClick={() => setInv((x) => ({ ...x, lines: [...x.lines, blankLine()] }))}>
          <Plus size={16} /> Tambah baris
        </button>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field label="Memo">
            <textarea className="input min-h-[80px]" value={inv.memo} onChange={(e) => set({ memo: e.target.value })} />
          </Field>
          <TotalsBox totals={totals} paid={paid} />
        </div>

        {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Link to={existing ? `${cfg.base}/${inv.id}` : cfg.base} className="btn-secondary">
            Batal
          </Link>
          <button className="btn-primary" onClick={save}>
            {existing ? 'Simpan Perubahan' : `Buat ${cfg.doc}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function TotalsBox({ totals, paid }: { totals: ReturnType<typeof docTotals>; paid?: number }) {
  return (
    <div className="space-y-1.5 text-sm md:ml-auto md:w-80">
      <Row label="Subtotal" value={money(totals.subtotal)} />
      {totals.discount > 0 && <Row label="Diskon" value={`-${money(totals.discount)}`} />}
      <Row label="Pajak (PPN)" value={money(totals.tax)} />
      <div className="border-t border-slate-200 pt-1.5">
        <Row label="Total" value={money(totals.total)} bold />
      </div>
      {paid !== undefined && paid > 0 && (
        <>
          <Row label="Sudah dibayar" value={`-${money(paid)}`} />
          <Row label="Sisa tagihan" value={money(round2(totals.total - paid))} bold />
        </>
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'text-base font-semibold text-slate-900' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function InvoiceDetail({ kind }: { kind: Kind }) {
  const cfg = CFG[kind]
  const { id } = useParams()
  const nav = useNavigate()
  const { data, ledger, remove } = useStore()
  const { contact, product, account } = useLookups()
  const inv = data[cfg.collection].find((x) => x.id === id)
  if (!inv) return <Empty>Faktur tidak ditemukan.</Empty>
  const st = invoiceStatus(data, inv, today())
  const totals = docTotals(inv.lines)
  const c = contact.get(inv.contactId)
  const payments = data.payments.filter((p) => p.allocations.some((a) => a.invoiceId === inv.id))
  const entry = ledger.find((e) => e.sourceId === inv.id)

  const del = () => {
    if (payments.length) return alert('Faktur ini sudah memiliki pembayaran. Hapus pembayaran terlebih dahulu.')
    if (!confirmDelete(`${cfg.doc} ${inv.number}`)) return
    remove(cfg.collection, inv.id)
    nav(cfg.base)
  }

  return (
    <div>
      <PageHeader
        title={`${cfg.doc} #${inv.number}`}
        subtitle={<StatusBadge status={st.status} />}
        back={{ to: cfg.base, label: cfg.title }}
        actions={
          <>
            <button className="btn-secondary" onClick={() => window.print()}>
              <Printer size={16} /> Cetak
            </button>
            <button className="btn-danger" onClick={del}>
              <Trash2 size={16} /> Hapus
            </button>
            <Link to={`${cfg.base}/${inv.id}/edit`} className="btn-secondary">
              Ubah
            </Link>
            {st.due > 0 && (
              <Link to={`${cfg.base}/pembayaran/new?invoice=${inv.id}`} className="btn-primary">
                {cfg.payLabel}
              </Link>
            )}
          </>
        }
      />
      <div className="card mb-5 p-4 md:p-6">
        <div className="grid gap-4 text-sm md:grid-cols-4">
          <Info label={cfg.contactLabel} value={<Link className="text-brand-700 hover:underline" to={`/kontak/${c?.id}`}>{c?.name}</Link>} />
          <Info label="Tanggal Transaksi" value={fmtDate(inv.date)} />
          <Info label="Jatuh Tempo" value={fmtDate(inv.dueDate)} />
          <Info label="Sisa Tagihan" value={<span className="text-lg font-semibold">{money(st.due)}</span>} />
        </div>
        <div className="-mx-4 mt-6 overflow-x-auto md:-mx-6">
          <table className="table">
            <thead>
              <tr>
                <th>Produk / Akun</th>
                <th>Deskripsi</th>
                <th className="num">Kuantitas</th>
                <th className="num">Harga</th>
                <th className="num">Diskon</th>
                <th className="num">Pajak</th>
                <th className="num">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => {
                const p = l.productId ? product.get(l.productId) : undefined
                return (
                  <tr key={l.id}>
                    <td>{p ? `${p.code} · ${p.name}` : account.get(l.accountId ?? '')?.name}</td>
                    <td className="text-slate-500">{l.description}</td>
                    <td className="num">
                      {l.qty} {p?.unit}
                    </td>
                    <td className="num">{money(l.price, false)}</td>
                    <td className="num">{l.discountPct ? `${l.discountPct}%` : '-'}</td>
                    <td className="num">{l.taxPct ? `PPN ${l.taxPct}%` : '-'}</td>
                    <td className="num">{money(lineAmounts(l).net, false)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="text-sm text-slate-500">{inv.memo && <><div className="label">Memo</div>{inv.memo}</>}</div>
          <TotalsBox totals={totals} paid={st.paid} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Riwayat Pembayaran</div>
          <table className="table">
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.date)}</td>
                  <td>
                    <Link className="text-brand-700 hover:underline" to={`${cfg.base}/pembayaran/${p.id}`}>
                      {p.number}
                    </Link>
                  </td>
                  <td>{account.get(p.accountId)?.name}</td>
                  <td className="num">{money(p.allocations.find((a) => a.invoiceId === inv.id)?.amount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payments.length && <Empty>Belum ada pembayaran.</Empty>}
        </div>
        <JournalPreview entry={entry} />
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-slate-800">{value}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function PaymentForm({ kind }: { kind: Kind }) {
  const cfg = CFG[kind]
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { data, ledger, upsert, remove } = useStore()
  const existing = id ? data.payments.find((p) => p.id === id) : undefined
  const preInv = sp.get('invoice') ? data[cfg.collection].find((i) => i.id === sp.get('invoice')) : undefined

  const [pay, setPay] = useState<Payment>(() => {
    if (existing) return existing
    const due = preInv ? round2(docTotals(preInv.lines).total - invoicePaid(data, preInv.id)) : 0
    return {
      id: uid('pay'),
      kind: cfg.payKind,
      number: nextNumber(cfg.payPrefix, data.payments),
      date: today(),
      contactId: preInv?.contactId ?? '',
      accountId: 'acc-1-10002',
      allocations: preInv ? [{ invoiceId: preInv.id, amount: due }] : [],
      memo: '',
      createdAt: Date.now(),
    }
  })
  const [error, setError] = useState('')

  // Invoices of this contact that still have a balance (excluding this payment's own allocation).
  const candidates = data[cfg.collection]
    .filter((i) => i.contactId === pay.contactId)
    .map((i) => {
      const own = existing?.allocations.find((a) => a.invoiceId === i.id)?.amount ?? 0
      const due = round2(docTotals(i.lines).total - invoicePaid(data, i.id) + own)
      return { inv: i, due }
    })
    .filter((x) => x.due > 0)
    .sort((a, b) => (a.inv.date < b.inv.date ? -1 : 1))

  const amountFor = (invoiceId: string) => pay.allocations.find((a) => a.invoiceId === invoiceId)?.amount ?? 0
  const setAmount = (invoiceId: string, amount: number) =>
    setPay((p) => ({
      ...p,
      allocations: [...p.allocations.filter((a) => a.invoiceId !== invoiceId), ...(amount > 0 ? [{ invoiceId, amount }] : [])],
    }))
  const total = round2(pay.allocations.reduce((s, a) => s + a.amount, 0))

  const save = () => {
    if (!pay.contactId) return setError(`Pilih ${cfg.contactLabel.toLowerCase()}.`)
    if (!pay.accountId) return setError('Pilih akun kas/bank.')
    if (total <= 0) return setError('Masukkan jumlah pembayaran.')
    for (const a of pay.allocations) {
      const c = candidates.find((x) => x.inv.id === a.invoiceId)
      if (!c || a.amount > c.due + 0.001) return setError('Jumlah pembayaran melebihi sisa tagihan.')
    }
    upsert('payments', pay)
    nav(`${cfg.base}/pembayaran/${pay.id}`)
  }

  const readOnly = !!existing && !sp.has('edit')

  if (readOnly) {
    const entry = ledger.find((e) => e.sourceId === pay.id)
    return (
      <div>
        <PageHeader
          title={`${cfg.payLabel} #${pay.number}`}
          back={{ to: cfg.base, label: cfg.title }}
          actions={
            <>
              <button
                className="btn-danger"
                onClick={() => {
                  if (!confirmDelete(`pembayaran ${pay.number}`)) return
                  remove('payments', pay.id)
                  nav(cfg.base)
                }}
              >
                <Trash2 size={16} /> Hapus
              </button>
              <Link className="btn-secondary" to={`${cfg.base}/pembayaran/${pay.id}?edit`}>
                Ubah
              </Link>
            </>
          }
        />
        <div className="card mb-5 p-4 text-sm md:p-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Info label={cfg.contactLabel} value={data.contacts.find((c) => c.id === pay.contactId)?.name} />
            <Info label="Tanggal" value={fmtDate(pay.date)} />
            <Info label={kind === 'sales' ? 'Setor ke' : 'Bayar dari'} value={data.accounts.find((a) => a.id === pay.accountId)?.name} />
            <Info label="Total" value={<span className="text-lg font-semibold">{money(total)}</span>} />
          </div>
          <table className="table mt-5">
            <thead>
              <tr>
                <th>Faktur</th>
                <th className="num">Jumlah dibayar</th>
              </tr>
            </thead>
            <tbody>
              {pay.allocations.map((a) => {
                const inv = data[cfg.collection].find((i) => i.id === a.invoiceId)
                return (
                  <tr key={a.invoiceId}>
                    <td>
                      <Link className="text-brand-700 hover:underline" to={`${cfg.base}/${a.invoiceId}`}>
                        {inv?.number}
                      </Link>
                    </td>
                    <td className="num">{money(a.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <JournalPreview entry={entry} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={cfg.payLabel} back={{ to: cfg.base, label: cfg.title }} />
      <div className="card p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label={cfg.contactLabel} className="md:col-span-2">
            <ContactSelect value={pay.contactId} onChange={(contactId) => setPay((p) => ({ ...p, contactId, allocations: [] }))} types={cfg.contactTypes} />
          </Field>
          <Field label={kind === 'sales' ? 'Setor ke' : 'Bayar dari'}>
            <AccountSelect value={pay.accountId} onChange={(accountId) => setPay((p) => ({ ...p, accountId }))} categories={['cash_bank']} />
          </Field>
          <Field label="Nomor">
            <input className="input" value={pay.number} onChange={(e) => setPay((p) => ({ ...p, number: e.target.value }))} />
          </Field>
          <Field label="Tanggal Pembayaran">
            <input type="date" className="input" value={pay.date} onChange={(e) => setPay((p) => ({ ...p, date: e.target.value }))} />
          </Field>
        </div>
        <div className="-mx-4 mt-6 overflow-x-auto md:-mx-6">
          <table className="table">
            <thead>
              <tr>
                <th>Nomor Faktur</th>
                <th>Tanggal</th>
                <th>Jatuh Tempo</th>
                <th className="num">Sisa Tagihan</th>
                <th className="w-48 num">Jumlah Bayar</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(({ inv, due }) => (
                <tr key={inv.id}>
                  <td>{inv.number}</td>
                  <td>{fmtDate(inv.date)}</td>
                  <td>{fmtDate(inv.dueDate)}</td>
                  <td className="num">
                    <button className="text-brand-700 hover:underline" onClick={() => setAmount(inv.id, due)}>
                      {money(due)}
                    </button>
                  </td>
                  <td>
                    <NumInput value={amountFor(inv.id)} onChange={(n) => setAmount(inv.id, n)} min={0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!candidates.length && <Empty>{pay.contactId ? 'Tidak ada faktur terbuka untuk kontak ini.' : `Pilih ${cfg.contactLabel.toLowerCase()} untuk melihat faktur terbuka.`}</Empty>}
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field label="Memo">
            <textarea className="input" value={pay.memo} onChange={(e) => setPay((p) => ({ ...p, memo: e.target.value }))} />
          </Field>
          <div className="md:ml-auto md:w-80">
            <Row label="Total Pembayaran" value={money(total)} bold />
          </div>
        </div>
        {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Link to={cfg.base} className="btn-secondary">
            Batal
          </Link>
          <button className="btn-primary" onClick={save}>
            Simpan Pembayaran
          </button>
        </div>
      </div>
    </div>
  )
}
