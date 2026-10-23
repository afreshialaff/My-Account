import { CATEGORIES, SYS } from './coa'
import { daysBetween, round2, startOfYear } from './format'
import type {
  Account,
  AccountCategory,
  AppData,
  DocLine,
  Invoice,
  LedgerEntry,
  LedgerLine,
  Product,
} from './types'

/* ------------------------------------------------------------------ */
/* Document math                                                       */
/* ------------------------------------------------------------------ */

export function lineAmounts(l: Pick<DocLine, 'qty' | 'price' | 'discountPct' | 'taxPct'>) {
  const gross = round2((l.qty || 0) * (l.price || 0))
  const discount = round2((gross * (l.discountPct || 0)) / 100)
  const net = round2(gross - discount)
  const tax = round2((net * (l.taxPct || 0)) / 100)
  return { gross, discount, net, tax, total: round2(net + tax) }
}

export function docTotals(lines: DocLine[]) {
  let subtotal = 0
  let discount = 0
  let tax = 0
  for (const l of lines) {
    const a = lineAmounts(l)
    subtotal += a.gross
    discount += a.discount
    tax += a.tax
  }
  subtotal = round2(subtotal)
  discount = round2(discount)
  tax = round2(tax)
  return { subtotal, discount, tax, total: round2(subtotal - discount + tax) }
}

export function invoicePaid(data: AppData, invoiceId: string, asOf?: string): number {
  let s = 0
  for (const p of data.payments) {
    if (asOf && p.date > asOf) continue
    for (const a of p.allocations) if (a.invoiceId === invoiceId) s += a.amount
  }
  return round2(s)
}

export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue'

export function invoiceStatus(data: AppData, inv: Invoice, asOf: string) {
  const total = docTotals(inv.lines).total
  const paid = invoicePaid(data, inv.id)
  const due = round2(total - paid)
  let status: InvoiceStatus
  if (due <= 0) status = 'paid'
  else if (inv.dueDate < asOf) status = 'overdue'
  else if (paid > 0) status = 'partial'
  else status = 'unpaid'
  return { total, paid, due, status }
}

/* ------------------------------------------------------------------ */
/* Inventory costing — perpetual, moving average                       */
/* ------------------------------------------------------------------ */

export interface StockPosition {
  qty: number
  value: number
  avgCost: number
}

interface StockEvent {
  productId: string
  date: string
  order: number // 0 = in, 1 = out (incoming processed first on the same day)
  createdAt: number
  qty: number
  value?: number // for incoming
  lineId?: string // for outgoing sales lines
}

export function computeCosting(data: AppData, asOf?: string) {
  const products = new Map(data.products.map((p) => [p.id, p]))
  const events: StockEvent[] = []

  for (const p of data.products) {
    if (p.trackInventory && p.openingQty > 0) {
      events.push({
        productId: p.id,
        date: p.openingDate,
        order: 0,
        createdAt: 0,
        qty: p.openingQty,
        value: round2(p.openingQty * p.openingCost),
      })
    }
  }
  for (const inv of data.purchaseInvoices) {
    for (const l of inv.lines) {
      const p = l.productId ? products.get(l.productId) : undefined
      if (!p?.trackInventory || !l.qty) continue
      events.push({
        productId: p.id,
        date: inv.date,
        order: 0,
        createdAt: inv.createdAt,
        qty: l.qty,
        value: lineAmounts(l).net,
      })
    }
  }
  for (const inv of data.salesInvoices) {
    for (const l of inv.lines) {
      const p = l.productId ? products.get(l.productId) : undefined
      if (!p?.trackInventory || !l.qty) continue
      events.push({ productId: p.id, date: inv.date, order: 1, createdAt: inv.createdAt, qty: l.qty, lineId: l.id })
    }
  }

  events.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.order !== b.order ? a.order - b.order : a.createdAt - b.createdAt,
  )

  const stock = new Map<string, StockPosition>()
  const cogsByLine = new Map<string, number>()

  for (const e of events) {
    if (asOf && e.date > asOf) continue
    const product = products.get(e.productId) as Product
    const pos = stock.get(e.productId) ?? { qty: 0, value: 0, avgCost: product.buyPrice || 0 }
    if (e.order === 0) {
      pos.qty = round2(pos.qty + e.qty)
      pos.value = round2(pos.value + (e.value ?? 0))
      if (pos.qty > 0) pos.avgCost = pos.value / pos.qty
      else if (e.qty > 0) pos.avgCost = (e.value ?? 0) / e.qty
    } else {
      // When stock is exhausted the last known average cost is used.
      const cost = pos.qty >= e.qty ? round2((pos.value * e.qty) / pos.qty) : round2(e.qty * pos.avgCost)
      cogsByLine.set(e.lineId as string, cost)
      pos.qty = round2(pos.qty - e.qty)
      pos.value = round2(pos.value - cost)
      if (pos.qty === 0) pos.value = 0
    }
    stock.set(e.productId, pos)
  }
  return { stock, cogsByLine }
}

