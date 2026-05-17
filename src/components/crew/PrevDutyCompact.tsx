import type { Person, ShiftAssignment } from '../../lib/crew'
import { CREW_VEHICLE_NAMES } from '../../lib/crew'

export function PrevDutyCompact({ assignment, personnel }: {
  assignment: ShiftAssignment | null
  personnel: Person[]
}) {
  function n(id: string | null) {
    if (!id) return null
    return personnel.find(p => p.id === id)?.name ?? null
  }

  if (!assignment) {
    return (
      <p className="px-4 sm:px-6 py-3 text-xs text-slate-600 italic">
        Brak zapisanej obsady dla tej służby.
      </p>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-3 space-y-2">
      <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-xs">
        {assignment.shiftCommanderId && (
          <span className="text-slate-500">
            Dowódca: <span className="text-brand-300 font-semibold">{n(assignment.shiftCommanderId)}</span>
          </span>
        )}
        {assignment.dutyOfficerIds.map(id => (
          <span key={id} className="text-slate-500">
            Dyżurny: <span className="text-amber-300 font-semibold">{n(id)}</span>
          </span>
        ))}
        {assignment.unassignedIds.length > 0 && (
          <span className="text-slate-500">
            Rezerwa: <span className="text-slate-400">{assignment.unassignedIds.map(id => n(id)).filter(Boolean).join(', ')}</span>
          </span>
        )}
      </div>
      <div className="space-y-1">
        {assignment.vehicles.map(v => {
          const vName = CREW_VEHICLE_NAMES[v.vehicleId as keyof typeof CREW_VEHICLE_NAMES] ?? v.vehicleId
          const members: string[] = []
          if (v.commanderId) { const nm = n(v.commanderId); if (nm) members.push(nm) }
          if (v.driverId && v.driverId !== v.commanderId) { const nm = n(v.driverId); if (nm) members.push(nm) }
          v.rescuerIds.forEach(id => { const nm = n(id); if (nm) members.push(nm) })
          if (!members.length) return null
          return (
            <div key={v.vehicleId} className="flex items-baseline gap-3 text-xs">
              <span className="text-emerald-400 font-semibold shrink-0 w-24">{vName}</span>
              <span className="text-slate-300">{members.join(' · ')}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
