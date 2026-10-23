import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Empty, StatCard, StatusBadge } from '../components/ui'
import { addMonths, endOfMonth, fmtDate, monthLabel, money, startOfMonth, today } from '../lib/format'
import { accountTotals, balanceOf, invoiceStatus, profitLoss, sortAccounts } from '../lib/ledger'
import { useLookups, useStore } from '../store/store'

const short = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}M`
  if (a >= 1e6) return `${(n / 1e6).toFixed(0)}jt`
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}rb`
  return String(n)
}

const PIE = ['#1c5bf1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b']

export default function Dashboard() {
  const { data, ledger } = useStore()
  const { contact } = useLookups()
  const now = today()

  const m = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => startOfMonth(addMonths(now, i - 5)))
    const series = months.map((ms) => {
      const pl = profitLoss(data, ledger, { from: ms, to: endOfMonth(ms) })
      return {
        month: monthLabel(ms),
        Pendapatan: pl.revenue.total + pl.otherIncome.total,
        'HPP & Biaya': pl.cogs.total + pl.expense.total + pl.otherExpense.total,
        'Laba Bersih': pl.net,
      }
    })
    const cashAccounts = sortAccounts(data.accounts.filter((a) => a.category === 'cash_bank'))
    const cash = cashAccounts.map((a) => ({ a, bal: balanceOf(ledger, a) }))
    const cashSeries = months.map((ms) => {
      const t = accountTotals(ledger, { from: ms, to: endOfMonth(ms) })
      let inflow = 0
      let outflow = 0
      for (const a of cashAccounts) {
        inflow += t.get(a.id)?.debit ?? 0
        outflow += t.get(a.id)?.credit ?? 0
      }
      // Ignore internal transfers between cash accounts
      const transfers = data.cashTransactions.filter((c) => c.kind === 'transfer' && c.date >= ms && c.date <= endOfMonth(ms)).reduce((s, c) => s + (c.amount ?? 0), 0)
      return { month: monthLabel(ms), Masuk: inflow - transfers, Keluar: outflow - transfers }
    })
    const sales = data.salesInvoices.map((i) => ({ i, ...invoiceStatus(data, i, now) }))
    const purchases = data.purchaseInvoices.map((i) => ({ i, ...invoiceStatus(data, i, now) }))
    const thisMonth = profitLoss(data, ledger, { from: startOfMonth(now), to: now })
    const expenseBreakdown = [...thisMonth.expense.rows, ...thisMonth.otherExpense.rows]
      .sort((a, b) => b.amount - a.amount)
      .map((r) => ({ name: r.account.name, value: r.amount }))
    const top = expenseBreakdown.slice(0, 6)
    const rest = expenseBreakdown.slice(6).reduce((s, x) => s + x.value, 0)
    if (rest) top.push({ name: 'Lainnya', value: rest })
    return { series, cash, cashSeries, sales, purchases, thisMonth, expenses: top }
  }, [data, ledger, now])

  const ar = m.sales.filter((s) => s.due > 0)
  const ap = m.purchases.filter((s) => s.due > 0)
  const overdue = ar.filter((s) => s.status === 'overdue')

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-900">Beranda</h1>
        <p className="text-sm text-slate-500">Ringkasan keuangan {data.company.name} per {fmtDate(now)}</p>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Kas & Bank" value={money(m.cash.reduce((s, c) => s + c.bal, 0))} tone="blue" hint={`${m.cash.length} akun`} />
        <StatCard label="Piutang belum dibayar" value={money(ar.reduce((s, x) => s + x.due, 0))} tone="amber" hint={`${overdue.length} jatuh tempo`} />
        <StatCard label="Hutang belum dibayar" value={money(ap.reduce((s, x) => s + x.due, 0))} tone="red" hint={`${ap.length} faktur`} />
        <StatCard label="Laba bersih bulan ini" value={money(m.thisMonth.net)} tone="green" hint={`Pendapatan ${money(m.thisMonth.revenue.total)}`} />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <div className="card p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Laba Rugi 6 Bulan Terakhir</h2>
            <Link to="/laporan/laba-rugi" className="text-xs font-medium text-brand-700 hover:underline">
              Lihat laporan
            </Link>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={m.series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={short} tick={{ fontSize: 12 }} width={50} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Pendapatan" fill="#1c5bf1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="HPP & Biaya" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Laba Bersih" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Biaya Bulan Ini</h2>
          {m.expenses.length ? (
            <>
              <div className="h-48">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={m.expenses} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {m.expenses.map((_, i) => (
                        <Cell key={i} fill={PIE[i % PIE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => money(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {m.expenses.map((e, i) => (
                  <li key={e.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />
                    <span className="flex-1 truncate text-slate-600">{e.name}</span>
                    <span className="tabular-nums">{money(e.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>Belum ada biaya bulan ini.</Empty>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-3">
        <div className="card p-4 xl:col-span-2">
          <h2 className="mb-3 font-semibold">Arus Kas Masuk & Keluar</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={m.cashSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={short} tick={{ fontSize: 12 }} width={50} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Masuk" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Keluar" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold">Kas & Bank</h2>
            <Link to="/kas-bank" className="text-xs font-medium text-brand-700 hover:underline">
              Kelola
            </Link>
          </div>
          <table className="table">
            <tbody>
              {m.cash.map(({ a, bal }) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/kas-bank/${a.id}`} className="text-brand-700 hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="num">{money(bal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <InvoiceBox title="Faktur Penjualan Belum Lunas" rows={ar} base="/penjualan" contactName={(id) => contact.get(id)?.name} />
        <InvoiceBox title="Faktur Pembelian Belum Lunas" rows={ap} base="/pembelian" contactName={(id) => contact.get(id)?.name} />
      </div>
    </div>
  )
}

function InvoiceBox({
  title,
  rows,
  base,
  contactName,
}: {
  title: string
  rows: { i: { id: string; number: string; contactId: string; dueDate: string }; due: number; status: 'paid' | 'partial' | 'unpaid' | 'overdue' }[]
  base: string
  contactName: (id: string) => string | undefined
}) {
  const sorted = [...rows].sort((a, b) => (a.i.dueDate < b.i.dueDate ? -1 : 1)).slice(0, 6)
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <Link to={base} className="text-xs font-medium text-brand-700 hover:underline">
          Lihat semua
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <tbody>
            {sorted.map((r) => (
              <tr key={r.i.id}>
                <td>
                  <Link to={`${base}/${r.i.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.i.number}
                  </Link>
                  <div className="text-xs text-slate-500">{contactName(r.i.contactId)}</div>
                </td>
                <td className="text-xs text-slate-500">Jatuh tempo {fmtDate(r.i.dueDate)}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="num">{money(r.due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!sorted.length && <Empty>Semua faktur sudah lunas.</Empty>}
    </div>
  )
}
