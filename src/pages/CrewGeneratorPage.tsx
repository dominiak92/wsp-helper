import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { RefreshCw, Zap, Users, Plus, ArrowLeft, ArrowRight, Save, Check, History, X, UserPlus } from 'lucide-react'
import { previousDutyDate, nextDutyDate, formatDateShort, MONTHS_GEN } from '../lib/duty'
import { cn } from '../lib/utils'
import {
  Person, RoleType, AbsenceType, ShiftAssignment,
  ABSENCE_LABELS, ABSENCE_ORDER, ROLE_SORT_ORDER,
  DEFAULT_PERSONNEL, generateCrew, resolveName, applyDrop, isPersonInAssignment, removePersonFromAssignment,
  parseShiftAssignment, withGuests,
} from '../lib/crew'
import { supabase } from '../lib/supabase'
import { PersonnelRow, AddPersonForm } from '../components/crew/PersonnelPanel'
import type { DragCtx } from '../components/crew/AssignmentBoard'
import { getPersonAtSlotKey, VehicleCard, SpecialRoleCard } from '../components/crew/AssignmentBoard'
import { PrevDutyCompact } from '../components/crew/PrevDutyCompact'

function formatPolishDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`
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

  const [dataLoading, setDataLoading] = useState(!!dutyDate)

  const [showPersonnel, setShowPersonnel] = useState(false)
  const [addingPerson, setAddingPerson] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)
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
            isSoldier: !!row.is_soldier,
          })))
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Specific duty date mode — load personnel + assignment atomically to avoid race condition.
  // Absence for a given date lives exclusively in assignment.absenceMap, not in personnel table.
  useEffect(() => {
    if (!dutyDate) return
    setDataLoading(true)
    setAssignment(null)
    // Reset the cached row id — otherwise navigating to a date without a saved
    // assignment would keep the previous date's id and persistToSupabase would
    // UPDATE the wrong row instead of inserting a new one.
    assignmentIdRef.current = null
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
      const parsed = parseShiftAssignment(row?.assignment_json)
      if (parsed) {
        loadedAssignment = parsed
        assignmentIdRef.current = row!.id
      }
      if (pData && pData.length > 0) {
        setPersonnel(pData.map(pRow => ({
          id: pRow.id,
          name: pRow.name,
          roles: pRow.roles as RoleType[],
          preferredVehicleId: pRow.preferred_vehicle_id ?? undefined,
          // Use only the date-specific absenceMap — ignore global personnel.absence
          absence: (loadedAssignment?.absenceMap?.[pRow.id] ?? null) as AbsenceType | null,
          partial8h: !!loadedAssignment?.partial8hIds?.includes(pRow.id),
          isSoldier: !!pRow.is_soldier,
        })))
      }
      if (loadedAssignment) setAssignment(loadedAssignment)
      const prevParsed = parseShiftAssignment(prevData?.[0]?.assignment_json)
      if (prevParsed) setPrevAssignment(prevParsed)
      setDataLoading(false)
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

    if (assignment) {
      let next = assignment
      if (updated.absence !== null) {
        next = removePersonFromAssignment(next, updated.id)
        next = { ...next, absenceMap: { ...(next.absenceMap ?? {}), [updated.id]: updated.absence } }
      } else {
        const newMap = { ...(next.absenceMap ?? {}) }
        delete newMap[updated.id]
        next = { ...next, absenceMap: Object.keys(newMap).length > 0 ? newMap : undefined }
        if (!isPersonInAssignment(next, updated.id)) {
          next = { ...next, unassignedIds: [...next.unassignedIds, updated.id] }
        }
      }

      // Obecność tylko 8h (niezależna od przydziału — może być w wozie lub w rezerwie)
      const had8h = (next.partial8hIds ?? []).includes(updated.id)
      const want8h = !!updated.partial8h && updated.absence === null
      if (want8h !== had8h) {
        const ids = new Set(next.partial8hIds ?? [])
        if (want8h) ids.add(updated.id); else ids.delete(updated.id)
        next = { ...next, partial8hIds: ids.size ? [...ids] : undefined }
      }

      if (next !== assignment) applyAssignment(next)
    }

    supabase.from('personnel').upsert({
      id: updated.id,
      name: updated.name,
      roles: updated.roles,
      preferred_vehicle_id: updated.preferredVehicleId ?? null,
      is_soldier: !!updated.isSoldier,
      // When dutyDate is set, absence is stored only in assignment.absenceMap —
      // never write it back to the global personnel table.
      ...(dutyDate ? {} : { absence: updated.absence }),
    }).then(({ error }) => { if (error) console.error('[supabase] upsert personnel:', error) })
  }

  function clearSpecialRole(role: 'shiftCommander' | 'dutyOfficer', personId: string) {
    if (!assignment) return
    if (role === 'shiftCommander') {
      // Clear GBA commander if it's the same person, then derive fallback shift commander
      const next: ShiftAssignment = {
        ...assignment,
        shiftCommanderId: null,
        vehicles: assignment.vehicles.map(v =>
          v.vehicleId === 'gba' && v.commanderId === personId
            ? { ...v, commanderId: null }
            : v
        ),
        unassignedIds: [...assignment.unassignedIds, personId],
      }
      const fallback = next.vehicles
        .filter(v => v.vehicleId !== 'gba')
        .find(v => v.commanderId !== null)?.commanderId ?? null
      applyAssignment({ ...next, shiftCommanderId: fallback })
    } else {
      const base = { ...assignment, dutyOfficerIds: assignment.dutyOfficerIds.filter(id => id !== personId) }
      applyAssignment({ ...base, unassignedIds: [...base.unassignedIds, personId] })
    }
  }

  function handleGenerate() {
    const base = generateCrew(personnel)
    // Auto-generation works off the roster only — re-attach any ad-hoc guests
    // to the reserve so they are not lost when regenerating.
    const guests = assignment?.guests ?? []
    applyAssignment(guests.length
      ? { ...base, guests, unassignedIds: [...base.unassignedIds, ...guests.map(g => g.id)] }
      : base)
  }

  function addGuest() {
    const name = guestName.trim()
    if (!name || !assignment) return
    const id = `guest_${crypto.randomUUID()}`
    applyAssignment({
      ...assignment,
      guests: [...(assignment.guests ?? []), { id, name }],
      unassignedIds: [...assignment.unassignedIds, id],
    })
    setGuestName('')
    setAddingGuest(false)
  }

  function removeGuest(id: string) {
    if (!assignment) return
    const cleared = removePersonFromAssignment(assignment, id)
    applyAssignment({
      ...cleared,
      guests: (cleared.guests ?? []).filter(g => g.id !== id),
    })
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

  // Roster + ad-hoc guests — used for all name resolution on the board.
  const persons = withGuests(personnel, assignment)
  const guestIds = new Set((assignment?.guests ?? []).map(g => g.id))


  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {dutyDate && (
            <button
              onClick={() => navigate('/duty-calendar')}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-700 transition-colors shrink-0"
              title="Wróć do kalendarza"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
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
            <>
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
              <button
                onClick={() => navigate(`/crew-generator?date=${nextDutyDate(dutyDate)}`)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white transition-colors"
              >
                <span className="hidden sm:inline">Następna służba</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
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
          {dataLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !assignment ? (
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
                    persons={persons}
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
                          persons={persons}
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
                          persons={persons}
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
                      persons={persons}
                      dnd={dnd}
                    />
                  ))}
                </div>
              </div>

              {/* Rezerwa + Nieobecni */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Rezerwa drop zone — always visible */}
                  <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
                          Rezerwa ({assignment.unassignedIds.length})
                        </p>
                        <button
                          onClick={() => setAddingGuest(v => !v)}
                          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white transition-colors"
                          title="Dodaj osobę spoza składu (tylko na ten dzień)"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Gość
                        </button>
                      </div>
                      {addingGuest && (
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            autoFocus
                            value={guestName}
                            onChange={e => setGuestName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') addGuest()
                              if (e.key === 'Escape') { setAddingGuest(false); setGuestName('') }
                            }}
                            placeholder="Imię i nazwisko gościa…"
                            className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-surface-900 border border-slate-700 text-white placeholder:text-slate-600 focus:border-brand-600 focus:outline-none"
                          />
                          <button
                            onClick={addGuest}
                            disabled={!guestName.trim()}
                            className="text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Dodaj
                          </button>
                        </div>
                      )}
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
                        {assignment.unassignedIds.map(id => {
                          const isGuest = guestIds.has(id)
                          return (
                          <span
                            key={id}
                            draggable
                            onDragStart={e => handleDragStart(`unassigned:${id}`, e)}
                            onDragEnd={handleDragEnd}
                            onClick={e => { e.stopPropagation(); handleTap(`unassigned:${id}`, true) }}
                            className={cn(
                              'text-sm px-3 py-1.5 rounded-lg bg-surface-800 border text-slate-400 inline-flex items-center gap-1.5',
                              'cursor-grab active:cursor-grabbing select-none transition-opacity',
                              dragSource === `unassigned:${id}` && 'opacity-30',
                              selectedSlot === `unassigned:${id}`
                                ? 'border-brand-600 ring-1 ring-brand-400 text-brand-200'
                                : isGuest ? 'border-amber-700/60' : 'border-slate-700',
                            )}
                          >
                            {resolveName(persons, id)}
                            {isGuest && (
                              <>
                                <span className="text-[9px] uppercase tracking-wide text-amber-500 font-semibold">gość</span>
                                <button
                                  onClick={e => { e.stopPropagation(); removeGuest(id) }}
                                  title="Usuń gościa"
                                  className="text-slate-600 hover:text-red-400 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </span>
                          )
                        })}
                        {assignment.unassignedIds.length === 0 && (
                          <span className="text-xs text-slate-700 italic self-center px-1">
                            Upuść / przenieś tutaj aby usunąć z obsady
                          </span>
                        )}
                      </div>
                  </div>

                  {/* Nieobecni */}
                  {personnel.some(p => p.absence) && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-3">
                        Nieobecni ({personnel.filter(p => p.absence).length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {personnel.filter(p => p.absence).sort((a, b) => ABSENCE_ORDER.indexOf(a.absence!) - ABSENCE_ORDER.indexOf(b.absence!)).map(p => (
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
              <span className="font-semibold">{resolveName(persons, pid)}</span>
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
