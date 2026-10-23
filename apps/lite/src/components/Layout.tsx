import {
  BarChart3,
  BookOpen,
  Boxes,
  FileText,
  Home,
  Landmark,
  ListTree,
  Menu,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useStore } from '../store/store'

const nav = [
  { to: '/', label: 'Beranda', icon: Home, end: true },
  { to: '/laporan', label: 'Laporan', icon: BarChart3 },
  { to: '/kas-bank', label: 'Kas & Bank', icon: Landmark },
  { to: '/penjualan', label: 'Penjualan', icon: Receipt },
  { to: '/pembelian', label: 'Pembelian', icon: ShoppingCart },
  { to: '/biaya', label: 'Biaya', icon: Wallet },
  { to: '/produk', label: 'Produk', icon: Boxes },
  { to: '/kontak', label: 'Kontak', icon: Users },
  { to: '/akun', label: 'Daftar Akun', icon: ListTree },
  { to: '/jurnal', label: 'Jurnal Umum', icon: BookOpen },
  { to: '/pengaturan', label: 'Pengaturan', icon: Settings },
]

export default function Layout() {
  const { data } = useStore()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-[#0f2c6b] text-slate-200 transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-500 font-bold text-white">M</div>
          <div className="leading-tight">
            <div className="font-semibold text-white">MyAccount</div>
            <div className="text-[11px] text-slate-400">Akuntansi Online</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 text-[11px] text-slate-400">
          <FileText size={12} className="mr-1 inline" />
          Data tersimpan di browser ini
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
            <Menu size={20} />
          </button>
          <div className="truncate font-semibold text-slate-800">{data.company.name}</div>
          <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700">
              {data.company.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
