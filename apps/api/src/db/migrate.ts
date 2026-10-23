import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { Client } from 'pg'
import { config } from '../config'

/**
 * Applies SQL files in /migrations in order, each in its own transaction, then makes sure
 * the non-privileged application role exists and has DML grants (RLS applies to it).
 */
export async function migrate(log = console.log) {
  const db = new Client({ connectionString: config.adminDatabaseUrl })
  await db.connect()
  try {
    await db.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`)
    const dir = join(__dirname, '..', '..', 'migrations')
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    const done = new Set((await db.query('select name from schema_migrations')).rows.map((r) => r.name))
    for (const f of files) {
      if (done.has(f)) continue
      await db.query('begin')
      try {
        await db.query(readFileSync(join(dir, f), 'utf8'))
        await db.query('insert into schema_migrations (name) values ($1)', [f])
        await db.query('commit')
        log(`applied ${f}`)
      } catch (e) {
        await db.query('rollback')
        throw new Error(`migration ${f} failed: ${(e as Error).message}`)
      }
    }

    const role = config.appDbRole
    if (!/^[a-z_][a-z0-9_]*$/.test(role)) throw new Error('invalid APP_DB_ROLE')
    const exists = await db.query('select 1 from pg_roles where rolname = $1', [role])
    if (!exists.rowCount) {
      if (!config.appDbPassword) throw new Error('APP_DB_PASSWORD is required to create the application role')
      await db.query(`create role ${role} login password '${config.appDbPassword.replace(/'/g, "''")}' nosuperuser nobypassrls`)
      log(`created role ${role}`)
    }
    await db.query(`grant usage on schema public to ${role}`)
    await db.query(`grant select, insert, update, delete on all tables in schema public to ${role}`)
    await db.query(`revoke all on schema_migrations from ${role}`)
    await db.query(`grant usage, select on all sequences in schema public to ${role}`)
  } finally {
    await db.end()
  }
}

if (require.main === module) {
  migrate()
    .then(() => console.log('migrations complete'))
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
}
