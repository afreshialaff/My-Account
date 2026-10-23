const idr = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function money(n: number, withSymbol = true): string {
  const v = round2(n)
  const s = idr.format(Math.abs(v))
  const sign = v < 0 ? '-' : ''
  return withSymbol ? `${sign}Rp ${s}` : `${sign}${s}`
}

/** Accounting style: negatives in parentheses. */
export function acct(n: number): string {
  const v = round2(n)
  if (v === 0) return '0'
  return v < 0 ? `(${idr.format(-v)})` : idr.format(v)
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export function fmtDateLong(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${monthNames[m - 1]} ${String(y).slice(2)}`
}

export function today(): string {
  const d = new Date()
  return toISO(d)
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISO(new Date(y, m - 1, d + days))
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISO(new Date(y, m - 1 + months, d))
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01'
}

export function endOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return toISO(new Date(y, m, 0))
}

export function startOfYear(iso: string): string {
  return iso.slice(0, 4) + '-01-01'
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}
