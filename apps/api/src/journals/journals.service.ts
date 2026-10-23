import { Injectable } from '@nestjs/common'
import Decimal from 'decimal.js'
import { z } from 'zod'
import { AccessService, EntityRow } from '../auth/access.service'
import type { AuthCtx } from '../auth/auth.guard'
import { AuditService } from '../audit/audit.service'
import { BusinessRuleError, Conflict, Forbidden, NotFound } from '../common/errors'
import { isoDate, money, uuid } from '../common/validation'
import type { Db } from '../db/db.service'
import { nextDocumentNumber } from '../tenancy/bootstrap'

export const JournalLineInput = z
  .object({
    accountId: uuid,
    description: z.string().max(500).nullish(),
    debit: money.default('0.00'),
    credit: money.default('0.00'),
    branchId: uuid.nullish(),
  })
  .refine((l) => !(Number(l.debit) > 0 && Number(l.credit) > 0), 'a line cannot have both debit and credit')
  .refine((l) => Number(l.debit) > 0 || Number(l.credit) > 0, 'a line needs a debit or credit amount')

export const JournalInput = z.object({
  journalDate: isoDate,
  memo: z.string().max(1000).nullish(),
  branchId: uuid.nullish(),
  lines: z.array(JournalLineInput).min(1, 'at least one line').max(500),
})
export type JournalInput = z.infer<typeof JournalInput>

export type JournalAction = 'submit' | 'return' | 'approve' | 'post'

export function totals(lines: { debit: string; credit: string }[]) {
  const debit = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0))
  const credit = lines.reduce((s, l) => s.plus(l.credit), new Decimal(0))
  return { debit: debit.toFixed(2), credit: credit.toFixed(2), difference: debit.minus(credit).toFixed(2), balanced: debit.eq(credit) && debit.gt(0) }
}

