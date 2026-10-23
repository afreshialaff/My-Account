import { Printer } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AccountSelect, Empty, PageHeader } from '../components/ui'
import { SYS } from '../lib/coa'
import { acct, addDays, fmtDate, fmtDateLong, money, round2, startOfMonth, startOfYear, today } from '../lib/format'
import {
  AGING_BUCKETS,
  aging,
  balanceSheet,
  cashFlow,
  computeCosting,
  docTotals,
  generalLedger,
  profitLoss,
  SOURCE_LABEL,
  trialBalance,
  type ReportSection,
} from '../lib/ledger'
import { useLookups, useStore } from '../store/store'
import { sourcePath } from './Cash'

const REPORTS = [
  {
    group: 'Sekilas Bisnis',
    items: [
      { to: 'neraca', title: 'Neraca', desc: 'Posisi aset, kewajiban, dan ekuitas pada tanggal tertentu.' },
      { to: 'laba-rugi', title: 'Laba Rugi', desc: 'Pendapatan, HPP, beban, dan laba bersih dalam suatu periode.' },
      { to: 'arus-kas', title: 'Arus Kas', desc: 'Kas masuk dan keluar per aktivitas operasi, investasi, dan pendanaan.' },
      { to: 'perubahan-modal', title: 'Perubahan Modal', desc: 'Pergerakan ekuitas pemilik dalam suatu periode.' },
    ],
  },
  {
    group: 'Akuntansi',
    items: [
      { to: 'neraca-saldo', title: 'Neraca Saldo', desc: 'Saldo debit & kredit seluruh akun (trial balance).' },
      { to: 'buku-besar', title: 'Buku Besar', desc: 'Rincian mutasi dan saldo berjalan per akun.' },
      { to: 'jurnal', title: 'Jurnal', desc: 'Seluruh jurnal transaksi double-entry.' },
    ],
  },
  {
    group: 'Penjualan & Pembelian',
    items: [
      { to: 'umur-piutang', title: 'Umur Piutang', desc: 'Piutang belum dibayar dikelompokkan berdasarkan umur.' },
      { to: 'umur-hutang', title: 'Umur Hutang', desc: 'Hutang belum dibayar dikelompokkan berdasarkan umur.' },
      { to: 'penjualan-pelanggan', title: 'Penjualan per Pelanggan', desc: 'Total penjualan untuk tiap pelanggan.' },
      { to: 'pembelian-supplier', title: 'Pembelian per Supplier', desc: 'Total pembelian dari tiap supplier.' },
    ],
  },
  {
    group: 'Produk & Pajak',
    items: [
      { to: 'persediaan', title: 'Ringkasan Persediaan', desc: 'Kuantitas, HPP rata-rata, dan nilai persediaan.' },
      { to: 'pajak', title: 'Ringkasan PPN', desc: 'PPN Keluaran vs PPN Masukan dan kurang/lebih bayar.' },
    ],
  },
]