/* ------------------------------------------------------------------ */
/* Posting — every document is translated into a balanced journal      */
/* ------------------------------------------------------------------ */

function push(lines: LedgerLine[], accountId: string, debit: number, credit: number, description = '') {
  debit = round2(debit)
  credit = round2(credit)
  if (debit === 0 && credit === 0) return
  // Normalise negatives onto the opposite side.
  if (debit < 0) {
    credit -= debit
    debit = 0
  }
  if (credit < 0) {
    debit -= credit
    credit = 0
  }
  lines.push({ accountId, debit, credit, description })
}

/** Merge lines that hit the same account on the same side, keeping journals tidy. */
function compact(lines: LedgerLine[]): LedgerLine[] {
  const out: LedgerLine[] = []
  for (const l of lines) {
    const ex = out.find((o) => o.accountId === l.accountId && o.description === l.description && !!o.debit === !!l.debit)
    if (ex) {
      ex.debit = round2(ex.debit + l.debit)
      ex.credit = round2(ex.credit + l.credit)
    } else out.push({ ...l })
  }
  return out
}

export function buildLedger(data: AppData): LedgerEntry[] {
  const products = new Map(data.products.map((p) => [p.id, p]))
  const { cogsByLine } = computeCosting(data)
  const invoices = new Map([...data.salesInvoices, ...data.purchaseInvoices].map((i) => [i.id, i]))
  const entries: LedgerEntry[] = []

  // Opening inventory
  for (const p of data.products) {
    if (!p.trackInventory || !(p.openingQty > 0)) continue
    const lines: LedgerLine[] = []
    const v = p.openingQty * p.openingCost
    push(lines, p.purchaseAccountId, v, 0, `Saldo awal ${p.name}`)
    push(lines, SYS.openingEquity, 0, v, `Saldo awal ${p.name}`)
    entries.push({
      id: `open-${p.id}`,
      date: p.openingDate,
      number: p.code,
      sourceType: 'opening',
      sourceId: p.id,
      memo: `Saldo awal persediaan ${p.name}`,
      createdAt: 0,
      lines,
    })
  }

  // Sales invoices
  for (const inv of data.salesInvoices) {
    const lines: LedgerLine[] = []
    const t = docTotals(inv.lines)
    push(lines, SYS.receivable, t.total, 0)
    for (const l of inv.lines) {
      const p = l.productId ? products.get(l.productId) : undefined
      const a = lineAmounts(l)
      push(lines, p?.salesAccountId ?? l.accountId ?? SYS.revenue, 0, a.net, l.description)
    }
    push(lines, SYS.vatOut, 0, t.tax)
    for (const l of inv.lines) {
      const p = l.productId ? products.get(l.productId) : undefined
      if (!p?.trackInventory) continue
      const cost = cogsByLine.get(l.id) ?? 0
      push(lines, p.cogsAccountId, cost, 0, p.name)
      push(lines, p.purchaseAccountId, 0, cost, p.name)
    }
    entries.push({
      id: `si-${inv.id}`,
      date: inv.date,
      number: inv.number,
      sourceType: 'sales_invoice',
      sourceId: inv.id,
      contactId: inv.contactId,
      memo: inv.memo || 'Faktur Penjualan',
      createdAt: inv.createdAt,
      lines: compact(lines),
    })
  }

  // Purchase invoices
  for (const inv of data.purchaseInvoices) {
    const lines: LedgerLine[] = []
    const t = docTotals(inv.lines)
    for (const l of inv.lines) {
      const p = l.productId ? products.get(l.productId) : undefined
      push(lines, p?.purchaseAccountId ?? l.accountId ?? SYS.generalExpense, lineAmounts(l).net, 0, l.description)
    }
    push(lines, SYS.vatIn, t.tax, 0)
    push(lines, SYS.payable, 0, t.total)
    entries.push({
      id: `pi-${inv.id}`,
      date: inv.date,
      number: inv.number,
      sourceType: 'purchase_invoice',
      sourceId: inv.id,
      contactId: inv.contactId,
      memo: inv.memo || 'Faktur Pembelian',
      createdAt: inv.createdAt,
      lines: compact(lines),
    })
  }

  // Payments
  for (const p of data.payments) {
    const lines: LedgerLine[] = []
    const total = round2(p.allocations.reduce((s, a) => s + a.amount, 0))
    const refs = p.allocations.map((a) => invoices.get(a.invoiceId)?.number).filter(Boolean).join(', ')
    if (p.kind === 'receive') {
      push(lines, p.accountId, total, 0)
      push(lines, SYS.receivable, 0, total, refs)
    } else {
      push(lines, SYS.payable, total, 0, refs)
      push(lines, p.accountId, 0, total)
    }
    entries.push({
      id: `pay-${p.id}`,
      date: p.date,
      number: p.number,
      sourceType: p.kind === 'receive' ? 'receive_payment' : 'purchase_payment',
      sourceId: p.id,
      contactId: p.contactId,
      memo: p.memo || (p.kind === 'receive' ? 'Penerimaan Pembayaran' : 'Pembayaran Pembelian'),
      createdAt: p.createdAt,
      lines,
    })
  }

  // Expenses
  for (const e of data.expenses) {
    const lines: LedgerLine[] = []
    let total = 0
    let tax = 0
    for (const l of e.lines) {
      const t = round2((l.amount * (l.taxPct || 0)) / 100)
      push(lines, l.accountId, l.amount, 0, l.description)
      tax += t
      total += l.amount + t
    }
    push(lines, SYS.vatIn, tax, 0)
    push(lines, e.payFromAccountId, 0, total)
    entries.push({
      id: `exp-${e.id}`,
      date: e.date,
      number: e.number,
      sourceType: 'expense',
      sourceId: e.id,
      contactId: e.contactId,
      memo: e.memo || 'Biaya',
      createdAt: e.createdAt,
      lines: compact(lines),
    })
  }

  // Cash & bank
  for (const c of data.cashTransactions) {
    const lines: LedgerLine[] = []
    if (c.kind === 'transfer') {
      push(lines, c.toAccountId as string, c.amount ?? 0, 0)
      push(lines, c.accountId, 0, c.amount ?? 0)
    } else {
      const total = c.lines.reduce((s, l) => s + l.amount, 0)
      if (c.kind === 'receive') {
        push(lines, c.accountId, total, 0)
        for (const l of c.lines) push(lines, l.accountId, 0, l.amount, l.description)
      } else {
        for (const l of c.lines) push(lines, l.accountId, l.amount, 0, l.description)
        push(lines, c.accountId, 0, total)
      }
    }
    entries.push({
      id: `cash-${c.id}`,
      date: c.date,
      number: c.number,
      sourceType: c.kind === 'transfer' ? 'bank_transfer' : c.kind === 'receive' ? 'bank_deposit' : 'bank_withdrawal',
      sourceId: c.id,
      contactId: c.contactId,
      memo: c.memo || (c.kind === 'transfer' ? 'Transfer Dana' : c.kind === 'receive' ? 'Terima Uang' : 'Kirim Uang'),
      createdAt: c.createdAt,
      lines,
    })
  }

  // Manual journals
  for (const j of data.journals) {
    const lines: LedgerLine[] = []
    for (const l of j.lines) push(lines, l.accountId, l.debit, l.credit, l.description)
    entries.push({
      id: `je-${j.id}`,
      date: j.date,
      number: j.number,
      sourceType: 'journal',
      sourceId: j.id,
      memo: j.memo || 'Jurnal Umum',
      createdAt: j.createdAt,
      lines,
    })
  }

  entries.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt - b.createdAt))
  return entries
}

