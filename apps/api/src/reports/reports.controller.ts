import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common'
import Decimal from 'decimal.js'
import { z } from 'zod'
import { AccessService } from '../auth/access.service'
import { Auth, AuthCtx } from '../auth/auth.guard'
import { NotFound } from '../common/errors'
import { isoDate, parse, uuid } from '../common/validation'
import { ACCOUNT_CATEGORIES, AccountCategory, CATEGORIES } from '../coa/template'
import { Db, DbService } from '../db/db.service'

// Reversed journals stay in the ledger together with their posted reversal, so both count.
const POSTED = `j.status in ('posted', 'reversed')`

const Range = z.object({ from: isoDate, to: isoDate })

function prevDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

interface Totals {
  id: string
  code: string
  name: string
  category: AccountCategory
  debit: string
  credit: string
}

async function accountTotals(db: Db, entityId: string, from: string | null, to: string): Promise<Totals[]> {
  return (
    await db.query(
      `select a.id, a.code, a.name, a.category,
              coalesce(sum(l.debit) filter (where j.id is not null), 0) as debit,
              coalesce(sum(l.credit) filter (where j.id is not null), 0) as credit
         from accounts a
         left join journal_lines l on l.account_id = a.id
         left join journal_entries j on j.id = l.entry_id and ${POSTED}
              and ($2::date is null or j.journal_date >= $2) and j.journal_date <= $3
        where a.entity_id = $1
        group by a.id order by a.code`,
      [entityId, from, to],
    )
  ).rows
}

const d = (v: Decimal.Value) => new Decimal(v)

/** Signed so that each account's natural side is positive. */
function natural(t: Totals) {
  return CATEGORIES[t.category].normal === 'debit' ? d(t.debit).minus(t.credit) : d(t.credit).minus(t.debit)
}

function section(rows: Totals[], cats: AccountCategory[], sign: (t: Totals) => Decimal) {
  return cats.map((category) => {
    const items = rows
      .filter((r) => r.category === category)
      .map((r) => ({ accountId: r.id, code: r.code, name: r.name, amount: sign(r) }))
      .filter((r) => !r.amount.isZero())
    const total = items.reduce((s, r) => s.plus(r.amount), d(0))
    return { category, label: CATEGORIES[category].label, items: items.map((i) => ({ ...i, amount: i.amount.toFixed(2) })), total: total.toFixed(2) }
  })
}

const creditMinusDebit = (t: Totals) => d(t.credit).minus(t.debit)
const debitMinusCredit = (t: Totals) => d(t.debit).minus(t.credit)

function netIncome(rows: Totals[]) {
  return rows
    .filter((r) => ['income', 'expense'].includes(CATEGORIES[r.category].group))
    .reduce((s, r) => s.plus(creditMinusDebit(r)), d(0))
}

