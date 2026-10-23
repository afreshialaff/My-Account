/**
 * Formats a decimal string ("-1234567.50") as Indonesian accounting notation ("(1.234.567,50)")
 * by string manipulation only, so large amounts never lose precision through JS floats.
 */
export function amount(value: string | null | undefined, opts: { parens?: boolean; zero?: string } = {}): string {
  if (value === null || value === undefined || value === '') return ''
  const s = String(value).trim()
  const neg = s.startsWith('-')
  const [intPart, frac = ''] = s.replace(/^[-+]/, '').split('.')
  const int = intPart.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const f = (frac + '00').slice(0, 2)
  const body = f === '00' ? int : `${int},${f}`
  if (/^0(,00)?$/.test(body)) return opts.zero ?? '0'
  if (!neg) return body
  return opts.parens === false ? `-${body}` : `(${body})`
}

export function rupiah(value: string | null | undefined): string {
  const a = amount(value, { parens: false })
  return a.startsWith('-') ? `-Rp ${a.slice(1)}` : `Rp ${a}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export function date(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`
}

export function dateLong(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)} ${MONTHS_LONG[Number(m) - 1]} ${y}`
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function startOfYear(iso = today()) {
  return `${iso.slice(0, 4)}-01-01`
}

export function startOfMonth(iso = today()) {
  return `${iso.slice(0, 7)}-01`
}

/** Exact decimal sum of 2-dp strings using integer cents (BigInt). */
export function sumAmounts(values: string[]): string {
  let cents = 0n
  for (const v of values) cents += toCents(v)
  return fromCents(cents)
}

export function toCents(v: string): bigint {
  const s = (v || '0').trim()
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return 0n
  const neg = s.startsWith('-')
  const [i, f = ''] = s.replace('-', '').split('.')
  const c = BigInt(i) * 100n + BigInt((f + '00').slice(0, 2))
  return neg ? -c : c
}

export function fromCents(c: bigint): string {
  const neg = c < 0n
  const a = neg ? -c : c
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`
}

/** Accepts "1.250.000,50", "1250000.5" or "1,250,000.50" typed by users and returns "1250000.50" or null. */
export function parseAmountInput(raw: string): string | null {
  let s = raw.replace(/[^\d.,]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '')
  else if (lastDot >= 0 && s.split('.').length > 2) s = s.replace(/\./g, '')
  else if (lastDot >= 0 && s.length - lastDot - 1 === 3 && !s.includes(',')) s = s.replace(/\./g, '') // "1.250" read as thousands
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  return fromCents(toCents(s))
}

export const ROLE_LABEL: Record<string, string> = {
  partner: 'Partner',
  manager: 'Manajer',
  accountant: 'Akuntan',
  auditor: 'Auditor (baca saja)',
}
