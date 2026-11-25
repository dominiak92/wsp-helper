import { Clock } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  type Qualification, type QualLevel,
  qualLevel, daysLeft, remainingFraction, formatRemaining, formatQualDate,
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

// Kafelek terminu w widoku załogi: nazwa, „zostało” dużą czcionką, data, pasek
export function QualTile({ title, q, today }: {
  title: string
  q: Qualification | null
  today: string
}) {
  const level = q ? qualLevel(q, today) : 'missing'
  const style = LEVEL_STYLES[level]
  return (
    <div className={cn('rounded-lg border px-2 py-1.5 min-w-0', style.tile)}>
      <p className="text-[10px] uppercase tracking-wide text-slate-400 truncate">{title}</p>
      <p className={cn('text-sm font-bold tabular-nums leading-tight mt-0.5', style.text)}>
        {formatRemaining(q ? daysLeft(q, today) : null)}
      </p>
      <p className="text-[10px] text-slate-500 tabular-nums">{formatQualDate(q?.valid_until ?? null)}</p>
      <RemainingBar q={q} today={today} className="mt-1" />
      {q?.pending_valid_until && (
        <p className="mt-1 flex items-center gap-0.5 text-[10px] text-brand-300 truncate">
          <Clock className="w-2.5 h-2.5 shrink-0" /> {formatQualDate(q.pending_valid_until)}
        </p>
      )}
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
    <div className="grid grid-cols-4 gap-1.5">
      {LEVEL_ORDER.filter(l => l !== 'missing').map(level => {
        const style = LEVEL_STYLES[level]
        const isActive = active === level
        return (
          <button
            key={level}
            onClick={() => onSelect(isActive ? null : level)}
            className={cn(
              'rounded-lg border px-2 py-1.5 text-left transition-all',
              style.tile,
              isActive ? 'ring-2 ring-white/40' : active ? 'opacity-50' : '',
            )}
          >
            <p className={cn('text-xl font-bold tabular-nums leading-none', style.text)}>{counts[level]}</p>
            <p className="text-[10px] text-slate-400 mt-1 leading-tight">{style.label}</p>
          </button>
        )
      })}
    </div>
  )
}
