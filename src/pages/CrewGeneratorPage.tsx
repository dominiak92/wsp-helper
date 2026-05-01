import { useState } from 'react'
import { RefreshCw, Zap, Pencil, X, Users } from 'lucide-react'
import { cn } from '../lib/utils'
import {
  Person, RoleType, AbsenceType, ShiftAssignment,
  ALL_ROLES, ROLE_LABELS, ROLE_COLORS, ABSENCE_LABELS,
  CREW_VEHICLE_NAMES, VEHICLE_SEATS,
  DEFAULT_PERSONNEL, generateCrew, resolveName,
} from '../lib/crew'

// ── Helpers ───────────────────────────────────────────────────────────────────

function RoleChip({ role }: { role: RoleType }) {
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium leading-none', ROLE_COLORS[role])}>
      {ROLE_LABELS[role]}
    </span>
  )
}

function AbsenceSelect({ value, onChange }: { value: AbsenceType | null; onChange: (v: AbsenceType | null) => void }) {
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

function PersonnelRow({ person, onUpdate }: { person: Person; onUpdate: (p: Person) => void }) {
  const [editingRoles, setEditingRoles] = useState(false)
  const absent = !!person.absence

  function toggleRole(role: RoleType) {
    const has = person.roles.includes(role)
    if (has && person.roles.length === 1) return
    const roles = has ? person.roles.filter(r => r !== role) : [...person.roles, role]
    onUpdate({ ...person, roles })
  }

  return (
    <div className={cn('p-2 rounded-lg border border-slate-800 bg-surface-900 transition-opacity', absent && 'opacity-50')}>
      <div className="flex items-center gap-1.5">
        <span className={cn('text-sm font-medium text-white flex-1 truncate', absent && 'line-through')}>
          {person.name}
        </span>
        <button
          onClick={() => setEditingRoles(v => !v)}
          className="text-slate-600 hover:text-slate-300 transition-colors shrink-0"
          title="Edytuj role"
        >
          {editingRoles ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
        </button>
        <AbsenceSelect value={person.absence} onChange={v => onUpdate({ ...person, absence: v })} />
      </div>

      <div className="flex gap-1 flex-wrap mt-1.5">
        {person.roles.map(r => <RoleChip key={r} role={r} />)}
      </div>

      {editingRoles && (
        <div className="mt-2 pt-2 border-t border-slate-800 flex gap-1 flex-wrap">
          {ALL_ROLES.map(role => {
            const active = person.roles.includes(role)
            return (
              <button
                key={role}
                onClick={() => toggleRole(role)}
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                  active ? ROLE_COLORS[role] : 'text-slate-600 border-slate-700 hover:text-slate-400 hover:border-slate-500'
                )}
              >
                {ROLE_LABELS[role]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Slot row in vehicle card ───────────────────────────────────────────────────

function SlotRow({
  label,
  personId,
  persons,
  highlight = false,
  empty = false,
}: {
  label: string
  personId: string | null
  persons: Person[]
  highlight?: boolean
  empty?: boolean
}) {
  const name = resolveName(persons, personId)
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-[10px] text-slate-600 w-20 shrink-0 uppercase tracking-wide">{label}</span>
      <span className={cn(
        'text-sm font-medium truncate',
        empty || !personId ? 'text-slate-700 italic text-xs' : highlight ? 'text-brand-300' : 'text-white',
      )}>
        {empty ? 'brak' : name}
      </span>
    </div>
  )
}

// ── Vehicle card ──────────────────────────────────────────────────────────────

function VehicleCard({
  vehicleId, commanderId, driverId, rescuerIds, persons,
}: {
  vehicleId: string
  commanderId: string | null
  driverId: string | null
  rescuerIds: string[]
  persons: Person[]
}) {
  const vid = vehicleId as keyof typeof CREW_VEHICLE_NAMES
  const name = CREW_VEHICLE_NAMES[vid] ?? vehicleId
  const cap = VEHICLE_SEATS[vid as keyof typeof VEHICLE_SEATS] ?? 0
  const filled = (commanderId ? 1 : 0) + (driverId && driverId !== commanderId ? 1 : 0) + rescuerIds.length
  const full = filled >= cap

  return (
    <div className={cn(
      'flex-1 min-w-[180px] rounded-xl border p-4 bg-surface-800',
      full ? 'border-emerald-900' : 'border-amber-900/60'
    )}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-white">{name}</h3>
        <span className={cn(
          'text-xs font-mono px-1.5 py-0.5 rounded font-semibold',
          full ? 'bg-emerald-900/50 text-emerald-400' : 'bg-amber-900/30 text-amber-400'
        )}>
          {filled}/{cap}
        </span>
      </div>

      <div className="divide-y divide-slate-800/80 mt-2">
        {commanderId && (
          <SlotRow label="Ddca zast." personId={commanderId} persons={persons} highlight />
        )}
        <SlotRow label="Kierowca" personId={driverId} persons={persons} empty={!driverId} />
        {rescuerIds.map((id, i) => (
          <SlotRow key={i} label="Ratownik" personId={id} persons={persons} />
        ))}
        {Array.from({ length: Math.max(0, cap - filled) }).map((_, i) => (
          <SlotRow key={`e${i}`} label="Ratownik" personId={null} persons={persons} empty />
        ))}
      </div>
    </div>
  )
}

// ── Special role card ─────────────────────────────────────────────────────────

function SpecialRoleCard({
  title, personId, persons, colorClass, borderClass,
}: {
  title: string
  personId: string | null
  persons: Person[]
  colorClass: string
  borderClass: string
}) {
  return (
    <div className={cn('rounded-xl border p-4 bg-surface-800 min-w-[140px]', borderClass)}>
      <p className={cn('text-[10px] uppercase tracking-widest font-semibold mb-1.5', colorClass)}>{title}</p>
      <p className="text-sm font-bold text-white">{resolveName(persons, personId)}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CrewGeneratorPage() {
  const [personnel, setPersonnel] = useState<Person[]>(() => {
    try {
      const s = localStorage.getItem('wsp-crew-personnel')
      return s ? JSON.parse(s) : DEFAULT_PERSONNEL
    } catch {
      return DEFAULT_PERSONNEL
    }
  })

  const [assignment, setAssignment] = useState<ShiftAssignment | null>(() => {
    try {
      const s = localStorage.getItem('wsp-crew-assignment')
      return s ? JSON.parse(s) : null
    } catch {
      return null
    }
  })

  const [showPersonnel, setShowPersonnel] = useState(true)

  function updatePerson(updated: Person) {
    setPersonnel(prev => {
      const next = prev.map(p => p.id === updated.id ? updated : p)
      localStorage.setItem('wsp-crew-personnel', JSON.stringify(next))
      return next
    })
  }

  function handleGenerate() {
    const result = generateCrew(personnel)
    setAssignment(result)
    localStorage.setItem('wsp-crew-assignment', JSON.stringify(result))
  }

  function handleReset() {
    if (!confirm('Zresetować dane personelu do domyślnych?')) return
    setPersonnel(DEFAULT_PERSONNEL)
    setAssignment(null)
    localStorage.removeItem('wsp-crew-personnel')
    localStorage.removeItem('wsp-crew-assignment')
  }

  const absentCount = personnel.filter(p => p.absence).length
  const availableCount = personnel.length - absentCount

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white">Generator obsady</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="text-emerald-500 font-medium">{availableCount}</span> dostępnych
            {absentCount > 0 && (
              <> · <span className="text-red-400 font-medium">{absentCount}</span> nieobecnych</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPersonnel(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-400 hover:text-white text-xs transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            {showPersonnel ? 'Ukryj' : 'Personel'}
          </button>
          {assignment && (
            <button
              onClick={handleGenerate}
              title="Reroll — nowe losowanie"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-300 hover:text-white text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleGenerate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
          >
            <Zap className="w-4 h-4" />
            {assignment ? 'Nowe losowanie' : 'Generuj obsadę'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Personnel sidebar */}
        {showPersonnel && (
          <aside className="w-80 shrink-0 border-r border-slate-800 overflow-y-auto p-3 space-y-1.5">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                Stan osobowy
              </span>
              <button
                onClick={handleReset}
                className="text-[10px] text-slate-700 hover:text-red-500 transition-colors"
              >
                Reset
              </button>
            </div>
            {personnel.map(person => (
              <PersonnelRow key={person.id} person={person} onUpdate={updatePerson} />
            ))}
          </aside>
        )}

        {/* Assignment board */}
        <main className="flex-1 overflow-y-auto p-6">
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
                  />
                  <SpecialRoleCard
                    title="Dyżurny"
                    personId={assignment.dutyOfficerId}
                    persons={personnel}
                    colorClass="text-amber-400"
                    borderClass="border-amber-900"
                  />
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
                    />
                  ))}
                </div>
              </div>

              {/* Unassigned */}
              {assignment.unassignedIds.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold mb-3">
                    Nieprzydzieleni ({assignment.unassignedIds.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {assignment.unassignedIds.map(id => (
                      <span
                        key={id}
                        className="text-sm px-3 py-1.5 rounded-lg bg-surface-800 border border-slate-700 text-slate-400"
                      >
                        {resolveName(personnel, id)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
