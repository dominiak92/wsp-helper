import { useState, useEffect, useRef } from 'react'
import { Zap, Save, RefreshCw, Check, ChevronDown, ChevronUp } from 'lucide-react'
import {
  currentOrNextDutyDate, todayYmdKey,
  formatDateShort, formatDateLong,
} from '../../lib/duty'
import { cn } from '../../lib/utils'
import type { Person, RoleType, AbsenceType, ShiftAssignment } from '../../lib/crew'
import { parseShiftAssignment, guestsAsPersons } from '../../lib/crew'
import {
  ABSENCE_LABELS, ABSENCE_ORDER, CREW_VEHICLE_NAMES, VEHICLE_SEATS,
  generateCrew, removePersonFromAssignment, isPersonInAssignment,
} from '../../lib/crew'
import { supabase } from '../../lib/supabase'

// ── Slot helpers ───────────────────────────────────────────────────────────────

function getSlotOccupant(a: ShiftAssignment, slotKey: string): string | null {
  if (slotKey === 'shift-commander') return a.shiftCommanderId
  if (slotKey.startsWith('duty-officer:')) {
    return a.dutyOfficerIds[parseInt(slotKey.split(':')[1])] ?? null
  }
  const [ns, vid, role, idxStr] = slotKey.split(':')
  if (ns !== 'v') return null
  const v = a.vehicles.find(x => x.vehicleId === vid)
  if (!v) return null
  if (role === 'commander') return v.commanderId
  if (role === 'driver') return v.driverId
  if (role === 'rescuer') return v.rescuerIds[parseInt(idxStr)] ?? null
  return null
}

function applySlotPerson(
  a: ShiftAssignment,
  slotKey: string,
  personId: string | null,
): ShiftAssignment {
  if (slotKey === 'shift-commander') return { ...a, shiftCommanderId: personId }
  if (slotKey.startsWith('duty-officer:')) {
    const idx = parseInt(slotKey.split(':')[1])
    const ids = [...a.dutyOfficerIds]
    if (personId === null) {
      ids.splice(idx, 1)
    } else if (idx < ids.length) {
      ids[idx] = personId
    } else {
      ids.push(personId)
    }
    return { ...a, dutyOfficerIds: ids }
  }
  const [, vid, role, idxStr] = slotKey.split(':')
  const vehicles = a.vehicles.map(v => {
    if (v.vehicleId !== vid) return v
    if (role === 'commander') return { ...v, commanderId: personId }
    if (role === 'driver') return { ...v, driverId: personId }
    if (role === 'rescuer') {
      const idx = parseInt(idxStr)
      if (personId === null) return { ...v, rescuerIds: v.rescuerIds.filter((_, i) => i !== idx) }
      const rescuerIds = [...v.rescuerIds]
      if (idx < rescuerIds.length) rescuerIds[idx] = personId
      else rescuerIds.push(personId)
      return { ...v, rescuerIds }
    }
    return v
  })
  return { ...a, vehicles }
}

