'use client'

import { Printer } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { useApi, type Account, type Entity } from '@/lib/api'
import { amount, date, dateLong, startOfYear, today } from '@/lib/format'
import { Badge, Empty, ErrorState, Loading, PageHeader } from '../ui'

const REPORTS = [
  { slug: 'balance-sheet', title: 'Neraca', desc: 'Aset, kewajiban dan ekuitas per tanggal, termasuk laba tahun berjalan.' },
  { slug: 'profit-loss', title: 'Laba Rugi', desc: 'Pendapatan, HPP, beban dan laba bersih untuk suatu periode.' },
  { slug: 'trial-balance', title: 'Neraca Saldo', desc: 'Saldo awal, mutasi dan saldo akhir debit/kredit seluruh akun.' },
  { slug: 'general-ledger', title: 'Buku Besar', desc: 'Mutasi per akun dengan saldo berjalan dan tautan ke jurnal sumber.' },
]

export function ReportIndex({ entityId }: { entityId: string }) {
  return (
    <div>
      <PageHeader title="Laporan" subtitle="Semua laporan dihitung langsung dari jurnal yang diposting dan dapat ditelusuri ke sumbernya" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {REPORTS.map((r) => (
          <Link key={r.slug} href={`/e/${entityId}/reports/${r.slug}`} className="card p-4 transition-shadow hover:shadow-md">
            <div className="font-semibold text-primary">{r.title}</div>
            <div className="mt-1 text-sm text-muted-fg">{r.desc}</div>
          </Link>
        ))}
        <Link href={`/e/${entityId}/m/reports-more`} className="card border-dashed p-4">
          <div className="flex items-center gap-2 font-semibold text-muted-fg">
            Arus Kas, Umur Piutang/Hutang, Ekspor PDF/XLSX <Badge tone="accent">Segera</Badge>
          </div>
          <div className="mt-1 text-sm text-muted-fg">Lihat roadmap laporan lanjutan.</div>
        </Link>
      </div>
    </div>
  )
}

function useParamsState(defaults: Record<string, string>) {
  const sp = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const get = (k: string) => sp.get(k) ?? defaults[k]
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    n.set(k, v)
    router.replace(`${path}?${n}`)
  }
  return { get, set }
}

function Shell({ entityId, title, period, controls, children }: { entityId: string; title: string; period: string; controls: ReactNode; children: ReactNode }) {
  const { data: e } = useApi<Entity>(`/entities/${entityId}`)
  return (
    <div>
      <PageHeader
        title={title}
        back={{ href: `/e/${entityId}/reports`, label: 'Laporan' }}
        actions={
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden /> Cetak
          </button>
        }
      />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3 print:hidden">{controls}</div>
      <div className="card p-4 md:p-8">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold">{e?.legal_name || e?.name}</div>
          <div className="font-semibold text-muted-fg">{title}</div>
          <div className="text-sm text-muted-fg">{period}</div>
        </div>
        {children}
      </div>
    </div>
  )
}

function DateInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function Row({ label, value, level = 0, bold, border, href }: { label: ReactNode; value?: string; level?: number; bold?: boolean; border?: boolean; href?: string }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 text-sm ${bold ? 'font-semibold' : ''} ${border ? 'border-t border-primary-strong/30' : ''}`} style={{ paddingLeft: level * 18 }}>
      <span>{href ? <Link className="link font-normal" href={href}>{label}</Link> : label}</span>
      {value !== undefined && <span className={`font-mono tabular-nums ${value.startsWith('-') ? 'text-danger' : ''}`}>{amount(value, { zero: '0' })}</span>}
    </div>
  )
}

interface Section {
  category: string
  label: string
  items: { accountId: string; code: string; name: string; amount: string }[]
  total: string
}

function SectionBlock({ s, entityId, from, to, level = 1 }: { s: Section; entityId: string; from: string; to: string; level?: number }) {
  if (!s.items.length) return null
  return (
    <div className="mb-2">
      <Row label={s.label} level={level} bold />
      {s.items.map((i) => (
        <Row key={i.accountId} level={level + 1} label={`${i.code} ${i.name}`} value={i.amount} href={`/e/${entityId}/reports/general-ledger?accountId=${i.accountId}&from=${from}&to=${to}`} />
      ))}
      <Row label={`Total ${s.label}`} value={s.total} level={level} bold border />
    </div>
  )
}

function BalancedNote({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return <div className={`mt-4 rounded-md px-3 py-2 text-center text-sm ${ok ? 'bg-emerald-50 text-success' : 'bg-rose-50 text-danger'}`}>{ok ? `✓ ${okText}` : badText}</div>
}

/* ------------------------------------------------------------------ */

interface BS {
  asOf: string
  fiscalYearStart: string
  assets: Section[]
  liabilities: Section[]
  equity: Section
  priorEarnings: string
  currentEarnings: string
  totalAssets: string
  totalLiabilities: string
  totalEquity: string
  totalLiabilitiesEquity: string
  balanced: boolean
}

export function BalanceSheet({ entityId }: { entityId: string }) {
  const p = useParamsState({ asOf: today() })
  const asOf = p.get('asOf')
  const { data, error } = useApi<BS>(`/entities/${entityId}/reports/balance-sheet?asOf=${asOf}`)
  return (
    <Shell entityId={entityId} title="Neraca" period={`Per ${dateLong(asOf)}`} controls={<DateInput id="asof" label="Per tanggal" value={asOf} onChange={(v) => p.set('asOf', v)} />}>
      {error ? <ErrorState error={error} /> : !data ? <Loading /> : (
        <div className="mx-auto max-w-3xl">
          <Row label="ASET" bold />
          {data.assets.map((s) => (
            <SectionBlock key={s.category} s={s} entityId={entityId} from={startOfYear(asOf)} to={asOf} />
          ))}
          <Row label="TOTAL ASET" value={data.totalAssets} bold border />
          <div className="h-6" />
          <Row label="KEWAJIBAN DAN EKUITAS" bold />
          {data.liabilities.map((s) => (
            <SectionBlock key={s.category} s={s} entityId={entityId} from={startOfYear(asOf)} to={asOf} />
          ))}
          <Row label="Total Kewajiban" value={data.totalLiabilities} level={1} bold border />
          <div className="h-3" />
          <Row label="Ekuitas" level={1} bold />
          {data.equity.items.map((i) => (
            <Row key={i.accountId} level={2} label={`${i.code} ${i.name}`} value={i.amount} href={`/e/${entityId}/reports/general-ledger?accountId=${i.accountId}&from=${data.fiscalYearStart}&to=${asOf}`} />
          ))}
          <Row level={2} label="Laba ditahan (s.d. tahun buku lalu)" value={data.priorEarnings} />
          <Row level={2} label="Laba tahun berjalan" value={data.currentEarnings} href={`/e/${entityId}/reports/profit-loss?from=${data.fiscalYearStart}&to=${asOf}`} />
          <Row label="Total Ekuitas" value={data.totalEquity} level={1} bold border />
          <Row label="TOTAL KEWAJIBAN DAN EKUITAS" value={data.totalLiabilitiesEquity} bold border />
          <BalancedNote ok={data.balanced} okText="Seimbang: Aset = Kewajiban + Ekuitas" badText="Neraca tidak seimbang — periksa data" />
        </div>
      )}
    </Shell>
  )
}

interface PL {
  revenue: Section
  cogs: Section
  grossProfit: string
  expense: Section
  operatingProfit: string
  otherIncome: Section
  otherExpense: Section
  netIncome: string
}

export function ProfitLoss({ entityId }: { entityId: string }) {
  const p = useParamsState({ from: startOfYear(), to: today() })
  const from = p.get('from')
  const to = p.get('to')
  const { data, error } = useApi<PL>(`/entities/${entityId}/reports/profit-loss?from=${from}&to=${to}`)
  return (
    <Shell
      entityId={entityId}
      title="Laba Rugi"
      period={`${dateLong(from)} – ${dateLong(to)}`}
      controls={
        <>
          <DateInput id="from" label="Dari" value={from} onChange={(v) => p.set('from', v)} />
          <DateInput id="to" label="Sampai" value={to} onChange={(v) => p.set('to', v)} />
        </>
      }
    >
      {error ? <ErrorState error={error} /> : !data ? <Loading /> : (
        <div className="mx-auto max-w-3xl">
          <SectionBlock s={data.revenue} entityId={entityId} from={from} to={to} level={0} />
          <SectionBlock s={data.cogs} entityId={entityId} from={from} to={to} level={0} />
          <Row label="LABA KOTOR" value={data.grossProfit} bold border />
          <div className="h-3" />
          <SectionBlock s={{ ...data.expense, label: 'Beban Operasional' }} entityId={entityId} from={from} to={to} level={0} />
          <Row label="LABA OPERASIONAL" value={data.operatingProfit} bold border />
          <div className="h-3" />
          <SectionBlock s={data.otherIncome} entityId={entityId} from={from} to={to} level={0} />
          <SectionBlock s={data.otherExpense} entityId={entityId} from={from} to={to} level={0} />
          <div className="mt-3 rounded-md bg-canvas px-2">
            <Row label="LABA BERSIH" value={data.netIncome} bold />
          </div>
        </div>
      )}
    </Shell>
  )
}

interface TB {
  rows: { accountId: string; code: string; name: string; openingDebit: string; openingCredit: string; debit: string; credit: string; closingDebit: string; closingCredit: string }[]
  totals: Record<string, string>
  balanced: boolean
}

export function TrialBalance({ entityId }: { entityId: string }) {
  const p = useParamsState({ from: startOfYear(), to: today() })
  const from = p.get('from')
  const to = p.get('to')
  const { data, error } = useApi<TB>(`/entities/${entityId}/reports/trial-balance?from=${from}&to=${to}`)
  const cols = ['openingDebit', 'openingCredit', 'debit', 'credit', 'closingDebit', 'closingCredit'] as const
  return (
    <Shell
      entityId={entityId}
      title="Neraca Saldo"
      period={`${dateLong(from)} – ${dateLong(to)}`}
      controls={
        <>
          <DateInput id="from" label="Dari" value={from} onChange={(v) => p.set('from', v)} />
          <DateInput id="to" label="Sampai" value={to} onChange={(v) => p.set('to', v)} />
        </>
      }
    >
      {error ? <ErrorState error={error} /> : !data ? <Loading /> : (
        <>
          <div className="overflow-x-auto">
            <table className="tbl min-w-[900px]">
              <thead>
                <tr>
                  <th rowSpan={2}>Akun</th>
                  <th colSpan={2} className="text-center">
                    Saldo Awal
                  </th>
                  <th colSpan={2} className="text-center">
                    Mutasi
                  </th>
                  <th colSpan={2} className="text-center">
                    Saldo Akhir
                  </th>
                </tr>
                <tr>
                  {['Debit', 'Kredit', 'Debit', 'Kredit', 'Debit', 'Kredit'].map((h, i) => (
                    <th key={i} className="text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.accountId}>
                    <td>
                      <Link className="link font-normal" href={`/e/${entityId}/reports/general-ledger?accountId=${r.accountId}&from=${from}&to=${to}`}>
                        <span className="mr-2 font-mono text-xs text-muted-fg">{r.code}</span>
                        {r.name}
                      </Link>
                    </td>
                    {cols.map((c) => (
                      <td key={c} className="num">
                        {amount(r[c], { zero: '' })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-3 py-2">Total</td>
                  {cols.map((c) => (
                    <td key={c} className="num px-3 py-2">
                      {amount(data.totals[c])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
            {!data.rows.length && <Empty title="Belum ada jurnal diposting pada periode ini" />}
          </div>
          <BalancedNote ok={data.balanced} okText="Total debit = total kredit" badText="Neraca saldo tidak seimbang" />
        </>
      )}
    </Shell>
  )
}

interface GL {
  account: { id: string; code: string; name: string; normalSide: string }
  opening: string
  closing: string
  rows: { journal_id: string; number: string; journal_date: string; memo: string | null; description: string | null; debit: string; credit: string; balance: string; source_type: string }[]
}

export function GeneralLedger({ entityId }: { entityId: string }) {
  const { data: accounts } = useApi<Account[]>(`/entities/${entityId}/accounts`)
  const p = useParamsState({ from: startOfYear(), to: today(), accountId: '' })
  const from = p.get('from')
  const to = p.get('to')
  const accountId = p.get('accountId') || accounts?.find((a) => a.code === '1-10002')?.id || ''
  const { data, error } = useApi<GL>(accountId ? `/entities/${entityId}/reports/general-ledger?accountId=${accountId}&from=${from}&to=${to}` : null)
  return (
    <Shell
      entityId={entityId}
      title="Buku Besar"
      period={`${dateLong(from)} – ${dateLong(to)}`}
      controls={
        <>
          <div className="min-w-[280px]">
            <label htmlFor="gl-acc" className="label">
              Akun
            </label>
            <select id="gl-acc" className="input" value={accountId} onChange={(e) => p.set('accountId', e.target.value)}>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <DateInput id="from" label="Dari" value={from} onChange={(v) => p.set('from', v)} />
          <DateInput id="to" label="Sampai" value={to} onChange={(v) => p.set('to', v)} />
        </>
      }
    >
      {error ? <ErrorState error={error} /> : !data ? <Loading /> : (
        <div className="overflow-x-auto">
          <div className="mb-2 font-semibold">
            <span className="font-mono">{data.account.code}</span> {data.account.name}
            <span className="ml-2 text-xs font-normal text-muted-fg">saldo normal {data.account.normalSide === 'debit' ? 'debit' : 'kredit'}</span>
          </div>
          <table className="tbl min-w-[800px]">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nomor</th>
                <th>Keterangan</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Kredit</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-canvas font-medium">
                <td colSpan={5}>Saldo awal</td>
                <td className="num">{amount(data.opening, { zero: '0' })}</td>
              </tr>
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{date(r.journal_date)}</td>
                  <td>
                    <Link className="link font-mono text-xs" href={`/e/${entityId}/journals/${r.journal_id}`}>
                      {r.number}
                    </Link>
                  </td>
                  <td className="text-muted-fg">{[r.memo, r.description].filter(Boolean).join(' · ')}</td>
                  <td className="num">{r.debit !== '0.00' ? amount(r.debit) : ''}</td>
                  <td className="num">{r.credit !== '0.00' ? amount(r.credit) : ''}</td>
                  <td className="num">{amount(r.balance, { zero: '0' })}</td>
                </tr>
              ))}
              <tr className="bg-canvas font-semibold">
                <td colSpan={5}>Saldo akhir</td>
                <td className="num">{amount(data.closing, { zero: '0' })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}
