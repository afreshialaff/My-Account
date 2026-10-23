import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, PageHeader } from '../components/ui'
import { DATA_VERSION } from '../lib/seed'
import type { AppData } from '../lib/types'
import { useStore } from '../store/store'

export default function Settings() {
  const { data, setCompany, reset, replace } = useStore()
  const [c, setC] = useState(data.company)
  const [saved, setSaved] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const nav = useNavigate()

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `myaccount-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as AppData
      if (d.version !== DATA_VERSION || !Array.isArray(d.accounts)) throw new Error('format')
      replace(d)
      setC(d.company)
      alert('Data berhasil dipulihkan.')
    } catch {
      alert('File cadangan tidak valid.')
    }
  }

  return (
    <div>
      <PageHeader title="Pengaturan" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-4 md:p-6">
          <h2 className="mb-4 font-semibold">Profil Perusahaan</h2>
          <div className="grid gap-4">
            <Field label="Nama Perusahaan">
              <input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
            </Field>
            <Field label="Alamat">
              <textarea className="input" value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Telepon">
                <input className="input" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className="input" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
              </Field>
            </div>
            <Field label="NPWP">
              <input className="input" value={c.npwp} onChange={(e) => setC({ ...c, npwp: e.target.value })} />
            </Field>
          </div>
          <div className="mt-5 flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-emerald-600">Tersimpan</span>}
            <button
              className="btn-primary"
              onClick={() => {
                setCompany(c)
                setSaved(true)
                setTimeout(() => setSaved(false), 2000)
              }}
            >
              Simpan
            </button>
          </div>
        </div>
        <div className="card p-4 md:p-6">
          <h2 className="mb-1 font-semibold">Data</h2>
          <p className="mb-4 text-sm text-slate-500">Data disimpan di penyimpanan lokal browser ini. Buat cadangan secara berkala.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={exportJson}>
              Unduh Cadangan (JSON)
            </button>
            <button className="btn-secondary" onClick={() => file.current?.click()}>
              Pulihkan dari Cadangan
            </button>
            <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </div>
          <hr className="my-5 border-slate-200" />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                if (window.confirm('Ganti semua data dengan data demo?')) {
                  reset('demo')
                  nav('/')
                }
              }}
            >
              Muat Data Demo
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                if (window.confirm('Hapus SEMUA transaksi dan mulai dari awal? Daftar akun standar akan dipertahankan.')) {
                  reset('empty')
                  nav('/')
                }
              }}
            >
              Mulai dari Awal (Kosongkan)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