function setSlot(
  a: ShiftAssignment,
  slotKey: string,
  newPersonId: string | null,
): ShiftAssignment {
  let next = newPersonId ? removePersonFromAssignment(a, newPersonId) : a
  const displaced = getSlotOccupant(next, slotKey)
  if (displaced) {
    next = removePersonFromAssignment(next, displaced)
    next = { ...next, unassignedIds: [...next.unassignedIds, displaced] }
  }
  if (!newPersonId) return next
  return applySlotPerson(next, slotKey, newPersonId)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SlotRow({
  label, value, slotKey, personnel, onChange,
}: {
  label: string
  value: string | null
  slotKey: string
  personnel: Person[]
  onChange: (slotKey: string, personId: string | null) => void
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
      <select
        value={value ?? ''}
        onChange={e => onChange(slotKey, e.target.value || null)}
        className="flex-1 min-w-0 text-sm bg-surface-700 border border-slate-600 rounded-lg px-2 py-1.5 text-white outline-none focus:border-brand-500"
      >
        <option value="">— Brak —</option>
        {personnel.map(p => (
          <option key={p.id} value={p.id}>{p.partial8h ? `${p.name} (8h)` : p.name}</option>
        ))}
      </select>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function MobileCrewPage() {
  const dutyDate = currentOrNextDutyDate()
  const isToday = dutyDate === todayYmdKey()

  const [personnel, setPersonnel] = useState<Person[]>([])
  const [assignment, setAssignment] = useState<ShiftAssignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [showAbsences, setShowAbsences] = useState(false)
  const assignmentIdRef = useRef<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('personnel').select('*'),
      supabase
        .from('duty_assignments')
        .select('id, assignment_json')
        .eq('duty_date', dutyDate)
        .order('created_at', { ascending: false })
        .limit(1),
    ]).then(([{ data: pData }, { data: aData }]) => {
      const row = aData?.[0]
      const loaded = parseShiftAssignment(row?.assignment_json)
      if (loaded) assignmentIdRef.current = row!.id
      if (pData && pData.length > 0) {
        const roster: Person[] = pData.map(r => ({
          id: r.id,
          name: r.name,
          roles: r.roles as RoleType[],
          preferredVehicleId: r.preferred_vehicle_id ?? undefined,
          absence: (loaded?.absenceMap?.[r.id] ?? null) as AbsenceType | null,
          login: r.login ?? null,
          partial8h: !!loaded?.partial8hIds?.includes(r.id),
        }))
        // Include ad-hoc guests stored in the assignment so their names resolve
        setPersonnel([...roster, ...guestsAsPersons(loaded)])
      }
      if (loaded) setAssignment(loaded)
      setLoading(false)
    })
  }, [dutyDate])

  async function persistToSupabase(a: ShiftAssignment) {
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

  function applyAssignment(a: ShiftAssignment) {
    setAssignment(a)
    setIsDirty(true)
    setSavedOk(false)
  }

  function handleGenerate() {
    const base = generateCrew(personnel)
    // Re-attach any ad-hoc guests to the reserve so they survive regeneration.
    const guests = assignment?.guests ?? []
    applyAssignment(guests.length
      ? { ...base, guests, unassignedIds: [...base.unassignedIds, ...guests.map(g => g.id)] }
      : base)
  }

  function updateAbsence(personId: string, absence: AbsenceType | null) {
    setPersonnel(prev => prev.map(p => p.id === personId ? { ...p, absence } : p))
    if (!assignment) return
    let next = assignment
    if (absence !== null) {
      next = removePersonFromAssignment(next, personId)
      next = { ...next, absenceMap: { ...(next.absenceMap ?? {}), [personId]: absence } }
    } else {
      const newMap = { ...(next.absenceMap ?? {}) }
      delete newMap[personId]
      next = { ...next, absenceMap: Object.keys(newMap).length > 0 ? newMap : undefined }
      if (!isPersonInAssignment(next, personId)) {
        next = { ...next, unassignedIds: [...next.unassignedIds, personId] }
      }
    }
    applyAssignment(next)
  }

  function handleSlotChange(slotKey: string, personId: string | null) {
    if (!assignment) return
    applyAssignment(setSlot(assignment, slotKey, personId))
  }

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-4 animate-pulse">
        <div className="h-20 bg-surface-800 rounded-xl" />
        <div className="h-14 bg-surface-800 rounded-xl" />
        <div className="h-48 bg-surface-800 rounded-xl" />
        <div className="h-40 bg-surface-800 rounded-xl" />
      </div>
    )
  }

  const availablePersonnel = personnel.filter(p => !p.absence)
  const absentPersonnel = personnel
    .filter(p => p.absence)
    .sort((a, b) => ABSENCE_ORDER.indexOf(a.absence!) - ABSENCE_ORDER.indexOf(b.absence!))

  return (
    <div className="px-3 sm:px-5 py-4 space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {isToday ? 'Obsada dzisiejszej służby' : 'Obsada następnej służby'}
          </p>
          <h2 className="text-xl font-bold text-white mt-0.5">{formatDateShort(dutyDate)}</h2>
          <p className="text-xs text-slate-500">{formatDateLong(dutyDate)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {isDirty && (
            <button
              onClick={() => assignment && persistToSupabase(assignment)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-medium transition-colors"
            >
              {saving
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Zapisuję…' : 'Zapisz'}
            </button>
          )}
          {savedOk && !isDirty && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 px-1">
              <Check className="w-3.5 h-3.5" /> Zapisano
            </span>
          )}
          <button
            onClick={handleGenerate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            {assignment ? 'Losuj' : 'Generuj'}
          </button>
        </div>
      </div>

      {/* Absences (collapsible) */}
      <div className="bg-surface-800 rounded-xl border border-slate-700/40 overflow-hidden">
        <button
          onClick={() => setShowAbsences(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <p className="text-sm font-medium text-white">Nieobecności</p>
            <p className="text-[11px] text-slate-500">
              {absentPersonnel.length > 0
                ? `${absentPersonnel.length} nieobecnych — kliknij aby edytować`
                : 'Wszyscy obecni — kliknij aby edytować'}
            </p>
          </div>
          {showAbsences
            ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
        </button>
        {showAbsences && (
          <div className="border-t border-slate-800 divide-y divide-slate-800/60">
            {personnel.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <span className={cn(
                  'text-sm flex-1 truncate',
                  p.absence ? 'text-slate-500 line-through' : 'text-white',
                )}>
                  {p.name}
                </span>
                <select
                  value={p.absence ?? ''}
                  onChange={e => updateAbsence(p.id, (e.target.value as AbsenceType) || null)}
                  className={cn(
                    'text-xs py-1 px-1.5 rounded border bg-surface-900 cursor-pointer outline-none shrink-0',
                    p.absence ? 'text-red-400 border-red-800' : 'text-slate-500 border-slate-700',
                  )}
                >
                  <option value="">Obecny</option>
                  {(Object.keys(ABSENCE_LABELS) as AbsenceType[]).map(k => (
                    <option key={k} value={k}>{ABSENCE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignment board */}
      {!assignment ? (
        <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-8 flex flex-col items-center gap-4 text-center">
          <Zap className="w-10 h-10 text-slate-700" />
          <div>
            <p className="text-sm font-medium text-slate-400">Brak wygenerowanej obsady</p>
            <p className="text-xs text-slate-600 mt-1">
              Kliknij „Generuj" aby automatycznie przydzielić personel
            </p>
          </div>
          <button
            onClick={handleGenerate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
          >
            <Zap className="w-4 h-4" /> Generuj obsadę
          </button>
        </div>
      ) : (
        <div className="space-y-3">

          {/* Special roles */}
          <div className="bg-surface-800 rounded-xl border border-slate-700/40 overflow-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 pt-3 pb-1">
              Role specjalne
            </p>
            <div className="px-4 pb-3">
              <SlotRow
                label="Dowódca zmiany"
                value={assignment.shiftCommanderId}
                slotKey="shift-commander"
                personnel={availablePersonnel}
                onChange={handleSlotChange}
              />
              {[0, 1].map(idx => (
                <SlotRow
                  key={idx}
                  label="Dyżurny"
                  value={assignment.dutyOfficerIds[idx] ?? null}
                  slotKey={`duty-officer:${idx}`}
                  personnel={availablePersonnel}
                  onChange={handleSlotChange}
                />
              ))}
            </div>
          </div>

          {/* Vehicle cards */}
          {assignment.vehicles.map(v => {
            const vid = v.vehicleId as keyof typeof CREW_VEHICLE_NAMES
            const cap = VEHICLE_SEATS[vid as keyof typeof VEHICLE_SEATS] ?? 0
            const filled =
              (v.commanderId ? 1 : 0) +
              (v.driverId && v.driverId !== v.commanderId ? 1 : 0) +
              v.rescuerIds.length
            const full = filled >= cap
            const pfx = `v:${v.vehicleId}`

            return (
              <div key={v.vehicleId} className={cn(
                'bg-surface-800 rounded-xl border overflow-hidden',
                full ? 'border-emerald-900/60' : 'border-amber-900/40',
              )}>
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    {CREW_VEHICLE_NAMES[vid] ?? v.vehicleId}
                  </p>
                  <span className={cn(
                    'text-xs font-mono px-1.5 py-0.5 rounded font-semibold',
                    full
                      ? 'bg-emerald-900/50 text-emerald-400'
                      : 'bg-amber-900/30 text-amber-400',
                  )}>
                    {filled}/{cap}
                  </span>
                </div>
                <div className="px-4 pb-3">
                  <SlotRow
                    label="Dowódca zastępu"
                    value={v.commanderId}
                    slotKey={`${pfx}:commander`}
                    personnel={availablePersonnel}
                    onChange={handleSlotChange}
                  />
                  <SlotRow
                    label="Kierowca"
                    value={v.driverId}
                    slotKey={`${pfx}:driver`}
                    personnel={availablePersonnel}
                    onChange={handleSlotChange}
                  />
                  {v.rescuerIds.map((id, i) => (
                    <SlotRow
                      key={i}
                      label="Ratownik"
                      value={id}
                      slotKey={`${pfx}:rescuer:${i}`}
                      personnel={availablePersonnel}
                      onChange={handleSlotChange}
                    />
                  ))}
                  {Array.from({ length: Math.max(0, cap - filled) }).map((_, i) => (
                    <SlotRow
                      key={`e${i}`}
                      label="Ratownik"
                      value={null}
                      slotKey={`${pfx}:rescuer:${v.rescuerIds.length + i}`}
                      personnel={availablePersonnel}
                      onChange={handleSlotChange}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Reserve */}
          {assignment.unassignedIds.length > 0 && (
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                Rezerwa ({assignment.unassignedIds.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {assignment.unassignedIds.map(id => (
                  <span
                    key={id}
                    className="text-sm px-3 py-1.5 rounded-lg bg-surface-900 border border-slate-700 text-slate-400"
                  >
                    {personnel.find(p => p.id === id)?.name ?? '—'}
                  </span>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
