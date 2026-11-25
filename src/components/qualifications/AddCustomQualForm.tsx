import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { DEFAULT_REMIND_DAYS, REMIND_DAYS_OPTIONS, formatRemindDays } from '../../lib/qualifications'

// Własny termin (np. prawo jazdy C, uprawnienia na piłę) — nazwa + data + kiedy przypomnieć
export function AddCustomQualForm({ onAdd }: {
  onAdd: (label: string, validUntil: string, remindDays: number) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')
  const [remindDays, setRemindDays] = useState(DEFAULT_REMIND_DAYS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!label.trim() || !date) return
    setBusy(true)
    setError(null)
    try {
      await onAdd(label.trim(), date, remindDays)
      setLabel('')
      setDate('')
      setRemindDays(DEFAULT_REMIND_DAYS)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się dodać terminu.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-700 px-3 py-2.5 text-sm text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
      >
        <Plus className="w-4 h-4" /> Dodaj własny termin
      </button>
    )
  }

  return (
    <div className="bg-surface-800 rounded-xl border border-brand-800/60 p-3 space-y-2.5">
      <label className="block">
        <span className="text-[11px] text-slate-500">Nazwa</span>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          maxLength={60}
          placeholder="Np. prawo jazdy kat. C, uprawnienia na piłę…"
          className="mt-1 w-full rounded-lg border border-slate-700 bg-surface-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-500 placeholder:text-slate-600"
          autoFocus
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="block">
          <span className="text-[11px] text-slate-500">Ważne do</span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-surface-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-500 [color-scheme:dark]"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-slate-500">Przypomnij</span>
          <select
            value={remindDays}
            onChange={e => setRemindDays(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-surface-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
          >
            {REMIND_DAYS_OPTIONS.map(d => <option key={d} value={d}>{formatRemindDays(d)}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Anuluj
        </button>
        <button
          onClick={submit}
          disabled={busy || !label.trim() || !date}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> {busy ? 'Dodawanie…' : 'Dodaj'}
        </button>
      </div>
    </div>
  )
}