export const SOURCE_LABEL: Record<LedgerEntry['sourceType'], string> = {
  opening: 'Saldo Awal',
  sales_invoice: 'Faktur Penjualan',
  purchase_invoice: 'Faktur Pembelian',
  receive_payment: 'Terima Pembayaran',
  purchase_payment: 'Pembayaran Pembelian',
  expense: 'Biaya',
  bank_transfer: 'Transfer Dana',
  bank_deposit: 'Terima Uang',
  bank_withdrawal: 'Kirim Uang',
  journal: 'Jurnal Umum',
}

/* ------------------------------------------------------------------ */
/* Balances                                                            */
/* ------------------------------------------------------------------ */

export interface Range {
  from?: string
  to?: string
}

export type Totals = Map<string, { debit: number; credit: number }>

export function accountTotals(ledger: LedgerEntry[], range: Range = {}): Totals {
  const m: Totals = new Map()
  for (const e of ledger) {
    if (range.from && e.date < range.from) continue
    if (range.to && e.date > range.to) continue
    for (const l of e.lines) {
      const t = m.get(l.accountId) ?? { debit: 0, credit: 0 }
      t.debit += l.debit
      t.credit += l.credit
      m.set(l.accountId, t)
    }
  }
  for (const t of m.values()) {
    t.debit = round2(t.debit)
    t.credit = round2(t.credit)
  }
  return m
}

