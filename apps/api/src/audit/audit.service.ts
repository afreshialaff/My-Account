import { Injectable } from '@nestjs/common'
import type { AuthCtx } from '../auth/auth.guard'
import type { Db } from '../db/db.service'

export interface AuditInput {
  entityId?: string | null
  action: string
  objectType: string
  objectId?: string | null
  data?: unknown
}

/** Audit rows are written in the same transaction as the change they describe. */
@Injectable()
export class AuditService {
  async record(db: Db, ctx: Pick<AuthCtx, 'firmId' | 'userId'>, e: AuditInput) {
    await db.query(
      `insert into audit_events (firm_id, entity_id, actor_id, action, object_type, object_id, data)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [ctx.firmId, e.entityId ?? null, ctx.userId, e.action, e.objectType, e.objectId ?? null, e.data === undefined ? null : JSON.stringify(e.data)],
    )
  }
}
