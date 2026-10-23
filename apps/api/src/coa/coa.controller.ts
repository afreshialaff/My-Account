import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { z } from 'zod'
import { AccessService } from '../auth/access.service'
import { Auth, AuthCtx } from '../auth/auth.guard'
import { AuditService } from '../audit/audit.service'
import { BusinessRuleError, NotFound } from '../common/errors'
import { isoDate, parse, uuid } from '../common/validation'
import { DbService } from '../db/db.service'
import { ACCOUNT_CATEGORIES, CATEGORIES, DEBIT_NORMAL_SQL } from './template'

const AccountBody = z.object({
  code: z.string().trim().min(1).max(20).regex(/^[0-9A-Za-z.-]+$/, 'digits, letters, . or -'),
  name: z.string().trim().min(2).max(200),
  category: z.enum(ACCOUNT_CATEGORIES as [string, ...string[]]),
  parentId: uuid.nullish(),
  isPostable: z.boolean().default(true),
  description: z.string().max(1000).nullish(),
})
const AccountPatch = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(1000).nullish(),
  isActive: z.boolean().optional(),
})

@Controller('entities/:entityId/accounts')
export class CoaController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Accounts with their posted balance (normal-side sign) as of an optional date. */
  @Get()
  list(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Query('asOf') asOf?: string) {
    const date = asOf ? parse(isoDate, asOf) : null
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const rows = (
        await db.query(
          `select a.*, coalesce(t.debit, 0) as debit, coalesce(t.credit, 0) as credit, coalesce(t.n, 0)::int as line_count,
                  case when a.category in (${DEBIT_NORMAL_SQL}) then coalesce(t.debit, 0) - coalesce(t.credit, 0)
                       else coalesce(t.credit, 0) - coalesce(t.debit, 0) end as balance
             from accounts a
             left join (
               select l.account_id, sum(l.debit) as debit, sum(l.credit) as credit, count(*) as n
                 from journal_lines l join journal_entries j on j.id = l.entry_id
                where j.entity_id = $1 and j.status in ('posted', 'reversed') and ($2::date is null or j.journal_date <= $2)
                group by l.account_id
             ) t on t.account_id = a.id
            where a.entity_id = $1 order by a.code`,
          [entityId, date],
        )
      ).rows
      return rows.map((a) => {
        const c = CATEGORIES[a.category as keyof typeof CATEGORIES]
        return { ...a, normal_side: c.normal, category_label: c.label }
      })
    })
  }

  @Post()
  create(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Body() body: unknown) {
    this.access.require(ctx, 'coa.manage')
    const b = parse(AccountBody, body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const r = (
        await db.query(
          `insert into accounts (firm_id, entity_id, code, name, category, parent_id, is_postable, description)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
          [ctx.firmId, entityId, b.code, b.name, b.category, b.parentId ?? null, b.isPostable, b.description ?? null],
        )
      ).rows[0]
      await this.audit.record(db, ctx, { entityId, action: 'account.created', objectType: 'account', objectId: r.id, data: b })
      return r
    })
  }

  @Patch(':accountId')
  update(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Param('accountId', ParseUUIDPipe) accountId: string, @Body() body: unknown) {
    this.access.require(ctx, 'coa.manage')
    const b = parse(AccountPatch, body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const before = (await db.query(`select * from accounts where entity_id = $1 and id = $2`, [entityId, accountId])).rows[0]
      if (!before) throw new NotFound('Account')
      if (b.isActive === false && before.is_system) throw new BusinessRuleError('system_account', 'System accounts cannot be deactivated')
      const r = (
        await db.query(
          `update accounts set name = coalesce($3, name), description = coalesce($4, description), is_active = coalesce($5, is_active)
            where entity_id = $1 and id = $2 returning *`,
          [entityId, accountId, b.name ?? null, b.description ?? null, b.isActive ?? null],
        )
      ).rows[0]
      await this.audit.record(db, ctx, { entityId, action: 'account.updated', objectType: 'account', objectId: accountId, data: { before: { name: before.name, is_active: before.is_active }, change: b } })
      return r
    })
  }
}