/** Balance in the account's normal direction. */
export function normalBalance(account: Account, t?: { debit: number; credit: number }): number {
  if (!t) return 0
  return CATEGORIES[account.category].normal === 'debit' ? round2(t.debit - t.credit) : round2(t.credit - t.debit)
}

export function balanceOf(ledger: LedgerEntry[], account: Account, range: Range = {}): number {
  return normalBalance(account, accountTotals(ledger, range).get(account.id))
}

export function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export interface ReportRow {
  account: Account
  amount: number
}

export interface ReportSection {
  category: AccountCategory
  label: string
  rows: ReportRow[]
  total: number
}

function sections(accounts: Account[], totals: Totals, cats: AccountCategory[], sign: (a: Account, t?: { debit: number; credit: number }) => number, includeZero = false): ReportSection[] {
  return cats.map((category) => {
    const rows = sortAccounts(accounts.filter((a) => a.category === category))
      .map((account) => ({ account, amount: sign(account, totals.get(account.id)) }))
      .filter((r) => includeZero || r.amount !== 0)
    return { category, label: CATEGORIES[category].label, rows, total: round2(rows.reduce((s, r) => s + r.amount, 0)) }
  })
}

/** Credit-positive amount for P&L presentation (income positive, expense positive within its own section). */
const incomeSign = (_a: Account, t?: { debit: number; credit: number }) => (t ? round2(t.credit - t.debit) : 0)
const expenseSign = (_a: Account, t?: { debit: number; credit: number }) => (t ? round2(t.debit - t.credit) : 0)
const assetSign = expenseSign
const liabSign = incomeSign

export function netIncome(accounts: Account[], totals: Totals): number {
  let n = 0
  for (const a of accounts) {
    const g = CATEGORIES[a.category].group
    if (g !== 'income' && g !== 'expense') continue
    const t = totals.get(a.id)
    if (t) n += t.credit - t.debit
  }
  return round2(n)
}

export function profitLoss(data: AppData, ledger: LedgerEntry[], range: Range) {
  const totals = accountTotals(ledger, range)
  const [revenue] = sections(data.accounts, totals, ['revenue'], incomeSign)
  const [cogs] = sections(data.accounts, totals, ['cogs'], expenseSign)
  const [expense] = sections(data.accounts, totals, ['expense'], expenseSign)
  const [otherIncome] = sections(data.accounts, totals, ['other_income'], incomeSign)
  const [otherExpense] = sections(data.accounts, totals, ['other_expense'], expenseSign)
  const grossProfit = round2(revenue.total - cogs.total)
  const operatingProfit = round2(grossProfit - expense.total)
  const netOther = round2(otherIncome.total - otherExpense.total)
  const net = round2(operatingProfit + netOther)
  return { revenue, cogs, grossProfit, expense, operatingProfit, otherIncome, otherExpense, netOther, net }
}