@Injectable()
export class JournalsService {
  constructor(
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Validation shared by preview, submit and post. Returns human-readable problems (empty = ready to post). */
  async check(db: Db, entityId: string, input: JournalInput) {
    const problems: string[] = []
    const t = totals(input.lines)
    if (input.lines.length < 2) problems.push('Jurnal membutuhkan minimal dua baris.')
    if (!t.balanced) problems.push(`Total debit (${t.debit}) dan kredit (${t.credit}) belum seimbang.`)
    const ids = [...new Set(input.lines.map((l) => l.accountId))]
    const accounts = (await db.query(`select id, code, name, category, is_active, is_postable from accounts where entity_id = $1 and id = any($2::uuid[])`, [entityId, ids])).rows
    const byId = new Map(accounts.map((a) => [a.id, a]))
    for (const id of ids) {
      const a = byId.get(id)
      if (!a) problems.push('Akun tidak ditemukan pada perusahaan ini.')
      else if (!a.is_active || !a.is_postable) problems.push(`Akun ${a.code} ${a.name} tidak aktif atau bukan akun transaksi.`)
    }
    const period = (await db.query(`select id, name, status from fiscal_periods where entity_id = $1 and $2::date between start_date and end_date`, [entityId, input.journalDate])).rows[0]
    if (!period) problems.push(`Tidak ada periode akuntansi untuk tanggal ${input.journalDate}.`)
    else if (period.status !== 'open') problems.push(`Periode ${period.name} sudah dikunci.`)
    return { totals: t, period: period ?? null, problems, accounts: Object.fromEntries(byId) }
  }

  async get(db: Db, entityId: string, id: string) {
    const e = (
      await db.query(
        `select j.*, b.name as branch_name, cu.full_name as created_by_name, su.full_name as submitted_by_name,
                au.full_name as approved_by_name, pu.full_name as posted_by_name,
                ro.number as reversal_of_number, rb.number as reversed_by_number
           from journal_entries j
           left join branches b on b.id = j.branch_id
           left join users cu on cu.id = j.created_by
           left join users su on su.id = j.submitted_by
           left join users au on au.id = j.approved_by
           left join users pu on pu.id = j.posted_by
           left join journal_entries ro on ro.id = j.reversal_of
           left join journal_entries rb on rb.id = j.reversed_by
          where j.entity_id = $1 and j.id = $2`,
        [entityId, id],
      )
    ).rows[0]
    if (!e) throw new NotFound('Journal')
    const lines = (
      await db.query(
        `select l.*, a.code as account_code, a.name as account_name, a.category as account_category, b.name as branch_name
           from journal_lines l join accounts a on a.id = l.account_id left join branches b on b.id = l.branch_id
          where l.entry_id = $1 order by l.line_no`,
        [id],
      )
    ).rows
    const history = (
      await db.query(
        `select ev.action, ev.data, ev.created_at, u.full_name as actor
           from audit_events ev left join users u on u.id = ev.actor_id
          where ev.object_type = 'journal' and ev.object_id = $1 order by ev.id`,
        [id],
      )
    ).rows
    return { ...e, lines, totals: totals(lines), history }
  }

  private async insertLines(db: Db, ctx: AuthCtx, entityId: string, entryId: string, input: JournalInput) {
    let n = 0
    for (const l of input.lines) {
      await db.query(
        `insert into journal_lines (firm_id, entity_id, entry_id, line_no, account_id, branch_id, description, debit, credit)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [ctx.firmId, entityId, entryId, ++n, l.accountId, l.branchId ?? input.branchId ?? null, l.description ?? null, l.debit, l.credit],
      )
    }
  }

  /**
   * Creates a draft. With an idempotency key, a retried request returns the journal created
   * by the first attempt instead of creating a duplicate.
   */
  async create(db: Db, ctx: AuthCtx, entityId: string, input: JournalInput, idempotencyKey?: string, sourceType = 'manual') {
    this.access.require(ctx, 'journal.write')
    if (idempotencyKey) {
      await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`${entityId}:${idempotencyKey}`])
      const ex = (await db.query(`select id from journal_entries where entity_id = $1 and idempotency_key = $2`, [entityId, idempotencyKey])).rows[0]
      if (ex) return { journal: await this.get(db, entityId, ex.id), replayed: true }
    }
    const number = await nextDocumentNumber(db, entityId, 'journal', input.journalDate)
    const e = (
      await db.query(
        `insert into journal_entries (firm_id, entity_id, branch_id, number, journal_date, memo, idempotency_key, created_by, source_type)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [ctx.firmId, entityId, input.branchId ?? null, number, input.journalDate, input.memo ?? null, idempotencyKey ?? null, ctx.userId, sourceType],
      )
    ).rows[0]
    await this.insertLines(db, ctx, entityId, e.id, input)
    await this.audit.record(db, ctx, { entityId, action: 'journal.created', objectType: 'journal', objectId: e.id, data: { number, ...totals(input.lines) } })
    return { journal: await this.get(db, entityId, e.id), replayed: false }
  }

  private async lock(db: Db, entityId: string, id: string) {
    const e = (await db.query(`select * from journal_entries where entity_id = $1 and id = $2 for update`, [entityId, id])).rows[0]
    if (!e) throw new NotFound('Journal')
    return e
  }

  async update(db: Db, ctx: AuthCtx, entityId: string, id: string, input: JournalInput, expectedVersion?: number) {
    this.access.require(ctx, 'journal.write')
    const e = await this.lock(db, entityId, id)
    if (e.status !== 'draft') throw new BusinessRuleError('not_draft', `Only draft journals can be edited (status: ${e.status})`)
    if (expectedVersion !== undefined && e.version !== expectedVersion) throw new Conflict('version_conflict', 'The journal was changed by someone else; reload and try again')
    await db.query(`delete from journal_lines where entry_id = $1`, [id])
    await this.insertLines(db, ctx, entityId, id, input)
    await db.query(`update journal_entries set journal_date = $3, memo = $4, branch_id = $5 where entity_id = $1 and id = $2`, [entityId, id, input.journalDate, input.memo ?? null, input.branchId ?? null])
    await this.audit.record(db, ctx, { entityId, action: 'journal.updated', objectType: 'journal', objectId: id, data: totals(input.lines) })
    return this.get(db, entityId, id)
  }

  async remove(db: Db, ctx: AuthCtx, entityId: string, id: string) {
    this.access.require(ctx, 'journal.write')
    const e = await this.lock(db, entityId, id)
    if (e.status !== 'draft') throw new BusinessRuleError('not_draft', 'Only draft journals can be deleted; posted journals must be reversed')
    await db.query(`delete from journal_entries where entity_id = $1 and id = $2`, [entityId, id])
    await this.audit.record(db, ctx, { entityId, action: 'journal.deleted', objectType: 'journal', objectId: id, data: { number: e.number } })
    return { ok: true }
  }

  private async readyToPost(db: Db, entityId: string, e: { id: string; journal_date: string }) {
    const lines = (await db.query(`select account_id, debit, credit from journal_lines where entry_id = $1`, [e.id])).rows
    const c = await this.check(db, entityId, {
      journalDate: e.journal_date,
      lines: lines.map((l) => ({ accountId: l.account_id, debit: l.debit, credit: l.credit })),
    })
    if (c.problems.length) throw new BusinessRuleError('not_postable', c.problems.join(' '))
  }

  async transition(db: Db, ctx: AuthCtx, entity: EntityRow, id: string, action: JournalAction, reason?: string) {
    const entityId = entity.id
    const e = await this.lock(db, entityId, id)
    const fail = (msg: string) => {
      throw new BusinessRuleError('invalid_transition', msg)
    }

    switch (action) {
      case 'submit':
        this.access.require(ctx, 'journal.write')
        if (e.status !== 'draft') fail(`Cannot submit a ${e.status} journal`)
        await this.readyToPost(db, entityId, e)
        await db.query(`update journal_entries set status = 'submitted', submitted_by = $3, submitted_at = now() where entity_id = $1 and id = $2`, [entityId, id, ctx.userId])
        break
      case 'return':
        this.access.require(ctx, 'journal.approve')
        if (!['submitted', 'approved'].includes(e.status)) fail(`Cannot return a ${e.status} journal`)
        await db.query(
          `update journal_entries set status = 'draft', submitted_by = null, submitted_at = null, approved_by = null, approved_at = null where entity_id = $1 and id = $2`,
          [entityId, id],
        )
        break
      case 'approve':
        this.access.require(ctx, 'journal.approve')
        if (e.status !== 'submitted') fail(`Only submitted journals can be approved (status: ${e.status})`)
        // Maker-checker: the preparer can never approve their own journal.
        if (e.created_by === ctx.userId) throw new Forbidden('Pemisahan tugas (segregation of duties): Anda tidak dapat menyetujui jurnal yang Anda susun sendiri')
        await this.readyToPost(db, entityId, e)
        await db.query(`update journal_entries set status = 'approved', approved_by = $3, approved_at = now() where entity_id = $1 and id = $2`, [entityId, id, ctx.userId])
        break
      case 'post':
        this.access.require(ctx, 'journal.post')
        if (e.status === 'posted') return this.get(db, entityId, id) // idempotent re-post
        if (e.status === 'reversed') fail('Journal has already been reversed')
        if (entity.require_approval && e.status !== 'approved') fail('This company requires approval before posting')
        await this.readyToPost(db, entityId, e)
        // The trigger re-validates balance and period atomically with the status change.
        await db.query(`update journal_entries set status = 'posted', posted_by = $3, posted_at = now() where entity_id = $1 and id = $2`, [entityId, id, ctx.userId])
        break
    }
    await this.audit.record(db, ctx, { entityId, action: `journal.${action === 'return' ? 'returned' : action === 'submit' ? 'submitted' : action === 'approve' ? 'approved' : 'posted'}`, objectType: 'journal', objectId: id, data: { number: e.number, from: e.status, reason } })
    return this.get(db, entityId, id)
  }

  /** Corrects a posted journal by posting a mirror entry; history is never edited. */
  async reverse(db: Db, ctx: AuthCtx, entityId: string, id: string, date: string, memo?: string | null) {
    this.access.require(ctx, 'journal.reverse')
    const e = await this.lock(db, entityId, id)
    if (e.status === 'reversed') throw new Conflict('already_reversed', `Journal ${e.number} has already been reversed`)
    if (e.status !== 'posted') throw new BusinessRuleError('not_posted', 'Only posted journals can be reversed; delete or edit drafts instead')
    if (date < e.journal_date) throw new BusinessRuleError('invalid_date', 'Reversal date cannot be before the original journal date')
    const lines = (await db.query(`select * from journal_lines where entry_id = $1 order by line_no`, [id])).rows
    const number = await nextDocumentNumber(db, entityId, 'journal', date)
    const r = (
      await db.query(
        `insert into journal_entries (firm_id, entity_id, branch_id, number, journal_date, memo, created_by, source_type, reversal_of)
         values ($1, $2, $3, $4, $5, $6, $7, 'reversal', $8) returning id`,
        [ctx.firmId, entityId, e.branch_id, number, date, memo || `Pembalik ${e.number}`, ctx.userId, id],
      )
    ).rows[0]
    let n = 0
    for (const l of lines) {
      await db.query(
        `insert into journal_lines (firm_id, entity_id, entry_id, line_no, account_id, branch_id, description, debit, credit)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [ctx.firmId, entityId, r.id, ++n, l.account_id, l.branch_id, l.description, l.credit, l.debit],
      )
    }
    await db.query(`update journal_entries set status = 'posted', posted_by = $3, posted_at = now() where entity_id = $1 and id = $2`, [entityId, r.id, ctx.userId])
    await db.query(`update journal_entries set status = 'reversed', reversed_by = $3, reversed_at = now() where entity_id = $1 and id = $2`, [entityId, id, r.id])
    await this.audit.record(db, ctx, { entityId, action: 'journal.reversed', objectType: 'journal', objectId: id, data: { number: e.number, reversal: number, date } })
    await this.audit.record(db, ctx, { entityId, action: 'journal.posted', objectType: 'journal', objectId: r.id, data: { number, reversalOf: e.number } })
    return this.get(db, entityId, r.id)
  }
}
