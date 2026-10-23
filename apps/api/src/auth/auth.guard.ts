import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config'

export type Role = 'partner' | 'manager' | 'accountant' | 'auditor'

export interface AuthCtx {
  userId: string
  firmId: string
  role: Role
}

export const SESSION_COOKIE = 'aos_session'
const PUBLIC = 'isPublic'
export const Public = () => SetMetadata(PUBLIC, true)

export function signSession(ctx: AuthCtx): string {
  return jwt.sign({ sub: ctx.userId, firm: ctx.firmId, role: ctx.role }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '8h' })
}

function readToken(req: Request): string | undefined {
  const h = req.headers.authorization
  if (h?.startsWith('Bearer ')) return h.slice(7)
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE]
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [context.getHandler(), context.getClass()])) return true
    const req = context.switchToHttp().getRequest<Request & { auth?: AuthCtx }>()
    const token = readToken(req)
    if (!token) throw new UnauthorizedException({ code: 'unauthenticated', message: 'Login required' })
    try {
      const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { sub: string; firm: string; role: Role }
      req.auth = { userId: p.sub, firmId: p.firm, role: p.role }
      return true
    } catch {
      throw new UnauthorizedException({ code: 'unauthenticated', message: 'Session expired or invalid' })
    }
  }
}

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthCtx => {
  return ctx.switchToHttp().getRequest<{ auth: AuthCtx }>().auth
})
