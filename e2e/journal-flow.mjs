// Browser E2E for the journal workflow against a running web+api with the demo seed.
// Usage: BASE_URL=http://localhost:3000 SHOTS=./shots node e2e/journal-flow.mjs
import { mkdirSync } from 'fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.BASE_URL || 'http://localhost:3000'
const shots = process.env.SHOTS || 'e2e/shots'
mkdirSync(shots, { recursive: true })
const D = 'demo.accounting-os.local', PW = 'demo-password-123'
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errs = []
async function session(role) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(`${role} ${p.url()} ${e.message}`))
  p.on('console', (m) => m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text()) && errs.push(`${role} ${p.url()} ${m.text()}`))
  await p.goto(base + '/login')
  await p.fill('#email', `${role}@${D}`); await p.fill('#password', PW)
  await p.click('button[type=submit]')
  await p.waitForURL('**/firm')
  return p
}
const acc = await session('accountant')
await acc.waitForSelector('text=Beranda Firma')
await acc.screenshot({ path: `${shots}/01-firm-home.png`, fullPage: true })
const entityHref = await acc.locator('#entity-switcher option').nth(1).getAttribute('value')
const E = `/e/${entityHref}`
await acc.goto(base + E); await acc.waitForSelector('text=Jurnal terbaru'); await acc.waitForTimeout(500)
await acc.screenshot({ path: `${shots}/02-entity-dashboard.png`, fullPage: true })

// Create journal via keyboard-friendly editor
await acc.goto(base + E + '/journals/new'); await acc.waitForSelector('#acc-0')
await acc.fill('#j-memo', 'E2E: biaya konsultan pajak')
await acc.click('#acc-0'); await acc.keyboard.type('Jasa Profesional'); await acc.keyboard.press('Enter')
await acc.fill('[aria-label="Debit baris 1"]', '3.500.000')
await acc.click('#acc-1'); await acc.keyboard.type('1-10002'); await acc.keyboard.press('Enter')
await acc.fill('[aria-label="Kredit baris 2"]', '3500000')
await acc.waitForSelector('text=Siap diposting')
await acc.screenshot({ path: `${shots}/03-journal-editor.png`, fullPage: true })
await acc.click('text=Simpan & Ajukan')
await acc.waitForURL(/journals\/[0-9a-f-]{36}$/)
await acc.waitForSelector('text=Diajukan')
const journalUrl = acc.url()
console.log('created & submitted', journalUrl)
console.log('accountant sees Setujui button:', await acc.locator('button:has-text("Setujui")').count())

// Manager approves through the approval inbox
const mgr = await session('manager')
await mgr.goto(base + '/firm/approvals'); await mgr.waitForSelector('text=Kotak Persetujuan')
await mgr.screenshot({ path: `${shots}/04-approvals.png`, fullPage: true })
await mgr.goto(journalUrl); await mgr.click('button:has-text("Setujui")'); await mgr.waitForSelector('text=Disetujui')
console.log('manager approved')

// Accountant posts
await acc.reload(); await acc.click('button:has-text("Posting ke Buku Besar")'); await acc.waitForSelector('span:has-text("Diposting")')
await acc.screenshot({ path: `${shots}/05-journal-posted.png`, fullPage: true })
console.log('posted; history items:', await acc.locator('ol li').count())

// Manager reverses
await mgr.goto(journalUrl); await mgr.click('button:has-text("Balik Jurnal")'); await mgr.click('button:has-text("Posting Jurnal Pembalik")')
await mgr.waitForSelector('text=Jurnal pembalik untuk'); console.log('reversal', mgr.url())

// Reports
for (const r of ['balance-sheet', 'profit-loss', 'trial-balance', 'general-ledger']) {
  await acc.goto(base + E + '/reports/' + r); await acc.waitForLoadState('networkidle'); await acc.waitForTimeout(300)
  const ok = await acc.locator('text=/Seimbang|Total debit = total kredit/').count()
  console.log(r, 'balanced-note:', ok)
  await acc.screenshot({ path: `${shots}/06-${r}.png`, fullPage: true })
}
// Other pages
for (const r of ['/accounts', '/periods', '/settings', '/m/sales', '/m/inventory', '/journals']) {
  await acc.goto(base + E + r); await acc.waitForLoadState('networkidle'); console.log(r, '=>', await acc.locator('h1').first().textContent())
}
await acc.goto(base + E + '/m/sales'); await acc.screenshot({ path: `${shots}/07-planned.png` })
await acc.goto(base + E + '/audit'); await acc.waitForLoadState('networkidle'); console.log('/audit (accountant) =>', (await acc.locator('h1, [role=alert]').first().textContent()).slice(0, 60))
const partner = await session('partner')
for (const r of ['/firm/staff', '/firm/audit', '/firm/clients', '/firm/m/close']) { await partner.goto(base + r); await partner.waitForLoadState('networkidle'); console.log(r, '=>', await partner.locator('h1').first().textContent()) }
await partner.goto(base + E + '/periods'); await partner.screenshot({ path: `${shots}/08-periods.png`, fullPage: true })
// Mobile
const m = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: await partner.context().storageState() }); const mp = await m.newPage()
await mp.goto(base + E + '/journals'); await mp.waitForLoadState('networkidle'); await mp.screenshot({ path: `${shots}/09-mobile.png` })
console.log('mobile horizontal overflow:', await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
console.log('ERRORS', JSON.stringify(errs, null, 1))
await b.close()
