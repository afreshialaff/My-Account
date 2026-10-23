import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AccountSelect, ContactSelect, Empty, Field, JournalPreview, NumInput, PageHeader, StatCard, confirmDelete } from '../components/ui'
import { fmtDate, money, round2, startOfMonth, today, uid } from '../lib/format'
import { nextNumber } from '../lib/seed'
import type { Expense, ExpenseLine } from '../lib/types'
import { useLookups, useStore } from '../store/store'

export function expenseTotals(e: Expense) {
  const subtotal = round2(e.lines.reduce((s, l) => s + l.amount, 0))
  const tax = round2(e.lines.reduce((s, l) => s + round2((l.amount * (l.taxPct || 0)) / 100), 0))
  return { subtotal, tax, total: round2(subtotal + tax) }
}

export function ExpenseList() {
  const { data } = useStore()
  const { account, contact } = useLookups()
  const [q, setQ] = useState('')
  const list = [...data.expenses].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
  const filtered = list.filter((e) => !q || `${e.number} ${e.memo} ${contact.get(e.contactId ?? '')?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  const month = startOfMonth(today())
  const thisMonth = list.filter((e) => e.date >= month).reduce((s, e) => s + expenseTotals(e).total, 0)

  return (
    <div>
      <PageHeader
        title="Biaya"
        actions={
          <Link to="/biaya/new" className="btn-primary">
            <Plus size={16} /> Buat Biaya
          </Link>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Biaya bulan ini" value={money(thisMonth)} tone="amber" />
        <StatCard label="Total transaksi biaya" value={String(list.length)} tone="slate" />
      </div>
      <div className="card">
        <div className="p-4">
          <input className="input max-w-xs" placeholder="Cari biaya" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nomor</th>
                <th>Kategori</th>
                <th>Penerima</th>
                <th>Dibayar dari</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)}</td>
                  <td>
                    <Link className="font-medium text-brand-700 hover:underline" to={`/biaya/${e.id}`}>
                      {e.number}
                    </Link>
                  </td>
                  <td>{e.lines.map((l) => account.get(l.accountId)?.name).join(', ')}</td>
                  <td>{contact.get(e.contactId ?? '')?.name ?? '-'}</td>
                  <td>{account.get(e.payFromAccountId)?.name}</td>
                  <td className="num">{money(expenseTotals(e).total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <Empty>Belum ada biaya.</Empty>}
        </div>
      </div>
    </div>
  )
}

const blank = (): ExpenseLine => ({ id: uid('el'), accountId: '', description: '', amount: 0, taxPct: 0 })

export function ExpenseForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, upsert } = useStore()
  const existing = id ? data.expenses.find((e) => e.id === id) : undefined
  const [exp, setExp] = useState<Expense>(
    () =>
      existing ?? {
        id: uid('exp'),
        number: nextNumber('EXP-', data.expenses),
        date: today(),
        payFromAccountId: 'acc-1-10001',
        contactId: '',
        lines: [blank()],
        memo: '',
        createdAt: Date.now(),
      },
  )
  const [error, setError] = useState('')
  const setLine = (i: number, patch: Partial<ExpenseLine>) => setExp((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const t = expenseTotals(exp)

  const save = () => {
    const lines = exp.lines.filter((l) => l.accountId || l.amount)
    if (!exp.payFromAccountId) return setError('Pilih akun pembayaran.')
    if (!lines.length || lines.some((l) => !l.accountId || l.amount <= 0)) return setError('Setiap baris harus memiliki akun biaya dan jumlah > 0.')
    upsert('expenses', { ...exp, lines })
    nav(`/biaya/${exp.id}`)
  }

  return (
    <div>
      <PageHeader title={existing ? 'Ubah Biaya' : 'Buat Biaya'} back={{ to: '/biaya', label: 'Biaya' }} />
      <div className="card p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Bayar dari">
            <AccountSelect value={exp.payFromAccountId} onChange={(payFromAccountId) => setExp((x) => ({ ...x, payFromAccountId }))} categories={['cash_bank']} />
          </Field>
          <Field label="Penerima">
            <ContactSelect value={exp.contactId ?? ''} onChange={(contactId) => setExp((x) => ({ ...x, contactId }))} placeholder="(opsional)" />
          </Field>
          <Field label="Tanggal Transaksi">
            <input type="date" className="input" value={exp.date} onChange={(e) => setExp((x) => ({ ...x, date: e.target.value }))} />
          </Field>
          <Field label="Nomor">
            <input className="input" value={exp.number} onChange={(e) => setExp((x) => ({ ...x, number: e.target.value }))} />
          </Field>
        </div>
        <div className="-mx-4 mt-6 overflow-x-auto md:-mx-6">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th className="w-72">Akun Biaya</th>
                <th>Deskripsi</th>
                <th className="w-32">Pajak</th>
                <th className="w-44 num">Jumlah</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {exp.lines.map((l, i) => (
                <tr key={l.id}>
                  <td>
                    <AccountSelect value={l.accountId} onChange={(accountId) => setLine(i, { accountId })} exclude={['cash_bank', 'revenue', 'equity']} />
                  </td>
                  <td>
                    <input className="input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  </td>
                  <td>
                    <select className="input" value={l.taxPct} onChange={(e) => setLine(i, { taxPct: Number(e.target.value) })}>
                      <option value={0}>Tanpa Pajak</option>
                      <option value={11}>PPN 11%</option>
                      <option value={12}>PPN 12%</option>
                    </select>
                  </td>
                  <td>
                    <NumInput value={l.amount} onChange={(amount) => setLine(i, { amount })} />
                  </td>
                  <td>
                    <button className="p-1.5 text-slate-400 hover:text-red-600" onClick={() => setExp((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn-secondary mt-3" onClick={() => setExp((x) => ({ ...x, lines: [...x.lines, blank()] }))}>
          <Plus size={16} /> Tambah baris
        </button>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field label="Memo">
            <textarea className="input" value={exp.memo} onChange={(e) => setExp((x) => ({ ...x, memo: e.target.value }))} />
          </Field>
          <div className="space-y-1.5 text-sm md:ml-auto md:w-80">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{money(t.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Pajak (PPN Masukan)</span>
              <span>{money(t.tax)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold">
              <span>Total</span>
              <span>{money(t.total)}</span>
            </div>
          </div>
        </div>
        {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Link to="/biaya" className="btn-secondary">
            Batal
          </Link>
          <button className="btn-primary" onClick={save}>
            Simpan
          </button>
        </div>
      </div>
    </div>
  )
}

export function ExpenseDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, ledger, remove } = useStore()
  const { account, contact } = useLookups()
  const e = data.expenses.find((x) => x.id === id)
  if (!e) return <Empty>Biaya tidak ditemukan.</Empty>
  const t = expenseTotals(e)
  return (
    <div>
      <PageHeader
        title={`Biaya #${e.number}`}
        back={{ to: '/biaya', label: 'Biaya' }}
        actions={
          <>
            <button
              className="btn-danger"
              onClick={() => {
                if (!confirmDelete(`biaya ${e.number}`)) return
                remove('expenses', e.id)
                nav('/biaya')
              }}
            >
              <Trash2 size={16} /> Hapus
            </button>
            <Link to={`/biaya/${e.id}/edit`} className="btn-secondary">
              Ubah
            </Link>
          </>
        }
      />
      <div className="card mb-5 p-4 text-sm md:p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <div className="label">Bayar dari</div>
            {account.get(e.payFromAccountId)?.name}
          </div>
          <div>
            <div className="label">Penerima</div>
            {contact.get(e.contactId ?? '')?.name ?? '-'}
          </div>
          <div>
            <div className="label">Tanggal</div>
            {fmtDate(e.date)}
          </div>
          <div>
            <div className="label">Total</div>
            <span className="text-lg font-semibold">{money(t.total)}</span>
          </div>
        </div>
        {e.memo && <p className="mt-4 text-slate-500">{e.memo}</p>}
      </div>
      <JournalPreview entry={ledger.find((x) => x.sourceId === e.id)} />
    </div>
  )
}
