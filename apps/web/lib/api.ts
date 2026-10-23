'use client'

import useSWR, { mutate as globalMutate, SWRConfiguration } from 'swr'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: { path: string; message: string }[],
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
    }
    throw new ApiError(res.status, data?.code ?? 'error', data?.message ?? res.statusText, data?.issues)
  }
  return data as T
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown, h?: Record<string, string>) => request<T>('POST', p, b ?? {}, h),
  put: <T>(p: string, b: unknown, h?: Record<string, string>) => request<T>('PUT', p, b, h),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
}

export function useApi<T>(path: string | null, opts?: SWRConfiguration) {
  return useSWR<T, ApiError>(path, (p: string) => api.get<T>(p), { revalidateOnFocus: false, ...opts })
}

/** Revalidate every cached GET whose path starts with the prefix. */
export function refresh(prefix: string) {
  return globalMutate((key) => typeof key === 'string' && key.startsWith(prefix))
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.issues?.length) return `${e.message}: ${e.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`
    return e.message
  }
  return 'Terjadi kesalahan. Coba lagi.'
}

/* ------------------------------------------------------------------ types */

export type Role = 'partner' | 'manager' | 'accountant' | 'auditor'

export interface Me {
  user: { id: string; email: string; fullName: string; role: Role }
  firm: { id: string; name: string }
  permissions: string[]
  entities: { id: string; name: string; clientId: string; clientName: string }[]
}

export type JournalStatus = 'draft' | 'submitted' | 'approved' | 'posted' | 'reversed'

export interface Account {
  id: string
  code: string
  name: string
  category: string
  category_label: string
  normal_side: 'debit' | 'credit'
  is_active: boolean
  is_postable: boolean
  is_system: boolean
  description: string | null
  debit: string
  credit: string
  balance: string
  line_count: number
}

export interface JournalLine {
  id: string
  line_no: number
  account_id: string
  account_code: string
  account_name: string
  description: string | null
  debit: string
  credit: string
  branch_id: string | null
  branch_name: string | null
}

export interface Journal {
  id: string
  number: string
  journal_date: string
  status: JournalStatus
  memo: string | null
  branch_id: string | null
  branch_name: string | null
  source_type: string
  version: number
  created_by: string
  created_by_name: string
  submitted_by_name: string | null
  submitted_at: string | null
  approved_by_name: string | null
  approved_at: string | null
  posted_by_name: string | null
  posted_at: string | null
  reversal_of: string | null
  reversal_of_number: string | null
  reversed_by: string | null
  reversed_by_number: string | null
  lines: JournalLine[]
  totals: { debit: string; credit: string; difference: string; balanced: boolean }
  history: { action: string; actor: string; created_at: string; data: Record<string, unknown> | null }[]
}

export interface Entity {
  id: string
  name: string
  legal_name: string | null
  npwp: string | null
  address: string | null
  functional_currency: string
  fiscal_year_start_month: number
  require_approval: boolean
  client: { id: string; name: string; code: string }
}
