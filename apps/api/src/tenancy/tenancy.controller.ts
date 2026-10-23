import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { AccessService } from '../auth/access.service'
import { Auth, AuthCtx } from '../auth/auth.guard'
import { AuditService } from '../audit/audit.service'
import { NotFound } from '../common/errors'
import { parse, uuid } from '../common/validation'
import { DbService } from '../db/db.service'
import { createEntity } from './bootstrap'

const ClientBody = z.object({
  code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/, 'letters, digits, - or _'),
  name: z.string().trim().min(2).max(200),
})
const ClientPatch = z.object({ name: z.string().trim().min(2).max(200).optional(), status: z.enum(['active', 'inactive']).optional() })

const EntityBody = z.object({
  name: z.string().trim().min(2).max(200),
  legalName: z.string().trim().max(200).nullish(),
  npwp: z.string().trim().max(30).nullish(),
  address: z.string().trim().max(500).nullish(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  requireApproval: z.boolean().default(true),
})
const EntityPatch = EntityBody.omit({ fiscalYearStartMonth: true }).partial()

const BranchBody = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(200),
  address: z.string().trim().max(500).nullish(),
})
const BranchPatch = BranchBody.partial().extend({ isActive: z.boolean().optional() })

const StaffBody = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(200),
  role: z.enum(['partner', 'manager', 'accountant', 'auditor']),
  password: z.string().min(10).max(200),
})
const StaffPatch = z.object({ role: z.enum(['partner', 'manager', 'accountant', 'auditor']).optional(), isActive: z.boolean().optional() })

