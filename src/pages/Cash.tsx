import { ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AccountSelect, ContactSelect, Empty, Field, JournalPreview, NumInput, PageHeader, confirmDelete } from '../components/ui'
import { acct, fmtDate, money, round2, today, uid } from '../lib/format'
import { balanceOf, generalLedger, SOURCE_LABEL, sortAccounts } from '../lib/ledger'
import { nextNumber } from '../lib/seed'
import type { CashLine, CashTransaction, LedgerEntry } from '../lib/types'
import { useLookups, useStore } from '../store/store'

/** Path to the document that produced a ledger entry. */
export function sourcePath(e: LedgerEntry): string {
  switch (e.sourceType) {
    case 'sales_invoice':
      return `/penjualan/${e.sourceId}`
    case 'purchase_invoice':
      return `/pembelian/${e.sourceId}`
    case 'receive_payment':
      return `/penjualan/pembayaran/${e.sourceId}`
    case 'purchase_payment':
      return `/pembelian/pembayaran/${e.sourceId}`
    case 'expense':
      return `/biaya/${e.sourceId}`
    case 'bank_transfer':
    case 'bank_deposit':
    case 'bank_withdrawal':
      return `/kas-bank/transaksi/${e.sourceId}`
    case 'journal':
      return `/jurnal/${e.sourceId}`
    case 'opening':
      return `/produk/${e.sourceId}`
  }
}

export function CashList() {
  const { data, ledger } = useStore()
  const accounts = sortAccounts(data.accounts.filter((a) => a.category === 'cash_bank'))
  const total = accounts.reduce((s, a) => s + balanceOf(ledger, a), 0)
  return (
    <div>
      <PageHeader
        title="Kas & Bank"
        actions={
          <>
            <Link to="/kas-bank/transfer/new" className="btn-secondary">
              <ArrowLeftRight size={16} /> Transfer Dana
            </Link>
            <Link to="/kas-bank/terima/new" className="btn-secondary">
              <ArrowDownLeft size={16} /> Terima Uang
            </Link>
            <Link to="/kas-bank/kirim/new" className="btn-primary">
              <ArrowUpRight size={16} /> Kirim Uang
            </Link>
          </>
        }
      />
      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Kode Akun</th>
              <th>Nama Akun</th>
              <th className="num">Saldo di MyAccount</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.code}</td>
                <td>
                  <Link className="font-medium text-brand-700 hover:underline" to={`/kas-bank/${a.id}`}>
                    {a.name}
                  </Link>
                </td>
                <td className="num">{money(balanceOf(ledger, a))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-3 py-2" colSpan={2}>
                Total
              </td>
              <td className="num px-3 py-2">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="border-t border-slate-100 p-3 text-xs text-slate-500">
          Tambahkan rekening bank baru melalui <Link className="text-brand-700 hover:underline" to="/akun/new?category=cash_bank">Daftar Akun</Link>.
        </div>
      </div>
    </div>
  )
}

