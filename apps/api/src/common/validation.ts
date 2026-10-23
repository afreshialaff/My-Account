import { BadRequestException } from '@nestjs/common'
import Decimal from 'decimal.js'
import { z, ZodTypeAny } from 'zod'

export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input)
  if (!r.success) {
    throw new BadRequestException({
      code: 'validation_failed',
      message: 'Request validation failed',
      issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return r.data
}

export const uuid = z.string().uuid()
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

/** Amounts travel as decimal strings ("1250000.00"); at most 2 fraction digits, non-negative. */
export const money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,18}(\.\d{1,2})?$/.test(v), 'expected a non-negative amount with at most 2 decimals')
  .transform((v) => new Decimal(v).toFixed(2))

export function sum(values: string[]): Decimal {
  return values.reduce((s, v) => s.plus(v), new Decimal(0))
}
