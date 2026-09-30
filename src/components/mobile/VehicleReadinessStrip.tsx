import { Shield, Truck, HeartPulse, Plane } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Person, ShiftAssignment } from '../../lib/crew'
import { CREW_VEHICLE_NAMES, CREW_VEHICLE_IDS, VEHICLE_SEATS, VEHICLE_EXTRA_RESCUERS } from '../../lib/crew'

// ── Vehicle readiness strip ───────────────────────────────────────────────────

export function VehicleReadinessStrip({ assignment, personnel }: { assignment: ShiftAssignment | null; personnel: Person[] }) {
  if (!assignment) return null

  return (
    <div className="border-t border-slate-800">
      {CREW_VEHICLE_IDS.map((id, i) => {
        const v = assignment.vehicles.find(v => v.vehicleId === id)
        const cap = VEHICLE_SEATS[id]
        const rescuerCap = cap - 2 // standard rescuer slots counted toward capacity
        const extraCap = VEHICLE_EXTRA_RESCUERS[id]
        const commanderFilled = !!v?.commanderId
        const driverFilled = !!v?.driverId
        const allRescuers = v?.rescuerIds.length ?? 0
        const stdRescuers = Math.min(allRescuers, rescuerCap)
        const extraRescuers = Math.max(0, allRescuers - rescuerCap)
        const filled = (commanderFilled ? 1 : 0) + (driverFilled ? 1 : 0) + stdRescuers
        const full = filled >= cap
        const partial = filled > 0 && filled < cap

        return (
          <div
            key={id}
            className={cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-slate-800/60')}
          >
            <span className={cn(
              'text-xs font-semibold w-24 shrink-0 flex items-center gap-1',
              full ? 'text-emerald-300' : partial ? 'text-amber-300' : 'text-slate-500',
            )}>
              <span className="truncate">{CREW_VEHICLE_NAMES[id]}</span>
              {id === 'gcba850' && <Plane className="w-3 h-3 shrink-0 opacity-70" />}
            </span>
            <div className="flex items-center gap-2 flex-1">
              <Shield className={cn('w-3.5 h-3.5 shrink-0 transition-colors', commanderFilled ? 'text-purple-400' : 'text-slate-700')} />
              <Truck className={cn('w-3.5 h-3.5 shrink-0 transition-colors', driverFilled ? 'text-emerald-400' : 'text-slate-700')} />
              {Array.from({ length: rescuerCap }, (_, j) => (
                <HeartPulse key={j} className={cn('w-3.5 h-3.5 shrink-0 transition-colors', j < stdRescuers ? 'text-sky-400' : 'text-slate-700')} />
              ))}
              {extraCap > 0 && Array.from({ length: extraRescuers }, (_, j) => (
                <HeartPulse key={`x${j}`} className="w-3.5 h-3.5 shrink-0 text-teal-300/80" />
              ))}
            </div>
            <span className="flex items-baseline gap-1 shrink-0">
              <span className={cn(
                'text-xs font-bold tabular-nums',
                full ? 'text-emerald-400' : partial ? 'text-amber-400' : 'text-slate-500',
              )}>
                {filled}/{cap}
              </span>
              {extraRescuers > 0 && (
                <span className="text-xs font-bold tabular-nums text-teal-300/80">+{extraRescuers}</span>
              )}
            </span>
          </div>
        )
      })}
      {assignment.unassignedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-800/60">
          <span className="text-xs font-semibold w-24 shrink-0 truncate text-slate-400">Rezerwa</span>
          <div className="flex-1 text-xs text-slate-400 truncate">
            {assignment.unassignedIds.map(id => personnel.find(p => p.id === id)?.name ?? '—').join(', ')}
          </div>
          <span className="text-xs font-bold tabular-nums text-slate-400 shrink-0">
            {assignment.unassignedIds.length}
          </span>
        </div>
      )}
    </div>
  )
}
