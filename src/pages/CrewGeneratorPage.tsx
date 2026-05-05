import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { RefreshCw, Zap, Pencil, X, Users, Plus, ArrowLeft, ArrowRight, Save, Check, History } from 'lucide-react'
import { previousDutyDate, nextDutyDate, formatDateShort } from '../lib/duty'
import { cn } from '../lib/utils'
import {
  Person, RoleType, AbsenceType, ShiftAssignment,
  ALL_ROLES, ROLE_LABELS, ROLE_COLORS, ABSENCE_LABELS,
  CREW_VEHICLE_NAMES, VEHICLE_SEATS, VEHICLE_EXTRA_RESCUERS, ROLE_SORT_ORDER,
  DEFAULT_PERSONNEL, generateCrew, resolveName, applyDrop, isPersonInAssignment,
} from '../lib/crew'
import { supabase } from '../lib/supabase'

const POLISH_MONTHS = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
]

function formatPolishDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${d} ${POLISH_MONTHS[m - 1]} ${y}`
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function RoleChip({ role }: { role: RoleType }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium leading-none', ROLE_COLORS[role])}>
      {ROLE_LABELS[role]}
    </span>
  )
}

function AbsenceSelect({ value, onChange }: {
  value: AbsenceType | null
  onChange: (v: AbsenceType | null) => void
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange((e.target.value as AbsenceType) || null)}
      className={cn(
        'text-[10px] py-0.5 px-1 rounded border bg-surface-900 cursor-pointer outline-none',
        value ? 'text-red-400 border-red-800' : 'text-slate-500 border-slate-700 hover:border-slate-500'
      )}
    >
      <option value="">Obecny</option>
      {(Object.keys(ABSENCE_LABELS) as AbsenceType[]).map(k => (
        <option key={k} value={k}>{ABSENCE_LABELS[k]}</option>
      ))}
    </select>
  )
}

// ── Personnel row ─────────────────────────────────────────────────────────────

function PersonnelRow({ person, onUpdate, onDelete, notAssigned }: {
  person: Person
  onUpdate: (p: Person) => void
  onDelete: (id: string) => void
  notAssigned?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(person.name)
  const absent = !!person.absence

  function toggleRole(role: RoleType) {
    const has = person.roles.includes(role)
    if (has && person.roles.length === 1) return
    const roles = has ? person.roles.filter(r => r !== role) : [...person.roles, role]
    onUpdate({ ...person, roles })
  }

  function handleSave() {
    const trimmed = editName.trim()
    if (!trimmed) return
    onUpdate({ ...person, name: trimmed })
    setEditing(false)
  }

  function handleCancel() {
    setEditName(person.name)
    setEditing(false)
  }

  return (
    <div className={cn(
      'p-2 rounded-lg border bg-surface-900',
      absent && !editing ? 'border-slate-800 opacity-50' : notAssigned ? 'border-amber-900/50' : 'border-slate-800'
    )}>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <input
            className="text-sm font-medium bg-surface-800 border border-slate-700 rounded px-1.5 py-0.5 text-white flex-1 min-w-0 outline-none focus:border-brand-500"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
            autoFocus
          />
        ) : (
          <span className={cn('text-sm font-medium text-white flex-1 truncate', absent && 'line-through')}>
            {person.name}
          </span>
        )}
        {notAssigned && !editing && (
          <span className="text-[10px] font-medium text-amber-600 shrink-0">poza obsadą</span>
        )}
        <button
          onClick={() => editing ? handleCancel() : setEditing(true)}
          className="text-slate-600 hover:text-slate-300 transition-colors shrink-0"
          title={editing ? 'Anuluj' : 'Edytuj'}
        >
          {editing ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
        </button>
        <AbsenceSelect value={person.absence} onChange={v => onUpdate({ ...person, absence: v })} />
      </div>
      <div className="flex gap-1 flex-wrap mt-1.5">
        {person.roles.map(r => <RoleChip key={r} role={r} />)}
      </div>
      {editing && (
        <div className="mt-2 pt-2 border-t border-slate-800 space-y-2">
          <div className="flex gap-1 flex-wrap">
            {ALL_ROLES.map(role => {
              const active = person.roles.includes(role)
              return (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                    active
                      ? ROLE_COLORS[role]
                      : 'text-slate-600 border-slate-700 hover:text-slate-400 hover:border-slate-500'
                  )}
                >
                  {ROLE_LABELS[role]}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => { if (confirm(`Usunąć ${person.name}?`)) onDelete(person.id) }}
              className="text-[10px] text-red-700 hover:text-red-400 transition-colors"
            >
              Usuń osobę
            </button>
            <button
              onClick={handleSave}
              className="text-[10px] px-2 py-0.5 rounded bg-brand-700 hover:bg-brand-600 text-white transition-colors"
            >
              Zapisz
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add person form ───────────────────────────────────────────────────────────

function AddPersonForm({ onAdd, onCancel }: {
  onAdd: (name: string, roles: RoleType[]) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [roles, setRoles] = useState<RoleType[]>(['RESCUER'])

  function toggleRole(role: RoleType) {
    const has = roles.includes(role)
    if (has && roles.length === 1) return
    setRoles(has ? roles.filter(r => r !== role) : [...roles, role])
  }

  return (
    <div className="p-2 rounded-lg border border-brand-900 bg-surface-900 space-y-2">
      <input
        className="w-full text-sm bg-surface-800 border border-slate-700 rounded px-1.5 py-1 text-white outline-none focus:border-brand-500 placeholder:text-slate-600"
        placeholder="Imię i nazwisko"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onAdd(name.trim(), roles); if (e.key === 'Escape') onCancel() }}
        autoFocus
      />
      <div className="flex gap-1 flex-wrap">
        {ALL_ROLES.map(role => {
          const active = roles.includes(role)
          return (
            <button
              key={role}
              onClick={() => toggleRole(role)}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                active
                  ? ROLE_COLORS[role]
                  : 'text-slate-600 border-slate-700 hover:text-slate-400 hover:border-slate-500'
              )}
            >
              {ROLE_LABELS[role]}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
          Anuluj
        </button>
        <button
          onClick={() => { if (name.trim()) onAdd(name.trim(), roles) }}
          disabled={!name.trim()}
          className="text-[10px] px-2 py-0.5 rounded bg-brand-700 hover:bg-brand-600 text-white transition-colors disabled:opacity-40"
        >
          Dodaj
        </button>
      </div>
    </div>
  )
}

// ── Drag context ──────────────────────────────────────────────────────────────

interface DragCtx {
  dragSource: string | null
  dropTarget: string | null
  onDragStart: (key: string, e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (key: string, e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (key: string, e: React.DragEvent) => void
  // Tap-to-swap (mobile) ─────────────────────────────────────────────────────
  selectedSlot: string | null
  onTap: (key: string, hasPerson: boolean) => void
}

function getPersonAtSlotKey(a: ShiftAssignment, key: string): string | null {
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

// ── Slot row ──────────────────────────────────────────────────────────────────

function SlotRow({ label, personId, slotKey, persons, highlight = false, empty = false, dnd }: {
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

// ── Vehicle card ──────────────────────────────────────────────────────────────

function VehicleCard({ vehicleId, commanderId, driverId, rescuerIds, persons, dnd }: {
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

  const cmdSlot = commanderId ? 1 : 0
  // driver row always takes 1 visual slot regardless of whether it's filled
  const stdRescuerSlots = cap - cmdSlot - 1
  const stdRescuers = rescuerIds.slice(0, stdRescuerSlots)
  const extraRescuers = rescuerIds.slice(stdRescuerSlots)

  const takenBySpecial = cmdSlot + (driverId && driverId !== commanderId ? 1 : 0)
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
        {commanderId && (
          <SlotRow label="Ddca zast." slotKey={`${pfx}:commander`} personId={commanderId}
            persons={persons} highlight dnd={dnd} />
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

// ── Special role card ─────────────────────────────────────────────────────────

function SpecialRoleCard({ title, personId, persons, colorClass, borderClass, slotKey, dnd, onClear }: {
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

// ── Previous duty compact view ────────────────────────────────────────────────

function PrevDutyCompact({ assignment, personnel }: {
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
      {/* Special roles + reserve on one line */}
      <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-xs">
        {assignment.shiftCommanderId && (
          <span className="text-slate-500">
            Ddca: <span className="text-brand-300 font-semibold">{n(assignment.shiftCommanderId)}</span>
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
      {/* One line per vehicle */}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export function CrewGeneratorPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dutyDate = searchParams.get('date') // e.g. "2026-05-01"

  const [personnel, setPersonnel] = useState<Person[]>(DEFAULT_PERSONNEL)

  const [assignment, setAssignment] = useState<ShiftAssignment | null>(() => {
    if (dutyDate) return null // loaded from Supabase in useEffect
    try {
      const s = localStorage.getItem('wsp-crew-assignment')
      if (!s) return null
      const parsed = JSON.parse(s)
      if (!Array.isArray(parsed.dutyOfficerIds)) return null
      return parsed
    } catch {
      return null
    }
  })

  const assignmentIdRef = useRef<string | null>(null)

  const [showPersonnel, setShowPersonnel] = useState(false)
  const [addingPerson, setAddingPerson] = useState(false)
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [showPrevDuty, setShowPrevDuty] = useState(false)
  const [prevAssignment, setPrevAssignment] = useState<ShiftAssignment | null>(null)

  // Standalone mode (no specific duty date) — load personnel with global absence flags
  useEffect(() => {
    if (dutyDate) return
    supabase
      .from('personnel')
      .select('*')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setPersonnel(data.map(row => ({
            id: row.id,
            name: row.name,
            roles: row.roles as RoleType[],
            preferredVehicleId: row.preferred_vehicle_id ?? undefined,
            absence: row.absence as AbsenceType | null,
          })))
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Specific duty date mode — load personnel + assignment atomically to avoid race condition.
  // Absence for a given date lives exclusively in assignment.absenceMap, not in personnel table.
  useEffect(() => {
    if (!dutyDate) return
    const prevDate = previousDutyDate(dutyDate)
    Promise.all([
      supabase.from('personnel').select('*'),
      supabase
        .from('duty_assignments')
        .select('id, assignment_json')
        .eq('duty_date', dutyDate)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('duty_assignments')
        .select('assignment_json')
        .eq('duty_date', prevDate)
        .order('created_at', { ascending: false })
        .limit(1),
    ]).then(([{ data: pData }, { data: aData }, { data: prevData }]) => {
      const row = aData?.[0]
      let loadedAssignment: ShiftAssignment | null = null
      if (row?.assignment_json) {
        const parsed = row.assignment_json as ShiftAssignment
        if (Array.isArray(parsed.dutyOfficerIds)) {
          loadedAssignment = parsed
          assignmentIdRef.current = row.id
        }
      }
      if (pData && pData.length > 0) {
        setPersonnel(pData.map(pRow => ({
          id: pRow.id,
          name: pRow.name,
          roles: pRow.roles as RoleType[],
          preferredVehicleId: pRow.preferred_vehicle_id ?? undefined,
          // Use only the date-specific absenceMap — ignore global personnel.absence
          absence: (loadedAssignment?.absenceMap?.[pRow.id] ?? null) as AbsenceType | null,
        })))
      }
      if (loadedAssignment) setAssignment(loadedAssignment)
      const prevRow = prevData?.[0]
      if (prevRow?.assignment_json) {
        const parsed = prevRow.assignment_json as ShiftAssignment
        if (Array.isArray(parsed.dutyOfficerIds)) setPrevAssignment(parsed)
      }
    })
  }, [dutyDate])

  // Persist to Supabase — called explicitly via "Zapisz" button or after generate
  async function persistToSupabase(a: ShiftAssignment) {
    if (!dutyDate) return
    setSaving(true)
    setSavedOk(false)
    try {
      const currentId = assignmentIdRef.current
      if (currentId) {
        const { error } = await supabase
          .from('duty_assignments')
          .update({ assignment_json: a })
          .eq('id', currentId)
        if (error) throw error
      } else {
        // Delete any stale duplicate rows first, then insert fresh
        await supabase.from('duty_assignments').delete().eq('duty_date', dutyDate)
        const { data: inserted, error } = await supabase
          .from('duty_assignments')
          .insert({ duty_date: dutyDate, assignment_json: a })
          .select('id')
          .single()
        if (error) throw error
        if (inserted?.id) assignmentIdRef.current = inserted.id
      }
      setIsDirty(false)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (err) {
      console.error('[supabase] save duty_assignment:', err)
    } finally {
      setSaving(false)
    }
  }

  function applyAssignment(a: ShiftAssignment, autoSave = false) {
    setAssignment(a)
    if (!dutyDate) {
      localStorage.setItem('wsp-crew-assignment', JSON.stringify(a))
      return
    }
    if (autoSave) {
      persistToSupabase(a)
    } else {
      setIsDirty(true)
      setSavedOk(false)
    }
  }

  function updatePerson(updated: Person) {
    setPersonnel(prev => prev.map(p => p.id === updated.id ? updated : p))

    // Keep absenceMap in sync. Multi-status is intentional — a person can be
    // in a slot AND marked absent simultaneously (formal status vs. slot assignment).
    if (assignment) {
      let next = assignment
      if (updated.absence !== null) {
        next = { ...next, absenceMap: { ...(next.absenceMap ?? {}), [updated.id]: updated.absence } }
      } else {
        const newMap = { ...(next.absenceMap ?? {}) }
        delete newMap[updated.id]
        next = { ...next, absenceMap: Object.keys(newMap).length > 0 ? newMap : undefined }
      }
      if (next !== assignment) applyAssignment(next)
    }

    supabase.from('personnel').upsert({
      id: updated.id,
      name: updated.name,
      roles: updated.roles,
      preferred_vehicle_id: updated.preferredVehicleId ?? null,
      // When dutyDate is set, absence is stored only in assignment.absenceMap —
      // never write it back to the global personnel table.
      ...(dutyDate ? {} : { absence: updated.absence }),
    }).then(({ error }) => { if (error) console.error('[supabase] upsert personnel:', error) })
  }

  function clearSpecialRole(role: 'shiftCommander' | 'dutyOfficer', personId: string) {
    if (!assignment) return
    const base = role === 'shiftCommander'
      ? { ...assignment, shiftCommanderId: null }
      : { ...assignment, dutyOfficerIds: assignment.dutyOfficerIds.filter(id => id !== personId) }
    applyAssignment({ ...base, unassignedIds: [...base.unassignedIds, personId] })
  }

  function handleGenerate() {
    applyAssignment(generateCrew(personnel))
  }

  function deletePerson(id: string) {
    setPersonnel(prev => prev.filter(p => p.id !== id))
    supabase.from('personnel').delete().eq('id', id)
      .then(({ error }) => { if (error) console.error('[supabase] delete personnel:', error) })
  }

  function addPerson(name: string, roles: RoleType[]) {
    const newPerson: Person = { id: crypto.randomUUID(), name, roles, absence: null }
    setPersonnel(prev => [...prev, newPerson])
    setAddingPerson(false)
    supabase.from('personnel').insert({
      id: newPerson.id,
      name: newPerson.name,
      roles: newPerson.roles,
      preferred_vehicle_id: null,
      absence: null,
    }).then(({ error }) => { if (error) console.error('[supabase] insert personnel:', error) })
  }

  function handleReset() {
    if (!confirm('Zresetować dane personelu do domyślnych?')) return
    setPersonnel(DEFAULT_PERSONNEL)
    setAssignment(null)
    setAddingPerson(false)
    localStorage.removeItem('wsp-crew-assignment')
    supabase.from('personnel').upsert(
      DEFAULT_PERSONNEL.map(p => ({
        id: p.id,
        name: p.name,
        roles: p.roles,
        preferred_vehicle_id: p.preferredVehicleId ?? null,
        absence: p.absence,
      }))
    )
  }

  // DnD handlers
  function handleDragStart(key: string, e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', key)
    e.dataTransfer.effectAllowed = 'move'
    setDragSource(key)
  }

  function handleDragEnd() {
    setDragSource(null)
    setDropTarget(null)
  }

  function handleDragOver(key: string, e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(key)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
  }

  function handleDrop(dstKey: string, e: React.DragEvent) {
    e.preventDefault()
    const srcKey = e.dataTransfer.getData('text/plain')
    setDragSource(null)
    setDropTarget(null)
    if (!srcKey || srcKey === dstKey || !assignment) return
    applyAssignment(applyDrop(assignment, srcKey, dstKey))
  }

  function handleTap(key: string, hasPerson: boolean) {
    if (!assignment) return
    if (selectedSlot === null) {
      if (hasPerson) setSelectedSlot(key)
    } else if (selectedSlot === key) {
      setSelectedSlot(null)
    } else {
      applyAssignment(applyDrop(assignment, selectedSlot, key))
      setSelectedSlot(null)
    }
  }

  const dnd: DragCtx = {
    dragSource, dropTarget,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    selectedSlot,
    onTap: handleTap,
  }

  const absentCount = personnel.filter(p => p.absence).length
  const availableCount = personnel.length - absentCount
  const isDragging = dragSource !== null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {dutyDate && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate('/duty-calendar')}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-700 transition-colors shrink-0"
                title="Wróć do kalendarza"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate(`/crew-generator?date=${nextDutyDate(dutyDate)}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 hover:text-white text-xs transition-colors shrink-0"
              >
                <span>Następna służba</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-white">Tworzenie obsady</h1>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {dutyDate
                ? <span className="text-brand-400 font-medium">Służba: {formatPolishDate(dutyDate)}</span>
                : <><span className="text-emerald-500 font-medium">{availableCount}</span> dostępnych{absentCount > 0 && <> · <span className="text-red-400 font-medium">{absentCount}</span> nieobecnych</>}</>
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dutyDate && (
            <button
              onClick={() => setShowPrevDuty(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors',
                showPrevDuty
                  ? 'bg-slate-700 text-white'
                  : 'bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white',
              )}
              title="Obsada poprzedniej służby"
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Poprzednia służba</span>
            </button>
          )}
          <button
            onClick={() => setShowPersonnel(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white text-xs transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{showPersonnel ? 'Ukryj' : 'Personel'}</span>
          </button>
          {dutyDate && assignment && isDirty && (
            <button
              onClick={() => persistToSupabase(assignment)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : savedOk ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{saving ? 'Zapisuję…' : 'Zapisz'}</span>
            </button>
          )}
          {dutyDate && savedOk && !isDirty && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 px-2">
              <Check className="w-3.5 h-3.5" /> Zapisano
            </span>
          )}
          <button
            onClick={handleGenerate}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">{assignment ? 'Nowe losowanie' : 'Generuj obsadę'}</span>
            <span className="sm:hidden">{assignment ? 'Losuj' : 'Generuj'}</span>
          </button>
        </div>
      </div>

      {/* Previous duty reference panel */}
      {dutyDate && showPrevDuty && (
        <div className="shrink-0 border-b border-slate-800 bg-surface-900/40">
          <div className="px-4 sm:px-6 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Obsada poprzedniej służby —{' '}
              <span className="text-brand-400">{formatDateShort(previousDutyDate(dutyDate))}</span>
            </p>
          </div>
          <PrevDutyCompact assignment={prevAssignment} personnel={personnel} />
        </div>
      )}

      {/* Body */}
      <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
        {/* Personnel sidebar */}
        {showPersonnel && (
          <aside className="w-full sm:w-72 shrink-0 border-b sm:border-b-0 sm:border-r border-slate-800 overflow-y-auto p-3 space-y-1.5 max-h-56 sm:max-h-none">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                Stan osobowy
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAddingPerson(v => !v)}
                  className="text-[10px] text-brand-500 hover:text-brand-300 transition-colors flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Dodaj
                </button>
                <button
                  onClick={handleReset}
                  className="text-[10px] text-slate-700 hover:text-red-500 transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
            {addingPerson && (
              <AddPersonForm onAdd={addPerson} onCancel={() => setAddingPerson(false)} />
            )}
            {[...personnel].sort((a, b) => {
              const aAbsent = a.absence !== null ? 2 : (!assignment || isPersonInAssignment(assignment, a.id)) ? 0 : 1
              const bAbsent = b.absence !== null ? 2 : (!assignment || isPersonInAssignment(assignment, b.id)) ? 0 : 1
              if (aAbsent !== bAbsent) return aAbsent - bAbsent
              const aP = Math.min(...a.roles.map(r => ROLE_SORT_ORDER[r]))
              const bP = Math.min(...b.roles.map(r => ROLE_SORT_ORDER[r]))
              return aP - bP
            }).map(person => (
              <PersonnelRow
                key={person.id}
                person={person}
                onUpdate={updatePerson}
                onDelete={deletePerson}
                notAssigned={!person.absence && !!assignment && !isPersonInAssignment(assignment, person.id)}
              />
            ))}
          </aside>
        )}

        {/* Assignment board */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          {!assignment ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-700 gap-4 pb-16">
              <Zap className="w-12 h-12 opacity-20" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-500">Brak wygenerowanej obsady</p>
                <p className="text-xs text-slate-600 mt-1">Kliknij „Generuj obsadę" aby losowo przydzielić personel</p>
              </div>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors mt-2"
              >
                <Zap className="w-4 h-4" />
                Generuj obsadę
              </button>
            </div>
          ) : (
            <div className="space-y-8 max-w-4xl">
              {/* Special roles */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-3">
                  Role specjalne
                </p>
                <div className="flex flex-wrap gap-3">
                  <SpecialRoleCard
                    title="Dowódca zmiany"
                    personId={assignment.shiftCommanderId}
                    persons={personnel}
                    colorClass="text-brand-400"
                    borderClass="border-brand-900"
                    slotKey="special:shift-commander"
                    dnd={dnd}
                    onClear={assignment.shiftCommanderId ? () => clearSpecialRole('shiftCommander', assignment.shiftCommanderId!) : undefined}
                  />
                  {assignment.dutyOfficerIds.length > 0
                    ? assignment.dutyOfficerIds.map((id, idx) => (
                        <SpecialRoleCard
                          key={id}
                          title="Dyżurny"
                          personId={id}
                          persons={personnel}
                          colorClass="text-amber-400"
                          borderClass="border-amber-900"
                          slotKey={`special:duty-officer:${idx}`}
                          dnd={dnd}
                          onClear={() => clearSpecialRole('dutyOfficer', id)}
                        />
                      ))
                    : (
                        <SpecialRoleCard
                          title="Dyżurny"
                          personId={null}
                          persons={personnel}
                          colorClass="text-amber-400"
                          borderClass="border-amber-900"
                          slotKey="special:duty-officer:0"
                          dnd={dnd}
                        />
                      )
                  }
                </div>
              </div>

              {/* Obiad */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-2">
                  Obiad
                </p>
                <div className="flex gap-2">
                  {([true, false, null] as const).map(v => {
                    const label = v === true ? 'Jest obiad' : v === false ? 'Nie ma obiadu' : 'Brak danych'
                    const isActive = v === null ? assignment.dinner == null : assignment.dinner === v
                    const activeClass = v === true
                      ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
                      : v === false
                        ? 'bg-red-900/50 text-red-300 border-red-700'
                        : 'bg-surface-700 text-slate-300 border-slate-500'
                    return (
                      <button
                        key={String(v)}
                        onClick={() => applyAssignment({ ...assignment, dinner: v })}
                        className={cn(
                          'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                          isActive ? activeClass : 'bg-surface-800 text-slate-600 border-slate-700 hover:border-slate-500 hover:text-slate-400',
                        )}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Vehicles */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-3">
                  Obsada pojazdów
                </p>
                <div className="flex flex-wrap gap-4">
                  {assignment.vehicles.map(v => (
                    <VehicleCard
                      key={v.vehicleId}
                      vehicleId={v.vehicleId}
                      commanderId={v.commanderId}
                      driverId={v.driverId}
                      rescuerIds={v.rescuerIds}
                      persons={personnel}
                      dnd={dnd}
                    />
                  ))}
                </div>
              </div>

              {/* Rezerwa + Nieobecni */}
              {(assignment.unassignedIds.length > 0 || isDragging || personnel.some(p => p.absence)) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Rezerwa drop zone — always visible while dragging */}
                  {(assignment.unassignedIds.length > 0 || isDragging) && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-3">
                        Rezerwa / dyżur ({assignment.unassignedIds.length})
                      </p>
                      <div
                        className={cn(
                          'flex flex-wrap gap-2 min-h-[3rem] p-2 rounded-lg border border-dashed transition-colors',
                          dropTarget === 'unassigned'
                            ? 'border-brand-500 bg-brand-900/20'
                            : selectedSlot
                              ? 'border-slate-600 bg-surface-900/30 cursor-pointer'
                              : 'border-slate-700 bg-surface-900/30'
                        )}
                        onDragOver={e => { e.preventDefault(); setDropTarget('unassigned') }}
                        onDragLeave={e => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null)
                        }}
                        onDrop={e => {
                          e.preventDefault()
                          const srcKey = e.dataTransfer.getData('text/plain')
                          setDragSource(null)
                          setDropTarget(null)
                          if (!srcKey || !assignment) return
                          applyAssignment(applyDrop(assignment, srcKey, 'unassigned'))
                        }}
                        onClick={e => {
                          if (e.target === e.currentTarget && selectedSlot) {
                            handleTap('unassigned', false)
                          }
                        }}
                      >
                        {assignment.unassignedIds.map(id => (
                          <span
                            key={id}
                            draggable
                            onDragStart={e => handleDragStart(`unassigned:${id}`, e)}
                            onDragEnd={handleDragEnd}
                            onClick={e => { e.stopPropagation(); handleTap(`unassigned:${id}`, true) }}
                            className={cn(
                              'text-sm px-3 py-1.5 rounded-lg bg-surface-800 border text-slate-400',
                              'cursor-grab active:cursor-grabbing select-none transition-opacity',
                              dragSource === `unassigned:${id}` && 'opacity-30',
                              selectedSlot === `unassigned:${id}`
                                ? 'border-brand-600 ring-1 ring-brand-400 text-brand-200'
                                : 'border-slate-700',
                            )}
                          >
                            {resolveName(personnel, id)}
                          </span>
                        ))}
                        {assignment.unassignedIds.length === 0 && (
                          <span className="text-xs text-slate-700 italic self-center px-1">
                            Upuść / przenieś tutaj aby usunąć z obsady
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Nieobecni */}
                  {personnel.some(p => p.absence) && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-3">
                        Nieobecni ({personnel.filter(p => p.absence).length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {personnel.filter(p => p.absence).map(p => (
                          <span
                            key={p.id}
                            className="text-sm px-3 py-1.5 rounded-lg bg-surface-800 border border-red-900/40 text-slate-500 flex items-center gap-2"
                          >
                            <span className="line-through">{p.name}</span>
                            <span className="text-[10px] text-red-500">{ABSENCE_LABELS[p.absence!]}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Tap-to-swap indicator — fixed bar shown when a person is selected on mobile */}
      {selectedSlot && assignment && (() => {
        const pid = getPersonAtSlotKey(assignment, selectedSlot)
        if (!pid) return null
        return (
          <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-brand-950/95 backdrop-blur border-t border-brand-800/60 px-4 py-3 shadow-2xl">
            <p className="text-sm text-brand-100 min-w-0 truncate">
              <span className="font-semibold">{resolveName(personnel, pid)}</span>
              <span className="text-brand-400 ml-1.5">— wybierz docelowy slot</span>
            </p>
            <button
              onClick={() => setSelectedSlot(null)}
              className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-brand-800 hover:bg-brand-700 text-brand-200 transition-colors"
            >
              Anuluj
            </button>
          </div>
        )
      })()}
    </div>
  )
}
