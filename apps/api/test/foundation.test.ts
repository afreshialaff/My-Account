import { INestApplication } from '@nestjs/common'
import { Client } from 'pg'
import { Api, createApp, freshDatabase, uniqueEmail } from './helpers'

/*
 * Sprint 01-06 vertical slice: tenancy, RBAC, chart of accounts, fiscal periods and the
 * double-entry journal engine, exercised through the HTTP API against real PostgreSQL.
 */

let app: INestApplication
let api: Api
let urls: { adminUrl: string; appUrl: string }

interface Firm {
  partner: Api
  partnerId: string
  clientId: string
  entityId: string
  acc: Record<string, string> // code -> id
}

const PASSWORD = 'correct-horse-battery'
const today = new Date().toISOString().slice(0, 10)
const year = Number(today.slice(0, 4))

async function setupFirm(name: string, requireApproval = true): Promise<Firm> {
  const reg = await api.post('/auth/register', { firmName: name, fullName: `Partner ${name}`, email: uniqueEmail('partner'), password: PASSWORD })
  expect(reg.status).toBe(201)
  const partner = api.as(reg.body.token)
  const client = await partner.post('/clients', { code: 'CL1', name: `${name} Client` })
  expect(client.status).toBe(201)
  const entity = await partner.post(`/clients/${client.body.id}/entities`, { name: `${name} Co`, requireApproval })
  expect(entity.status).toBe(201)
  const accounts = await partner.get(`/entities/${entity.body.id}/accounts`)
  const acc = Object.fromEntries(accounts.body.map((a: { code: string; id: string }) => [a.code, a.id]))
  return { partner, partnerId: reg.body.user.id, clientId: client.body.id, entityId: entity.body.id, acc }
}

async function addStaff(f: Firm, role: string) {
  const email = uniqueEmail(role)
  const r = await f.partner.post('/staff', { email, fullName: `${role} user`, role, password: PASSWORD })
  expect(r.status).toBe(201)
  const login = await api.post('/auth/login', { email, password: PASSWORD })
  expect(login.status).toBe(200)
  return { api: api.as(login.body.token), id: r.body.id as string }
}

function journal(f: Firm, lines: [string, string, string][], date = today, memo = 'test') {
  return {
    journalDate: date,
    memo,
    lines: lines.map(([code, debit, credit]) => ({ accountId: f.acc[code], debit, credit })),
  }
}

/** Creates and posts a journal in a company that does not require approval. */
async function postDirect(f: Firm, lines: [string, string, string][], date = today) {
  const c = await f.partner.post(`/entities/${f.entityId}/journals`, journal(f, lines, date))
  expect(c.status).toBe(201)
  const p = await f.partner.post(`/entities/${f.entityId}/journals/${c.body.id}/post`)
  expect(p.status).toBe(200)
  return p.body
}

beforeAll(async () => {
  urls = await freshDatabase()
  app = await createApp()
  api = new Api(app)
})

afterAll(async () => {
  await app?.close()
})

describe('authentication', () => {
  it('registers a firm, logs in and returns the session profile', async () => {
    const email = uniqueEmail('auth')
    const reg = await api.post('/auth/register', { firmName: 'KAP Auth', fullName: 'Auditor Satu', email, password: PASSWORD })
    expect(reg.status).toBe(201)
    expect((await api.post('/auth/login', { email, password: 'wrong-password-1' })).status).toBe(401)
    const login = await api.post('/auth/login', { email, password: PASSWORD })
    expect(login.status).toBe(200)
    const me = await api.as(login.body.token).get('/me')
    expect(me.body.firm.name).toBe('KAP Auth')
    expect(me.body.permissions).toContain('journal.approve')
  })

  it('rejects unauthenticated requests and weak passwords', async () => {
    expect((await api.get('/clients')).status).toBe(401)
    expect((await api.post('/auth/register', { firmName: 'X Firm', fullName: 'X', email: uniqueEmail('w'), password: 'short' })).status).toBe(400)
  })
})

