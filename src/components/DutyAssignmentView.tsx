import type { Person, ShiftAssignment } from '../lib/crew'
import { CREW_VEHICLE_NAMES } from '../lib/crew'
import { cn } from '../lib/utils'

function name(personnel: Person[], id: string | null): string {
  if (!id) return '—'
  return personnel.find(p => p.id === id)?.name ?? '—'
}

interface Props {
  personnel: Person[]
  assignment: ShiftAssignment | null
  loading: boolean
}

export function DutyAssignmentView({ personnel, assignment, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-8">
        <p className="text-sm font-medium text-slate-400">Brak zapisanej obsady</p>
        <p className="text-xs text-slate-600">Administrator może ją dodać w panelu zarządzania</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 px-4 pb-6">
      {/* Special roles */}
      <Card label="Role specjalne" labelColor="text-slate-400">
        <Row label="Dowódca zmiany" value={name(personnel, assignment.shiftCommanderId)} valueColor="text-brand-300" />
        {assignment.dutyOfficerIds.map(id => (
          <Row key={id} label="Dyżurny" value={name(personnel, id)} valueColor="text-amber-300" />
        ))}
      </Card>

      {/* Vehicles */}
      {assignment.vehicles.map(v => {
        const rows: { label: string; id: string | null }[] = []
        if (v.commanderId) rows.push({ label: 'Ddca zast.', id: v.commanderId })
        if (v.driverId) rows.push({ label: 'Kierowca', id: v.driverId })
        v.rescuerIds.forEach(id => rows.push({ label: 'Ratownik', id }))
        if (!rows.length) return null
        const vehicleName = CREW_VEHICLE_NAMES[v.vehicleId as keyof typeof CREW_VEHICLE_NAMES] ?? v.vehicleId
        return (
          <Card key={v.vehicleId} label={vehicleName} labelColor="text-emerald-400">
            {rows.map((r, i) => (
              <Row key={i} label={r.label} value={name(personnel, r.id)} />
            ))}
          </Card>
        )
      })}

      {/* Reserve */}
      {assignment.unassignedIds.length > 0 && (
        <Card label="Rezerwa / Dyżur" labelColor="text-slate-400">
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {assignment.unassignedIds.map(id => (
              <span key={id} className="text-sm text-slate-300 bg-surface-900 rounded-lg px-3 py-1.5 border border-slate-700">
                {name(personnel, id)}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Card({ label, labelColor, children }: {
  label: string
  labelColor: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface-800 rounded-xl border border-slate-700/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-800">
        <p className={cn('text-[10px] font-semibold uppercase tracking-widest', labelColor)}>{label}</p>
      </div>
      <div className="divide-y divide-slate-800/60">{children}</div>
    </div>
  )
}

function Row({ label, value, valueColor = 'text-white' }: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={cn('text-sm font-semibold', valueColor)}>{value}</span>
    </div>
  )
}