export function balanceSheet(data: AppData, ledger: LedgerEntry[], asOf: string) {
  const totals = accountTotals(ledger, { to: asOf })
  const assets = sections(
    data.accounts,
    totals,
    ['cash_bank', 'receivable', 'inventory', 'other_current_asset', 'fixed_asset', 'depreciation', 'other_asset'],
    assetSign,
  )
  const liabilities = sections(data.accounts, totals, ['payable', 'other_current_liability', 'long_term_liability'], liabSign)
  const [equity] = sections(data.accounts, totals, ['equity'], liabSign)

  const fyStart = startOfYear(asOf)
  const priorTotals = accountTotals(ledger, { to: prevDay(fyStart) })
  const currentTotals = accountTotals(ledger, { from: fyStart, to: asOf })
  const priorEarnings = netIncome(data.accounts, priorTotals)
  const currentEarnings = netIncome(data.accounts, currentTotals)

  const totalAssets = round2(assets.reduce((s, x) => s + x.total, 0))
  const totalLiabilities = round2(liabilities.reduce((s, x) => s + x.total, 0))
  const totalEquity = round2(equity.total + priorEarnings + currentEarnings)
  return {
    assets,
    liabilities,
    equity,
    priorEarnings,
    currentEarnings,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesEquity: round2(totalLiabilities + totalEquity),
  }
}

function prevDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d - 1))
  return dt.toISOString().slice(0, 10)
}

export function trialBalance(data: AppData, ledger: LedgerEntry[], range: Range) {
  const opening = range.from ? accountTotals(ledger, { to: prevDay(range.from) }) : new Map()
  const movement = accountTotals(ledger, range)
  const rows = sortAccounts(data.accounts)
    .map((account) => {
      const o = opening.get(account.id) ?? { debit: 0, credit: 0 }
      const m = movement.get(account.id) ?? { debit: 0, credit: 0 }
      const openNet = round2(o.debit - o.credit)
      const closeNet = round2(openNet + m.debit - m.credit)
      return {
        account,
        openDebit: openNet > 0 ? openNet : 0,
        openCredit: openNet < 0 ? -openNet : 0,
        debit: m.debit,
        credit: m.credit,
        closeDebit: closeNet > 0 ? closeNet : 0,
        closeCredit: closeNet < 0 ? -closeNet : 0,
      }
    })
    .filter((r) => r.openDebit || r.openCredit || r.debit || r.credit)
  const sum = (k: keyof (typeof rows)[number]) => round2(rows.reduce((s, r) => s + (r[k] as number), 0))
  return {
    rows,
    totals: {
      openDebit: sum('openDebit'),
      openCredit: sum('openCredit'),
      debit: sum('debit'),
      credit: sum('credit'),
      closeDebit: sum('closeDebit'),
      closeCredit: sum('closeCredit'),
    },
  }
}

export function generalLedger(data: AppData, ledger: LedgerEntry[], accountId: string, range: Range) {
  const account = data.accounts.find((a) => a.id === accountId) as Account
  const debitNormal = CATEGORIES[account.category].normal === 'debit'
  const openTotals = range.from ? accountTotals(ledger, { to: prevDay(range.from) }).get(accountId) : undefined
  const opening = normalBalance(account, openTotals)
  let running = opening
  const rows: { entry: LedgerEntry; line: LedgerLine; balance: number }[] = []
  for (const e of ledger) {
    if (range.from && e.date < range.from) continue
    if (range.to && e.date > range.to) continue
    for (const line of e.lines) {
      if (line.accountId !== accountId) continue
      running = round2(running + (debitNormal ? line.debit - line.credit : line.credit - line.debit))
      rows.push({ entry: e, line, balance: running })
    }
  }
  return { account, opening, rows, closing: running }
}

