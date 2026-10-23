import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES, CATEGORY_ORDER } from '../lib/coa'
import { acct, money } from '../lib/format'
import type { InvoiceStatus } from '../lib/ledger'
import { sortAccounts } from '../lib/ledger'
import type { AccountCategory, ContactType, LedgerEntry } from '../lib/types'
import { useLookups, useStore } from '../store/store'

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {back && (
          <Link to={back.to} className="mb-1 inline-block text-xs font-medium text-brand-600 hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const statusStyle: Record<InvoiceStatus, [string, string]> = {
  paid: ['Lunas', 'bg-emerald-100 text-emerald-700'],
  partial: ['Dibayar Sebagian', 'bg-amber-100 text-amber-700'],
  unpaid: ['Belum Dibayar', 'bg-sky-100 text-sky-700'],
  overdue: ['Jatuh Tempo', 'bg-red-100 text-red-700'],
}

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const [label, cls] = statusStyle[status]
  return <span className={`badge ${cls}`}>{label}</span>
}

export function AccountSelect({
  value,
  onChange,
  categories,
  exclude,
  className = 'input',
  placeholder = 'Pilih akun',
}: {
  value: string
  onChange: (id: string) => void
  categories?: AccountCategory[]
  exclude?: AccountCategory[]
  className?: string
  placeholder?: string
}) {
  const { data } = useStore()
  const groups = useMemo(() => {
    const cats = (categories ?? CATEGORY_ORDER).filter((c) => !exclude?.includes(c))
    return cats
      .map((c) => ({ c, accounts: sortAccounts(data.accounts.filter((a) => a.category === c)) }))
      .filter((g) => g.accounts.length)
  }, [data.accounts, categories, exclude])
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.c} label={CATEGORIES[g.c].label}>
          {g.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              ({a.code}) {a.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function ContactSelect({ value, onChange, types, placeholder = 'Pilih kontak' }: { value: string; onChange: (id: string) => void; types?: ContactType[]; placeholder?: string }) {
  const { data } = useStore()
  const list = data.contacts.filter((c) => !types || types.includes(c.type)).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

export function NumInput({ value, onChange, className = 'input text-right', min }: { value: number; onChange: (n: number) => void; className?: string; min?: number }) {
  return (
    <input
      type="number"
      className={className}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      step="any"
      onChange={(e) => onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
      onFocus={(e) => e.target.select()}
    />
  )
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-400">{children}</div>
}

export function StatCard({ label, value, tone = 'slate', hint }: { label: string; value: string; tone?: 'slate' | 'red' | 'green' | 'blue' | 'amber'; hint?: string }) {
  const bar = { slate: 'bg-slate-400', red: 'bg-red-500', green: 'bg-emerald-500', blue: 'bg-brand-500', amber: 'bg-amber-500' }[tone]
  return (
    <div className="card relative overflow-hidden p-4">
      <div className={`absolute inset-x-0 top-0 h-1 ${bar}`} />
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            value === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Shows the journal entry automatically generated for a document. */
export function JournalPreview({ entry }: { entry?: LedgerEntry }) {
  const { account } = useLookups()
  if (!entry) return null
  const dr = entry.lines.reduce((s, l) => s + l.debit, 0)
  const cr = entry.lines.reduce((s, l) => s + l.credit, 0)
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Jurnal Otomatis</div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Akun</th>
              <th>Keterangan</th>
              <th className="num">Debit</th>
              <th className="num">Kredit</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l, i) => {
              const a = account.get(l.accountId)
              return (
                <tr key={i}>
                  <td className={l.credit ? 'pl-8' : ''}>
                    <Link to={`/akun/${l.accountId}`} className="text-brand-700 hover:underline">
                      ({a?.code}) {a?.name}
                    </Link>
                  </td>
                  <td className="text-slate-500">{l.description}</td>
                  <td className="num">{l.debit ? acct(l.debit) : ''}</td>
                  <td className="num">{l.credit ? acct(l.credit) : ''}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-3 py-2" colSpan={2}>
                Total
              </td>
              <td className="num px-3 py-2">{acct(dr)}</td>
              <td className="num px-3 py-2">{acct(cr)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export function Money({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`tabular-nums ${value < 0 ? 'text-red-600' : ''} ${className}`}>{money(value)}</span>
}

export function confirmDelete(what: string) {
  return window.confirm(`Hapus ${what}? Tindakan ini tidak dapat dibatalkan.`)
}
