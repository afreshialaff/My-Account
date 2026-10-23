'use client'

import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { api, ApiError } from '@/lib/api'
import { ErrorSummary, Field } from './ui'

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter()
  const next = useSearchParams()?.get('next') || '/firm'
  const [form, setForm] = useState({ firmName: '', fullName: '', email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [summary, setSummary] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (mode === 'register') {
      if (form.firmName.trim().length < 2) e.firmName = 'Isi nama kantor/firma (min. 2 karakter)'
      if (form.fullName.trim().length < 2) e.fullName = 'Isi nama lengkap'
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Masukkan alamat email yang valid'
    if (mode === 'register' ? form.password.length < 10 : !form.password) e.password = mode === 'register' ? 'Kata sandi minimal 10 karakter' : 'Masukkan kata sandi'
    return e
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    setSummary(Object.values(e))
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      if (mode === 'login') await api.post('/auth/login', { email: form.email, password: form.password })
      else await api.post('/auth/register', form)
      router.push(mode === 'login' ? next : '/firm')
    } catch (err) {
      setSummary([err instanceof ApiError ? err.message : 'Tidak dapat terhubung ke server'])
      setBusy(false)
    }
  }

  const input = (k: keyof typeof form, type = 'text', autoComplete?: string) => (
    <input
      id={k}
      type={type}
      className="input"
      value={form[k]}
      onChange={set(k)}
      onBlur={() => {
        const e = validate()
        setErrors((x) => ({ ...x, [k]: e[k] ?? '' }))
      }}
      autoComplete={autoComplete}
      aria-invalid={!!errors[k]}
      aria-describedby={errors[k] ? `${k}-error` : undefined}
    />
  )

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[44%] flex-col justify-between bg-primary-strong p-10 text-slate-200 lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary font-bold text-white">A</div>
          <span className="text-lg font-semibold text-white">Accounting OS</span>
        </div>
        <div>
          <h2 className="text-3xl font-semibold leading-tight text-white">Satu ruang kerja untuk seluruh klien kantor akuntan Anda.</h2>
          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            <li>• Multi-klien, multi-perusahaan, multi-cabang dengan isolasi data per firma</li>
            <li>• Jurnal double-entry yang seimbang, tidak dapat diubah setelah diposting</li>
            <li>• Alur draf → diajukan → disetujui → diposting dengan pemisahan tugas</li>
            <li>• Kunci periode, log audit, laporan yang selalu dapat ditelusuri</li>
          </ul>
        </div>
        <div className="text-xs text-slate-500">Dibangun untuk kantor akuntan di Indonesia</div>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={submit} noValidate className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold">{mode === 'login' ? 'Masuk' : 'Daftarkan firma Anda'}</h1>
          <p className="mb-6 mt-1 text-sm text-muted-fg">{mode === 'login' ? 'Masuk ke ruang kerja firma Anda.' : 'Anda akan menjadi Partner pertama di firma ini.'}</p>
          <ErrorSummary messages={summary} />
          <div className="space-y-4">
            {mode === 'register' && (
              <>
                <Field label="Nama kantor / firma" htmlFor="firmName" error={errors.firmName}>
                  {input('firmName', 'text', 'organization')}
                </Field>
                <Field label="Nama lengkap" htmlFor="fullName" error={errors.fullName}>
                  {input('fullName', 'text', 'name')}
                </Field>
              </>
            )}
            <Field label="Email" htmlFor="email" error={errors.email}>
              {input('email', 'email', 'email')}
            </Field>
            <Field label="Kata sandi" htmlFor="password" error={errors.password} hint={mode === 'register' ? 'Minimal 10 karakter' : undefined}>
              {input('password', 'password', mode === 'login' ? 'current-password' : 'new-password')}
            </Field>
          </div>
          <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {mode === 'login' ? 'Masuk' : 'Buat ruang kerja'}
          </button>
          <p className="mt-4 text-center text-sm text-muted-fg">
            {mode === 'login' ? (
              <>
                Belum punya akun? <Link className="link" href="/register">Daftarkan firma</Link>
              </>
            ) : (
              <>
                Sudah punya akun? <Link className="link" href="/login">Masuk</Link>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