@Controller('entities/:entityId/reports')
export class ReportsController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
  ) {}

  @Get('trial-balance')
  trialBalance(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Query() q: unknown) {
    const r = parse(Range, q)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const opening = new Map((await accountTotals(db, entityId, null, prevDay(r.from))).map((t) => [t.id, t]))
      const movement = await accountTotals(db, entityId, r.from, r.to)
      const sums = { openingDebit: d(0), openingCredit: d(0), debit: d(0), credit: d(0), closingDebit: d(0), closingCredit: d(0) }
      const rows = movement
        .map((m) => {
          const o = opening.get(m.id)!
          const openNet = d(o.debit).minus(o.credit)
          const closeNet = openNet.plus(m.debit).minus(m.credit)
          const row = {
            accountId: m.id,
            code: m.code,
            name: m.name,
            category: m.category,
            openingDebit: openNet.gt(0) ? openNet : d(0),
            openingCredit: openNet.lt(0) ? openNet.neg() : d(0),
            debit: d(m.debit),
            credit: d(m.credit),
            closingDebit: closeNet.gt(0) ? closeNet : d(0),
            closingCredit: closeNet.lt(0) ? closeNet.neg() : d(0),
          }
          return row
        })
        .filter((x) => !(x.openingDebit.isZero() && x.openingCredit.isZero() && x.debit.isZero() && x.credit.isZero()))
      for (const x of rows) for (const k of Object.keys(sums) as (keyof typeof sums)[]) sums[k] = sums[k].plus(x[k])
      const fmt = <T extends Record<string, unknown>>(o: T) =>
        Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v instanceof Decimal ? v.toFixed(2) : v]))
      return {
        from: r.from,
        to: r.to,
        rows: rows.map(fmt),
        totals: fmt(sums),
        balanced: sums.closingDebit.eq(sums.closingCredit) && sums.debit.eq(sums.credit),
      }
    })
  }

  @Get('general-ledger')
  generalLedger(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Query() q: unknown) {
    const r = parse(Range.extend({ accountId: uuid }), q)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const acc = (await db.query(`select id, code, name, category from accounts where entity_id = $1 and id = $2`, [entityId, r.accountId])).rows[0]
      if (!acc) throw new NotFound('Account')
      const debitNormal = CATEGORIES[acc.category as AccountCategory].normal === 'debit'
      const o = (
        await db.query(
          `select coalesce(sum(l.debit), 0) as debit, coalesce(sum(l.credit), 0) as credit
             from journal_lines l join journal_entries j on j.id = l.entry_id
            where l.account_id = $1 and ${POSTED} and j.journal_date < $2`,
          [r.accountId, r.from],
        )
      ).rows[0]
      const opening = debitNormal ? d(o.debit).minus(o.credit) : d(o.credit).minus(o.debit)
      const lines = (
        await db.query(
          `select j.id as journal_id, j.number, j.journal_date, j.memo, j.source_type, l.description, l.debit, l.credit
             from journal_lines l join journal_entries j on j.id = l.entry_id
            where l.account_id = $1 and ${POSTED} and j.journal_date between $2 and $3
            order by j.journal_date, j.posted_at, j.number, l.line_no`,
          [r.accountId, r.from, r.to],
        )
      ).rows
      let running = opening
      const rows = lines.map((l) => {
        running = running.plus(debitNormal ? d(l.debit).minus(l.credit) : d(l.credit).minus(l.debit))
        return { ...l, balance: running.toFixed(2) }
      })
      return { account: { ...acc, normalSide: debitNormal ? 'debit' : 'credit' }, from: r.from, to: r.to, opening: opening.toFixed(2), rows, closing: running.toFixed(2) }
    })
  }

  @Get('profit-loss')
  profitLoss(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Query() q: unknown) {
    const r = parse(Range, q)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const rows = await accountTotals(db, entityId, r.from, r.to)
      const [revenue] = section(rows, ['revenue'], creditMinusDebit)
      const [cogs] = section(rows, ['cogs'], debitMinusCredit)
      const [expense] = section(rows, ['expense'], debitMinusCredit)
      const [otherIncome] = section(rows, ['other_income'], creditMinusDebit)
      const [otherExpense] = section(rows, ['other_expense'], debitMinusCredit)
      const gross = d(revenue.total).minus(cogs.total)
      const operating = gross.minus(expense.total)
      const net = operating.plus(otherIncome.total).minus(otherExpense.total)
      return {
        from: r.from,
        to: r.to,
        revenue,
        cogs,
        grossProfit: gross.toFixed(2),
        expense,
        operatingProfit: operating.toFixed(2),
        otherIncome,
        otherExpense,
        netIncome: net.toFixed(2),
      }
    })
  }

  @Get('balance-sheet')
  balanceSheet(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Query() q: unknown) {
    const { asOf } = parse(z.object({ asOf: isoDate }), q)
    return this.db.tx(ctx, async (db) => {
      const entity = await this.access.assertEntity(db, ctx, entityId)
      const rows = await accountTotals(db, entityId, null, asOf)
      // Fiscal year start containing asOf.
      const y = Number(asOf.slice(0, 4))
      const m = Number(asOf.slice(5, 7))
      const sm = entity.fiscal_year_start_month
      const fyStart = `${m >= sm ? y : y - 1}-${String(sm).padStart(2, '0')}-01`
      const prior = await accountTotals(db, entityId, null, prevDay(fyStart))
      const current = await accountTotals(db, entityId, fyStart, asOf)
      const assets = section(rows, ['cash_bank', 'receivable', 'inventory', 'other_current_asset', 'fixed_asset', 'depreciation', 'other_asset'], debitMinusCredit)
      const liabilities = section(rows, ['payable', 'other_current_liability', 'long_term_liability'], creditMinusDebit)
      const [equity] = section(rows, ['equity'], creditMinusDebit)
      const priorEarnings = netIncome(prior)
      const currentEarnings = netIncome(current)
      const totalAssets = assets.reduce((s, x) => s.plus(x.total), d(0))
      const totalLiabilities = liabilities.reduce((s, x) => s.plus(x.total), d(0))
      const totalEquity = d(equity.total).plus(priorEarnings).plus(currentEarnings)
      const totalLE = totalLiabilities.plus(totalEquity)
      return {
        asOf,
        fiscalYearStart: fyStart,
        assets,
        liabilities,
        equity,
        priorEarnings: priorEarnings.toFixed(2),
        currentEarnings: currentEarnings.toFixed(2),
        totalAssets: totalAssets.toFixed(2),
        totalLiabilities: totalLiabilities.toFixed(2),
        totalEquity: totalEquity.toFixed(2),
        totalLiabilitiesEquity: totalLE.toFixed(2),
        balanced: totalAssets.eq(totalLE),
      }
    })
  }

  /** Small set of headline numbers for the company dashboard. */
  @Get('summary')
  summary(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Query() q: unknown) {
    const { asOf } = parse(z.object({ asOf: isoDate }), q)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const rows = await accountTotals(db, entityId, null, asOf)
      const byCat = (c: AccountCategory) => rows.filter((r) => r.category === c).reduce((s, r) => s.plus(natural(r)), d(0)).toFixed(2)
      const monthStart = `${asOf.slice(0, 7)}-01`
      const month = await accountTotals(db, entityId, monthStart, asOf)
      const counts = (
        await db.query(`select status, count(*)::int as n from journal_entries where entity_id = $1 group by status`, [entityId])
      ).rows.reduce((m: Record<string, number>, r) => ({ ...m, [r.status]: r.n }), {})
      const cash = rows.filter((r) => r.category === 'cash_bank').map((r) => ({ accountId: r.id, code: r.code, name: r.name, balance: natural(r).toFixed(2) }))
      return {
        asOf,
        cashBank: byCat('cash_bank'),
        receivable: byCat('receivable'),
        payable: byCat('payable'),
        netIncomeMonth: netIncome(month).toFixed(2),
        journalCounts: counts,
        cashAccounts: cash,
        categories: ACCOUNT_CATEGORIES.map((c) => ({ category: c, label: CATEGORIES[c].label, balance: byCat(c) })),
      }
    })
  }
}
