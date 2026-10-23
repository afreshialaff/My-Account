import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'

/** Business invariant failure → 422 with a stable error code. */
export class BusinessRuleError extends HttpException {
  constructor(code: string, message: string) {
    super({ code, message }, HttpStatus.UNPROCESSABLE_ENTITY)
  }
}

export class NotFound extends HttpException {
  constructor(what = 'Data') {
    super({ code: 'not_found', message: `${what} tidak ditemukan` }, HttpStatus.NOT_FOUND)
  }
}

export class Forbidden extends HttpException {
  constructor(message = 'Anda tidak memiliki izin untuk tindakan ini') {
    super({ code: 'forbidden', message }, HttpStatus.FORBIDDEN)
  }
}

export class Conflict extends HttpException {
  constructor(code: string, message: string) {
    super({ code, message }, HttpStatus.CONFLICT)
  }
}

interface PgError {
  code?: string
  message: string
  constraint?: string
}

/** Maps HttpExceptions and PostgreSQL errors (raised by triggers/constraints) to JSON responses. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors')

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    if (err instanceof HttpException) {
      const body = err.getResponse()
      const payload = typeof body === 'string' ? { code: 'error', message: body } : body
      return res.status(err.getStatus()).json(payload)
    }
    const pg = err as PgError
    switch (pg.code) {
      case 'P0001': // raised by accounting triggers
        return res.status(422).json({ code: 'accounting_rule', message: pg.message })
      case '23505':
        return res.status(409).json({ code: 'duplicate', message: `Duplicate value (${pg.constraint ?? 'unique'})` })
      case '23503':
        return res.status(422).json({ code: 'invalid_reference', message: 'Referenced record does not exist in this workspace' })
      case '23514':
        return res.status(422).json({ code: 'check_violation', message: `Invalid value (${pg.constraint ?? 'check'})` })
      case '23P01':
        return res.status(409).json({ code: 'overlap', message: 'Overlaps an existing record (e.g. fiscal period)' })
      case '42501':
        return res.status(403).json({ code: 'forbidden', message: 'Row level security denied access' })
      case '22P02':
        return res.status(400).json({ code: 'bad_request', message: 'Malformed identifier or value' })
    }
    this.log.error(err instanceof Error ? err.stack : String(err))
    return res.status(500).json({ code: 'internal', message: 'Internal server error' })
  }
}