describe('tenant isolation', () => {
  let a: Firm
  let b: Firm
  beforeAll(async () => {
    a = await setupFirm('Firm A', false)
    b = await setupFirm('Firm B', false)
    await postDirect(a, [['1-10002', '1000000.00', '0'], ['3-30000', '0', '1000000.00']])
  })

  it('denies another firm reading or writing a company (404, not 403, to avoid id probing)', async () => {
    expect((await b.partner.get(`/entities/${a.entityId}`)).status).toBe(404)
    expect((await b.partner.get(`/entities/${a.entityId}/journals`)).status).toBe(404)
    expect((await b.partner.get(`/entities/${a.entityId}/reports/trial-balance?from=${year}-01-01&to=${today}`)).status).toBe(404)
    expect((await b.partner.post(`/entities/${a.entityId}/journals`, journal(a, [['1-10001', '1', '0'], ['4-40000', '0', '1']]))).status).toBe(404)
    expect((await b.partner.get(`/clients/${a.clientId}`)).status).toBe(404)
  })

  it("cannot reference another firm's accounts from its own company", async () => {
    const bad = { journalDate: today, lines: [{ accountId: a.acc['1-10001'], debit: '5', credit: '0' }, { accountId: b.acc['4-40000'], debit: '0', credit: '5' }] }
    const r = await b.partner.post(`/entities/${b.entityId}/journals`, bad)
    expect(r.status).toBe(422)
  })

  it('row level security hides other firms even for raw SQL by the application role', async () => {
    const db = new Client({ connectionString: urls.appUrl })
    await db.connect()
    try {
      await db.query('begin')
      const firmB = (await b.partner.get('/me')).body.firm.id
      await db.query(`select set_config('app.firm_id', $1, true)`, [firmB])
      const rows = await db.query(`select count(*)::int as n from journal_entries where entity_id = $1`, [a.entityId])
      expect(rows.rows[0].n).toBe(0)
      await expect(db.query(`insert into clients (firm_id, code, name) values ($1, 'X', 'Hijack')`, [(await a.partner.get('/me')).body.firm.id])).rejects.toThrow(/row-level security/)
      await db.query('rollback')
      // Without any firm context nothing is visible at all.
      const none = await db.query(`select count(*)::int as n from journal_entries`)
      expect(none.rows[0].n).toBe(0)
    } finally {
      await db.end()
    }
  })

  it('accountants only see clients they are assigned to; auditors are read-only', async () => {
    const acct = await addStaff(a, 'accountant')
    expect((await acct.api.get(`/entities/${a.entityId}`)).status).toBe(404)
    expect((await acct.api.get('/clients')).body).toHaveLength(0)
    expect((await a.partner.post(`/clients/${a.clientId}/members`, { userId: acct.id })).status).toBe(201)
    expect((await acct.api.get(`/entities/${a.entityId}`)).status).toBe(200)

    const auditor = await addStaff(a, 'auditor')
    await a.partner.post(`/clients/${a.clientId}/members`, { userId: auditor.id })
    expect((await auditor.api.get(`/entities/${a.entityId}/journals`)).status).toBe(200)
    expect((await auditor.api.post(`/entities/${a.entityId}/journals`, journal(a, [['1-10001', '1', '0'], ['4-40000', '0', '1']]))).status).toBe(403)
    expect((await acct.api.post('/clients', { code: 'NOPE', name: 'Not allowed' })).status).toBe(403)
  })
})