export function CashAccount() {
  const { id } = useParams()
  const { data, ledger } = useStore()
  const { contact } = useLookups()
  const gl = useMemo(() => (id ? generalLedger(data, ledger, id, {}) : undefined), [data, ledger, id])
  if (!gl?.account) return <Empty>Akun tidak ditemukan.</Empty>
  const rows = [...gl.rows].reverse()
  return (
    <div>
      <PageHeader title={gl.account.name} subtitle={`(${gl.account.code}) · Saldo ${money(gl.closing)}`} back={{ to: '/kas-bank', label: 'Kas & Bank' }} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Deskripsi</th>
              <th>Referensi</th>
              <th>Kontak</th>
              <th className="num">Terima</th>
              <th className="num">Kirim</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{fmtDate(r.entry.date)}</td>
                <td>{SOURCE_LABEL[r.entry.sourceType]}</td>
                <td>
                  <Link className="text-brand-700 hover:underline" to={sourcePath(r.entry)}>
                    {r.entry.number}
                  </Link>
                </td>
                <td>{contact.get(r.entry.contactId ?? '')?.name ?? '-'}</td>
                <td className="num">{r.line.debit ? acct(r.line.debit) : ''}</td>
                <td className="num">{r.line.credit ? acct(r.line.credit) : ''}</td>
                <td className="num">{acct(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty>Belum ada transaksi.</Empty>}
      </div>
    </div>
  )
}

const KIND_INFO = {
  transfer: { title: 'Transfer Dana', prefix: 'BT-' },
  receive: { title: 'Terima Uang', prefix: 'BD-' },
  spend: { title: 'Kirim Uang', prefix: 'BW-' },
} as const

const blankLine = (): CashLine => ({ id: uid('cl'), accountId: '', description: '', amount: 0 })

export function CashForm({ kind: kindProp }: { kind?: CashTransaction['kind'] }) {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, upsert } = useStore()
  const existing = id ? data.cashTransactions.find((c) => c.id === id) : undefined
  const kind = existing?.kind ?? kindProp ?? 'spend'
  const info = KIND_INFO[kind]
  const [tx, setTx] = useState<CashTransaction>(
    () =>
      existing ?? {
        id: uid('ct'),
        kind,
        number: nextNumber(info.prefix, data.cashTransactions),
        date: today(),
        accountId: 'acc-1-10002',
        toAccountId: kind === 'transfer' ? 'acc-1-10001' : undefined,
        amount: 0,
        contactId: '',
        lines: kind === 'transfer' ? [] : [blankLine()],
        memo: '',
        createdAt: Date.now(),
      },
  )
  const [error, setError] = useState('')
  const setLine = (i: number, patch: Partial<CashLine>) => setTx((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const total = kind === 'transfer' ? tx.amount ?? 0 : round2(tx.lines.reduce((s, l) => s + l.amount, 0))

  const save = () => {
    if (!tx.accountId) return setError('Pilih akun kas/bank.')
    if (kind === 'transfer') {
      if (!tx.toAccountId || tx.toAccountId === tx.accountId) return setError('Pilih akun tujuan yang berbeda.')
      if (!(tx.amount! > 0)) return setError('Masukkan jumlah transfer.')
      upsert('cashTransactions', tx)
    } else {
      const lines = tx.lines.filter((l) => l.accountId || l.amount)
      if (!lines.length || lines.some((l) => !l.accountId || l.amount <= 0)) return setError('Setiap baris harus memiliki akun dan jumlah > 0.')
      upsert('cashTransactions', { ...tx, lines })
    }
    nav(`/kas-bank/transaksi/${tx.id}`)
  }

  return (
    <div>
      <PageHeader title={`${existing ? 'Ubah ' : ''}${info.title}`} back={{ to: '/kas-bank', label: 'Kas & Bank' }} />
      <div className="card p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label={kind === 'transfer' ? 'Transfer dari' : kind === 'receive' ? 'Setor ke' : 'Bayar dari'}>
            <AccountSelect value={tx.accountId} onChange={(accountId) => setTx((x) => ({ ...x, accountId }))} categories={['cash_bank']} />
          </Field>
          {kind === 'transfer' ? (
            <>
              <Field label="Setor ke">
                <AccountSelect value={tx.toAccountId ?? ''} onChange={(toAccountId) => setTx((x) => ({ ...x, toAccountId }))} categories={['cash_bank']} />
              </Field>
              <Field label="Jumlah">
                <NumInput value={tx.amount ?? 0} onChange={(amount) => setTx((x) => ({ ...x, amount }))} />
              </Field>
            </>
          ) : (
            <Field label={kind === 'receive' ? 'Yang membayar' : 'Penerima'}>
              <ContactSelect value={tx.contactId ?? ''} onChange={(contactId) => setTx((x) => ({ ...x, contactId }))} placeholder="(opsional)" />
            </Field>
          )}
          <Field label="Tanggal">
            <input type="date" className="input" value={tx.date} onChange={(e) => setTx((x) => ({ ...x, date: e.target.value }))} />
          </Field>
          <Field label="Nomor">
            <input className="input" value={tx.number} onChange={(e) => setTx((x) => ({ ...x, number: e.target.value }))} />
          </Field>
        </div>

        {kind !== 'transfer' && (
          <>
            <div className="-mx-4 mt-6 overflow-x-auto md:-mx-6">
              <table className="table min-w-[640px]">
                <thead>
                  <tr>
                    <th className="w-72">{kind === 'receive' ? 'Terima dari akun' : 'Bayar untuk akun'}</th>
                    <th>Deskripsi</th>
                    <th className="w-44 num">Jumlah</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {tx.lines.map((l, i) => (
                    <tr key={l.id}>
                      <td>
                        <AccountSelect value={l.accountId} onChange={(accountId) => setLine(i, { accountId })} exclude={['cash_bank']} />
                      </td>
                      <td>
                        <input className="input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                      </td>
                      <td>
                        <NumInput value={l.amount} onChange={(amount) => setLine(i, { amount })} />
                      </td>
                      <td>
                        <button className="p-1.5 text-slate-400 hover:text-red-600" onClick={() => setTx((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-secondary mt-3" onClick={() => setTx((x) => ({ ...x, lines: [...x.lines, blankLine()] }))}>
              <Plus size={16} /> Tambah baris
            </button>
          </>
        )}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field label="Memo">
            <textarea className="input" value={tx.memo} onChange={(e) => setTx((x) => ({ ...x, memo: e.target.value }))} />
          </Field>
          <div className="flex justify-between text-base font-semibold md:ml-auto md:w-80">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
        </div>
        {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Link to="/kas-bank" className="btn-secondary">
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

export function CashDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, ledger, remove } = useStore()
  const { account, contact } = useLookups()
  const tx = data.cashTransactions.find((c) => c.id === id)
  if (!tx) return <Empty>Transaksi tidak ditemukan.</Empty>
  const total = tx.kind === 'transfer' ? tx.amount ?? 0 : tx.lines.reduce((s, l) => s + l.amount, 0)
  return (
    <div>
      <PageHeader
        title={`${KIND_INFO[tx.kind].title} #${tx.number}`}
        back={{ to: '/kas-bank', label: 'Kas & Bank' }}
        actions={
          <>
            <button
              className="btn-danger"
              onClick={() => {
                if (!confirmDelete(`transaksi ${tx.number}`)) return
                remove('cashTransactions', tx.id)
                nav('/kas-bank')
              }}
            >
              <Trash2 size={16} /> Hapus
            </button>
            <Link to={`/kas-bank/transaksi/${tx.id}/edit`} className="btn-secondary">
              Ubah
            </Link>
          </>
        }
      />
      <div className="card mb-5 grid gap-4 p-4 text-sm md:grid-cols-4 md:p-6">
        <div>
          <div className="label">Akun</div>
          {account.get(tx.accountId)?.name}
          {tx.toAccountId && ` → ${account.get(tx.toAccountId)?.name}`}
        </div>
        <div>
          <div className="label">Kontak</div>
          {contact.get(tx.contactId ?? '')?.name ?? '-'}
        </div>
        <div>
          <div className="label">Tanggal</div>
          {fmtDate(tx.date)}
        </div>
        <div>
          <div className="label">Total</div>
          <span className="text-lg font-semibold">{money(total)}</span>
        </div>
      </div>
      <JournalPreview entry={ledger.find((e) => e.sourceId === tx.id)} />
    </div>
  )
}