export const CASHFLOW_GROUPS: { key: string; label: string; activity: 'operating' | 'investing' | 'financing'; cats: AccountCategory[] }[] = [
  { key: 'customers', label: 'Penerimaan dari pelanggan', activity: 'operating', cats: ['receivable', 'revenue'] },
  { key: 'suppliers', label: 'Pembayaran ke pemasok', activity: 'operating', cats: ['payable', 'inventory', 'cogs'] },
  { key: 'opex', label: 'Pengeluaran operasional', activity: 'operating', cats: ['expense'] },
  { key: 'otherOp', label: 'Pendapatan & beban lainnya', activity: 'operating', cats: ['other_income', 'other_expense'] },
  { key: 'otherCA', label: 'Kenaikan/penurunan aset lancar lainnya', activity: 'operating', cats: ['other_current_asset'] },
  { key: 'otherCL', label: 'Kenaikan/penurunan kewajiban lancar lainnya', activity: 'operating', cats: ['other_current_liability'] },
  { key: 'fixed', label: 'Perolehan/penjualan aset tetap', activity: 'investing', cats: ['fixed_asset', 'depreciation'] },
  { key: 'otherInv', label: 'Aktivitas investasi lainnya', activity: 'investing', cats: ['other_asset'] },
  { key: 'loans', label: 'Pembayaran/penerimaan pinjaman jangka panjang', activity: 'financing', cats: ['long_term_liability'] },
  { key: 'equity', label: 'Ekuitas / modal', activity: 'financing', cats: ['equity'] },
]

/** Direct-method cash flow: every non-cash line in an entry that touches cash explains part of the cash movement. */
export function cashFlow(data: AppData, ledger: LedgerEntry[], range: Range) {
  const byId = new Map(data.accounts.map((a) => [a.id, a]))
  const isCash = (id: string) => byId.get(id)?.category === 'cash_bank'
  const groups = new Map(CASHFLOW_GROUPS.map((g) => [g.key, 0]))
  const catToGroup = new Map<AccountCategory, string>()
  for (const g of CASHFLOW_GROUPS) for (const c of g.cats) catToGroup.set(c, g.key)

  for (const e of ledger) {
    if (range.from && e.date < range.from) continue
    if (range.to && e.date > range.to) continue
    if (!e.lines.some((l) => isCash(l.accountId))) continue
    for (const l of e.lines) {
      if (isCash(l.accountId)) continue
      const acc = byId.get(l.accountId)
      if (!acc) continue
      const key = catToGroup.get(acc.category) as string
      groups.set(key, round2((groups.get(key) ?? 0) + l.credit - l.debit))
    }
  }

  const cashAccounts = data.accounts.filter((a) => a.category === 'cash_bank')
  const openT = range.from ? accountTotals(ledger, { to: prevDay(range.from) }) : new Map()
  const closeT = accountTotals(ledger, { to: range.to })
  const opening = round2(cashAccounts.reduce((s, a) => s + normalBalance(a, openT.get(a.id)), 0))
  const closing = round2(cashAccounts.reduce((s, a) => s + normalBalance(a, closeT.get(a.id)), 0))

  const activity = (k: 'operating' | 'investing' | 'financing') => {
    const rows = CASHFLOW_GROUPS.filter((g) => g.activity === k).map((g) => ({ ...g, amount: groups.get(g.key) ?? 0 }))
    return { rows, total: round2(rows.reduce((s, r) => s + r.amount, 0)) }
  }
  const operating = activity('operating')
  const investing = activity('investing')
  const financing = activity('financing')
  const net = round2(operating.total + investing.total + financing.total)
  return { operating, investing, financing, net, opening, closing }
}

export const AGING_BUCKETS = ['Belum jatuh tempo', '1-30 hari', '31-60 hari', '61-90 hari', '> 90 hari'] as const

export function aging(data: AppData, kind: 'receivable' | 'payable', asOf: string) {
  const invoices = kind === 'receivable' ? data.salesInvoices : data.purchaseInvoices
  const rows = new Map<string, number[]>()
  for (const inv of invoices) {
    if (inv.date > asOf) continue
    const due = round2(docTotals(inv.lines).total - invoicePaid(data, inv.id, asOf))
    if (due <= 0) continue
    const days = daysBetween(inv.dueDate, asOf)
    const b = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4
    const r = rows.get(inv.contactId) ?? [0, 0, 0, 0, 0]
    r[b] = round2(r[b] + due)
    rows.set(inv.contactId, r)
  }
  return [...rows.entries()].map(([contactId, buckets]) => ({
    contactId,
    buckets,
    total: round2(buckets.reduce((s, x) => s + x, 0)),
  }))
}
