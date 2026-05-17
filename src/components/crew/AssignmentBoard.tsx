import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Person, ShiftAssignment } from '../../lib/crew'
import { CREW_VEHICLE_NAMES, VEHICLE_SEATS, VEHICLE_EXTRA_RESCUERS, resolveName } from '../../lib/crew'

export interface DragCtx {
  dragSource: string | null
  dropTarget: string | null
  onDragStart: (key: string, e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (key: string, e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (key: string, e: React.DragEvent) => void
  selectedSlot: string | null
  onTap: (key: string, hasPerson: boolean) => void
}

export function getPersonAtSlotKey(a: ShiftAssignment, key: string): string | null {
  if (!key || key === 'unassigned') return null
  if (key.startsWith('unassigned:')) return key.split(':')[1]
  if (key === 'special:shift-commander') return a.shiftCommanderId
  if (key.startsWith('special:duty-officer:')) return a.dutyOfficerIds[parseInt(key.split(':')[2])] ?? null
  const [ns, vid, role, idxStr] = key.split(':')
  if (ns !== 'v') return null
  const v = a.vehicles.find(x => x.vehicleId === vid)
  if (!v) return null
  if (role === 'commander') return v.commanderId
  if (role === 'driver') return v.driverId
  if (role === 'rescuer') return v.rescuerIds[parseInt(idxStr)] ?? null
  return null
}

export function SlotRow({ label, personId, slotKey, persons, highlight = false, empty = false, dnd }: {
  label: string
  personId: string | null
  slotKey: string
  persons: Person[]
  highlight?: boolean
  empty?: boolean
  dnd: DragCtx
}) {
  const name = resolveName(persons, personId)
  const isOver = dnd.dropTarget === slotKey
  const isDragging = dnd.dragSource === slotKey
  const isSelected = dnd.selectedSlot === slotKey
  const hasSelection = dnd.selectedSlot !== null

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-1.5 px-1 rounded-md transition-all',
        isOver && 'bg-brand-900/30 ring-1 ring-inset ring-brand-500/70',
        isSelected && 'bg-brand-900/40 ring-1 ring-inset ring-brand-400/80',
        hasSelection && !isSelected && 'cursor-pointer hover:bg-surface-700/40',
      )}
      onClick={() => dnd.onTap(slotKey, !!personId)}
      onDragOver={e => dnd.onDragOver(slotKey, e)}
      onDragLeave={dnd.onDragLeave}
      onDrop={e => dnd.onDrop(slotKey, e)}
    >
      <span className="text-[10px] text-slate-600 w-20 shrink-0 uppercase tracking-wide">{label}</span>
      {personId ? (
        <span
          draggable
          onDragStart={e => dnd.onDragStart(slotKey, e)}
          onDragEnd={dnd.onDragEnd}
          className={cn(
            'text-sm font-medium truncate select-none transition-opacity',
            highlight ? 'text-brand-300' : 'text-white',
            isDragging && 'opacity-30',
            isSelected ? 'cursor-pointer text-brand-200' : 'cursor-grab active:cursor-grabbing',
          )}
        >
          {name}
        </span>
      ) : (
        <span className="text-[10px] text-slate-700 italic">{empty ? 'brak' : '—'}</span>
      )}
    </div>
  )
}

