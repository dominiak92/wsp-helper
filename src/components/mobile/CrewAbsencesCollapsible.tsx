import { useState } from 'react'
import { CalendarX, CheckCircle, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { nextDutyKeys, formatDateLong, formatDateShort } from '../../lib/duty'
import type { Person, ShiftAssignment, AbsenceType } from '../../lib/crew'
import { ABSENCE_LABELS, ABSENCE_ORDER } from '../../lib/crew'

// ── Upcoming duty absences ────────────────────────────────────────────────────

export function CrewAbsencesCollapsible({
  personnel,
  savedMap,
  currentAssignment,
  currentDutyDate,
  myPersonId,
}: {
  personnel: Person[]
  savedMap: Map<string, ShiftAssignment>
  currentAssignment: ShiftAssignment | null
  currentDutyDate: string
  myPersonId: string | null
}) {
  const [open, setOpen] = useState(false)

  const assignmentFor = (date: string): ShiftAssignment | null =>
    date === currentDutyDate ? currentAssignment : (savedMap.get(date) ?? null)

  const absentOf = (a: ShiftAssignment | null) =>
    a
      ? personnel
          .filter(p => a.absenceMap?.[p.id])
          .map(p => ({ id: p.id, name: p.name, absence: a.absenceMap![p.id] as AbsenceType }))
          .sort((x, y) => ABSENCE_ORDER.indexOf(x.absence) - ABSENCE_ORDER.indexOf(y.absence))
      : null

  // Dzień bieżący (z aktywnej obsady) na początku, potem najbliższe zapisane służby
  const dayKeys = [currentDutyDate, ...nextDutyKeys(6).filter(k => k !== currentDutyDate).slice(0, 5)]
  const rows = dayKeys.map(date => ({ date, absent: absentOf(assignmentFor(date)) }))
  const todayCount = rows[0]?.absent?.length ?? 0

  // Koniec ciągu kolejnych nieobecnych służb (≥2 z rzędu, dowolny typ): data → osoba → data końca.
  // Liczone w szerszym oknie (savedMap obejmuje 16 najbliższych służb), by „do xx.xx" było poprawne
  // nawet gdy ciąg wychodzi poza 6 wyświetlanych dni.
  const streakEndByDate = (() => {
    const allKeys = [currentDutyDate, ...nextDutyKeys(16).filter(k => k !== currentDutyDate)]
    const isAbsent = (date: string, id: string) => !!assignmentFor(date)?.absenceMap?.[id]
    const ids = new Set<string>()
    allKeys.forEach(k => {
      const m = assignmentFor(k)?.absenceMap
      if (m) Object.keys(m).forEach(id => ids.add(id))
    })
    const byDate = new Map<string, Map<string, string>>()
    for (const id of ids) {
      let i = 0
      while (i < allKeys.length) {
        if (!isAbsent(allKeys[i], id)) { i++; continue }
        let j = i
        while (j + 1 < allKeys.length && isAbsent(allKeys[j + 1], id)) j++
        if (j > i) {
          const end = allKeys[j]
          for (let k = i; k <= j; k++) {
            if (!byDate.has(allKeys[k])) byDate.set(allKeys[k], new Map())
            byDate.get(allKeys[k])!.set(id, end)
          }
        }
        i = j + 1
      }
    }
    return byDate
  })()

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3 text-left hover:border-slate-600 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CalendarX className="w-4 h-4 text-red-400/70 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">Nieobecności na służbach</p>
            {todayCount > 0 && (
              <p className="text-[11px] text-red-400/90 leading-tight">
                Dzisiaj {todayCount} {todayCount === 1 ? 'nieobecny' : 'nieobecnych'}
              </p>
            )}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-500 shrink-0 transition-transform duration-300 ml-2', open && 'rotate-180')} />
      </button>

      <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', open ? 'max-h-[1500px] opacity-100' : 'max-h-0 opacity-0')}>
        <div className="mt-2 bg-surface-800 rounded-xl border border-slate-700/40 divide-y divide-slate-800/60 overflow-hidden">
          {rows.map(({ date, absent }) => (
            <DutyDayAbsenceRow key={date} date={date} absent={absent} myPersonId={myPersonId} streakEnds={streakEndByDate.get(date) ?? null} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DutyDayAbsenceRow({
  date,
  absent,
  myPersonId,
  streakEnds,
}: {
  date: string
  absent: { id: string; name: string; absence: AbsenceType }[] | null
  myPersonId: string | null
  streakEnds: Map<string, string> | null
}) {
  const [open, setOpen] = useState(false)
  const weekday = formatDateLong(date).split(',')[0]
  const hasAbsent = absent && absent.length > 0
  const iAmAbsent = !!myPersonId && !!absent?.some(p => p.id === myPersonId)

  return (
    <div className={cn(iAmAbsent && 'border-l-2 border-amber-500')}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={!hasAbsent}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{formatDateShort(date)}</p>
          <p className="text-[11px] text-slate-500">{weekday}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {iAmAbsent && (
            <span className="text-[11px] font-medium text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-900/40">
              Nieobecny
            </span>
          )}
          {absent === null ? (
            <span className="text-[11px] text-slate-600">Brak obsady</span>
          ) : hasAbsent ? (
            <span className="text-[11px] font-medium text-red-400 bg-red-950/40 px-2 py-0.5 rounded-md border border-red-900/40">
              {absent.length} {absent.length === 1 ? 'nieobecny' : 'nieobecnych'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
              <CheckCircle className="w-3 h-3" />
              Wszyscy obecni
            </span>
          )}
          {hasAbsent && (
            <ChevronDown className={cn('w-3.5 h-3.5 text-slate-600 transition-transform duration-200', open && 'rotate-180')} />
          )}
        </div>
      </button>

      {hasAbsent && (
        <div className={cn('overflow-hidden transition-all duration-200 ease-in-out', open ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0')}>
          <div className="border-t border-slate-800/60 divide-y divide-slate-800/40">
            {absent.map(p => {
              const isMe = p.id === myPersonId
              const streakEnd = streakEnds?.get(p.id) ?? null
              const showStreak = streakEnd && streakEnd !== date
              return (
                <div key={p.id} className={cn(
                  'flex items-center justify-between py-2.5 gap-2 bg-surface-900/40',
                  isMe ? 'pl-3 pr-4 border-l-2 border-brand-500' : 'px-4',
                )}>
                  <span className={cn('text-sm truncate', isMe ? 'text-brand-200 font-semibold' : 'text-slate-400')}>
                    {p.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {showStreak && (
                      <span className="text-[11px] font-medium text-amber-300/90 bg-amber-950/30 px-2 py-0.5 rounded-md border border-amber-900/30 whitespace-nowrap">
                        do {formatDateShort(streakEnd)}
                      </span>
                    )}
                    <span className={cn(
                      'text-[11px] font-medium px-2 py-0.5 rounded-md border whitespace-nowrap',
                      isMe
                        ? 'text-amber-400 bg-amber-950/40 border-amber-900/40'
                        : 'text-red-400 bg-red-950/40 border-red-900/40',
                    )}>
                      {ABSENCE_LABELS[p.absence]}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
