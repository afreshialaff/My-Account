import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { z } from 'zod'
import { AccessService } from '../auth/access.service'
import { Auth, AuthCtx } from '../auth/auth.guard'
import { isoDate, parse } from '../common/validation'
import { DbService } from '../db/db.service'
import { JournalAction, JournalInput, JournalsService } from './journals.service'

const ListQuery = z.object({
  status: z.enum(['draft', 'submitted', 'approved', 'posted', 'reversed']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const idemKey = z.string().trim().min(8).max(100).optional()

@Controller('entities/:entityId/journals')
export class JournalsController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly journals: JournalsService,
  ) {}

  @Get()
  list(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Query() query: unknown) {
    const q = parse(ListQuery, query)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const where = ['j.entity_id = $1']
      const params: unknown[] = [entityId]
      if (q.status) where.push(`j.status = $${params.push(q.status)}`)
      if (q.from) where.push(`j.journal_date >= $${params.push(q.from)}`)
      if (q.to) where.push(`j.journal_date <= $${params.push(q.to)}`)
      if (q.q) where.push(`(j.number ilike $${params.push(`%${q.q}%`)} or j.memo ilike $${params.length})`)
      const total = (await db.query(`select count(*)::int as n from journal_entries j where ${where.join(' and ')}`, params)).rows[0].n
      const rows = (
        await db.query(
          `select j.id, j.number, j.journal_date, j.status, j.memo, j.source_type, j.created_at, j.posted_at, u.full_name as created_by_name,
                  (select sum(debit) from journal_lines l where l.entry_id = j.id) as total
             from journal_entries j left join users u on u.id = j.created_by
            where ${where.join(' and ')}
            order by j.journal_date desc, j.created_at desc
            limit ${q.limit} offset ${q.offset}`,
          params,
        )
      ).rows
      return { total, rows }
    })
  }

  /** Validates a journal without saving it: totals, period status and posting problems. */
  @Post('preview')
  @HttpCode(200)
  preview(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Body() body: unknown) {
    const input = parse(JournalInput, body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      const c = await this.journals.check(db, entityId, input)
      return { totals: c.totals, period: c.period, problems: c.problems, postable: c.problems.length === 0 }
    })
  }

  @Post()
  async create(
    @Auth() ctx: AuthCtx,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(JournalInput, body)
    const k = parse(idemKey, key)
    const r = await this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      return this.journals.create(db, ctx, entityId, input, k)
    })
    if (r.replayed) {
      res.status(200)
      res.setHeader('Idempotent-Replayed', 'true')
    }
    return r.journal
  }

  @Get(':id')
  get(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      return this.journals.get(db, entityId, id)
    })
  }

  @Put(':id')
  update(
    @Auth() ctx: AuthCtx,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    const input = parse(JournalInput, body)
    const version = ifMatch ? parse(z.coerce.number().int().positive(), ifMatch.replace(/"/g, '')) : undefined
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      return this.journals.update(db, ctx, entityId, id, input, version)
    })
  }

  @Delete(':id')
  remove(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      return this.journals.remove(db, ctx, entityId, id)
    })
  }

  @Post(':id/reverse')
  @HttpCode(200)
  reverse(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const b = parse(z.object({ date: isoDate, memo: z.string().max(1000).nullish() }), body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      return this.journals.reverse(db, ctx, entityId, id, b.date, b.memo)
    })
  }

  @Post(':id/:action')
  @HttpCode(200)
  transition(
    @Auth() ctx: AuthCtx,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') rawAction: string,
    @Body() body: unknown,
  ) {
    const action = parse(z.enum(['submit', 'return', 'approve', 'post']), rawAction) as JournalAction
    const { reason } = parse(z.object({ reason: z.string().max(1000).optional() }).default({}), body ?? {})
    return this.db.tx(ctx, async (db) => {
      const entity = await this.access.assertEntity(db, ctx, entityId)
      return this.journals.transition(db, ctx, entity, id, action, reason)
    })
  }
}
