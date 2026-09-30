import { useState } from 'react'
import { ChevronDown, Users, Star, Shield, Truck, HeartPulse, ClipboardList, Plane } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Person, ShiftAssignment } from '../../lib/crew'
import { CREW_VEHICLE_NAMES } from '../../lib/crew'
import { Badge8h } from '../Partial8h'

// ── Collapsible full assignment ───────────────────────────────────────────────

export function FullAssignmentCollapsible({ personnel, assignment, myPersonId }: {
  personnel: Person[]
  assignment: ShiftAssignment
  myPersonId: string | null
}) {
  const [open, setOpen] = useState(false)

  function name(id: string | null) {
    if (!id) return '—'
    return personnel.find(p => p.id === id)?.name ?? '—'
  }

  const isMe = (id: string | null) => !!id && id === myPersonId
  const is8h = (id: string | null) => !!id && !!assignment.partial8hIds?.includes(id)

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3 text-left hover:border-slate-600 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Users className="w-4 h-4 text-brand-400 shrink-0" />
          <p className="text-sm font-medium text-white">Pełna obsada służby</p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-500 shrink-0 transition-transform duration-300', open && 'rotate-180')} />
      </button>

      <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0')}>
          <div className="space-y-2 mt-1">
            {/* Special roles */}
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 divide-y divide-slate-800/60 overflow-hidden">
              <RowInline label="Dowódca zmiany" value={name(assignment.shiftCommanderId)} Icon={Star} iconClass="text-brand-400" isMe={isMe(assignment.shiftCommanderId)} is8h={is8h(assignment.shiftCommanderId)} />
              {assignment.dutyOfficerIds.map(id => (
                <RowInline key={id} label="Dyżurny" value={name(id)} Icon={ClipboardList} iconClass="text-amber-400" isMe={isMe(id)} is8h={is8h(id)} />
              ))}
            </div>

            {/* Vehicles */}
            {assignment.vehicles.map(v => {
              const vName = CREW_VEHICLE_NAMES[v.vehicleId as keyof typeof CREW_VEHICLE_NAMES] ?? v.vehicleId
              const rows: { label: string; id: string; Icon: LucideIcon; iconClass: string }[] = []
              if (v.commanderId) rows.push({ label: 'Dowódca zastępu', id: v.commanderId, Icon: Shield, iconClass: 'text-purple-400' })
              if (v.driverId) rows.push({ label: 'Kierowca', id: v.driverId, Icon: Truck, iconClass: 'text-emerald-400' })
              v.rescuerIds.forEach(id => rows.push({ label: 'Ratownik', id, Icon: HeartPulse, iconClass: 'text-sky-400' }))
              if (!rows.length) return null
              return (
                <div key={v.vehicleId} className="bg-surface-800 rounded-xl border border-slate-700/40 overflow-hidden">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400 px-4 py-2 border-b border-slate-800 flex items-center gap-1.5">
                    {vName}
                    {v.vehicleId === 'gcba850' && <Plane className="w-3 h-3 shrink-0 opacity-80" />}
                  </p>
                  <div className="divide-y divide-slate-800/60">
                    {rows.map((r, i) => (
                      <RowInline key={i} label={r.label} value={name(r.id)} Icon={r.Icon} iconClass={r.iconClass} isMe={isMe(r.id)} is8h={is8h(r.id)} />
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Reserve */}
            {assignment.unassignedIds.length > 0 && (
              <div className="bg-surface-800 rounded-xl border border-slate-700/40 overflow-hidden">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-2 border-b border-slate-800">
                  Rezerwa
                </p>
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  {assignment.unassignedIds.map(id => (
                    <span
                      key={id}
                      className={cn(
                        'text-sm rounded-lg px-3 py-1.5 border',
                        isMe(id)
                          ? 'text-brand-200 bg-brand-950/40 border-brand-700/60 font-semibold'
                          : 'text-slate-300 bg-surface-900 border-slate-700',
                      )}
                    >
                      {name(id)}
                      {is8h(id) && <Badge8h className="ml-1.5 align-middle" />}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  )
}

function RowInline({ label, value, Icon, iconClass, isMe, is8h }: {
  label: string
  value: string
  Icon?: LucideIcon
  iconClass?: string
  isMe?: boolean
  is8h?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-2 py-2.5',
      isMe ? 'px-3 border-l-2 border-brand-500 bg-brand-950/40' : 'px-4',
    )}>
      <span className={cn('flex items-center gap-1.5 text-xs shrink-0', isMe ? 'text-brand-300/80' : 'text-slate-500')}>
        {Icon && <Icon className={cn('w-3 h-3 shrink-0', iconClass)} />}
        {label}
      </span>
      <span className="flex items-center justify-end gap-1.5 min-w-0">
        <span className={cn('text-sm font-semibold truncate text-right', isMe ? 'text-brand-200' : 'text-white')}>
          {isMe && <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-400 mr-1.5 mb-0.5 shrink-0" />}
          {value}
        </span>
        {is8h && <Badge8h />}
      </span>
    </div>
  )
}
