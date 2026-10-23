import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AccountSelect, Empty, Field, NumInput, PageHeader, StatusBadge, Tabs, confirmDelete } from '../components/ui'
import { CATEGORIES, CATEGORY_ORDER, SYS } from '../lib/coa'
import { acct, fmtDate, money, today, uid } from '../lib/format'
import { accountTotals, computeCosting, generalLedger, invoiceStatus, normalBalance, SOURCE_LABEL, sortAccounts } from '../lib/ledger'
import type { Account, AccountCategory, Contact, ContactType, Product } from '../lib/types'
import { useLookups, useStore } from '../store/store'
import { sourcePath } from './Cash'

/* ============================== PRODUCTS ============================== */

export function ProductList() {
  const { data } = useStore()
  const { stock } = useMemo(() => computeCosting(data), [data])
  const [q, setQ] = useState('')
  const list = data.products.filter((p) => !q || `${p.code} ${p.name}`.toLowerCase().includes(q.toLowerCase()))
  const totalValue = data.products.reduce((s, p) => s + (stock.get(p.id)?.value ?? 0), 0)
  const low = data.products.filter((p) => p.trackInventory && (stock.get(p.id)?.qty ?? 0) <= 3).length
  return (
    <div>
      <PageHeader
        title="Produk"
        actions={
          <Link to="/produk/new" className="btn-primary">
            <Plus size={16} /> Buat Produk
          </Link>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-medium uppercase text-slate-500">Nilai persediaan</div>
          <div className="mt-1 text-xl font-semibold">{money(totalValue)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium uppercase text-slate-500">Stok menipis (≤ 3)</div>
          <div className="mt-1 text-xl font-semibold text-amber-600">{low}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-medium uppercase text-slate-500">Jumlah produk</div>
          <div className="mt-1 text-xl font-semibold">{data.products.length}</div>
        </div>
      </div>
      <div className="card">
        <div className="p-4">
          <input className="input max-w-xs" placeholder="Cari produk" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Produk</th>
                <th className="num">Qty</th>
                <th>Satuan</th>
                <th className="num">HPP Rata-rata</th>
                <th className="num">Harga Beli</th>
                <th className="num">Harga Jual</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = stock.get(p.id)
                return (
                  <tr key={p.id}>
                    <td>{p.code}</td>
                    <td>
                      <Link className="font-medium text-brand-700 hover:underline" to={`/produk/${p.id}`}>
                        {p.name}
                      </Link>
                      {!p.trackInventory && <span className="badge ml-2 bg-slate-100 text-slate-500">Jasa / non-stok</span>}
                    </td>
                    <td className={`num ${p.trackInventory && (s?.qty ?? 0) <= 3 ? 'font-semibold text-amber-600' : ''}`}>{p.trackInventory ? s?.qty ?? 0 : '-'}</td>
                    <td>{p.unit}</td>
                    <td className="num">{p.trackInventory ? money(s?.avgCost ?? p.buyPrice, false) : '-'}</td>
                    <td className="num">{money(p.buyPrice, false)}</td>
                    <td className="num">{money(p.sellPrice, false)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!list.length && <Empty>Belum ada produk.</Empty>}
        </div>
      </div>
    </div>
  )
}

export function ProductForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, upsert, remove } = useStore()
  const existing = id ? data.products.find((p) => p.id === id) : undefined
  const [p, setP] = useState<Product>(
    () =>
      existing ?? {
        id: uid('p'),
        code: '',
        name: '',
        unit: 'Pcs',
        sellPrice: 0,
        buyPrice: 0,
        trackInventory: true,
        salesAccountId: SYS.revenue,
        purchaseAccountId: SYS.inventory,
        cogsAccountId: SYS.cogs,
        openingQty: 0,
        openingCost: 0,
        openingDate: today(),
      },
  )
  const [error, setError] = useState('')
  const used = existing && [...data.salesInvoices, ...data.purchaseInvoices].some((i) => i.lines.some((l) => l.productId === existing.id))
  const set = (patch: Partial<Product>) => setP((x) => ({ ...x, ...patch }))

  const save = () => {
    if (!p.name.trim()) return setError('Nama produk wajib diisi.')
    if (!p.code.trim()) return setError('Kode produk wajib diisi.')
    if (data.products.some((x) => x.code === p.code && x.id !== p.id)) return setError('Kode produk sudah digunakan.')
    upsert('products', p)
    nav('/produk')
  }

  return (
    <div>
      <PageHeader title={existing ? existing.name : 'Buat Produk'} back={{ to: '/produk', label: 'Produk' }} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-4 md:p-6 lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nama Produk">
              <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Kode / SKU">
              <input className="input" value={p.code} onChange={(e) => set({ code: e.target.value })} />
            </Field>
            <Field label="Satuan">
              <input className="input" value={p.unit} onChange={(e) => set({ unit: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 pt-5 text-sm">
              <input
                type="checkbox"
                checked={p.trackInventory}
                disabled={!!used}
                onChange={(e) =>
                  set({
                    trackInventory: e.target.checked,
                    purchaseAccountId: e.target.checked ? SYS.inventory : SYS.generalExpense,
                  })
                }
              />
              Lacak persediaan (stok & HPP otomatis)
            </label>
          </div>
          <h3 className="mb-3 mt-6 text-sm font-semibold">Penjualan</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Harga Jual Satuan">
              <NumInput value={p.sellPrice} onChange={(sellPrice) => set({ sellPrice })} />
            </Field>
            <Field label="Akun Penjualan">
              <AccountSelect value={p.salesAccountId} onChange={(salesAccountId) => set({ salesAccountId })} categories={['revenue', 'other_income']} />
            </Field>
          </div>
          <h3 className="mb-3 mt-6 text-sm font-semibold">Pembelian</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Harga Beli Satuan">
              <NumInput value={p.buyPrice} onChange={(buyPrice) => set({ buyPrice })} />
            </Field>
            <Field label={p.trackInventory ? 'Akun Persediaan' : 'Akun Pembelian / Biaya'}>
              <AccountSelect
                value={p.purchaseAccountId}
                onChange={(purchaseAccountId) => set({ purchaseAccountId })}
                categories={p.trackInventory ? ['inventory'] : ['cogs', 'expense', 'other_expense', 'other_current_asset']}
              />
            </Field>
            {p.trackInventory && (
              <Field label="Akun Harga Pokok Penjualan">
                <AccountSelect value={p.cogsAccountId} onChange={(cogsAccountId) => set({ cogsAccountId })} categories={['cogs']} />
              </Field>
            )}
          </div>
          {p.trackInventory && (
            <>
              <h3 className="mb-3 mt-6 text-sm font-semibold">Saldo Awal Persediaan</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Kuantitas Awal">
                  <NumInput value={p.openingQty} onChange={(openingQty) => set({ openingQty })} min={0} />
                </Field>
                <Field label="Harga Pokok per Unit">
                  <NumInput value={p.openingCost} onChange={(openingCost) => set({ openingCost })} />
                </Field>
                <Field label="Tanggal Saldo Awal">
                  <input type="date" className="input" value={p.openingDate} onChange={(e) => set({ openingDate: e.target.value })} />
                </Field>
              </div>
              <p className="mt-2 text-xs text-slate-500">Dijurnal: Persediaan (D) / Ekuitas Saldo Awal (K).</p>
            </>
          )}
          {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="mt-6 flex justify-end gap-2">
            {existing && (
              <button
                className="btn-danger mr-auto"
                onClick={() => {
                  if (used) return alert('Produk sudah dipakai di transaksi dan tidak dapat dihapus.')
                  if (!confirmDelete(`produk ${existing.name}`)) return
                  remove('products', existing.id)
                  nav('/produk')
                }}
              >
                <Trash2 size={16} /> Hapus
              </button>
            )}
            <Link to="/produk" className="btn-secondary">
              Batal
            </Link>
            <button className="btn-primary" onClick={save}>
              Simpan
            </button>
          </div>
        </div>
        {existing?.trackInventory && <ProductMovements product={existing} />}
      </div>
    </div>
  )
}

function ProductMovements({ product }: { product: Product }) {
  const { data } = useStore()
  const { stock } = computeCosting(data)
  const s = stock.get(product.id)
  const moves = [
    ...data.purchaseInvoices.flatMap((i) => i.lines.filter((l) => l.productId === product.id).map((l) => ({ date: i.date, ref: i.number, to: `/pembelian/${i.id}`, qty: l.qty, createdAt: i.createdAt }))),
    ...data.salesInvoices.flatMap((i) => i.lines.filter((l) => l.productId === product.id).map((l) => ({ date: i.date, ref: i.number, to: `/penjualan/${i.id}`, qty: -l.qty, createdAt: i.createdAt }))),
  ].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
  return (
    <div className="card self-start overflow-hidden">
      <div className="border-b border-slate-200 p-4">
        <div className="text-xs uppercase text-slate-500">Stok saat ini</div>
        <div className="text-2xl font-semibold">
          {s?.qty ?? 0} {product.unit}
        </div>
        <div className="text-xs text-slate-500">
          Nilai {money(s?.value ?? 0)} · HPP rata-rata {money(s?.avgCost ?? 0)}
        </div>
      </div>
      <table className="table">
        <tbody>
          {product.openingQty > 0 && (
            <tr>
              <td>{fmtDate(product.openingDate)}</td>
              <td>Saldo awal</td>
              <td className="num text-emerald-600">+{product.openingQty}</td>
            </tr>
          )}
          {moves.map((m, i) => (
            <tr key={i}>
              <td>{fmtDate(m.date)}</td>
              <td>
                <Link className="text-brand-700 hover:underline" to={m.to}>
                  {m.ref}
                </Link>
              </td>
              <td className={`num ${m.qty > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {m.qty > 0 ? '+' : ''}
                {m.qty}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ============================== CONTACTS ============================== */

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'customer', label: 'Pelanggan' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'employee', label: 'Karyawan' },
  { value: 'other', label: 'Lainnya' },
]

function contactBalances(data: ReturnType<typeof useStore>['data'], contactId: string) {
  const t = today()
  const ar = data.salesInvoices.filter((i) => i.contactId === contactId).reduce((s, i) => s + invoiceStatus(data, i, t).due, 0)
  const ap = data.purchaseInvoices.filter((i) => i.contactId === contactId).reduce((s, i) => s + invoiceStatus(data, i, t).due, 0)
  return { ar, ap }
}

export function ContactList() {
  const { data } = useStore()
  const [tab, setTab] = useState<ContactType | 'all'>('all')
  const [q, setQ] = useState('')
  const list = data.contacts
    .filter((c) => (tab === 'all' || c.type === tab) && (!q || `${c.name} ${c.email ?? ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div>
      <PageHeader
        title="Kontak"
        actions={
          <Link to="/kontak/new" className="btn-primary">
            <Plus size={16} /> Buat Kontak
          </Link>
        }
      />
      <div className="card">
        <div className="px-4 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[{ value: 'all' as const, label: 'Semua', count: data.contacts.length }, ...CONTACT_TYPES.map((t) => ({ ...t, count: data.contacts.filter((c) => c.type === t.value).length }))]}
          />
        </div>
        <div className="p-4">
          <input className="input max-w-xs" placeholder="Cari kontak" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Tipe</th>
                <th>Email</th>
                <th>Telepon</th>
                <th className="num">Piutang</th>
                <th className="num">Hutang</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const b = contactBalances(data, c.id)
                return (
                  <tr key={c.id}>
                    <td>
                      <Link className="font-medium text-brand-700 hover:underline" to={`/kontak/${c.id}`}>
                        {c.name}
                      </Link>
                    </td>
                    <td>{CONTACT_TYPES.find((t) => t.value === c.type)?.label}</td>
                    <td>{c.email}</td>
                    <td>{c.phone}</td>
                    <td className="num">{b.ar ? money(b.ar) : '-'}</td>
                    <td className="num">{b.ap ? money(b.ap) : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!list.length && <Empty>Belum ada kontak.</Empty>}
        </div>
      </div>
    </div>
  )
}

export function ContactForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, upsert, remove } = useStore()
  const existing = id ? data.contacts.find((c) => c.id === id) : undefined
  const [c, setC] = useState<Contact>(() => existing ?? { id: uid('c'), type: 'customer', name: '', email: '', phone: '', address: '', npwp: '', company: '' })
  const [error, setError] = useState('')
  const set = (patch: Partial<Contact>) => setC((x) => ({ ...x, ...patch }))
  const used =
    existing &&
    ([...data.salesInvoices, ...data.purchaseInvoices, ...data.payments].some((x) => x.contactId === existing.id) ||
      [...data.expenses, ...data.cashTransactions].some((x) => x.contactId === existing.id))

  const invoices = existing
    ? [
        ...data.salesInvoices.filter((i) => i.contactId === existing.id).map((i) => ({ inv: i, to: `/penjualan/${i.id}`, type: 'Faktur Penjualan' })),
        ...data.purchaseInvoices.filter((i) => i.contactId === existing.id).map((i) => ({ inv: i, to: `/pembelian/${i.id}`, type: 'Faktur Pembelian' })),
      ].sort((a, b) => (a.inv.date < b.inv.date ? 1 : -1))
    : []

  return (
    <div>
      <PageHeader title={existing ? existing.name : 'Buat Kontak'} back={{ to: '/kontak', label: 'Kontak' }} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-4 md:p-6">
          <div className="grid gap-4">
            <Field label="Tipe Kontak">
              <select className="input" value={c.type} onChange={(e) => set({ type: e.target.value as ContactType })}>
                {CONTACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nama">
              <input className="input" value={c.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" value={c.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="Telepon">
              <input className="input" value={c.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="NPWP">
              <input className="input" value={c.npwp} onChange={(e) => set({ npwp: e.target.value })} />
            </Field>
            <Field label="Alamat">
              <textarea className="input" value={c.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          </div>
          {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="mt-6 flex justify-end gap-2">
            {existing && (
              <button
                className="btn-danger mr-auto"
                onClick={() => {
                  if (used) return alert('Kontak sudah dipakai di transaksi dan tidak dapat dihapus.')
                  if (!confirmDelete(`kontak ${existing.name}`)) return
                  remove('contacts', existing.id)
                  nav('/kontak')
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <Link to="/kontak" className="btn-secondary">
              Batal
            </Link>
            <button
              className="btn-primary"
              onClick={() => {
                if (!c.name.trim()) return setError('Nama wajib diisi.')
                upsert('contacts', c)
                nav('/kontak')
              }}
            >
              Simpan
            </button>
          </div>
        </div>
        {existing && (
          <div className="card self-start overflow-hidden lg:col-span-2">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Transaksi</div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Tipe</th>
                    <th>Nomor</th>
                    <th>Status</th>
                    <th className="num">Sisa</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(({ inv, to, type }) => {
                    const s = invoiceStatus(data, inv, today())
                    return (
                      <tr key={inv.id}>
                        <td>{fmtDate(inv.date)}</td>
                        <td>{type}</td>
                        <td>
                          <Link className="text-brand-700 hover:underline" to={to}>
                            {inv.number}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="num">{money(s.due)}</td>
                        <td className="num">{money(s.total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!invoices.length && <Empty>Belum ada transaksi.</Empty>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================== ACCOUNTS ============================== */

export function AccountList() {
  const { data, ledger } = useStore()
  const totals = useMemo(() => accountTotals(ledger), [ledger])
  const [cat, setCat] = useState<AccountCategory | ''>('')
  const [q, setQ] = useState('')
  const list = sortAccounts(data.accounts).filter((a) => (!cat || a.category === cat) && (!q || `${a.code} ${a.name}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <div>
      <PageHeader
        title="Daftar Akun"
        subtitle="Bagan akun (chart of accounts) sesuai standar akuntansi Indonesia"
        actions={
          <Link to="/akun/new" className="btn-primary">
            <Plus size={16} /> Buat Akun
          </Link>
        }
      />
      <div className="card">
        <div className="flex flex-wrap gap-2 p-4">
          <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value as AccountCategory | '')}>
            <option value="">Semua kategori</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].label}
              </option>
            ))}
          </select>
          <input className="input max-w-xs" placeholder="Cari kode / nama akun" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Kode Akun</th>
                <th>Nama Akun</th>
                <th>Kategori</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="tabular-nums">{a.code}</td>
                  <td>
                    <Link className="font-medium text-brand-700 hover:underline" to={`/akun/${a.id}`}>
                      {a.name}
                    </Link>
                    {a.system && <span className="badge ml-2 bg-slate-100 text-slate-500">sistem</span>}
                  </td>
                  <td className="text-slate-500">{CATEGORIES[a.category].label}</td>
                  <td className="num">{acct(normalBalance(a, totals.get(a.id)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function AccountForm() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { data, upsert } = useStore()
  const [a, setA] = useState<Account>(() => ({ id: uid('acc'), code: '', name: '', category: (sp.get('category') as AccountCategory) || 'expense', description: '' }))
  const [error, setError] = useState('')
  return (
    <div>
      <PageHeader title="Buat Akun" back={{ to: '/akun', label: 'Daftar Akun' }} />
      <AccountEditor a={a} setA={setA} error={error} />
      <div className="mt-4 flex max-w-xl justify-end gap-2">
        <Link to="/akun" className="btn-secondary">
          Batal
        </Link>
        <button
          className="btn-primary"
          onClick={() => {
            if (!a.code.trim() || !a.name.trim()) return setError('Kode dan nama akun wajib diisi.')
            if (data.accounts.some((x) => x.code === a.code)) return setError('Kode akun sudah digunakan.')
            upsert('accounts', a)
            nav(`/akun/${a.id}`)
          }}
        >
          Simpan
        </button>
      </div>
    </div>
  )
}

function AccountEditor({ a, setA, error, lockCategory }: { a: Account; setA: (f: (a: Account) => Account) => void; error: string; lockCategory?: boolean }) {
  return (
    <div className="card max-w-xl p-4 md:p-6">
      <div className="grid gap-4">
        <Field label="Kategori">
          <select className="input" value={a.category} disabled={lockCategory} onChange={(e) => setA((x) => ({ ...x, category: e.target.value as AccountCategory }))}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kode Akun">
          <input className="input" placeholder="mis. 6-60218" value={a.code} onChange={(e) => setA((x) => ({ ...x, code: e.target.value }))} />
        </Field>
        <Field label="Nama Akun">
          <input className="input" value={a.name} onChange={(e) => setA((x) => ({ ...x, name: e.target.value }))} />
        </Field>
        <Field label="Deskripsi">
          <textarea className="input" value={a.description ?? ''} onChange={(e) => setA((x) => ({ ...x, description: e.target.value }))} />
        </Field>
      </div>
      {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    </div>
  )
}

export function AccountDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, ledger, upsert, remove } = useStore()
  const { contact } = useLookups()
  const account = data.accounts.find((a) => a.id === id)
  const [edit, setEdit] = useState<Account | null>(null)
  const [error, setError] = useState('')
  const gl = useMemo(() => (account ? generalLedger(data, ledger, account.id, {}) : undefined), [data, ledger, account])
  if (!account || !gl) return <Empty>Akun tidak ditemukan.</Empty>
  const used = gl.rows.length > 0

  return (
    <div>
      <PageHeader
        title={account.name}
        subtitle={`(${account.code}) · ${CATEGORIES[account.category].label} · Saldo ${money(gl.closing)}`}
        back={{ to: '/akun', label: 'Daftar Akun' }}
        actions={
          !edit && (
            <>
              {!account.system && (
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (used) return alert('Akun sudah memiliki transaksi dan tidak dapat dihapus.')
                    if (!confirmDelete(`akun ${account.name}`)) return
                    remove('accounts', account.id)
                    nav('/akun')
                  }}
                >
                  <Trash2 size={16} /> Hapus
                </button>
              )}
              <button className="btn-secondary" onClick={() => setEdit(account)}>
                Ubah
              </button>
            </>
          )
        }
      />
      {edit && (
        <div className="mb-5">
          <AccountEditor a={edit} setA={(f) => setEdit((x) => (x ? f(x) : x))} error={error} lockCategory={account.system || used} />
          <div className="mt-4 flex max-w-xl justify-end gap-2">
            <button className="btn-secondary" onClick={() => setEdit(null)}>
              Batal
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                if (!edit.code.trim() || !edit.name.trim()) return setError('Kode dan nama akun wajib diisi.')
                if (data.accounts.some((x) => x.code === edit.code && x.id !== edit.id)) return setError('Kode akun sudah digunakan.')
                upsert('accounts', edit)
                setEdit(null)
              }}
            >
              Simpan
            </button>
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Transaksi Akun</div>
        <table className="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Transaksi</th>
              <th>Nomor</th>
              <th>Kontak</th>
              <th>Keterangan</th>
              <th className="num">Debit</th>
              <th className="num">Kredit</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {[...gl.rows].reverse().map((r, i) => (
              <tr key={i}>
                <td>{fmtDate(r.entry.date)}</td>
                <td>{SOURCE_LABEL[r.entry.sourceType]}</td>
                <td>
                  <Link className="text-brand-700 hover:underline" to={sourcePath(r.entry)}>
                    {r.entry.number}
                  </Link>
                </td>
                <td>{contact.get(r.entry.contactId ?? '')?.name ?? '-'}</td>
                <td className="text-slate-500">{r.line.description}</td>
                <td className="num">{r.line.debit ? acct(r.line.debit) : ''}</td>
                <td className="num">{r.line.credit ? acct(r.line.credit) : ''}</td>
                <td className="num">{acct(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!gl.rows.length && <Empty>Belum ada transaksi.</Empty>}
      </div>
    </div>
  )
}
