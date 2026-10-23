import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { z } from 'zod'
import { AccessService } from '../auth/access.service'
import { Auth, AuthCtx } from '../auth/auth.guard'
import { AuditService } from '../audit/audit.service'
import { BusinessRuleError, NotFound } from '../common/errors'
import { parse } from '../common/validation'
import { DbService } from '../db/db.service'
import { generateFiscalYear } from '../tenancy/bootstrap'

@Controller('entities/:entityId/periods')
export class PeriodsController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string) {
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      return (
        await db.query(
          `select p.*, u.full_name as locked_by_name,
                  (select count(*) from journal_entries j where j.entity_id = p.entity_id and j.journal_date between p.start_date and p.end_date and j.status in ('posted', 'reversed'))::int as posted_count,
                  (select count(*) from journal_entries j where j.entity_id = p.entity_id and j.journal_date between p.start_date and p.end_date and j.status in ('draft', 'submitted', 'approved'))::int as open_count
             from fiscal_periods p left join users u on u.id = p.locked_by
            where p.entity_id = $1 order by p.start_date`,
          [entityId],
        )
      ).rows
    })
  }

  @Post('generate')
  generate(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Body() body: unknown) {
    this.access.require(ctx, 'period.lock')
    const { year } = parse(z.object({ year: z.number().int().min(2000).max(2100) }), body)
    return this.db.tx(ctx, async (db) => {
      const e = await this.access.assertEntity(db, ctx, entityId)
      const created = await generateFiscalYear(db, ctx, entityId, e.fiscal_year_start_month, year)
      await this.audit.record(db, ctx, { entityId, action: 'period.generated', objectType: 'fiscal_year', objectId: String(year), data: { created } })
      return { created }
    })
  }

  /** Locking blocks posting into the period. Draft/unposted journals dated inside it are reported back as a warning. */
  @Post(':periodId/lock')
  @HttpCode(200)
  lock(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Param('periodId', ParseUUIDPipe) periodId: string) {
    this.access.require(ctx, 'period.lock')
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const p = (await db.query(`select * from fiscal_periods where entity_id = $1 and id = $2 for update`, [entityId, periodId])).rows[0]
      if (!p) throw new NotFound('Period')
      if (p.status === 'locked') return p
      const r = (
        await db.query(`update fiscal_periods set status = 'locked', locked_at = now(), locked_by = $3 where entity_id = $1 and id = $2 returning *`, [entityId, periodId, ctx.userId])
      ).rows[0]
      await this.audit.record(db, ctx, { entityId, action: 'period.locked', objectType: 'fiscal_period', objectId: periodId, data: { name: p.name } })
      return r
    })
  }

  @Post(':periodId/reopen')
  @HttpCode(200)
  reopen(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Param('periodId', ParseUUIDPipe) periodId: string, @Body() body: unknown) {
    this.access.require(ctx, 'period.reopen')
    const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'a reason of at least 5 characters is required').max(1000) }), body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const p = (await db.query(`select * from fiscal_periods where entity_id = $1 and id = $2 for update`, [entityId, periodId])).rows[0]
      if (!p) throw new NotFound('Period')
      if (p.status !== 'locked') throw new BusinessRuleError('period_not_locked', 'Period is not locked')
      const r = (
        await db.query(`update fiscal_periods set status = 'open', locked_at = null, locked_by = null where entity_id = $1 and id = $2 returning *`, [entityId, periodId])
      ).rows[0]
      await this.audit.record(db, ctx, { entityId, action: 'period.reopened', objectType: 'fiscal_period', objectId: periodId, data: { name: p.name, reason } })
      return r
    })
  }
}
