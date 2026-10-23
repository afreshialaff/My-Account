import { defaultAccounts, SYS } from './coa'
import { docTotals } from './ledger'
import { addDays, addMonths, startOfMonth, today } from './format'
import type { AppData, Contact, DocLine, Invoice, Product } from './types'

export const DATA_VERSION = 1

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    company: { name: 'Perusahaan Saya', address: '', phone: '', email: '', npwp: '' },
    accounts: defaultAccounts(),
    contacts: [],
    products: [],
    salesInvoices: [],
    purchaseInvoices: [],
    payments: [],
    expenses: [],
    cashTransactions: [],
    journals: [],
  }
}

export function nextNumber(prefix: string, existing: { number: string }[]): string {
  let max = 10000
  for (const e of existing) {
    if (!e.number.startsWith(prefix)) continue
    const n = parseInt(e.number.slice(prefix.length), 10)
    if (!isNaN(n) && n > max) max = n
  }
  return `${prefix}${max + 1}`
}

/** Demo company with ~6 months of activity ending today. */
export function demoData(): AppData {
  const d = emptyData()
  d.company = {
    name: 'PT Maju Bersama Teknologi',
    address: 'Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan',
    phone: '021-5551234',
    email: 'finance@majubersama.co.id',
    npwp: '01.234.567.8-012.000',
  }
  const end = today()
  const start = startOfMonth(addMonths(end, -5))
  let created = 1

  const contacts: Contact[] = [
    { id: 'c-1', type: 'customer', name: 'PT Sinar Abadi', email: 'ap@sinarabadi.co.id', phone: '021-7788990', address: 'Jakarta' },
    { id: 'c-2', type: 'customer', name: 'CV Cahaya Mandiri', email: 'admin@cahayamandiri.com', phone: '022-4455667', address: 'Bandung' },
    { id: 'c-3', type: 'customer', name: 'Toko Sumber Rejeki', phone: '031-3344556', address: 'Surabaya' },
    { id: 'c-4', type: 'customer', name: 'PT Nusantara Digital', email: 'finance@nusadigital.id', address: 'Tangerang' },
    { id: 'c-5', type: 'supplier', name: 'PT Distributor Elektronik Jaya', email: 'sales@dejaya.co.id', address: 'Jakarta Utara' },
    { id: 'c-6', type: 'supplier', name: 'CV Grosir Makmur', phone: '021-6612345', address: 'Jakarta Barat' },
    { id: 'c-7', type: 'supplier', name: 'PT PLN (Persero)', address: 'Jakarta' },
    { id: 'c-8', type: 'employee', name: 'Budi Santoso', email: 'budi@majubersama.co.id' },
  ]
  d.contacts = contacts

  const prod = (p: Partial<Product> & Pick<Product, 'id' | 'code' | 'name' | 'sellPrice' | 'buyPrice'>): Product => ({
    unit: 'Pcs',
    trackInventory: true,
    salesAccountId: SYS.revenue,
    purchaseAccountId: SYS.inventory,
    cogsAccountId: SYS.cogs,
    openingQty: 0,
    openingCost: 0,
    openingDate: start,
    ...p,
  })
  d.products = [
    prod({ id: 'p-1', code: 'LPT-001', name: 'Laptop ASUS Vivobook 14', buyPrice: 7_500_000, sellPrice: 9_250_000, openingQty: 5, openingCost: 7_400_000, unit: 'Unit' }),
    prod({ id: 'p-2', code: 'MON-024', name: 'Monitor LED 24 inch', buyPrice: 1_800_000, sellPrice: 2_350_000, openingQty: 10, openingCost: 1_750_000, unit: 'Unit' }),
    prod({ id: 'p-3', code: 'MOU-010', name: 'Mouse Wireless', buyPrice: 85_000, sellPrice: 150_000, openingQty: 40, openingCost: 80_000 }),
    prod({ id: 'p-4', code: 'KEY-020', name: 'Keyboard Mechanical', buyPrice: 450_000, sellPrice: 690_000 }),
    prod({
      id: 'p-5',
      code: 'JSA-001',
      name: 'Jasa Instalasi & Konfigurasi',
      buyPrice: 0,
      sellPrice: 750_000,
      unit: 'Jam',
      trackInventory: false,
      salesAccountId: 'acc-4-40300',
      purchaseAccountId: 'acc-6-60209',
    }),
  ]

  // Opening capital
  d.journals.push({
    id: 'j-open',
    number: 'JE-10001',
    date: start,
    memo: 'Setoran modal awal',
    createdAt: created++,
    lines: [
      { id: 'jl-1', accountId: SYS.bank, description: 'Setoran modal', debit: 250_000_000, credit: 0 },
      { id: 'jl-2', accountId: SYS.cash, description: 'Setoran modal', debit: 15_000_000, credit: 0 },
      { id: 'jl-3', accountId: 'acc-3-30000', description: 'Modal disetor', debit: 0, credit: 265_000_000 },
    ],
  })

  // Office equipment purchased in cash
  d.cashTransactions.push({
    id: 'ct-1',
    kind: 'spend',
    number: 'BW-10001',
    date: addDays(start, 2),
    accountId: SYS.bank,
    contactId: 'c-6',
    memo: 'Pembelian perlengkapan kantor',
    createdAt: created++,
    lines: [{ id: 'cl-1', accountId: 'acc-1-10705', description: 'Meja, kursi & lemari kantor', amount: 36_000_000 }],
  })
  d.cashTransactions.push({
    id: 'ct-2',
    kind: 'transfer',
    number: 'BT-10001',
    date: addDays(start, 3),
    accountId: SYS.bank,
    toAccountId: SYS.cash,
    amount: 5_000_000,
    memo: 'Isi kas kecil',
    createdAt: created++,
    lines: [],
  })

  const line = (id: string, productId: string, qty: number, price: number, discountPct = 0, taxPct = 11): DocLine => ({
    id,
    productId,
    description: d.products.find((p) => p.id === productId)!.name,
    qty,
    price,
    discountPct,
    taxPct,
  })

  let si = 10000
  let pi = 10000
  let rp = 10000
  let pp = 10000
  let ex = 10000
  let je = 10001
  let ln = 0

  for (let m = 0; m < 6; m++) {
    const ms = addMonths(start, m)
    const isLast = m === 5
    const day = (n: number) => {
      const dt = addDays(ms, n)
      return dt > end ? end : dt
    }

    // Purchases (restock)
    const purchase: Invoice = {
      id: `pi-${m}`,
      number: `PI-${++pi}`,
      contactId: m % 2 ? 'c-6' : 'c-5',
      date: day(1),
      dueDate: addDays(day(1), 30),
      memo: 'Pembelian stok bulanan',
      createdAt: created++,
      lines: [
        line(`l${++ln}`, 'p-1', 6 + (m % 2), 7_500_000 + m * 50_000),
        line(`l${++ln}`, 'p-2', 6, 1_800_000),
        line(`l${++ln}`, 'p-3', 30, 85_000, 5),
        line(`l${++ln}`, 'p-4', 10, 450_000),
      ],
    }
    d.purchaseInvoices.push(purchase)

    // Sales
    const custs = ['c-1', 'c-2', 'c-3', 'c-4']
    for (let k = 0; k < 3; k++) {
      const date = day(5 + k * 8)
      const inv: Invoice = {
        id: `si-${m}-${k}`,
        number: `INV-${++si}`,
        contactId: custs[(m + k) % 4],
        date,
        dueDate: addDays(date, 30),
        createdAt: created++,
        lines: [
          line(`l${++ln}`, 'p-1', 1 + ((m + k) % 3), 9_250_000, k === 1 ? 5 : 0),
          line(`l${++ln}`, 'p-2', 2 + (k % 2), 2_350_000),
          line(`l${++ln}`, 'p-3', 5 + k * 3, 150_000),
          ...(k !== 2 ? [line(`l${++ln}`, 'p-4', 2, 690_000)] : []),
          line(`l${++ln}`, 'p-5', 8 + k * 2, 750_000),
        ],
      }
      d.salesInvoices.push(inv)
    }

    // Collect payments for older invoices (current month left partly open)
    for (const inv of d.salesInvoices.filter((i) => i.id.startsWith(`si-${m}-`))) {
      const k = Number(inv.id.split('-')[2])
      if (isLast && k > 0) continue
      if (m === 4 && k === 2) continue // leave one overdue
      const total = invTotal(inv)
      const amount = m === 3 && k === 1 ? Math.round(total / 2) : total
      const payDate = isLast ? end : addDays(inv.date, 20)
      d.payments.push({
        id: `rp-${inv.id}`,
        kind: 'receive',
        number: `RP-${++rp}`,
        date: payDate > end ? end : payDate,
        contactId: inv.contactId,
        accountId: SYS.bank,
        allocations: [{ invoiceId: inv.id, amount }],
        createdAt: created++,
      })
    }

    // Pay supplier (except the last month)
    if (!isLast) {
      const pd = addDays(purchase.date, 25)
      d.payments.push({
        id: `pp-${m}`,
        kind: 'pay',
        number: `PP-${++pp}`,
        date: pd > end ? end : pd,
        contactId: purchase.contactId,
        accountId: SYS.bank,
        allocations: [{ invoiceId: purchase.id, amount: invTotal(purchase) }],
        createdAt: created++,
      })
    }

    // Monthly operating expenses
    d.expenses.push({
      id: `ex-${m}-1`,
      number: `EXP-${++ex}`,
      date: day(25),
      payFromAccountId: SYS.bank,
      contactId: 'c-8',
      memo: 'Gaji karyawan',
      createdAt: created++,
      lines: [{ id: `el-${m}-1`, accountId: 'acc-6-60101', description: 'Gaji bulanan', amount: 16_000_000, taxPct: 0 }],
    })
    d.expenses.push({
      id: `ex-${m}-2`,
      number: `EXP-${++ex}`,
      date: day(3),
      payFromAccountId: SYS.bank,
      memo: 'Sewa kantor',
      createdAt: created++,
      lines: [{ id: `el-${m}-2`, accountId: 'acc-6-60210', description: 'Sewa ruko', amount: 5_000_000, taxPct: 0 }],
    })
    d.expenses.push({
      id: `ex-${m}-3`,
      number: `EXP-${++ex}`,
      date: day(10),
      payFromAccountId: SYS.cash,
      contactId: 'c-7',
      memo: 'Utilitas',
      createdAt: created++,
      lines: [
        { id: `el-${m}-3a`, accountId: 'acc-6-60202', description: 'Listrik', amount: 1_850_000 + m * 75_000, taxPct: 0 },
        { id: `el-${m}-3b`, accountId: 'acc-6-60201', description: 'Internet kantor', amount: 650_000, taxPct: 11 },
      ],
    })
    d.expenses.push({
      id: `ex-${m}-4`,
      number: `EXP-${++ex}`,
      date: day(15),
      payFromAccountId: SYS.bank,
      memo: 'Iklan online',
      createdAt: created++,
      lines: [{ id: `el-${m}-4`, accountId: 'acc-6-60001', description: 'Iklan marketplace & media sosial', amount: 3_000_000 + m * 250_000, taxPct: 11 }],
    })

    // Monthly depreciation (straight line: 36jt / 4 years)
    const eom = addDays(addMonths(ms, 1), -1)
    if (eom <= end) {
      d.journals.push({
        id: `j-dep-${m}`,
        number: `JE-${++je}`,
        date: eom,
        memo: 'Penyusutan perlengkapan kantor',
        createdAt: created++,
        lines: [
          { id: `jd-${m}-1`, accountId: 'acc-6-60302', description: 'Penyusutan bulanan', debit: 750_000, credit: 0 },
          { id: `jd-${m}-2`, accountId: 'acc-1-10755', description: 'Penyusutan bulanan', debit: 0, credit: 750_000 },
        ],
      })
    }
  }

  // Bank interest income
  d.cashTransactions.push({
    id: 'ct-3',
    kind: 'receive',
    number: 'BD-10001',
    date: end,
    accountId: SYS.bank,
    memo: 'Bunga jasa giro',
    createdAt: created++,
    lines: [{ id: 'cl-3', accountId: 'acc-7-70000', description: 'Bunga bank', amount: 412_500 }],
  })

  return d
}

function invTotal(inv: Invoice): number {
  return docTotals(inv.lines).total
}