describe('double-entry journal engine', () => {
  let f: Firm
  let manager: { api: Api; id: string }
  let accountant: { api: Api; id: string }
  beforeAll(async () => {
    f = await setupFirm('Firm Journal', true)
    manager = await addStaff(f, 'manager')
    accountant = await addStaff(f, 'accountant')
    await f.partner.post(`/clients/${f.clientId}/members`, { userId: accountant.id })
  })

  it('previews problems without saving and rejects malformed amounts', async () => {
    const p = await f.partner.post(`/entities/${f.entityId}/journals/preview`, journal(f, [['1-10001', '100.00', '0'], ['4-40000', '0', '90.00']]))
    expect(p.status).toBe(200)
    expect(p.body.postable).toBe(false)
    expect(p.body.totals.difference).toBe('10.00')
    const bad = await f.partner.post(`/entities/${f.entityId}/journals`, journal(f, [['1-10001', '1.005', '0'], ['4-40000', '0', '1.005']]))
    expect(bad.status).toBe(400)
    const both = await f.partner.post(`/entities/${f.entityId}/journals`, { journalDate: today, lines: [{ accountId: f.acc['1-10001'], debit: '5', credit: '5' }] })
    expect(both.status).toBe(400)
  })

  it('uses exact decimals (0.10 + 0.20 = 0.30)', async () => {
    const p = await f.partner.post(`/entities/${f.entityId}/journals/preview`, journal(f, [['1-10001', '0.10', '0'], ['1-10002', '0.20', '0'], ['4-40000', '0', '0.30']]))
    expect(p.body.totals).toMatchObject({ debit: '0.30', credit: '0.30', balanced: true })
  })

  it('cannot submit or post an unbalanced journal', async () => {
    const c = await accountant.api.post(`/entities/${f.entityId}/journals`, journal(f, [['1-10001', '100', '0'], ['4-40000', '0', '99']]))
    expect(c.status).toBe(201)
    expect(c.body.status).toBe('draft')
    const s = await accountant.api.post(`/entities/${f.entityId}/journals/${c.body.id}/submit`)
    expect(s.status).toBe(422)
    expect(s.body.message).toMatch(/seimbang/)
  })

  it('is idempotent for retried creates with the same Idempotency-Key', async () => {
    const body = journal(f, [['1-10001', '250', '0'], ['4-40000', '0', '250']])
    const r1 = await accountant.api.post(`/entities/${f.entityId}/journals`, body).set('Idempotency-Key', 'retry-key-0001')
    const r2 = await accountant.api.post(`/entities/${f.entityId}/journals`, body).set('Idempotency-Key', 'retry-key-0001')
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(200)
    expect(r2.headers['idempotent-replayed']).toBe('true')
    expect(r2.body.id).toBe(r1.body.id)
    const list = await f.partner.get(`/entities/${f.entityId}/journals?q=${r1.body.number}`)
    expect(list.body.total).toBe(1)
  })

  it('enforces maker-checker: approved is not posted, and preparers cannot approve their own journal', async () => {
    const c = await accountant.api.post(`/entities/${f.entityId}/journals`, journal(f, [['1-10002', '5000000', '0'], ['3-30000', '0', '5000000']]))
    const id = c.body.id
    expect((await accountant.api.post(`/entities/${f.entityId}/journals/${id}/post`)).status).toBe(422) // approval required
    expect((await accountant.api.post(`/entities/${f.entityId}/journals/${id}/submit`)).status).toBe(200)
    expect((await accountant.api.post(`/entities/${f.entityId}/journals/${id}/approve`)).status).toBe(403) // no permission

    const own = await manager.api.post(`/entities/${f.entityId}/journals`, journal(f, [['1-10001', '10', '0'], ['4-40000', '0', '10']]))
    await manager.api.post(`/entities/${f.entityId}/journals/${own.body.id}/submit`)
    const self = await manager.api.post(`/entities/${f.entityId}/journals/${own.body.id}/approve`)
    expect(self.status).toBe(403)
    expect(self.body.message).toMatch(/segregation of duties/)

    const ap = await manager.api.post(`/entities/${f.entityId}/journals/${id}/approve`)
    expect(ap.body.status).toBe('approved')
    const tb1 = await f.partner.get(`/entities/${f.entityId}/reports/trial-balance?from=${year}-01-01&to=${today}`)
    expect(tb1.body.totals.debit).toBe('0.00') // approved but not posted → not in the ledger

    const posted = await accountant.api.post(`/entities/${f.entityId}/journals/${id}/post`)
    expect(posted.status).toBe(200)
    expect(posted.body.status).toBe('posted')
    expect(posted.body.history.map((h: { action: string }) => h.action)).toEqual(['journal.created', 'journal.submitted', 'journal.approved', 'journal.posted'])
  })

  it('handles concurrent duplicate post requests exactly once', async () => {
    const c = await accountant.api.post(`/entities/${f.entityId}/journals`, journal(f, [['1-10001', '777', '0'], ['4-40000', '0', '777']]))
    await accountant.api.post(`/entities/${f.entityId}/journals/${c.body.id}/submit`)
    await manager.api.post(`/entities/${f.entityId}/journals/${c.body.id}/approve`)
    const results = await Promise.all([1, 2, 3, 4].map(() => accountant.api.post(`/entities/${f.entityId}/journals/${c.body.id}/post`)))
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200])
    const j = await f.partner.get(`/entities/${f.entityId}/journals/${c.body.id}`)
    expect(j.body.history.filter((h: { action: string }) => h.action === 'journal.posted')).toHaveLength(1)
  })

  it('posted journals are immutable through the API and at the database level', async () => {
    const list = await f.partner.get(`/entities/${f.entityId}/journals?status=posted`)
    const id = list.body.rows[0].id
    expect((await f.partner.put(`/entities/${f.entityId}/journals/${id}`, journal(f, [['1-10001', '1', '0'], ['4-40000', '0', '1']]))).status).toBe(422)
    expect((await f.partner.delete(`/entities/${f.entityId}/journals/${id}`)).status).toBe(422)

    const db = new Client({ connectionString: urls.appUrl })
    await db.connect()
    try {
      await db.query(`select set_config('app.firm_id', $1, false)`, [(await f.partner.get('/me')).body.firm.id])
      await expect(db.query(`update journal_entries set memo = 'tampered' where id = $1`, [id])).rejects.toThrow(/immutable/)
      await expect(db.query(`update journal_lines set debit = debit + 1 where entry_id = $1`, [id])).rejects.toThrow(/cannot be changed/)
      await expect(db.query(`delete from journal_lines where entry_id = $1`, [id])).rejects.toThrow(/cannot be changed/)
      await expect(db.query(`update audit_events set action = 'x'`)).rejects.toThrow(/append-only/)
    } finally {
      await db.end()
    }
  })

  it('corrects posted journals only by reversal, exactly once', async () => {
    const list = await f.partner.get(`/entities/${f.entityId}/journals?status=posted`)
    const original = list.body.rows.find((r: { total: string }) => r.total === '777.00')
    const before = await f.partner.get(`/entities/${f.entityId}/reports/trial-balance?from=${year}-01-01&to=${today}`)
    const rev = await accountant.api.post(`/entities/${f.entityId}/journals/${original.id}/reverse`, { date: today })
    expect(rev.status).toBe(403) // accountants cannot reverse
    const ok = await manager.api.post(`/entities/${f.entityId}/journals/${original.id}/reverse`, { date: today })
    expect(ok.status).toBe(200)
    expect(ok.body.status).toBe('posted')
    expect(ok.body.reversal_of).toBe(original.id)
    expect(ok.body.lines[0]).toMatchObject({ debit: '0.00', credit: '777.00' })
    const orig = await f.partner.get(`/entities/${f.entityId}/journals/${original.id}`)
    expect(orig.body.status).toBe('reversed')
    expect(orig.body.reversed_by).toBe(ok.body.id)
    expect((await manager.api.post(`/entities/${f.entityId}/journals/${original.id}/reverse`, { date: today })).status).toBe(409)

    const after = await f.partner.get(`/entities/${f.entityId}/reports/trial-balance?from=${year}-01-01&to=${today}`)
    const cash = (tb: { body: { rows: { code: string; closingDebit: string }[] } }) => tb.body.rows.find((r) => r.code === '1-10001')?.closingDebit
    expect(Number(cash(before)) - Number(cash(after))).toBe(777)
    expect(after.body.balanced).toBe(true)
  })

  it('locked periods block posting and reversal; only partners can reopen, with a reason', async () => {
    const periods = (await f.partner.get(`/entities/${f.entityId}/periods`)).body
    const current = periods.find((p: { start_date: string; end_date: string }) => p.start_date <= today && today <= p.end_date)
    const c = await accountant.api.post(`/entities/${f.entityId}/journals`, journal(f, [['1-10001', '50', '0'], ['4-40000', '0', '50']]))
    await accountant.api.post(`/entities/${f.entityId}/journals/${c.body.id}/submit`)
    await manager.api.post(`/entities/${f.entityId}/journals/${c.body.id}/approve`)

    expect((await accountant.api.post(`/entities/${f.entityId}/periods/${current.id}/lock`)).status).toBe(403)
    expect((await manager.api.post(`/entities/${f.entityId}/periods/${current.id}/lock`)).body.status).toBe('locked')

    const post = await accountant.api.post(`/entities/${f.entityId}/journals/${c.body.id}/post`)
    expect(post.status).toBe(422)
    expect(post.body.message).toMatch(/dikunci/)
    const posted = (await f.partner.get(`/entities/${f.entityId}/journals?status=posted`)).body.rows[0]
    expect((await manager.api.post(`/entities/${f.entityId}/journals/${posted.id}/reverse`, { date: today })).status).toBe(422)

    expect((await manager.api.post(`/entities/${f.entityId}/periods/${current.id}/reopen`, { reason: 'audit adj' })).status).toBe(403)
    expect((await f.partner.post(`/entities/${f.entityId}/periods/${current.id}/reopen`, {})).status).toBe(400)
    expect((await f.partner.post(`/entities/${f.entityId}/periods/${current.id}/reopen`, { reason: 'Koreksi audit eksternal' })).body.status).toBe('open')
    expect((await accountant.api.post(`/entities/${f.entityId}/journals/${c.body.id}/post`)).status).toBe(200)

    const audit = (await f.partner.get(`/entities/${f.entityId}/audit`)).body
    expect(audit.find((e: { action: string }) => e.action === 'period.reopened').data.reason).toBe('Koreksi audit eksternal')
  })

  it('rejects posting into a date without a fiscal period', async () => {
    const c = await accountant.api.post(`/entities/${f.entityId}/journals`, journal(f, [['1-10001', '5', '0'], ['4-40000', '0', '5']], `${year + 5}-01-15`))
    await accountant.api.post(`/entities/${f.entityId}/journals/${c.body.id}/submit`).expect(422)
  })
})

