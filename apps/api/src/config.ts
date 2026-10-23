import { readFileSync } from 'fs'
import { join } from 'path'

/** Minimal .env loader (no dependency); real environment variables take precedence. */
function loadDotEnv() {
  try {
    const text = readFileSync(join(__dirname, '..', '.env'), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  } catch {
    /* no .env file */
  }
}
loadDotEnv()

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing environment variable ${name}`)
  return v
}

export const config = {
  get databaseUrl() {
    return required('DATABASE_URL')
  },
  get adminDatabaseUrl() {
    return process.env.DATABASE_ADMIN_URL || required('DATABASE_URL')
  },
  get jwtSecret() {
    const s = required('JWT_SECRET')
    if (process.env.NODE_ENV === 'production' && s.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production')
    return s
  },
  port: Number(process.env.PORT || 4000),
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  appDbRole: process.env.APP_DB_ROLE || 'aos_app',
  appDbPassword: process.env.APP_DB_PASSWORD,
}