export function ReportIndex() {
  return (
    <div>
      <PageHeader title="Laporan" />
      <div className="space-y-6">
        {REPORTS.map((g) => (
          <div key={g.group}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{g.group}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((r) => (
                <Link key={r.to} to={`/laporan/${r.to}`} className="card p-4 transition hover:border-brand-300 hover:shadow">
                  <div className="font-semibold text-brand-700">{r.title}</div>
                  <div className="mt-1 text-sm text-slate-500">{r.desc}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function useRange(defaultFrom: (t: string) => string) {
  const [sp, setSp] = useSearchParams()
  const t = today()
  const from = sp.get('from') ?? defaultFrom(t)
  const to = sp.get('to') ?? t
  const set = (k: 'from' | 'to', v: string) => {
    const n = new URLSearchParams(sp)
    n.set(k, v)
    setSp(n, { replace: true })
  }
  return { from, to, setFrom: (v: string) => set('from', v), setTo: (v: string) => set('to', v), sp, setSp }
}

function ReportShell({ title, period, controls, children }: { title: string; period: string; controls: ReactNode; children: ReactNode }) {
  const { data } = useStore()
  return (
    <div>
      <PageHeader
        title={title}
        back={{ to: '/laporan', label: 'Laporan' }}
        actions={
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Cetak
          </button>
        }
      />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4 print:hidden">{controls}</div>
      <div className="card p-4 md:p-8">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold">{data.company.name}</div>
          <div className="text-base font-semibold text-slate-700">{title}</div>
          <div className="text-sm text-slate-500">{period}</div>
        </div>
        {children}
      </div>
    </div>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function Line({ label, value, level = 0, bold, to, border }: { label: ReactNode; value?: number; level?: number; bold?: boolean; to?: string; border?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 text-sm ${bold ? 'font-semibold text-slate-900' : 'text-slate-700'} ${border ? 'border-t border-slate-300' : ''}`} style={{ paddingLeft: level * 20 }}>
      <span>{to ? <Link className="text-brand-700 hover:underline" to={to}>{label}</Link> : label}</span>
      {value !== undefined && <span className="tabular-nums">{acct(value)}</span>}
    </div>
  )
}

function SectionBlock({ s, level = 1 }: { s: ReportSection; level?: number }) {
  if (!s.rows.length) return null
  return (
    <div className="mb-2">
      <Line label={s.label} level={level} bold />
      {s.rows.map((r) => (
        <Line key={r.account.id} label={`(${r.account.code}) ${r.account.name}`} value={r.amount} level={level + 1} to={`/laporan/buku-besar?account=${r.account.id}`} />
      ))}
      <Line label={`Total ${s.label}`} value={s.total} level={level} bold border />
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function BalanceSheetReport() {
  const { data, ledger } = useStore()
  const { to, setTo } = useRange(startOfYear)
  const bs = useMemo(() => balanceSheet(data, ledger, to), [data, ledger, to])
  const balanced = bs.totalAssets === bs.totalLiabilitiesEquity
  return (
    <ReportShell title="Neraca" period={`Per ${fmtDateLong(to)}`} controls={<DateInput label="Per tanggal" value={to} onChange={setTo} />}>
      <div className="mx-auto max-w-3xl">
        <Line label="ASET" bold />
        {bs.assets.map((s) => (
          <SectionBlock key={s.category} s={s} />
        ))}
        <Line label="TOTAL ASET" value={bs.totalAssets} bold border />
        <div className="h-6" />
        <Line label="KEWAJIBAN DAN EKUITAS" bold />
        {bs.liabilities.map((s) => (
          <SectionBlock key={s.category} s={s} />
        ))}
        <Line label="Total Kewajiban" value={bs.totalLiabilities} level={1} bold border />
        <div className="h-3" />
        <Line label="Ekuitas" level={1} bold />
        {bs.equity.rows.map((r) => (
          <Line key={r.account.id} label={`(${r.account.code}) ${r.account.name}`} value={r.amount} level={2} to={`/laporan/buku-besar?account=${r.account.id}`} />
        ))}
        <Line label="Pendapatan sampai tahun lalu" value={bs.priorEarnings} level={2} />
        <Line label="Pendapatan periode ini" value={bs.currentEarnings} level={2} to={`/laporan/laba-rugi?from=${startOfYear(to)}&to=${to}`} />
        <Line label="Total Ekuitas" value={bs.totalEquity} level={1} bold border />
        <Line label="TOTAL KEWAJIBAN DAN EKUITAS" value={bs.totalLiabilitiesEquity} bold border />
        <div className={`mt-4 rounded-md px-3 py-2 text-center text-sm ${balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {balanced ? '✓ Neraca seimbang (Aset = Kewajiban + Ekuitas)' : `Neraca tidak seimbang: selisih ${money(bs.totalAssets - bs.totalLiabilitiesEquity)}`}
        </div>
      </div>
    </ReportShell>
  )
}

export function ProfitLossReport() {
  const { data, ledger } = useStore()
  const { from, to, setFrom, setTo } = useRange(startOfMonth)
  const pl = useMemo(() => profitLoss(data, ledger, { from, to }), [data, ledger, from, to])
  return (
    <ReportShell
      title="Laba Rugi"
      period={`${fmtDateLong(from)} - ${fmtDateLong(to)}`}
      controls={
        <>
          <DateInput label="Dari" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
          <QuickRanges />
        </>
      }
    >
      <div className="mx-auto max-w-3xl">
        <SectionBlock s={pl.revenue} level={0} />
        <SectionBlock s={pl.cogs} level={0} />
        <Line label="LABA KOTOR" value={pl.grossProfit} bold border />
        <div className="h-3" />
        <SectionBlock s={{ ...pl.expense, label: 'Beban Operasional' }} level={0} />
        <Line label="PENDAPATAN BERSIH OPERASIONAL" value={pl.operatingProfit} bold border />
        <div className="h-3" />
        <SectionBlock s={pl.otherIncome} level={0} />
        <SectionBlock s={pl.otherExpense} level={0} />
        <div className="mt-3 rounded-md bg-slate-50 px-2">
          <Line label="LABA BERSIH" value={pl.net} bold />
        </div>
      </div>
    </ReportShell>
  )
}

function QuickRanges() {
  const [sp, setSp] = useSearchParams()
  const t = today()
  const set = (from: string, to: string) => {
    const n = new URLSearchParams(sp)
    n.set('from', from)
    n.set('to', to)
    setSp(n, { replace: true })
  }
  return (
    <div className="flex flex-wrap gap-1">
      <button className="btn-secondary py-1.5 text-xs" onClick={() => set(startOfMonth(t), t)}>
        Bulan ini
      </button>
      <button className="btn-secondary py-1.5 text-xs" onClick={() => set(startOfYear(t), t)}>
        Tahun ini
      </button>
      <button className="btn-secondary py-1.5 text-xs" onClick={() => set('2000-01-01', t)}>
        Semua
      </button>
    </div>
  )
}

export function CashFlowReport() {
  const { data, ledger } = useStore()
  const { from, to, setFrom, setTo } = useRange(startOfMonth)
  const cf = useMemo(() => cashFlow(data, ledger, { from, to }), [data, ledger, from, to])
  const act = (title: string, a: typeof cf.operating, totalLabel: string) => (
    <div className="mb-3">
      <Line label={title} bold />
      {a.rows.map((r) => (
        <Line key={r.key} label={r.label} value={r.amount} level={1} />
      ))}
      <Line label={totalLabel} value={a.total} bold border />
    </div>
  )
  return (
    <ReportShell
      title="Arus Kas"
      period={`${fmtDateLong(from)} - ${fmtDateLong(to)}`}
      controls={
        <>
          <DateInput label="Dari" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
          <QuickRanges />
        </>
      }
    >
      <div className="mx-auto max-w-3xl">
        {act('Arus kas dari aktivitas operasional', cf.operating, 'Kas bersih dari aktivitas operasional')}
        {act('Arus kas dari aktivitas investasi', cf.investing, 'Kas bersih dari aktivitas investasi')}
        {act('Arus kas dari aktivitas pendanaan', cf.financing, 'Kas bersih dari aktivitas pendanaan')}
        <div className="mt-4 rounded-md bg-slate-50 px-2">
          <Line label="Kenaikan (penurunan) kas" value={cf.net} bold />
          <Line label="Saldo kas awal" value={cf.opening} />
          <Line label="Saldo kas akhir" value={cf.closing} bold border />
        </div>
      </div>
    </ReportShell>
  )
}

export function EquityReport() {
  const { data, ledger } = useStore()
  const { from, to, setFrom, setTo } = useRange(startOfYear)
  const r = useMemo(() => {
    const before = balanceSheet(data, ledger, addDays(from, -1))
    const after = balanceSheet(data, ledger, to)
    const pl = profitLoss(data, ledger, { from, to })
    const eqAcc = data.accounts.filter((a) => a.category === 'equity')
    const changes = eqAcc
      .map((a) => {
        const b = before.equity.rows.find((x) => x.account.id === a.id)?.amount ?? 0
        const e = after.equity.rows.find((x) => x.account.id === a.id)?.amount ?? 0
        return { a, change: round2(e - b) }
      })
      .filter((x) => x.change !== 0)
    return { opening: before.totalEquity, closing: after.totalEquity, net: pl.net, changes }
  }, [data, ledger, from, to])
  return (
    <ReportShell
      title="Perubahan Modal"
      period={`${fmtDateLong(from)} - ${fmtDateLong(to)}`}
      controls={
        <>
          <DateInput label="Dari" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
        </>
      }
    >
      <div className="mx-auto max-w-3xl">
        <Line label="Modal awal periode" value={r.opening} bold />
        <Line label="Laba (rugi) bersih periode berjalan" value={r.net} level={1} />
        {r.changes.map((c) => (
          <Line key={c.a.id} label={`Perubahan ${c.a.name}`} value={c.change} level={1} />
        ))}
        <Line label="Modal akhir periode" value={r.closing} bold border />
      </div>
    </ReportShell>
  )
}

export function TrialBalanceReport() {
  const { data, ledger } = useStore()
  const { from, to, setFrom, setTo } = useRange(startOfMonth)
  const tb = useMemo(() => trialBalance(data, ledger, { from, to }), [data, ledger, from, to])
  const balanced = tb.totals.closeDebit === tb.totals.closeCredit
  return (
    <ReportShell
      title="Neraca Saldo"
      period={`${fmtDateLong(from)} - ${fmtDateLong(to)}`}
      controls={
        <>
          <DateInput label="Dari" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th rowSpan={2}>Akun</th>
              <th colSpan={2} className="text-center">
                Saldo Awal
              </th>
              <th colSpan={2} className="text-center">
                Pergerakan
              </th>
              <th colSpan={2} className="text-center">
                Saldo Akhir
              </th>
            </tr>
            <tr>
              {['Debit', 'Kredit', 'Debit', 'Kredit', 'Debit', 'Kredit'].map((h, i) => (
                <th key={i} className="num">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tb.rows.map((r) => (
              <tr key={r.account.id}>
                <td>
                  <Link className="text-brand-700 hover:underline" to={`/laporan/buku-besar?account=${r.account.id}&from=${from}&to=${to}`}>
                    ({r.account.code}) {r.account.name}
                  </Link>
                </td>
                <td className="num">{acct(r.openDebit)}</td>
                <td className="num">{acct(r.openCredit)}</td>
                <td className="num">{acct(r.debit)}</td>
                <td className="num">{acct(r.credit)}</td>
                <td className="num">{acct(r.closeDebit)}</td>
                <td className="num">{acct(r.closeCredit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-3 py-2">Total</td>
              {(['openDebit', 'openCredit', 'debit', 'credit', 'closeDebit', 'closeCredit'] as const).map((k) => (
                <td key={k} className="num px-3 py-2">
                  {acct(tb.totals[k])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className={`mt-4 rounded-md px-3 py-2 text-center text-sm ${balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
        {balanced ? '✓ Total debit = total kredit' : 'Neraca saldo tidak seimbang'}
      </div>
    </ReportShell>
  )
}

export function GeneralLedgerReport() {
  const { data, ledger } = useStore()
  const { contact } = useLookups()
  const { from, to, setFrom, setTo, sp, setSp } = useRange(startOfMonth)
  const accountId = sp.get('account') ?? SYS.bank
  const gl = useMemo(() => (data.accounts.some((a) => a.id === accountId) ? generalLedger(data, ledger, accountId, { from, to }) : undefined), [data, ledger, accountId, from, to])
  return (
    <ReportShell
      title="Buku Besar"
      period={`${fmtDateLong(from)} - ${fmtDateLong(to)}`}
      controls={
        <>
          <label className="min-w-[260px]">
            <span className="label">Akun</span>
            <AccountSelect
              value={accountId}
              onChange={(v) => {
                const n = new URLSearchParams(sp)
                n.set('account', v)
                setSp(n, { replace: true })
              }}
            />
          </label>
          <DateInput label="Dari" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
          <QuickRanges />
        </>
      }
    >
      {gl ? (
        <div className="overflow-x-auto">
          <div className="mb-2 font-semibold">
            ({gl.account.code}) {gl.account.name}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Transaksi</th>
                <th>Nomor</th>
                <th>Kontak / Keterangan</th>
                <th className="num">Debit</th>
                <th className="num">Kredit</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-50 font-medium">
                <td colSpan={6}>Saldo Awal</td>
                <td className="num">{acct(gl.opening)}</td>
              </tr>
              {gl.rows.map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.entry.date)}</td>
                  <td>{SOURCE_LABEL[r.entry.sourceType]}</td>
                  <td>
                    <Link className="text-brand-700 hover:underline" to={sourcePath(r.entry)}>
                      {r.entry.number}
                    </Link>
                  </td>
                  <td className="text-slate-500">{[contact.get(r.entry.contactId ?? '')?.name, r.line.description].filter(Boolean).join(' · ')}</td>
                  <td className="num">{r.line.debit ? acct(r.line.debit) : ''}</td>
                  <td className="num">{r.line.credit ? acct(r.line.credit) : ''}</td>
                  <td className="num">{acct(r.balance)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={6}>Saldo Akhir</td>
                <td className="num">{acct(gl.closing)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Pilih akun.</Empty>
      )}
    </ReportShell>
  )
}

export function JournalReport() {
  const { ledger } = useStore()
  const { account, contact } = useLookups()
  const { from, to, setFrom, setTo } = useRange(startOfMonth)
  const entries = ledger.filter((e) => e.date >= from && e.date <= to)
  let td = 0
  let tc = 0
  return (
    <ReportShell
      title="Jurnal"
      period={`${fmtDateLong(from)} - ${fmtDateLong(to)}`}
      controls={
        <>
          <DateInput label="Dari" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
          <QuickRanges />
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Akun</th>
              <th className="num">Debit</th>
              <th className="num">Kredit</th>
            </tr>
          </thead>
          {entries.map((e) => (
            <tbody key={e.id}>
              <tr className="bg-slate-50">
                <td colSpan={3} className="text-xs">
                  <span className="font-semibold">
                    <Link className="text-brand-700 hover:underline" to={sourcePath(e)}>
                      {SOURCE_LABEL[e.sourceType]} #{e.number}
                    </Link>
                  </span>{' '}
                  · {fmtDate(e.date)} {e.contactId && `· ${contact.get(e.contactId)?.name}`}
                </td>
              </tr>
              {e.lines.map((l, i) => {
                td += l.debit
                tc += l.credit
                const a = account.get(l.accountId)
                return (
                  <tr key={i}>
                    <td className={l.credit ? 'pl-10' : ''}>
                      ({a?.code}) {a?.name}
                    </td>
                    <td className="num">{l.debit ? acct(l.debit) : ''}</td>
                    <td className="num">{l.credit ? acct(l.credit) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          ))}
          <tfoot>
            <tr className="font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="num px-3 py-2">{acct(td)}</td>
              <td className="num px-3 py-2">{acct(tc)}</td>
            </tr>
          </tfoot>
        </table>
        {!entries.length && <Empty>Tidak ada transaksi pada periode ini.</Empty>}
      </div>
    </ReportShell>
  )
}

export function AgingReport({ kind }: { kind: 'receivable' | 'payable' }) {
  const { data } = useStore()
  const { contact } = useLookups()
  const { to, setTo } = useRange(startOfMonth)
  const rows = useMemo(() => aging(data, kind, to).sort((a, b) => b.total - a.total), [data, kind, to])
  const sums = AGING_BUCKETS.map((_, i) => rows.reduce((s, r) => s + r.buckets[i], 0))
  return (
    <ReportShell title={kind === 'receivable' ? 'Umur Piutang' : 'Umur Hutang'} period={`Per ${fmtDateLong(to)}`} controls={<DateInput label="Per tanggal" value={to} onChange={setTo} />}>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{kind === 'receivable' ? 'Pelanggan' : 'Supplier'}</th>
              {AGING_BUCKETS.map((b) => (
                <th key={b} className="num">
                  {b}
                </th>
              ))}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.contactId}>
                <td>
                  <Link className="text-brand-700 hover:underline" to={`/kontak/${r.contactId}`}>
                    {contact.get(r.contactId)?.name}
                  </Link>
                </td>
                {r.buckets.map((b, i) => (
                  <td key={i} className={`num ${i >= 3 && b ? 'text-red-600' : ''}`}>
                    {acct(b)}
                  </td>
                ))}
                <td className="num font-medium">{acct(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-3 py-2">Total</td>
              {sums.map((s, i) => (
                <td key={i} className="num px-3 py-2">
                  {acct(s)}
                </td>
              ))}
              <td className="num px-3 py-2">{acct(sums.reduce((a, b) => a + b, 0))}</td>
            </tr>
          </tfoot>
        </table>
        {!rows.length && <Empty>Tidak ada saldo terbuka.</Empty>}
      </div>
    </ReportShell>
  )
}

export function ByContactReport({ kind }: { kind: 'sales' | 'purchase' }) {
  const { data } = useStore()
  const { contact } = useLookups()
  const { from, to, setFrom, setTo } = useRange(startOfYear)
  const rows = useMemo(() => {
    const list = kind === 'sales' ? data.salesInvoices : data.purchaseInvoices
    const m = new Map<string, { count: number; subtotal: number; tax: number; total: number }>()
    for (const inv of list) {
      if (inv.date < from || inv.date > to) continue
      const t = docTotals(inv.lines)
      const r = m.get(inv.contactId) ?? { count: 0, subtotal: 0, tax: 0, total: 0 }
      r.count++
      r.subtotal += t.subtotal - t.discount
      r.tax += t.tax
      r.total += t.total
      m.set(inv.contactId, r)
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [data, kind, from, to])
  const grand = rows.reduce((s, [, r]) => s + r.total, 0)
  return (
    <ReportShell
      title={kind === 'sales' ? 'Penjualan per Pelanggan' : 'Pembelian per Supplier'}
      period={`${fmtDateLong(from)} - ${fmtDateLong(to)}`}
      controls={
        <>
          <DateInput label="Dari" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
          <QuickRanges />
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{kind === 'sales' ? 'Pelanggan' : 'Supplier'}</th>
              <th className="num">Jumlah Faktur</th>
              <th className="num">Penjualan Bersih</th>
              <th className="num">PPN</th>
              <th className="num">Total</th>
              <th className="num">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([cid, r]) => (
              <tr key={cid}>
                <td>{contact.get(cid)?.name}</td>
                <td className="num">{r.count}</td>
                <td className="num">{acct(r.subtotal)}</td>
                <td className="num">{acct(r.tax)}</td>
                <td className="num">{acct(r.total)}</td>
                <td className="num">{grand ? ((r.total / grand) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="num px-3 py-2">{rows.reduce((s, [, r]) => s + r.count, 0)}</td>
              <td className="num px-3 py-2">{acct(rows.reduce((s, [, r]) => s + r.subtotal, 0))}</td>
              <td className="num px-3 py-2">{acct(rows.reduce((s, [, r]) => s + r.tax, 0))}</td>
              <td className="num px-3 py-2">{acct(grand)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        {!rows.length && <Empty>Tidak ada transaksi.</Empty>}
      </div>
    </ReportShell>
  )
}

export function InventoryReport() {
  const { data } = useStore()
  const { to, setTo } = useRange(startOfMonth)
  const { stock } = useMemo(() => computeCosting(data, to), [data, to])
  const items = data.products.filter((p) => p.trackInventory)
  const total = items.reduce((s, p) => s + (stock.get(p.id)?.value ?? 0), 0)
  return (
    <ReportShell title="Ringkasan Persediaan" period={`Per ${fmtDateLong(to)}`} controls={<DateInput label="Per tanggal" value={to} onChange={setTo} />}>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Produk</th>
              <th className="num">Kuantitas</th>
              <th>Satuan</th>
              <th className="num">HPP Rata-rata</th>
              <th className="num">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const s = stock.get(p.id)
              return (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td>
                    <Link className="text-brand-700 hover:underline" to={`/produk/${p.id}`}>
                      {p.name}
                    </Link>
                  </td>
                  <td className="num">{s?.qty ?? 0}</td>
                  <td>{p.unit}</td>
                  <td className="num">{acct(s?.avgCost ?? 0)}</td>
                  <td className="num">{acct(s?.value ?? 0)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-3 py-2" colSpan={5}>
                Total Nilai Persediaan
              </td>
              <td className="num px-3 py-2">{acct(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportShell>
  )
}

export function TaxReport() {
  const { ledger } = useStore()
  const { from, to, setFrom, setTo } = useRange(startOfMonth)
  const r = useMemo(() => {
    let out = 0
    let inn = 0
    for (const e of ledger) {
      if (e.date < from || e.date > to) continue
      for (const l of e.lines) {
        if (l.accountId === SYS.vatOut) out += l.credit - l.debit
        if (l.accountId === SYS.vatIn) inn += l.debit - l.credit
      }
    }
    return { out: round2(out), inn: round2(inn), net: round2(out - inn) }
  }, [ledger, from, to])
  return (
    <ReportShell
      title="Ringkasan PPN"
      period={`${fmtDateLong(from)} - ${fmtDateLong(to)}`}
      controls={
        <>
          <DateInput label="Dari" value={from} onChange={setFrom} />
          <DateInput label="Sampai" value={to} onChange={setTo} />
          <QuickRanges />
        </>
      }
    >
      <div className="mx-auto max-w-xl">
        <Line label="PPN Keluaran (dari penjualan)" value={r.out} to={`/laporan/buku-besar?account=${SYS.vatOut}&from=${from}&to=${to}`} />
        <Line label="PPN Masukan (dari pembelian & biaya)" value={r.inn} to={`/laporan/buku-besar?account=${SYS.vatIn}&from=${from}&to=${to}`} />
        <Line label={r.net >= 0 ? 'PPN Kurang Bayar (harus disetor)' : 'PPN Lebih Bayar'} value={Math.abs(r.net)} bold border />
        <p className="mt-4 text-xs text-slate-500">
          Untuk mencatat penyetoran/kompensasi PPN, buat Jurnal Umum: PPN Keluaran (D), PPN Masukan (K), dan Kas/Bank (K) sebesar kurang bayar.
        </p>
      </div>
    </ReportShell>
  )
}
