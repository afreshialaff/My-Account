import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildLedger } from '../lib/ledger'
import { DATA_VERSION, demoData, emptyData } from '../lib/seed'
import type { AppData, LedgerEntry } from '../lib/types'

const KEY = 'myaccount-data'

type Collection = Exclude<keyof AppData, 'version' | 'company'>
type Item<C extends Collection> = AppData[C][number]

interface Store {
  data: AppData
  ledger: LedgerEntry[]
  upsert: <C extends Collection>(c: C, item: Item<C>) => void
  remove: (c: Collection, id: string) => void
  setCompany: (c: AppData['company']) => void
  reset: (mode: 'demo' | 'empty') => void
  replace: (d: AppData) => void
}

const Ctx = createContext<Store | null>(null)

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as AppData
      if (d.version === DATA_VERSION) return d
    }
  } catch {
    /* ignore corrupted or unavailable storage */
  }
  return demoData()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* storage full or unavailable */
    }
  }, [data])

  const ledger = useMemo(() => buildLedger(data), [data])

  const upsert = useCallback(<C extends Collection>(c: C, item: Item<C>) => {
    setData((d) => {
      const list = d[c] as Item<C>[]
      const idx = list.findIndex((x) => x.id === item.id)
      const next = idx >= 0 ? list.map((x, i) => (i === idx ? item : x)) : [...list, item]
      return { ...d, [c]: next }
    })
  }, [])

  const remove = useCallback((c: Collection, id: string) => {
    setData((d) => ({ ...d, [c]: (d[c] as { id: string }[]).filter((x) => x.id !== id) }))
  }, [])

  const setCompany = useCallback((company: AppData['company']) => setData((d) => ({ ...d, company })), [])
  const reset = useCallback((mode: 'demo' | 'empty') => setData(mode === 'demo' ? demoData() : emptyData()), [])
  const replace = useCallback((d: AppData) => setData(d), [])

  const value = useMemo(
    () => ({ data, ledger, upsert, remove, setCompany, reset, replace }),
    [data, ledger, upsert, remove, setCompany, reset, replace],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}

export function useLookups() {
  const { data } = useStore()
  return useMemo(
    () => ({
      account: new Map(data.accounts.map((a) => [a.id, a])),
      contact: new Map(data.contacts.map((c) => [c.id, c])),
      product: new Map(data.products.map((p) => [p.id, p])),
    }),
    [data.accounts, data.contacts, data.products],
  )
}
