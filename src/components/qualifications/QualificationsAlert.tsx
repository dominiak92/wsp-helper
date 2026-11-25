import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { todayYmdKey } from '../../lib/duty'
import {
  type Qualification, type QualLevel, fetchQualifications, fetchCommanderRemindDays, qualLevel, qualTitle,
  daysLeft, compareAttention, formatQualDate, formatRemainingShort, formatDaysLeft, COMMANDER_REMIND_DAYS,
} from '../../lib/qualifications'
import { LEVEL_STYLES, LEVEL_ORDER } from './qualStyles'
import { RemainingBar } from './QualVisuals'

// W oknie przypomnienia (lub po terminie) — tylko takie pokazujemy na stronie głównej
const ALERT_LEVELS: QualLevel[] = ['expired', 'critical', 'soon', 'planned']

// „za 4 mies.” / „za 57 dni” / „dziś” / „po terminie 3 dni” — do zdania w nagłówku
function describeShort(days: number | null): string {
  if (days === null) return ''
  if (days <= 0) return formatDaysLeft(days)
  return `za ${formatRemainingShort(days)}`
}

// Najgorszy poziom z listy — kolor licznika w zwiniętym nagłówku
function worstLevel(levels: QualLevel[]): QualLevel {
  return LEVEL_ORDER.find(l => levels.includes(l)) ?? 'ok'
}

// Zwijana przypominajka na stronie głównej. Zwinięta: tylko kolorowe liczniki (widać,
// że coś jest), rozwinięta: lista. Strażak widzi swój termin dopiero w okresie przypomnienia
// (domyślnie pół roku). Dowódca zmiany (i admin) widzi też całą zmianę od progu dowódców,
// zatwierdzający — zgłoszenia. Nic do pokazania → nic nie renderuje.
export function QualificationsAlert({ myPersonId, names, showCrew, canApprove, to }: {
  myPersonId: string | null
  names: Record<string, string>
  showCrew: boolean
  canApprove: boolean
  to: string
}) {
  const [quals, setQuals] = useState<Qualification[]>([])
  const [commanderDays, setCommanderDays] = useState(COMMANDER_REMIND_DAYS)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Przypominajka jest dodatkiem — przy błędzie sieci po prostu jej nie pokazujemy
    fetchQualifications().then(setQuals).catch(() => {})
    if (showCrew) fetchCommanderRemindDays().then(setCommanderDays)
  }, [showCrew])

  const today = todayYmdKey()
  const inWindow = (q: Qualification) => ALERT_LEVELS.includes(qualLevel(q, today))
  const mine = quals.filter(q => q.person_id === myPersonId && inWindow(q)).sort((a, b) => compareAttention(a, b, today))
  // Dowódca: termin każdego strażaka od wspólnego progu dowódców (lub wcześniej, jeśli strażak ma dłuższe okno)
  const crew = showCrew
    ? quals
        .filter(q => q.person_id !== myPersonId && (inWindow(q) || (daysLeft(q, today) ?? Infinity) <= commanderDays))
        .sort((a, b) => compareAttention(a, b, today))
    : []
  const pending = canApprove ? quals.filter(q => q.pending_valid_until && q.person_id !== myPersonId).length : 0

  if (!mine.length && !crew.length && !pending) return null

  const iconLevel = worstLevel([...mine, ...crew].map(q => qualLevel(q, today)))

  // Zwinięty nagłówek: proste zdania. „Twoje najbliższe: Badania okresowe za 4 mies.”,
  // „5 osobom zbliża się termin, w tym 2 po terminie”, „1 nowa data do zatwierdzenia”
  const myTop = mine[0]
  const myTopLevel = myTop ? qualLevel(myTop, today) : 'ok'
  const crewPeople = new Set(crew.map(q => q.person_id)).size
  const crewExpiredPeople = new Set(crew.filter(q => qualLevel(q, today) === 'expired').map(q => q.person_id)).size
  const crewLevel = worstLevel(crew.map(q => qualLevel(q, today)))

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3 text-left hover:border-slate-600 transition-colors"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <CalendarClock className={cn('w-4 h-4 shrink-0 mt-0.5', LEVEL_STYLES[iconLevel].text)} />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-white">Terminy</p>
            {myTop && (
              <p className="text-[12px] text-slate-400 leading-snug">
                Twoje najbliższe: <span className="text-slate-200">{qualTitle(myTop)}</span>{' '}
                <span className={cn('font-semibold', LEVEL_STYLES[myTopLevel].text)}>
                  {myTopLevel === 'planned' && myTop.planned_on
                    ? `zapisany na ${formatQualDate(myTop.planned_on).slice(0, 5)}`
                    : describeShort(daysLeft(myTop, today))}
                </span>
              </p>
            )}
            {crewPeople > 0 && (
              <p className="text-[12px] text-slate-400 leading-snug">
                <span className={cn('font-semibold', LEVEL_STYLES[crewLevel].text)}>{crewPeople}</span>{' '}
                {crewPeople === 1 ? 'osobie' : 'osobom'} zbliża się termin
                {crewExpiredPeople > 0 && <>, w tym <span className="font-semibold text-red-300">{crewExpiredPeople}</span> po terminie</>}
              </p>
            )}
            {pending > 0 && (
              <p className="text-[12px] text-brand-300 leading-snug">
                {pending === 1
                  ? '1 nowa data czeka'
                  : [2, 3, 4].includes(pending % 10) && ![12, 13, 14].includes(pending % 100)
                    ? `${pending} nowe daty czekają`
                    : `${pending} nowych dat czeka`} na zatwierdzenie
              </p>
            )}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-500 shrink-0 transition-transform duration-300', open && 'rotate-180')} />
      </button>

      <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', open ? 'max-h-[1500px] opacity-100' : 'max-h-0 opacity-0')}>
        <div className="mt-2 bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3 space-y-3">
          {mine.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Twoje</p>
              {mine.map(q => {
                const style = LEVEL_STYLES[qualLevel(q, today)]
                return (
                  <div key={q.id}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-slate-200 truncate flex-1">{qualTitle(q)}</span>
                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{formatQualDate(q.valid_until)}</span>
                      <span className={cn('text-sm font-bold tabular-nums shrink-0 whitespace-nowrap', style.text)}>
                        {formatRemainingShort(daysLeft(q, today))}
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
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Zmiana</p>
              {crew.slice(0, 5).map(q => {
                const style = LEVEL_STYLES[qualLevel(q, today)]
                return (
                  <p key={q.id} className="flex items-center gap-2 text-xs">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />
                    <span className="text-slate-300 truncate">{names[q.person_id] ?? '?'}: {qualTitle(q)}</span>
                    <span className={cn('ml-auto shrink-0 font-semibold tabular-nums whitespace-nowrap', style.text)}>
                      {formatRemainingShort(daysLeft(q, today))}
                    </span>
                  </p>
                )
              })}
              {crew.length > 5 && <p className="text-[11px] text-slate-500">…i {crew.length - 5} więcej</p>}
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

          <Link to={to} className="flex items-center justify-center gap-1 rounded-lg bg-surface-700 hover:bg-surface-600 px-3 py-2 text-xs font-medium text-white transition-colors">
            Otwórz Terminy <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