export function VehicleCard({ vehicleId, commanderId, driverId, rescuerIds, persons, dnd }: {
  vehicleId: string
  commanderId: string | null
  driverId: string | null
  rescuerIds: string[]
  persons: Person[]
  dnd: DragCtx
}) {
  const vid = vehicleId as keyof typeof CREW_VEHICLE_NAMES
  const name = CREW_VEHICLE_NAMES[vid] ?? vehicleId
  const cap = VEHICLE_SEATS[vid as keyof typeof VEHICLE_SEATS] ?? 0
  const extraCap = VEHICLE_EXTRA_RESCUERS[vid as keyof typeof VEHICLE_EXTRA_RESCUERS] ?? 0
  const pfx = `v:${vehicleId}`

  const stdRescuerSlots = cap - 1 - 1  // always reserve commander + driver seats
  const stdRescuers = rescuerIds.slice(0, stdRescuerSlots)
  const extraRescuers = rescuerIds.slice(stdRescuerSlots)

  const takenBySpecial = (commanderId ? 1 : 0) + (driverId && driverId !== commanderId ? 1 : 0)
  const stdFilled = takenBySpecial + stdRescuers.length
  const full = stdFilled >= cap

  return (
    <div className={cn(
      'w-full sm:flex-1 sm:min-w-[190px] rounded-xl border p-3 sm:p-4 bg-surface-800',
      full ? 'border-emerald-900' : 'border-amber-900/60'
    )}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-white">{name}</h3>
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'text-xs font-mono px-1.5 py-0.5 rounded font-semibold',
            full ? 'bg-emerald-900/50 text-emerald-400' : 'bg-amber-900/30 text-amber-400'
          )}>
            {stdFilled}/{cap}
          </span>
          {extraRescuers.length > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
              +{extraRescuers.length}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2">
        {(commanderId || vehicleId !== 'gba') && (
          <SlotRow label="Dowódca zastępu" slotKey={`${pfx}:commander`} personId={commanderId}
            persons={persons} highlight empty={!commanderId} dnd={dnd} />
        )}
        <SlotRow label="Kierowca" slotKey={`${pfx}:driver`} personId={driverId}
          persons={persons} empty={!driverId} dnd={dnd} />
        {stdRescuers.map((id, i) => (
          <SlotRow key={i} label="Ratownik" slotKey={`${pfx}:rescuer:${i}`} personId={id}
            persons={persons} dnd={dnd} />
        ))}
        {Array.from({ length: Math.max(0, stdRescuerSlots - stdRescuers.length) }).map((_, i) => (
          <SlotRow key={`e${i}`} label="Ratownik" slotKey={`${pfx}:rescuer:${stdRescuers.length + i}`}
            personId={null} persons={persons} empty dnd={dnd} />
        ))}
        {extraCap > 0 && (
          <>
            <div className="border-t border-slate-700/40 my-1.5" />
            {Array.from({ length: extraCap }).map((_, i) => {
              const idx = stdRescuerSlots + i
              return (
                <SlotRow
                  key={`x${i}`}
                  label="Ratownik +"
                  slotKey={`${pfx}:rescuer:${idx}`}
                  personId={extraRescuers[i] ?? null}
                  persons={persons}
                  empty={!extraRescuers[i]}
                  dnd={dnd}
                />
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

export function SpecialRoleCard({ title, personId, persons, colorClass, borderClass, slotKey, dnd, onClear }: {
  title: string
  personId: string | null
  persons: Person[]
  colorClass: string
  borderClass: string
  slotKey: string
  dnd: DragCtx
  onClear?: () => void
}) {
  const isOver = dnd.dropTarget === slotKey
  const isSelected = dnd.selectedSlot === slotKey
  const hasSelection = dnd.selectedSlot !== null

  return (
    <div
      className={cn(
        'rounded-xl border p-4 bg-surface-800 min-w-[140px] transition-all',
        borderClass,
        isOver && 'ring-1 ring-inset ring-brand-500/70',
        isSelected && 'ring-1 ring-inset ring-brand-400/80',
        hasSelection && !isSelected && 'cursor-pointer hover:bg-surface-700/60',
      )}
      onDragOver={e => dnd.onDragOver(slotKey, e)}
      onDragLeave={dnd.onDragLeave}
      onDrop={e => dnd.onDrop(slotKey, e)}
      onClick={() => { if (hasSelection && !isSelected) dnd.onTap(slotKey, !!personId) }}
    >
      <p className={cn('text-[10px] uppercase tracking-widest font-semibold mb-1.5', colorClass)}>{title}</p>
      <div className="flex items-center gap-2">
        {personId ? (
          <span
            draggable
            onDragStart={e => dnd.onDragStart(slotKey, e)}
            onDragEnd={dnd.onDragEnd}
            onClick={e => { e.stopPropagation(); dnd.onTap(slotKey, true) }}
            className={cn(
              'text-sm font-bold flex-1 select-none',
              isSelected ? 'text-brand-200 cursor-pointer' : 'text-white cursor-grab active:cursor-grabbing',
            )}
          >
            {resolveName(persons, personId)}
          </span>
        ) : (
          <span className="text-[10px] text-slate-700 italic flex-1">—</span>
        )}
        {onClear && personId && !isSelected && (
          <button
            onClick={e => { e.stopPropagation(); onClear() }}
            title="Przenieś do nieprzydzielonych"
            className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
