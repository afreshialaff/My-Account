import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { Pool, PoolClient, types } from 'pg'
import { config } from '../config'

// Keep NUMERIC as exact strings (never JS floats) and DATE as plain YYYY-MM-DD.
types.setTypeParser(1700, (v) => v)
types.setTypeParser(1082, (v) => v)

export interface TenantCtx {
  firmId: string
  userId: string
}

export type Db = PoolClient

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool = new Pool({ connectionString: config.databaseUrl, max: 10 })

  /**
   * Runs `fn` in a transaction scoped to one firm. Row level security reads
   * app.firm_id, so every query inside can only see that firm's rows.
   */
  async tx<T>(ctx: TenantCtx, fn: (db: Db) => Promise<T>): Promise<T> {
    const db = await this.pool.connect()
    try {
      await db.query('begin')
      await db.query(`select set_config('app.firm_id', $1, true), set_config('app.user_id', $2, true)`, [ctx.firmId, ctx.userId])
      const out = await fn(db)
      await db.query('commit')
      return out
    } catch (e) {
      await db.query('rollback').catch(() => undefined)
      throw e
    } finally {
      db.release()
    }
  }

  /** Transaction with an arbitrary set of local settings (used by login/registration). */
  async txWith<T>(settings: Record<string, string>, fn: (db: Db) => Promise<T>): Promise<T> {
    const db = await this.pool.connect()
    try {
      await db.query('begin')
      for (const [k, v] of Object.entries(settings)) await db.query(`select set_config($1, $2, true)`, [k, v])
      const out = await fn(db)
      await db.query('commit')
      return out
    } catch (e) {
      await db.query('rollback').catch(() => undefined)
      throw e
    } finally {
      db.release()
    }
  }

  async onModuleDestroy() {
    await this.pool.end()
  }
}
