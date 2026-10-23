import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common'
import { z } from 'zod'
import { AccessService } from '../auth/access.service'
import { Auth, AuthCtx } from '../auth/auth.guard'
import { parse } from '../common/validation'
import { DbService } from '../db/db.service'

const Q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), offset: z.coerce.number().int().min(0).default(0) })

@Controller()
export class AuditController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
  ) {}

  @Get('entities/:entityId/audit')
  entity(@Auth() ctx: AuthCtx, @Param('entityId', ParseUUIDPipe) entityId: string, @Query() q: unknown) {
    this.access.require(ctx, 'audit.read')
    const p = parse(Q, q)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, entityId)
      return (
        await db.query(
          `select ev.id, ev.action, ev.object_type, ev.object_id, ev.data, ev.created_at, u.full_name as actor
             from audit_events ev left join users u on u.id = ev.actor_id
            where ev.entity_id = $1 order by ev.id desc limit ${p.limit} offset ${p.offset}`,
          [entityId],
        )
      ).rows
    })
  }

  /** Firm-level events (clients, staff, logins). */
  @Get('audit')
  firm(@Auth() ctx: AuthCtx, @Query() q: unknown) {
    this.access.require(ctx, 'audit.read')
    const p = parse(Q, q)
    return this.db.tx(ctx, async (db) => {
      const f = this.access.clientFilter(ctx, 'c', 1)
      return (
        await db.query(
          `select ev.id, ev.action, ev.object_type, ev.object_id, ev.data, ev.created_at, ev.entity_id, u.full_name as actor
             from audit_events ev left join users u on u.id = ev.actor_id
             left join legal_entities e on e.id = ev.entity_id
             left join clients c on c.id = e.client_id
            where ev.entity_id is null or ${f.sql}
            order by ev.id desc limit ${p.limit} offset ${p.offset}`,
          f.params,
        )
      ).rows
    })
  }
}
