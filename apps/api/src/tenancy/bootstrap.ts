import type { AuthCtx } from '../auth/auth.guard'
import { COA_TEMPLATE } from '../coa/template'
import type { Db } from '../db/db.service'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function iso(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m, d))
  return dt.toISOString().slice(0, 10)
}

/** Creates 12 monthly periods of the fiscal year that starts in `startMonth` (1-12) of `year`. Existing ones are kept. */
export async function generateFiscalYear(db: Db, ctx: Pick<AuthCtx, 'firmId'>, entityId: string, startMonth: number, year: number) {
  let created = 0
  for (let i = 0; i < 12; i++) {
    const m = startMonth - 1 + i
    const start = iso(year, m, 1)
    const end = iso(year, m + 1, 0)
    const label = `${MONTHS[((m % 12) + 12) % 12]} ${Number(start.slice(0, 4))}`
    const r = await db.query(
      `insert into fiscal_periods (firm_id, entity_id, name, start_date, end_date) values ($1, $2, $3, $4, $5) on conflict do nothing`,
      [ctx.firmId, entityId, label, start, end],
    )
    created += r.rowCount ?? 0
  }
  return created
}

export interface NewEntity {
  name: string
  legalName?: string | null
  npwp?: string | null
  address?: string | null
  fiscalYearStartMonth: number
  requireApproval: boolean
}

/** A new company gets the standard chart of accounts, a head-office branch, the current fiscal year and a journal sequence. */
export async function createEntity(db: Db, ctx: Pick<AuthCtx, 'firmId'>, clientId: string, e: NewEntity, today = new Date()) {
  const r = await db.query(
    `insert into legal_entities (firm_id, client_id, name, legal_name, npwp, address, fiscal_year_start_month, require_approval)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [ctx.firmId, clientId, e.name, e.legalName ?? null, e.npwp ?? null, e.address ?? null, e.fiscalYearStartMonth, e.requireApproval],
  )
  const entity = r.rows[0]
  const values: unknown[] = []
  const rows = COA_TEMPLATE.map(([code, name, category, system], i) => {
    values.push(ctx.firmId, entity.id, code, name, category, !!system)
    const b = i * 6
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`
  })
  await db.query(`insert into accounts (firm_id, entity_id, code, name, category, is_system) values ${rows.join(', ')}`, values)
  await db.query(`insert into branches (firm_id, entity_id, code, name) values ($1, $2, 'PUSAT', 'Kantor Pusat')`, [ctx.firmId, entity.id])
  await db.query(`insert into document_sequences (firm_id, entity_id, doc_type, prefix) values ($1, $2, 'journal', 'JU/')`, [ctx.firmId, entity.id])

  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1
  const fyYear = m >= e.fiscalYearStartMonth ? y : y - 1
  await generateFiscalYear(db, ctx, entity.id, e.fiscalYearStartMonth, fyYear)
  return entity
}

/** Gap-free, concurrency-safe document numbering (row lock on the sequence). */
export async function nextDocumentNumber(db: Db, entityId: string, docType: string, date: string) {
  const r = await db.query(
    `update document_sequences set next_value = next_value + 1 where entity_id = $1 and doc_type = $2 returning prefix, next_value - 1 as n`,
    [entityId, docType],
  )
  if (!r.rowCount) throw new Error(`no document sequence ${docType}`)
  const { prefix, n } = r.rows[0]
  return `${prefix}${date.slice(0, 4)}/${String(n).padStart(5, '0')}`
}
