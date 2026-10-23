'use client'

import { AlertTriangle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import { amount } from '@/lib/format'
import type { JournalStatus } from '@/lib/api'

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  back?: { href: string; label: string }
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-xs font-medium text-primary hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-xl font-semibold text-primary-strong md:text-2xl">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted-fg">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

const STATUS: Record<JournalStatus, [string, string]> = {
  draft: ['Draf', 'bg-muted text-muted-fg'],
  submitted: ['Diajukan', 'bg-amber-100 text-amber-800'],
  approved: ['Disetujui', 'bg-sky-100 text-sky-800'],
  posted: ['Diposting', 'bg-emerald-100 text-emerald-800'],
  reversed: ['Dibalik', 'bg-rose-100 text-rose-800'],
}

export function StatusBadge({ status }: { status: JournalStatus }) {
  const [label, cls] = STATUS[status]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'success' | 'danger' | 'primary' }) {
  const cls = {
    muted: 'bg-muted text-muted-fg',
    accent: 'bg-amber-100 text-amber-900',
    success: 'bg-emerald-100 text-emerald-800',
    danger: 'bg-rose-100 text-rose-800',
    primary: 'bg-primary-soft text-primary',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

export function Amount({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const neg = value?.startsWith('-')
  return <span className={`font-mono tabular-nums ${neg ? 'text-danger' : ''} ${className}`}>{amount(value)}</span>
}

export function Field({ label, htmlFor, error, hint, children, className = '' }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-fg">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function Loading({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-fg" role="status">
      <Loader2 size={16} className="animate-spin" aria-hidden /> {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Gagal memuat data'
  return (
    <div className="card flex flex-col items-center gap-3 px-4 py-10 text-center" role="alert">
      <AlertTriangle className="text-danger" aria-hidden />
      <div className="text-sm text-primary-strong">{msg}</div>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <div className="text-sm font-medium text-primary-strong">{title}</div>
      {children && <div className="mt-1 text-sm text-muted-fg">{children}</div>}
    </div>
  )
}

/** Form-level error summary: focusable, announced, placed above the form (ui-ux-pro-max: forms). */
export function ErrorSummary({ messages }: { messages: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (messages.length) ref.current?.focus()
  }, [messages])
  if (!messages.length) return null
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="mb-4 rounded-md border border-danger/30 bg-rose-50 px-3 py-2 text-sm text-danger">
      <div className="font-semibold">Periksa kembali:</div>
      <ul className="mt-1 list-disc pl-5">
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  )
}

export function StatCard({ label, value, hint, tone = 'primary', href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'primary' | 'accent' | 'success' | 'danger'; href?: string }) {
  const bar = { primary: 'bg-primary', accent: 'bg-accent', success: 'bg-success', danger: 'bg-danger' }[tone]
  const body = (
    <div className="card relative h-full overflow-hidden p-4">
      <div className={`absolute inset-x-0 top-0 h-1 ${bar}`} aria-hidden />
      <div className="text-xs font-medium uppercase tracking-wide text-muted-fg">{label}</div>
      <div className="mt-1 text-xl font-semibold text-primary-strong">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-fg">{hint}</div>}
    </div>
  )
  return href ? (
    <Link href={href} className="block rounded-lg transition-shadow hover:shadow-md">
      {body}
    </Link>
  ) : (
    body
  )
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} className="w-[min(92vw,520px)] rounded-lg border border-line p-0 shadow-xl backdrop:bg-primary-strong/40">
      <div className="border-b border-line px-5 py-3 font-semibold">{title}</div>
      <div className="p-5">{children}</div>
    </dialog>
  )
}