describe('financial reports reconcile', () => {
  let f: Firm
  beforeAll(async () => {
    f = await setupFirm('Firm Reports', false)
    await f.partner.post(`/entities/${f.entityId}/periods/generate`, { year: year - 1 })
    const lastYear = `${year - 1}-06-30`
    await postDirect(f, [['1-10002', '100000000', '0'], ['3-30000', '0', '100000000']], lastYear)
    await postDirect(f, [['1-10100', '22200000', '0'], ['4-40000', '0', '20000000'], ['2-20500', '0', '2200000']], lastYear) // sale with PPN 11%
    await postDirect(f, [['6-60101', '8000000', '0'], ['1-10002', '0', '8000000']], lastYear)
    await postDirect(f, [['1-10002', '22200000', '0'], ['1-10100', '0', '22200000']]) // collection this year
    await postDirect(f, [['1-10100', '11100000', '0'], ['4-40000', '0', '10000000'], ['2-20500', '0', '1100000']])
    await postDirect(f, [['6-60202', '1500000', '0'], ['1-10001', '0', '1500000']])
    await postDirect(f, [['1-10755', '0', '250000'], ['6-60302', '250000', '0']])
  })

  it('trial balance balances', async () => {
    const tb = await f.partner.get(`/entities/${f.entityId}/reports/trial-balance?from=${year}-01-01&to=${today}`)
    expect(tb.body.balanced).toBe(true)
    expect(tb.body.totals.openingDebit).toBe(tb.body.totals.openingCredit)
  })

  it('profit & loss and balance sheet tie out, with prior-year earnings carried forward', async () => {
    const pl = await f.partner.get(`/entities/${f.entityId}/reports/profit-loss?from=${year}-01-01&to=${today}`)
    expect(pl.body.revenue.total).toBe('10000000.00')
    expect(pl.body.netIncome).toBe('8250000.00') // 10,000,000 - 1,500,000 - 250,000
    const bs = await f.partner.get(`/entities/${f.entityId}/reports/balance-sheet?asOf=${today}`)
    expect(bs.body.balanced).toBe(true)
    expect(bs.body.currentEarnings).toBe(pl.body.netIncome)
    expect(bs.body.priorEarnings).toBe('12000000.00') // 20,000,000 - 8,000,000
    expect(bs.body.totalAssets).toBe(bs.body.totalLiabilitiesEquity)
    const dep = bs.body.assets.find((s: { category: string }) => s.category === 'depreciation')
    expect(dep.total).toBe('-250000.00') // contra asset reduces assets
  })

  it('general ledger shows opening and running balance', async () => {
    const gl = await f.partner.get(`/entities/${f.entityId}/reports/general-ledger?accountId=${f.acc['1-10002']}&from=${year}-01-01&to=${today}`)
    expect(gl.body.opening).toBe('92000000.00')
    expect(gl.body.closing).toBe('114200000.00')
    expect(gl.body.rows.at(-1).balance).toBe(gl.body.closing)
  })
})
