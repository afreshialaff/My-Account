import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { AccessService } from '../auth/access.service'
import type { AuthCtx, Role } from '../auth/auth.guard'
import { AuditService } from '../audit/audit.service'
import { config } from '../config'
import { JournalsService } from '../journals/journals.service'
import { createEntity, generateFiscalYear } from '../tenancy/bootstrap'
import { DbService } from './db.service'

/**
 * Sandbox data for demos. Everything is clearly labelled [DEMO]; it is not real client data.
 * Logins (password for all: demo-password-123):
 *   partner@demo.accounting-os.local, manager@…, accountant@…, auditor@…
 */
const PASSWORD = 'demo-password-123'
const DOMAIN = 'demo.accounting-os.local'

async function main() {
  const db = new DbService()
  const firmId = randomUUID()
  const users: Record<Role, string> = { partner: randomUUID(), manager: randomUUID(), accountant: randomUUID(), auditor: randomUUID() }
  const exists = await db.txWith({ 'app.auth_email': `partner@${DOMAIN}` }, async (c) => (await c.query('select 1 from users where email = $1', [`partner@${DOMAIN}`])).rowCount)
  if (exists) {
    console.log('demo firm already seeded')
    await db.pool.end()
    return
  }
  const hash = await bcrypt.hash(PASSWORD, 12)
  const partner: AuthCtx = { firmId, userId: users.partner, role: 'partner' }
  const manager: AuthCtx = { firmId, userId: users.manager, role: 'manager' }
  const accountant: AuthCtx = { firmId, userId: users.accountant, role: 'accountant' }
  const journals = new JournalsService(new AccessService(), new AuditService())
  const today = new Date().toISOString().slice(0, 10)
  const year = Number(today.slice(0, 4))
  const d = (m: number, day: number) => {
    const s = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return s > today ? today : s
  }

  await db.txWith({ 'app.firm_id': firmId, 'app.user_id': users.partner }, async (c) => {
    await c.query('insert into firms (id, name) values ($1, $2)', [firmId, '[DEMO] KAP Sejahtera & Rekan'])
    const names: Record<Role, string> = { partner: 'Siti Rahma (Partner)', manager: 'Andi Wijaya (Manager)', accountant: 'Dewi Lestari (Akuntan)', auditor: 'Bayu Pratama (Auditor)' }
    for (const role of Object.keys(users) as Role[]) {
      await c.query(`insert into users (id, firm_id, email, full_name, password_hash, role) values ($1, $2, $3, $4, $5, $6)`, [users[role], firmId, `${role}@${DOMAIN}`, names[role], hash, role])
    }

    const clients = [
      { code: 'MAJU', name: '[DEMO] PT Maju Bersama Teknologi', entities: ['PT Maju Bersama Teknologi', 'PT Maju Bersama Retail'] },
      { code: 'KOPI', name: '[DEMO] CV Kopi Nusantara', entities: ['CV Kopi Nusantara'] },
    ]
    for (const cl of clients) {
      const client = (await c.query(`insert into clients (firm_id, code, name, created_by) values ($1, $2, $3, $4) returning id`, [firmId, cl.code, cl.name, users.partner])).rows[0]
      await c.query(`insert into client_memberships (firm_id, user_id, client_id) values ($1, $2, $3), ($1, $4, $3)`, [firmId, users.accountant, client.id, users.auditor])
      for (const name of cl.entities) {
        const e = await createEntity(c, partner, client.id, { name, legalName: name, fiscalYearStartMonth: 1, requireApproval: true })
        await generateFiscalYear(c, partner, e.id, 1, year - 1)
        await c.query(`insert into branches (firm_id, entity_id, code, name) values ($1, $2, 'SBY', 'Cabang Surabaya')`, [firmId, e.id])
        const acc = Object.fromEntries((await c.query(`select code, id from accounts where entity_id = $1`, [e.id])).rows.map((r) => [r.code, r.id]))
        const entity = (await c.query(`select * from legal_entities where id = $1`, [e.id])).rows[0]
        const L = (code: string, debit: string, credit: string, description?: string) => ({ accountId: acc[code], debit, credit, description })

        const flow = async (date: string, memo: string, lines: ReturnType<typeof L>[], upTo: 'draft' | 'submitted' | 'approved' | 'posted' = 'posted') => {
          const { journal } = await journals.create(c, accountant, e.id, { journalDate: date, memo, lines })
          if (upTo === 'draft') return
          await journals.transition(c, accountant, entity, journal.id, 'submit')
          if (upTo === 'submitted') return
          await journals.transition(c, manager, entity, journal.id, 'approve')
          if (upTo === 'approved') return
          await journals.transition(c, accountant, entity, journal.id, 'post')
        }

        const scale = name.includes('Retail') ? 0.4 : name.includes('Kopi') ? 0.15 : 1
        const amt = (n: number) => (Math.round(n * scale * 100) / 100).toFixed(2)
        await flow(d(1, 2), 'Setoran modal awal', [L('1-10002', amt(500_000_000), '0'), L('1-10001', amt(20_000_000), '0'), L('3-30000', '0', amt(520_000_000))])
        await flow(d(1, 10), 'Pembelian peralatan kantor', [L('1-10705', amt(60_000_000), '0'), L('1-10002', '0', amt(60_000_000))])
        for (let m = 1; m <= Math.min(Number(today.slice(5, 7)), 12); m++) {
          await flow(d(m, 5), `Penjualan jasa bulan ${m}`, [L('1-10100', amt(111_000_000), '0'), L('4-40300', '0', amt(100_000_000)), L('2-20500', '0', amt(11_000_000))])
          await flow(d(m, 20), `Pelunasan piutang bulan ${m}`, [L('1-10002', amt(111_000_000), '0'), L('1-10100', '0', amt(111_000_000))])
          await flow(d(m, 25), `Gaji karyawan bulan ${m}`, [L('6-60101', amt(45_000_000), '0'), L('2-20501', '0', amt(2_250_000)), L('1-10002', '0', amt(42_750_000))])
          await flow(d(m, 26), `Sewa & utilitas bulan ${m}`, [L('6-60210', amt(15_000_000), '0'), L('6-60202', amt(3_200_000), '0'), L('1-10002', '0', amt(18_200_000))])
          await flow(d(m, 28), `Penyusutan bulan ${m}`, [L('6-60302', amt(1_250_000), '0'), L('1-10755', '0', amt(1_250_000))])
        }
        // Work in progress for the approval inbox.
        await flow(today, 'Biaya iklan (menunggu persetujuan)', [L('6-60001', amt(7_500_000), '0'), L('1-10002', '0', amt(7_500_000))], 'submitted')
        await flow(today, 'Koreksi PPN (menunggu posting)', [L('2-20500', amt(500_000), '0'), L('1-10002', '0', amt(500_000))], 'approved')
        await flow(today, 'Draft: biaya perjalanan dinas', [L('6-60204', amt(2_400_000), '0'), L('1-10001', '0', amt(2_400_000))], 'draft')
      }
    }
  })
  console.log(`seeded [DEMO] firm. Login: partner@${DOMAIN} / ${PASSWORD} (also manager@, accountant@, auditor@)`)
  await db.pool.end()
}

void config
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
