import { describe, expect, it } from 'vitest'
import { SYS } from './coa'
import { round2 } from './format'
import {
  accountTotals,
  aging,
  balanceSheet,
  buildLedger,
  cashFlow,
  computeCosting,
  docTotals,
  generalLedger,
  invoiceStatus,
  profitLoss,
  trialBalance,
} from './ledger'
import { demoData, emptyData } from './seed'
import type { AppData } from './types'

function scenario(): AppData {
  const d = emptyData()
  d.contacts = [
    { id: 'cust', type: 'customer', name: 'Customer' },
    { id: 'sup', type: 'supplier', name: 'Supplier' },
  ]
  d.products = [
    {
      id: 'p',
      code: 'P',
      name: 'Barang',
      unit: 'Pcs',
      sellPrice: 150,
      buyPrice: 100,
      trackInventory: true,
      salesAccountId: SYS.revenue,
      purchaseAccountId: SYS.inventory,
      cogsAccountId: SYS.cogs,
      openingQty: 10,
      openingCost: 100,
      openingDate: '2026-01-01',
    },
  ]
  d.journals.push({
    id: 'cap',
    number: 'JE-1',
    date: '2026-01-01',
    createdAt: 1,
    lines: [
      { id: '1', accountId: SYS.bank, description: '', debit: 10_000, credit: 0 },
      { id: '2', accountId: 'acc-3-30000', description: '', debit: 0, credit: 10_000 },
    ],
  })
  // Buy 10 @ 130 + 11% VAT  -> avg cost (10*100 + 10*130)/20 = 115
  d.purchaseInvoices.push({
    id: 'pi',
    number: 'PI-1',
    contactId: 'sup',
    date: '2026-01-05',
    dueDate: '2026-02-04',
    createdAt: 2,
    lines: [{ id: 'pl', productId: 'p', description: '', qty: 10, price: 130, discountPct: 0, taxPct: 11 }],
  })
  // Sell 4 @ 200, 10% discount, 11% VAT
  d.salesInvoices.push({
    id: 'si',
    number: 'INV-1',
    contactId: 'cust',
    date: '2026-01-10',
    dueDate: '2026-02-09',
    createdAt: 3,
    lines: [{ id: 'sl', productId: 'p', description: '', qty: 4, price: 200, discountPct: 10, taxPct: 11 }],
  })
  d.payments.push({
    id: 'rp',
    kind: 'receive',
    number: 'RP-1',
    date: '2026-01-20',
    contactId: 'cust',
    accountId: SYS.bank,
    allocations: [{ invoiceId: 'si', amount: 500 }],
    createdAt: 4,
  })
  d.expenses.push({
    id: 'ex',
    number: 'EXP-1',
    date: '2026-01-25',
    payFromAccountId: SYS.bank,
    createdAt: 5,
    lines: [{ id: 'el', accountId: 'acc-6-60202', description: 'Listrik', amount: 100, taxPct: 11 }],
  })
  return d
}

describe('document math', () => {
  it('applies discount before tax', () => {
    const t = docTotals([{ id: 'x', description: '', qty: 4, price: 200, discountPct: 10, taxPct: 11 }])
    expect(t).toEqual({ subtotal: 800, discount: 80, tax: 79.2, total: 799.2 })
  })
})