@Controller()
export class TenancyController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /* ----------------------------- firm command center ----------------------------- */

  @Get('firm/overview')
  overview(@Auth() ctx: AuthCtx) {
    return this.db.tx(ctx, async (db) => {
      const f = this.access.clientFilter(ctx)
      const clients = (
        await db.query(
          `select c.id, c.code, c.name, c.status,
                  (select count(*) from legal_entities e where e.client_id = c.id)::int as entity_count,
                  (select count(*) from journal_entries j join legal_entities e on e.id = j.entity_id where e.client_id = c.id and j.status = 'draft')::int as drafts,
                  (select count(*) from journal_entries j join legal_entities e on e.id = j.entity_id where e.client_id = c.id and j.status = 'submitted')::int as awaiting_approval,
                  (select count(*) from journal_entries j join legal_entities e on e.id = j.entity_id where e.client_id = c.id and j.status = 'approved')::int as awaiting_posting,
                  (select max(j.posted_at) from journal_entries j join legal_entities e on e.id = j.entity_id where e.client_id = c.id) as last_posted_at
             from clients c where ${f.sql} order by c.name`,
          f.params,
        )
      ).rows
      const staff = (await db.query(`select count(*)::int as n from users where is_active`)).rows[0].n
      return { clients, staffCount: staff }
    })
  }

  /** Approval inbox: journals waiting for approval or posting, across all accessible companies. */
  @Get('approvals')
  approvals(@Auth() ctx: AuthCtx) {
    return this.db.tx(ctx, async (db) => {
      const f = this.access.clientFilter(ctx)
      return (
        await db.query(
          `select j.id, j.number, j.journal_date, j.status, j.memo, j.entity_id, e.name as entity_name, c.name as client_name,
                  u.full_name as created_by_name, j.created_by, j.submitted_at,
                  (select sum(debit) from journal_lines l where l.entry_id = j.id) as total
             from journal_entries j
             join legal_entities e on e.id = j.entity_id
             join clients c on c.id = e.client_id
             left join users u on u.id = j.created_by
            where j.status in ('submitted', 'approved') and ${f.sql}
            order by j.submitted_at nulls last`,
          f.params,
        )
      ).rows
    })
  }

  /* ----------------------------- clients ----------------------------- */

  @Get('clients')
  listClients(@Auth() ctx: AuthCtx) {
    return this.db.tx(ctx, async (db) => {
      const f = this.access.clientFilter(ctx)
      return (
        await db.query(
          `select c.*, (select count(*) from legal_entities e where e.client_id = c.id)::int as entity_count
             from clients c where ${f.sql} order by c.name`,
          f.params,
        )
      ).rows
    })
  }

  @Post('clients')
  createClient(@Auth() ctx: AuthCtx, @Body() body: unknown) {
    this.access.require(ctx, 'tenancy.manage')
    const b = parse(ClientBody, body)
    return this.db.tx(ctx, async (db) => {
      const c = (
        await db.query(`insert into clients (firm_id, code, name, created_by) values ($1, $2, $3, $4) returning *`, [ctx.firmId, b.code.toUpperCase(), b.name, ctx.userId])
      ).rows[0]
      await this.audit.record(db, ctx, { action: 'client.created', objectType: 'client', objectId: c.id, data: b })
      return c
    })
  }

  @Get('clients/:id')
  getClient(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tx(ctx, async (db) => {
      const client = await this.access.assertClient(db, ctx, id)
      const entities = (await db.query(`select * from legal_entities where client_id = $1 order by name`, [id])).rows
      const members = (
        await db.query(
          `select u.id, u.full_name, u.email, u.role from client_memberships m join users u on u.id = m.user_id where m.client_id = $1 order by u.full_name`,
          [id],
        )
      ).rows
      return { ...client, entities, members }
    })
  }

  @Patch('clients/:id')
  updateClient(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    this.access.require(ctx, 'tenancy.manage')
    const b = parse(ClientPatch, body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertClient(db, ctx, id)
      const c = (
        await db.query(`update clients set name = coalesce($2, name), status = coalesce($3, status) where id = $1 returning *`, [id, b.name ?? null, b.status ?? null])
      ).rows[0]
      await this.audit.record(db, ctx, { action: 'client.updated', objectType: 'client', objectId: id, data: b })
      return c
    })
  }

  @Post('clients/:id/members')
  addMember(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    this.access.require(ctx, 'tenancy.manage')
    const { userId } = parse(z.object({ userId: uuid }), body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertClient(db, ctx, id)
      await db.query(`insert into client_memberships (firm_id, user_id, client_id) values ($1, $2, $3) on conflict do nothing`, [ctx.firmId, userId, id])
      await this.audit.record(db, ctx, { action: 'client.member_added', objectType: 'client', objectId: id, data: { userId } })
      return { ok: true }
    })
  }

  @Delete('clients/:id/members/:userId')
  removeMember(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    this.access.require(ctx, 'tenancy.manage')
    return this.db.tx(ctx, async (db) => {
      await this.access.assertClient(db, ctx, id)
      await db.query(`delete from client_memberships where client_id = $1 and user_id = $2`, [id, userId])
      await this.audit.record(db, ctx, { action: 'client.member_removed', objectType: 'client', objectId: id, data: { userId } })
      return { ok: true }
    })
  }

  /* ----------------------------- legal entities ----------------------------- */

  @Post('clients/:id/entities')
  createEntity(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    this.access.require(ctx, 'tenancy.manage')
    const b = parse(EntityBody, body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertClient(db, ctx, id)
      const e = await createEntity(db, ctx, id, b)
      await this.audit.record(db, ctx, { entityId: e.id, action: 'entity.created', objectType: 'legal_entity', objectId: e.id, data: b })
      return e
    })
  }

  @Get('entities/:id')
  getEntity(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tx(ctx, async (db) => {
      const e = await this.access.assertEntity(db, ctx, id)
      const client = (await db.query(`select id, name, code from clients where id = $1`, [e.client_id])).rows[0]
      return { ...e, client }
    })
  }

  @Patch('entities/:id')
  updateEntity(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    this.access.require(ctx, 'tenancy.manage')
    const b = parse(EntityPatch, body)
    return this.db.tx(ctx, async (db) => {
      const before = await this.access.assertEntity(db, ctx, id)
      const e = (
        await db.query(
          `update legal_entities set name = coalesce($2, name), legal_name = coalesce($3, legal_name), npwp = coalesce($4, npwp),
                  address = coalesce($5, address), require_approval = coalesce($6, require_approval)
            where id = $1 returning *`,
          [id, b.name ?? null, b.legalName ?? null, b.npwp ?? null, b.address ?? null, b.requireApproval ?? null],
        )
      ).rows[0]
      await this.audit.record(db, ctx, { entityId: id, action: 'entity.updated', objectType: 'legal_entity', objectId: id, data: { before, change: b } })
      return e
    })
  }

  /* ----------------------------- branches ----------------------------- */

  @Get('entities/:id/branches')
  listBranches(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, id)
      return (await db.query(`select * from branches where entity_id = $1 order by code`, [id])).rows
    })
  }

  @Post('entities/:id/branches')
  createBranch(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    this.access.require(ctx, 'tenancy.manage')
    const b = parse(BranchBody, body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, id)
      const r = (
        await db.query(`insert into branches (firm_id, entity_id, code, name, address) values ($1, $2, $3, $4, $5) returning *`, [ctx.firmId, id, b.code.toUpperCase(), b.name, b.address ?? null])
      ).rows[0]
      await this.audit.record(db, ctx, { entityId: id, action: 'branch.created', objectType: 'branch', objectId: r.id, data: b })
      return r
    })
  }

  @Patch('entities/:id/branches/:branchId')
  updateBranch(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string, @Param('branchId', ParseUUIDPipe) branchId: string, @Body() body: unknown) {
    this.access.require(ctx, 'tenancy.manage')
    const b = parse(BranchPatch, body)
    return this.db.tx(ctx, async (db) => {
      await this.access.assertEntity(db, ctx, id)
      const r = await db.query(
        `update branches set name = coalesce($3, name), address = coalesce($4, address), is_active = coalesce($5, is_active)
          where entity_id = $1 and id = $2 returning *`,
        [id, branchId, b.name ?? null, b.address ?? null, b.isActive ?? null],
      )
      if (!r.rowCount) throw new NotFound('Branch')
      await this.audit.record(db, ctx, { entityId: id, action: 'branch.updated', objectType: 'branch', objectId: branchId, data: b })
      return r.rows[0]
    })
  }

  /* ----------------------------- staff ----------------------------- */

  @Get('staff')
  listStaff(@Auth() ctx: AuthCtx) {
    return this.db.tx(ctx, async (db) => {
      return (
        await db.query(
          `select u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
                  coalesce(json_agg(json_build_object('id', c.id, 'name', c.name)) filter (where c.id is not null), '[]') as clients
             from users u
             left join client_memberships m on m.user_id = u.id
             left join clients c on c.id = m.client_id
            group by u.id order by u.full_name`,
        )
      ).rows
    })
  }

  @Post('staff')
  async createStaff(@Auth() ctx: AuthCtx, @Body() body: unknown) {
    this.access.require(ctx, 'staff.manage')
    const b = parse(StaffBody, body)
    const hash = await bcrypt.hash(b.password, 12)
    return this.db.tx(ctx, async (db) => {
      const u = (
        await db.query(
          `insert into users (firm_id, email, full_name, password_hash, role) values ($1, $2, $3, $4, $5) returning id, email, full_name, role, is_active`,
          [ctx.firmId, b.email.toLowerCase(), b.fullName, hash, b.role],
        )
      ).rows[0]
      await this.audit.record(db, ctx, { action: 'staff.created', objectType: 'user', objectId: u.id, data: { email: u.email, role: u.role } })
      return u
    })
  }

  @Patch('staff/:id')
  updateStaff(@Auth() ctx: AuthCtx, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    this.access.require(ctx, 'staff.manage')
    const b = parse(StaffPatch, body)
    return this.db.tx(ctx, async (db) => {
      const r = await db.query(
        `update users set role = coalesce($2, role), is_active = coalesce($3, is_active) where id = $1 returning id, email, full_name, role, is_active`,
        [id, b.role ?? null, b.isActive ?? null],
      )
      if (!r.rowCount) throw new NotFound('User')
      await this.audit.record(db, ctx, { action: 'staff.updated', objectType: 'user', objectId: id, data: b })
      return r.rows[0]
    })
  }
}
