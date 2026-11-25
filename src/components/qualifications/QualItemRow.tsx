import { useState } from 'react'
import { Clock, Pencil, Trash2, X, Check, Send, CalendarCheck } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  type Qualification,
  qualLevel, daysLeft, formatQualDate, formatDaysLeft, formatRemaining, formatRemindDays,
  isPlanned, plannedPassed,
  DEFAULT_REMIND_DAYS, REMIND_DAYS_OPTIONS,
} from '../../lib/qualifications'
import { LEVEL_STYLES, FIELD_CLASS, DATE_INPUT_CLASS } from './qualStyles'
import { RemainingBar } from './QualVisuals'

// 'direct' — data obowiązuje od razu (admin/dowódca zmiany, własne terminy),
// 'request' — nowa data czeka na zatwierdzenie, 'readonly' — tylko podgląd
export type QualEditMode = 'direct' | 'request' | 'readonly'

export function QualItemRow({
  title, q, today, mode, canEditRemind, canDelete, canPlan,
  onSetDate, onRequestDate, onRemindChange, onDelete, onPlan,
}: {
  title: string
  q: Qualification | null // null = brak wpisu dla standardowego terminu
  today: string
  mode: QualEditMode
  canEditRemind: boolean
  canDelete?: boolean
  canPlan?: boolean // zapis na termin (np. komora 12.03) — bez zatwierdzania
  onSetDate: (date: string, remindDays: number) => Promise<void>
  onRequestDate: (date: string) => Promise<void>
  onRemindChange: (remindDays: number) => Promise<void>
  onDelete?: () => Promise<void>
  onPlan?: (plannedOn: string | null) => Promise<void>
}) {
  const remind = q?.remind_days ?? DEFAULT_REMIND_DAYS
  const level = q ? qualLevel(q, today) : 'missing'
  const days = q ? daysLeft(q, today) : null
  const style = LEVEL_STYLES[level]

  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState('')
  const [remindDays, setRemindDays] = useState(remind)
  const [planned, setPlanned] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editable = mode !== 'readonly' || (canEditRemind && !!q) || (!!canPlan && !!onPlan)
  const remindOptions = REMIND_DAYS_OPTIONS.includes(remind) ? REMIND_DAYS_OPTIONS : [...REMIND_DAYS_OPTIONS, remind].sort((a, b) => a - b)
  const planActive = !!q && isPlanned(q, today)
  const planMissed = !!q && plannedPassed(q, today)

  function startEdit() {
    setDate(q?.pending_valid_until ?? q?.valid_until ?? '')
    setRemindDays(remind)
    setPlanned(q?.planned_on ?? '')
    setError(null)
    setEditing(true)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const dateChanged = !!date && date !== (q?.valid_until ?? '') && date !== (q?.pending_valid_until ?? '')
      if (mode === 'direct' && dateChanged) {
        await onSetDate(date, remindDays) // nowa ważność czyści też zapis
      } else {
        if (mode === 'request' && dateChanged) await onRequestDate(date)
        if (q && (canEditRemind || mode === 'direct') && remindDays !== remind) await onRemindChange(remindDays)
        if (canPlan && onPlan && (planned || null) !== (q?.planned_on ?? null)) await onPlan(planned || null)
      }
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zapisać.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!onDelete || !window.confirm(`Usunąć termin „${title}”?`)) return
    setBusy(true)
    try {
      await onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć.')
      setBusy(false)
    }
  }

  return (
    <div className={cn('bg-surface-800 rounded-xl border px-3 py-3 min-w-0 overflow-hidden', style.border)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', style.dot)} />
            <p className="text-sm font-semibold text-white truncate">{title}</p>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            ważne do <span className="text-slate-300 tabular-nums">{formatQualDate(q?.valid_until ?? null)}</span>
            {q && <> · przypomnienie {formatRemindDays(remind)}</>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-lg font-bold tabular-nums leading-tight whitespace-nowrap', style.text)}>{formatRemaining(days)}</p>
          <p className={cn('text-[10px]', style.text)}>{level === 'missing' ? 'brak daty' : formatDaysLeft(days)}</p>
        </div>
        {!editing && editable && (
          <button
            onClick={startEdit}
            className="-mr-1 p-1.5 text-slate-500 hover:text-white transition-colors shrink-0"
            title="Zmień"
            aria-label={`Zmień: ${title}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>

      <RemainingBar q={q} today={today} className="mt-2.5" />

      {(q?.pending_valid_until || planActive || planMissed) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {q?.pending_valid_until && (
            <p className="inline-flex items-center gap-1 text-[11px] text-brand-300 bg-brand-950/40 border border-brand-900/50 rounded-md px-1.5 py-0.5">
              <Clock className="w-3 h-3" /> Czeka na zatwierdzenie: {formatQualDate(q.pending_valid_until)}
            </p>
          )}
          {planActive && (
            <p className="inline-flex items-center gap-1 text-[11px] text-sky-300 bg-sky-950/40 border border-sky-900/50 rounded-md px-1.5 py-0.5">
              <CalendarCheck className="w-3 h-3" /> Zapisany na {formatQualDate(q!.planned_on!)}
            </p>
          )}
          {planMissed && !q?.pending_valid_until && (
            <p className="inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-900/50 rounded-md px-1.5 py-0.5">
              <CalendarCheck className="w-3 h-3" /> Zapis na {formatQualDate(q!.planned_on!)} minął, wpisz nową datę ważności
            </p>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {mode !== 'readonly' && (
              <label className="block min-w-0">
                <span className="text-[11px] text-slate-500">
                  {mode === 'request' ? 'Nowa data ważności (po odnowieniu)' : 'Ważne do'}
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className={DATE_INPUT_CLASS}
                />
              </label>
            )}
            {(canEditRemind || mode === 'direct') && (
              <label className="block min-w-0">
                <span className="text-[11px] text-slate-500">Przypomnij</span>
                <select
                  value={remindDays}
                  onChange={e => setRemindDays(Number(e.target.value))}
                  className={FIELD_CLASS}
                >
                  {remindOptions.map(d => <option key={d} value={d}>{formatRemindDays(d)}</option>)}
                </select>
              </label>
            )}
            {canPlan && onPlan && (
              <label className="block min-w-0 sm:col-span-2">
                <span className="text-[11px] text-slate-500">Zapisany na (dzień komory / badań / kursu)</span>
                <span className="flex items-center gap-2">
                  <input
                    type="date"
                    value={planned}
                    min={today}
                    onChange={e => setPlanned(e.target.value)}
                    className={DATE_INPUT_CLASS}
                  />
                  {planned && (
                    <button
                      type="button"
                      onClick={() => setPlanned('')}
                      className="mt-1 shrink-0 text-xs px-2.5 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300"
                    >
                      Usuń zapis
                    </button>
                  )}
                </span>
              </label>
            )}
          </div>
          {mode === 'request' && (
            <p className="text-[11px] text-slate-500">Nowa data zacznie obowiązywać po zatwierdzeniu przez dowódcę zmiany lub admina.</p>
          )}
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <div className="flex items-center gap-2">
            {canDelete && onDelete && (
              <button
                onClick={remove}
                disabled={busy}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-red-400 hover:bg-red-950/40 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Usuń
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Anuluj
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white transition-colors disabled:opacity-50"
              >
                {mode === 'request' ? <Send className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                {busy ? 'Zapisuję…' : mode === 'request' ? 'Wyślij' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
