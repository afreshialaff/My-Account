import { Injectable } from '@nestjs/common'
import { Forbidden, NotFound } from '../common/errors'
import type { Db } from '../db/db.service'
import type { AuthCtx, Role } from './auth.guard'

export type Permission =
  | 'tenancy.manage'
  | 'staff.manage'
  | 'coa.manage'
  | 'journal.write'
  | 'journal.approve'
  | 'journal.post'
  | 'journal.reverse'
  | 'period.lock'
  | 'period.reopen'
  | 'audit.read'

const MATRIX: Record<Permission, Role[]> = {
  'tenancy.manage': ['partner', 'manager'],
  'staff.manage': ['partner'],
  'coa.manage': ['partner', 'manager', 'accountant'],
  'journal.write': ['partner', 'manager', 'accountant'],
  'journal.approve': ['partner', 'manager'],
  'journal.post': ['partner', 'manager', 'accountant'],
  'journal.reverse': ['partner', 'manager'],
  'period.lock': ['partner', 'manager'],
  'period.reopen': ['partner'],
  'audit.read': ['partner', 'manager', 'auditor'],
}

export function can(role: Role, p: Permission): boolean {
  return MATRIX[p].includes(role)
}

export function permissionsOf(role: Role): Permission[] {
  return (Object.keys(MATRIX) as Permission[]).filter((p) => can(role, p))
}

/** Partners and managers see every client of the firm; others only clients they are assigned to. */
const FIRM_WIDE: Role[] = ['partner', 'manager']

export interface EntityRow {
  id: string
  client_id: string
  name: string
  functional_currency: string
  require_approval: boolean
  fiscal_year_start_month: number
}

@Injectable()
export class AccessService {
  require(ctx: AuthCtx, p: Permission) {
    if (!can(ctx.role, p)) throw new Forbidden()
  }

  /** SQL fragment + params restricting a clients alias to the ones the user may access. */
  clientFilter(ctx: AuthCtx, alias = 'c', paramIndex = 1): { sql: string; params: string[] } {
    if (FIRM_WIDE.includes(ctx.role)) return { sql: 'true', params: [] }
    return {
      sql: `exists (select 1 from client_memberships m where m.client_id = ${alias}.id and m.user_id = $${paramIndex})`,
      params: [ctx.userId],
    }
  }

  async assertClient(db: Db, ctx: AuthCtx, clientId: string) {
    const f = this.clientFilter(ctx, 'c', 2)
    const r = await db.query(`select c.* from clients c where c.id = $1 and ${f.sql}`, [clientId, ...f.params])
    // Same response for "missing" and "not yours" so ids cannot be probed.
    if (!r.rowCount) throw new NotFound('Client')
    return r.rows[0]
  }

  async assertEntity(db: Db, ctx: AuthCtx, entityId: string): Promise<EntityRow> {
    const f = this.clientFilter(ctx, 'c', 2)
    const r = await db.query(
      `select e.* from legal_entities e join clients c on c.id = e.client_id where e.id = $1 and ${f.sql}`,
      [entityId, ...f.params],
    )
    if (!r.rowCount) throw new NotFound('Company')
    return r.rows[0]
  }
}
