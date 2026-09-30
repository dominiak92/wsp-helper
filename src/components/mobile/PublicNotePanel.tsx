import { useState } from 'react'
import { CalendarDays, CheckCircle, AlertCircle } from 'lucide-react'
import { addDaysKey, formatDateLong, todayYmdKey } from '../../lib/duty'

export const PUBLIC_NOTE_MAX = 120

// Notatka widoczna dla wszystkich: dzień + treść → trafia do calendar_events
// (sekcja „Zdarzenia" u góry ekranu głównego i kalendarze).
export function PublicNotePanel({ onPublish }: {
  onPublish: (date: string, text: string) => Promise<void>
}) {
  const today = todayYmdKey()
  const [date, setDate] = useState(today)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const quickDays = [
    { key: today, label: 'Dziś' },
    { key: addDaysKey(today, 1), label: 'Jutro' },
  ]

  async function handlePublish() {
    const trimmed = text.trim()
    if (!date || !trimmed) return
    setBusy(true)
    setErrMsg(null)
    try {
      await onPublish(date, trimmed)
      setText('')
      setOkMsg('Notatka dodana — widoczna dla wszystkich w zdarzeniach')
      setTimeout(() => setOkMsg(null), 4000)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Nie udało się dodać notatki.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {okMsg && (
        <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-900/50 rounded-xl px-4 py-3">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">{okMsg}</p>
        </div>
      )}
      {errMsg && (
        <div className="flex items-center gap-2 bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{errMsg}</p>
        </div>
      )}

      <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-3 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Dzień</p>
          <div className="flex flex-wrap items-center gap-2">
            {quickDays.map(d => (
              <button
                key={d.key}
                onClick={() => setDate(d.key)}
                className={
                  'rounded-lg border px-3 py-2 text-sm transition-colors ' +
                  (date === d.key
                    ? 'border-brand-500 bg-brand-950/40 text-brand-200 font-semibold'
                    : 'border-slate-700 bg-surface-900 text-slate-300 hover:border-slate-600')
                }
              >
                {d.label}
              </button>
            ))}
            <input
              type="date"
              value={date}
              min={today}
              onChange={e => setDate(e.target.value)}
              className="rounded-lg border border-slate-700 bg-surface-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-500 [color-scheme:dark]"
              aria-label="Wybierz dzień"
            />
          </div>
          {date && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
              <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
              {formatDateLong(date)}
            </p>
          )}
        </div>

        <div>
          <textarea
            className="w-full bg-surface-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-none placeholder:text-slate-600"
            rows={2}
            maxLength={PUBLIC_NOTE_MAX}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Np. przegląd GBA o 10:00, szkolenie z aparatów, wizyta komendanta…"
          />
          <p className="text-right text-[11px] text-slate-500">{text.length}/{PUBLIC_NOTE_MAX}</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">Zobaczą ją wszyscy w „Zdarzeniach” i dostaną powiadomienie.</p>
          <button
            onClick={handlePublish}
            disabled={busy || !date || !text.trim()}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white transition-colors disabled:opacity-50 shrink-0"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            {busy ? 'Dodawanie…' : 'Dodaj notatkę'}
          </button>
        </div>
      </div>
    </div>
  )
}
