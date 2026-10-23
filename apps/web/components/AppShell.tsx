'use client'

import {
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  ChevronDown,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Percent,
  Receipt,
  Settings,
  Sheet,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { api, useApi, type Me } from '@/lib/api'
import { ROLE_LABEL } from '@/lib/format'
import { ENTITY_NAV, FIRM_NAV, type NavGroup } from '@/lib/nav'
import { Loading } from './ui'

const ICONS: Record<string, typeof Menu> = { BarChart3, BookOpen, Boxes, Briefcase, Building2, Landmark, LayoutDashboard, Percent, Receipt, Settings, Sheet, ShoppingCart, Users }

export default function AppShell({ children }: { children: ReactNode }) {
  const { data: me, error } = useApi<Me>('/me')
  const path = usePathname() ?? ''
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => setMobileOpen(false), [path])

  const entityId = path.match(/^\/e\/([0-9a-f-]{36})/)?.[1]
  const base = entityId ? `/e/${entityId}` : '/firm'
  const groups = entityId ? ENTITY_NAV : FIRM_NAV
  const entity = me?.entities.find((e) => e.id === entityId)
  const demo = me?.firm.name.startsWith('[DEMO]')

  if (error) return <div className="p-8"><Loading label="Mengalihkan ke halaman masuk…" /></div>
  if (!me) return <Loading />

  const logout = async () => {
    await api.post('/auth/logout')
    router.push('/login')
  }

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Lewati ke konten
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-primary-strong text-slate-200 transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Navigasi utama"
      >
        <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-bold text-white" aria-hidden>
            A
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold text-white">Accounting OS</div>
            <div className="truncate text-[11px] text-slate-400">{me.firm.name}</div>
          </div>
          <button className="ml-auto p-1 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Tutup menu">
            <X size={18} />
          </button>
        </div>

        {entityId && (
          <Link href="/firm" className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
            <Briefcase size={14} aria-hidden /> Kembali ke Beranda Firma
          </Link>
        )}

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <NavSection key={g.key} group={g} base={base} path={path} />
          ))}
          {entityId && (
            <Link href="/firm/approvals" className="mt-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
              <Inbox size={16} aria-hidden /> Kotak Persetujuan
            </Link>
          )}
        </nav>
        {demo && <div className="mx-3 mb-3 rounded-md bg-accent/20 px-3 py-2 text-[11px] text-amber-200">Sandbox DEMO — bukan data klien sungguhan.</div>}
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface px-4">
          <button className="p-1 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Buka menu">
            <Menu size={20} />
          </button>
          <EntitySwitcher me={me} current={entityId} />
          {entity && <span className="hidden truncate text-xs text-muted-fg md:inline">Klien: {entity.clientName}</span>}
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{me.user.fullName}</div>
              <div className="text-[11px] text-muted-fg">{ROLE_LABEL[me.user.role]}</div>
            </div>
            <button className="btn-ghost" onClick={logout} aria-label="Keluar">
              <LogOut size={16} aria-hidden /> <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

function NavSection({ group, base, path }: { group: NavGroup; base: string; path: string }) {
  const Icon = ICONS[group.icon] ?? LayoutDashboard
  const hrefOf = (h: string) => `${base}${h}`
  const matches = (h: string) => (h === '' ? path === base : path === hrefOf(h) || path.startsWith(`${hrefOf(h)}/`))
  // Only the most specific matching item is active (e.g. "Neraca" rather than "Semua Laporan").
  const best = group.items.filter((i) => matches(i.href)).sort((a, b) => b.href.length - a.href.length)[0]
  const activeHref = (h: string) => best?.href === h
  const containsActive = group.items.some((i) => activeHref(i.href))
  const [open, setOpen] = useState(containsActive || group.items.length === 1)
  const allPlanned = group.items.every((i) => i.status === 'planned')

  if (group.items.length === 1) {
    const it = group.items[0]
    return (
      <Link
        href={hrefOf(it.href)}
        className={`mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${activeHref(it.href) ? 'bg-primary text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
        aria-current={activeHref(it.href) ? 'page' : undefined}
      >
        <Icon size={16} aria-hidden />
        <span className="flex-1">{group.label}</span>
        {it.status === 'planned' && <SoonTag />}
      </Link>
    )
  }

  return (
    <div className="mb-0.5">
      <button
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${containsActive ? 'text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Icon size={16} aria-hidden />
        <span className="flex-1">{group.label}</span>
        {allPlanned && <SoonTag />}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="ml-5 border-l border-white/10 pl-2">
          {group.items.map((it) => (
            <Link
              key={it.label}
              href={hrefOf(it.href)}
              className={`my-0.5 flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors ${activeHref(it.href) && it.status === 'live' ? 'bg-primary text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
            >
              <span className="flex-1">{it.label}</span>
              {it.status === 'planned' && !allPlanned && <SoonTag />}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function SoonTag() {
  return <span className="rounded bg-white/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-slate-400">Segera</span>
}

function EntitySwitcher({ me, current }: { me: Me; current?: string }) {
  const router = useRouter()
  const byClient = me.entities.reduce<Record<string, Me['entities']>>((m, e) => ({ ...m, [e.clientName]: [...(m[e.clientName] ?? []), e] }), {})
  return (
    <div className="min-w-0">
      <label htmlFor="entity-switcher" className="sr-only">
        Pilih perusahaan
      </label>
      <select
        id="entity-switcher"
        className="input max-w-[16rem] font-medium sm:max-w-xs"
        value={current ?? ''}
        onChange={(e) => router.push(e.target.value ? `/e/${e.target.value}` : '/firm')}
      >
        <option value="">Beranda Firma (semua klien)</option>
        {Object.entries(byClient).map(([client, list]) => (
          <optgroup key={client} label={client}>
            {list.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
