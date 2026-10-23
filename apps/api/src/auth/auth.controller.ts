import { Body, Controller, Get, HttpCode, Post, Res, UnauthorizedException } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import type { Response } from 'express'
import { z } from 'zod'
import { AuditService } from '../audit/audit.service'
import { parse } from '../common/validation'
import { config } from '../config'
import { DbService } from '../db/db.service'
import { AccessService, permissionsOf } from './access.service'
import { Auth, AuthCtx, Public, Role, SESSION_COOKIE, signSession } from './auth.guard'

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12)

const password = z.string().min(10, 'password must be at least 10 characters').max(200)

const RegisterBody = z.object({
  firmName: z.string().trim().min(2).max(200),
  fullName: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320),
  password,
})

const LoginBody = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) })

@Controller()
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  private setCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: 8 * 3600 * 1000,
      path: '/',
    })
  }

  /** Creates a new accounting firm workspace with its first partner. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = parse(RegisterBody, body)
    const firmId = randomUUID()
    const userId = randomUUID()
    const hash = await bcrypt.hash(b.password, 12)
    await this.db.txWith({ 'app.firm_id': firmId, 'app.user_id': userId }, async (db) => {
      await db.query('insert into firms (id, name) values ($1, $2)', [firmId, b.firmName])
      await db.query(
        `insert into users (id, firm_id, email, full_name, password_hash, role) values ($1, $2, $3, $4, $5, 'partner')`,
        [userId, firmId, b.email.toLowerCase(), b.fullName, hash],
      )
      await this.audit.record(db, { firmId, userId }, { action: 'firm.created', objectType: 'firm', objectId: firmId, data: { name: b.firmName } })
    })
    const ctx: AuthCtx = { userId, firmId, role: 'partner' }
    const token = signSession(ctx)
    this.setCookie(res, token)
    return { token, user: { id: userId, email: b.email.toLowerCase(), fullName: b.fullName, role: 'partner' } }
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('auth/login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const b = parse(LoginBody, body)
    const email = b.email.toLowerCase()
    const user = await this.db.txWith({ 'app.auth_email': email }, async (db) => {
      const r = await db.query('select id, firm_id, password_hash, role, is_active, full_name from users where email = $1', [email])
      return r.rows[0] as { id: string; firm_id: string; password_hash: string; role: Role; is_active: boolean; full_name: string } | undefined
    })
    // Compare against a dummy hash when the user is unknown to keep timing uniform.
    const ok = await bcrypt.compare(b.password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !ok || !user.is_active) throw new UnauthorizedException({ code: 'invalid_credentials', message: 'Email atau kata sandi salah' })
    const ctx: AuthCtx = { userId: user.id, firmId: user.firm_id, role: user.role }
    await this.db.tx(ctx, (db) => this.audit.record(db, ctx, { action: 'user.login', objectType: 'user', objectId: user.id }))
    const token = signSession(ctx)
    this.setCookie(res, token)
    return { token, user: { id: user.id, email, fullName: user.full_name, role: user.role } }
  }

  @Public()
  @HttpCode(200)
  @Post('auth/logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  }

  /** Current user, firm, permissions and the clients/companies they can open. */
  @Get('me')
  me(@Auth() ctx: AuthCtx) {
    return this.db.tx(ctx, async (db) => {
      const u = (await db.query('select id, email, full_name, role from users where id = $1', [ctx.userId])).rows[0]
      const firm = (await db.query('select id, name from firms where id = $1', [ctx.firmId])).rows[0]
      const f = this.access.clientFilter(ctx)
      const entities = (
        await db.query(
          `select e.id, e.name, e.client_id, c.name as client_name
             from legal_entities e join clients c on c.id = e.client_id
            where c.status = 'active' and ${f.sql} order by c.name, e.name`,
          f.params,
        )
      ).rows
      return {
        user: { id: u.id, email: u.email, fullName: u.full_name, role: u.role },
        firm,
        permissions: permissionsOf(ctx.role),
        entities: entities.map((e) => ({ id: e.id, name: e.name, clientId: e.client_id, clientName: e.client_name })),
      }
    })
  }
}
