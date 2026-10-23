import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AccountSelect, Empty, Field, JournalPreview, NumInput, PageHeader, confirmDelete } from '../components/ui'
import { fmtDate, money, round2, today, uid } from '../lib/format'
import { nextNumber } from '../lib/seed'
import type { JournalLineInput, ManualJournal } from '../lib/types'
import { useStore } from '../store/store'

export function JournalList() {
  const { data } = useStore()
  const list = [...data.journals].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
  return (
    <div>
      <PageHeader
        title="Jurnal Umum"
        subtitle="Untuk penyesuaian, penyusutan, saldo awal, dan transaksi non-kas lainnya"
        actions={
          <Link to="/jurnal/new" className="btn-primary">
            <Plus size={16} /> Buat Jurnal Umum
          </Link>
        }
      />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Nomor</th>
              <th>Memo</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id}>
                <td>{fmtDate(j.date)}</td>
                <td>
                  <Link className="font-medium text-brand-700 hover:underline" to={`/jurnal/${j.id}`}>
                    {j.number}
                  </Link>
                </td>
                <td>{j.memo}</td>
                <td className="num">{money(j.lines.reduce((s, l) => s + l.debit, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <Empty>Belum ada jurnal umum.</Empty>}
      </div>
    </div>
  )
}

const blank = (): JournalLineInput => ({ id: uid('jl'), accountId: '', description: '', debit: 0, credit: 0 })

export function JournalForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, upsert } = useStore()
  const existing = id ? data.journals.find((j) => j.id === id) : undefined
  const [j, setJ] = useState<ManualJournal>(
    () => existing ?? { id: uid('je'), number: nextNumber('JE-', data.journals), date: today(), memo: '', lines: [blank(), blank()], createdAt: Date.now() },
  )
  const [error, setError] = useState('')
  const setLine = (i: number, patch: Partial<JournalLineInput>) => setJ((x) => ({ ...x, lines: x.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }))
  const dr = round2(j.lines.reduce((s, l) => s + (l.debit || 0), 0))
  const cr = round2(j.lines.reduce((s, l) => s + (l.credit || 0), 0))
  const diff = round2(dr - cr)

  const save = () => {
    const lines = j.lines.filter((l) => l.accountId || l.debit || l.credit)
    if (lines.length < 2) return setError('Jurnal membutuhkan minimal dua baris.')
    if (lines.some((l) => !l.accountId)) return setError('Setiap baris harus memiliki akun.')
    if (lines.some((l) => l.debit && l.credit)) return setError('Satu baris hanya boleh berisi debit atau kredit.')
    if (lines.some((l) => l.debit < 0 || l.credit < 0)) return setError('Nilai tidak boleh negatif.')
    if (diff !== 0 || dr === 0) return setError(`Total debit dan kredit harus sama (selisih ${money(diff)}).`)
    upsert('journals', { ...j, lines })
    nav(`/jurnal/${j.id}`)
  }

  return (
    <div>
      <PageHeader title={existing ? 'Ubah Jurnal Umum' : 'Buat Jurnal Umum'} back={{ to: '/jurnal', label: 'Jurnal Umum' }} />
      <div className="card p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Nomor">
            <input className="input" value={j.number} onChange={(e) => setJ((x) => ({ ...x, number: e.target.value }))} />
          </Field>
          <Field label="Tanggal Transaksi">
            <input type="date" className="input" value={j.date} onChange={(e) => setJ((x) => ({ ...x, date: e.target.value }))} />
          </Field>
        </div>
        <div className="-mx-4 mt-6 overflow-x-auto md:-mx-6">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th className="w-72">Akun</th>
                <th>Deskripsi</th>
                <th className="w-40 num">Debit</th>
                <th className="w-40 num">Kredit</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {j.lines.map((l, i) => (
                <tr key={l.id}>
                  <td>
                    <AccountSelect value={l.accountId} onChange={(accountId) => setLine(i, { accountId })} />
                  </td>
                  <td>
                    <input className="input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  </td>
                  <td>
                    <NumInput value={l.debit} onChange={(debit) => setLine(i, { debit, credit: debit ? 0 : l.credit })} />
                  </td>
                  <td>
                    <NumInput value={l.credit} onChange={(credit) => setLine(i, { credit, debit: credit ? 0 : l.debit })} />
                  </td>
                  <td>
                    <button className="p-1.5 text-slate-400 hover:text-red-600" onClick={() => setJ((x) => ({ ...x, lines: x.lines.filter((_, k) => k !== i) }))}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  Total {diff !== 0 && <span className="ml-2 text-xs font-normal text-red-600">Selisih {money(diff)}</span>}
                </td>
                <td className="num px-3 py-2">{money(dr)}</td>
                <td className="num px-3 py-2">{money(cr)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <button className="btn-secondary mt-3" onClick={() => setJ((x) => ({ ...x, lines: [...x.lines, blank()] }))}>
          <Plus size={16} /> Tambah baris
        </button>
        <Field label="Memo" className="mt-6 max-w-xl">
          <textarea className="input" value={j.memo} onChange={(e) => setJ((x) => ({ ...x, memo: e.target.value }))} />
        </Field>
        {error && <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Link to="/jurnal" className="btn-secondary">
            Batal
          </Link>
          <button className="btn-primary" onClick={save}>
            Simpan
          </button>
        </div>
      </div>
    </div>
  )
}

export function JournalDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, ledger, remove } = useStore()
  const j = data.journals.find((x) => x.id === id)
  if (!j) return <Empty>Jurnal tidak ditemukan.</Empty>
  return (
    <div>
      <PageHeader
        title={`Jurnal Umum #${j.number}`}
        subtitle={`${fmtDate(j.date)}${j.memo ? ' · ' + j.memo : ''}`}
        back={{ to: '/jurnal', label: 'Jurnal Umum' }}
        actions={
          <>
            <button
              className="btn-danger"
              onClick={() => {
                if (!confirmDelete(`jurnal ${j.number}`)) return
                remove('journals', j.id)
                nav('/jurnal')
              }}
            >
              <Trash2 size={16} /> Hapus
            </button>
            <Link className="btn-secondary" to={`/jurnal/${j.id}/edit`}>
              Ubah
            </Link>
          </>
        }
      />
      <JournalPreview entry={ledger.find((e) => e.sourceId === j.id)} />
    </div>
  )
}