describe('posting', () => {
  const d = scenario()
  const ledger = buildLedger(d)

  it('every journal entry is balanced', () => {
    for (const e of ledger) {
      const dr = round2(e.lines.reduce((s, l) => s + l.debit, 0))
      const cr = round2(e.lines.reduce((s, l) => s + l.credit, 0))
      expect(dr, e.number).toBe(cr)
    }
  })

  it('uses moving-average cost for COGS', () => {
    const { cogsByLine, stock } = computeCosting(d)
    expect(cogsByLine.get('sl')).toBe(460) // 4 x 115
    expect(stock.get('p')).toMatchObject({ qty: 16, value: 1840 })
  })

  it('sales invoice journal: AR / revenue / VAT out / COGS / inventory', () => {
    const e = ledger.find((x) => x.sourceId === 'si')!
    const by = (id: string) => e.lines.filter((l) => l.accountId === id).reduce((s, l) => s + l.debit - l.credit, 0)
    expect(by(SYS.receivable)).toBe(799.2)
    expect(by(SYS.revenue)).toBe(-720)
    expect(by(SYS.vatOut)).toBe(-79.2)
    expect(by(SYS.cogs)).toBe(460)
    expect(by(SYS.inventory)).toBe(-460)
  })

  it('inventory account equals stock valuation', () => {
    const t = accountTotals(ledger).get(SYS.inventory)!
    expect(round2(t.debit - t.credit)).toBe(computeCosting(d).stock.get('p')!.value)
  })

  it('profit & loss', () => {
    const pl = profitLoss(d, ledger, { from: '2026-01-01', to: '2026-12-31' })
    expect(pl.revenue.total).toBe(720)
    expect(pl.cogs.total).toBe(460)
    expect(pl.grossProfit).toBe(260)
    expect(pl.expense.total).toBe(100)
    expect(pl.net).toBe(160)
  })

  it('balance sheet balances and includes current earnings', () => {
    const bs = balanceSheet(d, ledger, '2026-12-31')
    expect(bs.currentEarnings).toBe(160)
    expect(bs.totalAssets).toBe(bs.totalLiabilitiesEquity)
    // Equity: capital 10,000 + opening stock 1,000 + earnings 160
    expect(bs.totalEquity).toBe(11_160)
  })

  it('trial balance debits equal credits', () => {
    const tb = trialBalance(d, ledger, { from: '2026-01-01', to: '2026-12-31' })
    expect(tb.totals.closeDebit).toBe(tb.totals.closeCredit)
    expect(tb.totals.debit).toBe(tb.totals.credit)
  })

  it('invoice status and aging', () => {
    const s = invoiceStatus(d, d.salesInvoices[0], '2026-01-31')
    expect(s).toMatchObject({ total: 799.2, paid: 500, due: 299.2, status: 'partial' })
    expect(invoiceStatus(d, d.salesInvoices[0], '2026-03-01').status).toBe('overdue')
    const ag = aging(d, 'receivable', '2026-03-15')
    expect(ag[0].buckets).toEqual([0, 0, 299.2, 0, 0])
  })

  it('cash flow reconciles to cash balances', () => {
    const cf = cashFlow(d, ledger, { from: '2026-01-01', to: '2026-12-31' })
    expect(cf.opening).toBe(0)
    expect(round2(cf.opening + cf.net)).toBe(cf.closing)
    expect(cf.closing).toBe(round2(10_000 + 500 - 111))
    expect(cf.financing.total).toBe(10_000)
  })

  it('general ledger running balance', () => {
    const gl = generalLedger(d, ledger, SYS.bank, { from: '2026-01-15', to: '2026-12-31' })
    expect(gl.opening).toBe(10_000)
    expect(gl.closing).toBe(10_389)
  })
})

describe('demo data', () => {
  const d = demoData()
  const ledger = buildLedger(d)
  it('is internally consistent', () => {
    const bs = balanceSheet(d, ledger, '2999-12-31')
    expect(bs.totalAssets).toBe(bs.totalLiabilitiesEquity)
    const tb = trialBalance(d, ledger, {})
    expect(tb.totals.closeDebit).toBe(tb.totals.closeCredit)
    const inv = accountTotals(ledger).get(SYS.inventory)!
    const stockValue = round2([...computeCosting(d).stock.values()].reduce((s, p) => s + p.value, 0))
    expect(round2(inv.debit - inv.credit)).toBe(stockValue)
    for (const p of computeCosting(d).stock.values()) expect(p.qty).toBeGreaterThanOrEqual(0)
  })
})
