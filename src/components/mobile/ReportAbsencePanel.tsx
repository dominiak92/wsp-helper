import { useState } from 'react'
import { UserX, Send, CheckCircle, Undo2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatDateLong, formatDateShort } from '../../lib/duty'
import type { ShiftAssignment, AbsenceType } from '../../lib/crew'
import { ABSENCE_LABELS, ABSENCE_ORDER } from '../../lib/crew'

// ── Zgłoś nieobecność ─────────────────────────────────────────────────────────

export function ReportAbsencePanel({
  dutyKeys,
  myPersonId,
  dayAssignment,
  onSubmit,
  onWithdraw,
}: {
  dutyKeys: string[]
  myPersonId: string
  dayAssignment: (date: string) => ShiftAssignment | null
  onSubmit: (date: string, type: AbsenceType, note: string) => Promise<void>
  onWithdraw: (date: string) => Promise<void>
}) {
  const [date, setDate] = useState(dutyKeys[0] ?? '')
  const [type, setType] = useState<AbsenceType | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const a = date ? dayAssignment(date) : null
  const myAbs = a?.absenceMap?.[myPersonId] ?? null
  const isSelf = !!a?.selfAbsences?.[myPersonId]

  async function handleSubmit() {
    if (!date || !type) return
    setBusy(true)
    try {
      await onSubmit(date, type, note)
      setNote('')
      setType(null)
      setOkMsg('Zgłoszono nieobecność — dyżurny powiadomiony')
      setTimeout(() => setOkMsg(null), 4000)
    } finally {
      setBusy(false)
    }
  }

  async function handleWithdraw() {
    setBusy(true)
    try {
      await onWithdraw(date)
      setOkMsg('Nieobecność wycofana — wracasz do składu')
      setTimeout(() => setOkMsg(null), 4000)
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

      <div>
        <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-3 space-y-3">
          {/* Wybór dnia */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1.5">Służba</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {dutyKeys.map(k => {
                const selected = k === date
                const weekday = formatDateLong(k).split(',')[0]
                return (
                  <button
                    key={k}
                    onClick={() => setDate(k)}
                    className={cn(
                      'shrink-0 rounded-lg border px-3 py-2 text-left transition-colors',
                      selected ? 'border-brand-500 bg-brand-950/40' : 'border-slate-700 bg-surface-900 hover:border-slate-600',
                    )}
                  >
                    <p className={cn('text-sm font-semibold whitespace-nowrap', selected ? 'text-brand-200' : 'text-white')}>{formatDateShort(k)}</p>
                    <p className="text-[10px] text-slate-500 whitespace-nowrap">{weekday}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Stan dnia: już zgłoszona / ustawiona przez dyżurnego / formularz */}
          {myAbs && isSelf ? (
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 flex items-center gap-3">
              <UserX className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-300">Zgłoszono nieobecność</p>
                <p className="text-[11px] text-slate-500">{ABSENCE_LABELS[myAbs]}</p>
              </div>
              <button
                onClick={handleWithdraw}
                disabled={busy}
                className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-200 transition-colors shrink-0 disabled:opacity-50"
              >
                <Undo2 className="w-3.5 h-3.5" /> {busy ? 'Cofanie…' : 'Cofnij'}
              </button>
            </div>
          ) : myAbs ? (
            <div className="rounded-lg border border-slate-700 bg-surface-900 p-3 flex items-center gap-3">
              <UserX className="w-5 h-5 text-slate-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-300">Masz już nieobecność na ten dzień</p>
                <p className="text-[11px] text-slate-500">{ABSENCE_LABELS[myAbs]} — ustawione przez dyżurnego</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1.5">Rodzaj nieobecności</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {ABSENCE_ORDER.map(t => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm text-left transition-colors',
                        type === t
                          ? 'border-brand-500 bg-brand-950/40 text-brand-200 font-semibold'
                          : 'border-slate-700 bg-surface-900 text-slate-300 hover:border-slate-600',
                      )}
                    >
                      {ABSENCE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="w-full bg-surface-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-none placeholder:text-slate-600"
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Notatka dla dyżurnego (opcjonalnie)"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">W razie pomyłki zgłoszenie cofniesz jednym kliknięciem.</p>
                <button
                  onClick={handleSubmit}
                  disabled={busy || !type || !date}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-brand-700 hover:bg-brand-600 text-white transition-colors disabled:opacity-50 shrink-0"
                >
                  <Send className="w-3 h-3" />
                  {busy ? 'Zgłaszanie…' : 'Zgłoś nieobecność'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
