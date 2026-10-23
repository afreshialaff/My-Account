import 'reflect-metadata'
import { createHash } from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * Runs the whole API inside one serverless function (used by apps/web on Vercel), so a single
 * Vercel project plus a Postgres integration (e.g. Neon) is enough to host Accounting OS.
 *
 * Environment: the Postgres integration provides an owner connection string (DATABASE_URL /
 * DATABASE_URL_UNPOOLED / POSTGRES_URL…). It is used only for migrations; requests run as the
 * non-privileged role `aos_app` so row level security applies. JWT_SECRET and APP_DB_PASSWORD
 * may be set explicitly; otherwise they are derived from the (secret) owner connection string.
 */
type Handler = (req: IncomingMessage, res: ServerResponse) => void

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function prepareEnv() {
  const e = process.env
  const admin = e.DATABASE_ADMIN_URL || e.DATABASE_URL_UNPOOLED || e.POSTGRES_URL_NON_POOLING || e.DATABASE_URL || e.POSTGRES_URL
  if (!admin) throw new Error('No database configured: add a Postgres integration (e.g. Neon) to the Vercel project')
  // Direct (non-pooler) host: works for roles created in SQL on every provider.
  const direct = e.APP_DATABASE_URL ? null : admin
  e.APP_DB_ROLE ||= 'aos_app'
  e.APP_DB_PASSWORD ||= sha(`aos-app:${admin}`).slice(0, 32)
  e.JWT_SECRET ||= sha(`aos-jwt:${admin}`)
  e.COOKIE_SECURE ||= e.VERCEL ? 'true' : 'false'
  e.PG_POOL_MAX ||= '3'
  e.DATABASE_ADMIN_URL = admin
  if (direct) {
    const u = new URL(direct)
    u.username = e.APP_DB_ROLE
    u.password = e.APP_DB_PASSWORD
    e.DATABASE_URL = u.toString()
  } else {
    e.DATABASE_URL = e.APP_DATABASE_URL
  }
}

async function boot(): Promise<Handler> {
  prepareEnv()
  const { migrate } = await import('./db/migrate')
  await migrate(() => undefined)
  if (process.env.DEMO_SEED !== 'false') {
    const { DbService } = await import('./db/db.service')
    const { seedDemo } = await import('./db/seed')
    const db = new DbService()
    try {
      await seedDemo(db)
    } finally {
      await db.pool.end()
    }
  }
  const { NestFactory } = await import('@nestjs/core')
  const { AppModule } = await import('./app.module')
  const { configure } = await import('./main')
  const app = configure(await NestFactory.create(AppModule, { logger: ['error', 'warn'] }))
  await app.init()
  return app.getHttpAdapter().getInstance() as Handler
}

let ready: Promise<Handler> | null = null

export function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= boot()
  ready.then(
    (h) => h(req, res),
    (err: Error) => {
      ready = null // retry on the next request
      console.error('Accounting OS API failed to start', err)
      res.statusCode = 503
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ code: 'boot_failed', message: err.message }))
    },
  )
}
