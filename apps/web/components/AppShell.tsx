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
  Search,
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
import { Logo } from './Logo'
import { Loading } from './ui'

const ICONS: Record<string, typeof Menu> = { BarChart3, BookOpen, Boxes, Briefcase, Building2, Landmark, LayoutDashboard, Percent, Receipt, Settings, Sheet, ShoppingCart, Users }

export default function AppShell({ children }: { children: ReactNode }) {
  const { data: me, error } = useApi<Me>('/me')
  const path = usePathname() ?? ''
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-primary-strong text-taupe transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Navigasi utama"
      >
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-4">
          <div className="min-w-0">
            <Logo reversed size={24} />
            <div className="mt-0.5 truncate pl-[2.1rem] text-[11px] text-taupe-deep">{me.firm.name}</div>
          </div>
          <button className="ml-auto p-1 text-taupe lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Tutup menu">
            <X size={18} />
          </button>
        </div>

        {entityId && (
          <Link href="/firm" className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-taupe hover:bg-white/5">
            <Briefcase size={14} aria-hidden /> Kembali ke Beranda Firma
          </Link>
        )}

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((g) => (
            <NavSection key={g.key} group={g} base={base} path={path} />
          ))}
          {entityId && (
            <Link href="/firm/approvals" className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-taupe hover:bg-white/10 hover:text-white">
              <Inbox size={16} aria-hidden /> Kotak Persetujuan
            </Link>
          )}
        </nav>
        {demo && <div className="mx-3 mb-3 rounded-lg bg-accent/20 px-3 py-2 text-[11px] text-white">Sandbox DEMO — bukan data klien sungguhan.</div>}
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-cream/95 px-4 backdrop-blur">
          <button className="p-1 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Buka menu">
            <Menu size={20} />
          </button>
          <EntitySwitcher me={me} current={entityId} />
          {entity && <span className="hidden truncate text-xs text-muted-fg md:inline">Klien: {entity.clientName}</span>}
          <button
            className="btn-secondary ml-auto hidden min-h-[36px] w-56 justify-start gap-2 font-medium text-muted-fg md:inline-flex"
            onClick={() => setPalette(true)}
            aria-label="Cari menu (Ctrl+K)"
          >
            <Search size={14} aria-hidden /> <span className="flex-1 text-left">Cari menu…</span>
            <kbd className="rounded border border-line bg-cream px-1.5 text-[10px]">Ctrl K</kbd>
          </button>
          <button className="btn-ghost md:hidden" onClick={() => setPalette(true)} aria-label="Cari menu">
            <Search size={18} aria-hidden />
          </button>
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{me.user.fullName}</div>
              <div className="text-[11px] text-muted-fg">{ROLE_LABEL[me.user.role]}</div>
            </div>
            <button className="btn-ghost" onClick={logout} aria-label="Keluar">
              <LogOut size={16} aria-hidden /> <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] p-4 md:p-8">
          {children}
        </main>
        {palette && <CommandPalette groups={groups} base={base} onClose={() => setPalette(false)} />}
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
        className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activeHref(it.href) ? 'bg-white/10 text-white shadow-[inset_3px_0_0_rgb(var(--accent))]' : 'text-taupe hover:bg-white/10 hover:text-white'}`}
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
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${containsActive ? 'text-white' : 'text-taupe hover:bg-white/10 hover:text-white'}`}
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
              className={`my-0.5 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${activeHref(it.href) && it.status === 'live' ? 'bg-white/10 text-white shadow-[inset_3px_0_0_rgb(var(--accent))]' : 'text-taupe-deep hover:bg-white/10 hover:text-white'}`}
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
  return <span className="rounded bg-white/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-taupe">Segera</span>
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
        className="input max-w-[16rem] font-semibold sm:max-w-xs"
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

/** Ctrl+K menu search: jump to any live page without opening the sidebar groups. */
function CommandPalette({ groups, base, onClose }: { groups: NavGroup[]; base: string; onClose: () => void }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const items = groups
    .flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
    .filter((i) => `${i.group} ${i.label}`.toLowerCase().includes(q.trim().toLowerCase()))
  const go = (i: (typeof items)[number] | undefined) => {
    if (!i) return
    router.push(`${base}${i.href}`)
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-primary-strong/50 p-4 pt-[12vh]" onClick={onClose} role="presentation">
      <div
        className="card w-full max-w-lg overflow-hidden shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Cari menu"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'ArrowDown') (e.preventDefault(), setIdx((i) => Math.min(i + 1, items.length - 1)))
          if (e.key === 'ArrowUp') (e.preventDefault(), setIdx((i) => Math.max(i - 1, 0)))
          if (e.key === 'Enter') go(items[idx])
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={16} className="text-muted-fg" aria-hidden />
          <input autoFocus className="min-h-[48px] flex-1 bg-transparent text-sm outline-none" placeholder="Cari menu, mis. Jurnal Umum, Neraca…" value={q} onChange={(e) => (setQ(e.target.value), setIdx(0))} aria-label="Cari menu" />
        </div>
        <ul className="max-h-80 overflow-y-auto p-1" role="listbox">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-fg">Tidak ada menu yang cocok.</li>}
          {items.map((i, n) => (
            <li key={`${i.group}-${i.label}`} role="option" aria-selected={n === idx}>
              <button className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${n === idx ? 'bg-primary-soft' : ''}`} onMouseEnter={() => setIdx(n)} onClick={() => go(i)}>
                <span className="font-semibold">{i.label}</span>
                <span className="text-xs text-muted-fg">{i.group}</span>
                {i.status === 'planned' && <span className="ml-auto rounded bg-muted/60 px-1.5 text-[10px] font-semibold uppercase text-muted-fg">Segera</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
