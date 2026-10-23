import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Client } from 'pg'
import request from 'supertest'

/**
 * Each test run uses a fresh database (accounting_os_test by default), migrated from scratch,
 * and talks to it through the non-superuser application role so RLS is exercised for real.
 */
const ADMIN = process.env.TEST_DATABASE_ADMIN_URL || 'postgres://postgres@localhost:5432/postgres'
const DB_NAME = process.env.TEST_DATABASE_NAME || 'accounting_os_test'

export async function freshDatabase() {
  const admin = new Client({ connectionString: ADMIN })
  await admin.connect()
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [DB_NAME])
  await admin.query(`drop database if exists ${DB_NAME}`)
  await admin.query(`create database ${DB_NAME}`)
  await admin.end()
  const base = new URL(ADMIN)
  base.pathname = `/${DB_NAME}`
  process.env.DATABASE_ADMIN_URL = base.toString()
  const app = new URL(base.toString())
  app.username = process.env.APP_DB_ROLE || 'aos_app'
  app.password = process.env.APP_DB_PASSWORD || 'aos_app_dev'
  process.env.DATABASE_URL = app.toString()
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret'
  const { migrate } = await import('../src/db/migrate')
  await migrate(() => undefined)
  return { adminUrl: base.toString(), appUrl: app.toString() }
}

export async function createApp(): Promise<INestApplication> {
  const { AppModule } = await import('../src/app.module')
  const { configure } = await import('../src/main')
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = configure(mod.createNestApplication({ logger: false }))
  await app.init()
  return app
}

export class Api {
  constructor(
    private readonly app: INestApplication,
    public token = '',
  ) {}

  private req(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
    const r = request(this.app.getHttpServer())[method](`/api/v1${path}`)
    return this.token ? r.set('Authorization', `Bearer ${this.token}`) : r
  }
  get(path: string) {
    return this.req('get', path)
  }
  post(path: string, body?: object) {
    return this.req('post', path).send(body ?? {})
  }
  put(path: string, body: object) {
    return this.req('put', path).send(body)
  }
  patch(path: string, body: object) {
    return this.req('patch', path).send(body)
  }
  delete(path: string) {
    return this.req('delete', path)
  }
  as(token: string) {
    return new Api(this.app, token)
  }
}

let seq = 0
export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${++seq}@test.local`
}
