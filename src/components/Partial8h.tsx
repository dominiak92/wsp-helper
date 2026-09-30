import { Clock } from 'lucide-react'
import { cn } from '../lib/utils'
import { findPersonSlot, partial8hPersons, slotLabel, type Person, type ShiftAssignment } from '../lib/crew'

// Plakietka przy nazwisku osoby obecnej tylko 8h danego dnia
export function Badge8h({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold leading-none',
        'text-amber-300 bg-amber-950/50 border border-amber-800/60',
        className,
      )}
      title="Obecny tylko 8h"
    >
      <Clock className="w-3 h-3" aria-hidden />
      8h
    </span>
  )
}

// Wyróżniona lista osób na 8h w danej obsadzie — nic nie renderuje, gdy nikogo nie ma
export function Partial8hCard({ assignment, persons, myPersonId = null }: {
  assignment: ShiftAssignment | null
  persons: Person[]
  myPersonId?: string | null
}) {
  const list = partial8hPersons(assignment, persons)
  if (!assignment || list.length === 0) return null

  return (
    <div className="bg-surface-800 rounded-xl border border-amber-800/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-amber-950/20">
        <Clock className="w-4 h-4 text-amber-400 shrink-0" aria-hidden />
        <p className="text-sm font-semibold text-amber-300">Na 8h ({list.length})</p>
        <p className="ml-auto text-[11px] text-slate-400">nie całą służbę</p>
      </div>
      <div className="divide-y divide-slate-800/60">
        {list.map(p => {
          const isMe = p.id === myPersonId
          return (
            <div
              key={p.id}
              className={cn(
                'flex items-center justify-between gap-2 py-2.5',
                isMe ? 'pl-3 pr-4 border-l-2 border-brand-500 bg-brand-950/40' : 'px-4',
              )}
            >
              <span className={cn('text-sm font-semibold truncate', isMe ? 'text-brand-200' : 'text-white')}>
                {p.name}
              </span>
              <span className="text-xs text-slate-400 shrink-0 text-right">
                {slotLabel(findPersonSlot(assignment, p.id))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
