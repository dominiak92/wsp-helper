import { Clock, CalendarCheck } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  type Qualification, type QualLevel,
  qualLevel, daysLeft, remainingFraction, formatRemainingShort, formatQualDate, isPlanned,
} from '../../lib/qualifications'
import { LEVEL_STYLES, LEVEL_ORDER } from './qualStyles'

// Pasek „ile zostało z okna przypomnienia” — pełny poza oknem, pusty po terminie
export function RemainingBar({ q, today, className }: {
  q: Pick<Qualification, 'valid_until' | 'remind_days'> | null
  today: string
  className?: string
}) {
  const level = q ? qualLevel(q, today) : 'missing'
  const width = q ? remainingFraction(q, today) : 0
  return (
    <div className={cn('h-1.5 rounded-full bg-surface-950/70 overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all', LEVEL_STYLES[level].bar)}
        style={{ width: `${Math.max(width * 100, level === 'expired' ? 100 : 3)}%` }}
      />
    </div>
  )
}

// Kafelek terminu w widoku załogi: nazwa, „zostało” dużą czcionką, data, pasek.
// Każdy tekst w jednej linii, a pasek przyklejony do dołu (mt-auto) — kafelki w rzędzie
// mają tę samą wysokość (grid rozciąga je), więc paski zawsze stoją równo.
export function QualTile({ title, q, today }: {
  title: string
  q: Qualification | null
  today: string
}) {
  const level = q ? qualLevel(q, today) : 'missing'
  const style = LEVEL_STYLES[level]
  return (
    <div className={cn('flex flex-col h-full rounded-lg border px-2 py-1.5 min-w-0', style.tile)}>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 truncate">{title}</p>
      <p className={cn('text-sm font-bold tabular-nums leading-tight mt-0.5 whitespace-nowrap truncate', style.text)}>
        {formatRemainingShort(q ? daysLeft(q, today) : null)}
      </p>
      <p className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap truncate">
        {formatQualDate(q?.valid_until ?? null)}
        {q?.pending_valid_until ? (
          <span className="ml-1 inline-flex items-center gap-0.5 text-brand-300">
            <Clock className="w-2.5 h-2.5" />{formatQualDate(q.pending_valid_until).slice(0, 5)}
          </span>
        ) : q && isPlanned(q, today) && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-sky-300">
            <CalendarCheck className="w-2.5 h-2.5" />{formatQualDate(q.planned_on!).slice(0, 5)}
          </span>
        )}
      </p>
      <div className="mt-auto pt-1">
        <RemainingBar q={q} today={today} />
      </div>
    </div>
  )
}

// Podsumowanie kolorami (liczba terminów w każdym poziomie) — klik filtruje listę
export function LevelSummary({ counts, active, onSelect }: {
  counts: Record<QualLevel, number>
  active: QualLevel | null
  onSelect: (level: QualLevel | null) => void
}) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {LEVEL_ORDER.filter(l => l !== 'missing').map(level => {
        const style = LEVEL_STYLES[level]
        const isActive = active === level
        return (
          <button
            key={level}
            onClick={() => onSelect(isActive ? null : level)}
            className={cn(
              'rounded-lg border px-1.5 py-1.5 text-left transition-all min-w-0',
              style.tile,
              isActive ? 'ring-2 ring-white/40' : active ? 'opacity-50' : '',
            )}
          >
            <p className={cn('text-xl font-bold tabular-nums leading-none', style.text)}>{counts[level]}</p>
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-1 leading-tight truncate">{style.label}</p>
          </button>
        )
      })}
    </div>
  )
}
