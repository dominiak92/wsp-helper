import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { todayYmdKey } from '../../lib/duty'
import {
  type Qualification, type QualLevel, fetchQualifications, fetchCommanderRemindDays, qualLevel, qualTitle,
  daysLeft, compareUrgency, formatQualDate, formatRemaining, COMMANDER_REMIND_DAYS,
} from '../../lib/qualifications'
import { LEVEL_STYLES } from './qualStyles'
import { RemainingBar } from './QualVisuals'

// W oknie przypomnienia (lub po terminie) — tylko takie pokazujemy na stronie głównej
const ALERT_LEVELS: QualLevel[] = ['expired', 'critical', 'soon']

// Karta-przypominajka na stronie głównej. Strażak widzi swój termin dopiero, gdy wejdzie
// w okno przypomnienia (domyślnie pół roku). Dowódca zmiany (i admin) widzi licznik
// terminów załogi w oknie, zatwierdzający — zgłoszenia. Nic do pokazania → nic nie renderuje.
export function QualificationsAlert({ myPersonId, names, showCrew, canApprove, to }: {
  myPersonId: string | null
  names: Record<string, string>
  showCrew: boolean
  canApprove: boolean
  to: string
}) {
  const [quals, setQuals] = useState<Qualification[]>([])
  const [commanderDays, setCommanderDays] = useState(COMMANDER_REMIND_DAYS)

  useEffect(() => {
    // Przypominajka jest dodatkiem — przy błędzie sieci po prostu jej nie pokazujemy
    fetchQualifications().then(setQuals).catch(() => {})
    if (showCrew) fetchCommanderRemindDays().then(setCommanderDays)
  }, [showCrew])

  const today = todayYmdKey()
  const inWindow = (q: Qualification) => ALERT_LEVELS.includes(qualLevel(q, today))
  const mine = quals.filter(q => q.person_id === myPersonId && inWindow(q)).sort(compareUrgency)
  // Dowódca: termin każdego strażaka od wspólnego progu dowódców (lub wcześniej, jeśli strażak ma dłuższe okno)
  const crew = showCrew
    ? quals
        .filter(q => q.person_id !== myPersonId && (inWindow(q) || (daysLeft(q, today) ?? Infinity) <= commanderDays))
        .sort(compareUrgency)
    : []
  const pending = canApprove ? quals.filter(q => q.pending_valid_until && q.person_id !== myPersonId).length : 0

  if (!mine.length && !crew.length && !pending) return null

  const crewCounts = ([...ALERT_LEVELS, 'ok'] as QualLevel[]).map(level => ({ level, n: crew.filter(q => qualLevel(q, today) === level).length }))

  return (
    <Link
      to={to}
      className="block bg-surface-800 rounded-xl border border-amber-900/50 px-4 py-3 space-y-3 hover:border-amber-700/60 transition-colors"
    >
      <div className="flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-sm font-semibold text-white flex-1">Terminy</p>
        <ChevronRight className="w-4 h-4 text-slate-500" />
      </div>

      {mine.length > 0 && (
        <div className="space-y-2.5">
          {mine.map(q => {
            const style = LEVEL_STYLES[qualLevel(q, today)]
            return (
              <div key={q.id}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-slate-200 truncate flex-1">{qualTitle(q)}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{formatQualDate(q.valid_until)}</span>
                  <span className={cn('text-sm font-bold tabular-nums shrink-0', style.text)}>
                    {formatRemaining(daysLeft(q, today))}
                  </span>
                </div>
                <RemainingBar q={q} today={today} className="mt-1" />
              </div>
            )
          })}
        </div>
      )}

      {crew.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 flex-1">Załoga</p>
            {crewCounts.filter(c => c.n > 0).map(({ level, n }) => (
              <span key={level} className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border', LEVEL_STYLES[level].tile, LEVEL_STYLES[level].text)}>
                {n} · {LEVEL_STYLES[level].label.toLowerCase()}
              </span>
            ))}
          </div>
          {crew.slice(0, 4).map(q => {
            const style = LEVEL_STYLES[qualLevel(q, today)]
            return (
              <p key={q.id} className="flex items-center gap-2 text-xs">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />
                <span className="text-slate-300 truncate">{names[q.person_id] ?? '?'} — {qualTitle(q)}</span>
                <span className={cn('ml-auto shrink-0 font-semibold tabular-nums', style.text)}>
                  {formatRemaining(daysLeft(q, today))}
                </span>
              </p>
            )
          })}
          {crew.length > 4 && <p className="text-[11px] text-slate-500">…i {crew.length - 4} więcej — zobacz wszystkie</p>}
        </div>
      )}

      {pending > 0 && (
        <p className="text-xs font-medium text-brand-300">
          {pending === 1
            ? '1 nowa data czeka'
            : [2, 3, 4].includes(pending % 10) && ![12, 13, 14].includes(pending % 100)
              ? `${pending} nowe daty czekają`
              : `${pending} nowych dat czeka`} na zatwierdzenie
        </p>
      )}
    </Link>
  )
}
