export type RoleType =
  | 'SHIFT_COMMANDER'
  | 'VEHICLE_COMMANDER'
  | 'DUTY_OFFICER'
  | 'DRIVER_RESCUER'
  | 'RESCUER'

export const ALL_ROLES: RoleType[] = [
  'SHIFT_COMMANDER',
  'VEHICLE_COMMANDER',
  'DUTY_OFFICER',
  'DRIVER_RESCUER',
  'RESCUER',
]

export const ROLE_LABELS: Record<RoleType, string> = {
  SHIFT_COMMANDER: 'Dowódca zmiany',
  VEHICLE_COMMANDER: 'Dowódca zastępu',
  DUTY_OFFICER: 'Dyżurny',
  DRIVER_RESCUER: 'Kier.-ratownik',
  RESCUER: 'Ratownik',
}

export const ROLE_COLORS: Record<RoleType, string> = {
  SHIFT_COMMANDER: 'bg-brand-900/50 text-brand-300 border-brand-700/50',
  VEHICLE_COMMANDER: 'bg-purple-950 text-purple-300 border-purple-800',
  DUTY_OFFICER: 'bg-amber-950 text-amber-300 border-amber-800',
  DRIVER_RESCUER: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  RESCUER: 'bg-slate-800 text-slate-300 border-slate-700',
}

export type AbsenceType = 'WH' | '8W' | 'W' | 'oddelegowanie' | 'L4'

export const ABSENCE_LABELS: Record<AbsenceType, string> = {
  WH: 'WH – wolna służba',
  '8W': '8W – 8h wolnego',
  W: 'W – urlop',
  oddelegowanie: 'Oddelegowanie',
  L4: 'L4',
}

export const ABSENCE_ORDER: AbsenceType[] = ['WH', '8W', 'W', 'oddelegowanie', 'L4']

export interface Person {
  id: string
  name: string
  roles: RoleType[]
  preferredVehicleId?: string
  absence: AbsenceType | null
  login?: string | null
  isGuest?: boolean // ad-hoc person from another shift, stored only in the assignment
}

export const CREW_VEHICLE_IDS = ['gba', 'gcba532', 'gcba1060', 'gcba850'] as const
export type CrewVehicleId = (typeof CREW_VEHICLE_IDS)[number]

// Vehicles the auto-generator staffs. The airport truck (GCBA 8/50, brama 4,
// kryptonim 35) is staffed manually only — "jeżeli potrzeba".
export const AUTO_CREW_VEHICLE_IDS: CrewVehicleId[] = ['gba', 'gcba532', 'gcba1060']

export const VEHICLE_SEATS: Record<CrewVehicleId, number> = {
  gba: 4,
  gcba532: 3,
  gcba1060: 3,
  gcba850: 3,
}

// Extra rescuer slots shown below the divider — not counted in official capacity
export const VEHICLE_EXTRA_RESCUERS: Record<CrewVehicleId, number> = {
  gba: 2,
  gcba532: 0,
  gcba1060: 0,
  gcba850: 0,
}

export const CREW_VEHICLE_NAMES: Record<CrewVehicleId, string> = {
  gba: 'GBA 2,5/16',
  gcba532: 'GCBA 5/32',
  gcba1060: 'GCBA 10/60',
  gcba850: 'GCBA 8/50',
}

export const DEFAULT_PERSONNEL: Person[] = [
  { id: 'lukasz_s', name: 'Łukasz S.', roles: ['SHIFT_COMMANDER'], absence: null },
  { id: 'michal_l', name: 'Michał Ł.', roles: ['SHIFT_COMMANDER', 'VEHICLE_COMMANDER'], absence: null },
  { id: 'andrzej_s', name: 'Andrzej S.', roles: ['SHIFT_COMMANDER', 'VEHICLE_COMMANDER'], absence: null },
  { id: 'sebastian_d', name: 'Sebastian D.', roles: ['DUTY_OFFICER'], absence: null },
  { id: 'mateusz_m', name: 'Mateusz M.', roles: ['DUTY_OFFICER'], absence: null },
  { id: 'maciej_s', name: 'Maciej S.', roles: ['RESCUER'], absence: null },
  { id: 'pawel_t', name: 'Paweł T.', roles: ['RESCUER'], absence: null },
  { id: 'waldemar_w', name: 'Waldemar W.', roles: ['RESCUER'], absence: null },
  { id: 'maciej_sz', name: 'Maciej Sz.', roles: ['RESCUER'], absence: null },
  { id: 'zbigniew_c', name: 'Zbigniew C.', roles: ['RESCUER'], absence: null },
  { id: 'jaroslaw_k', name: 'Jarosław K.', roles: ['DRIVER_RESCUER'], preferredVehicleId: 'gcba1060', absence: null },
  { id: 'aleksander_k', name: 'Aleksander K.', roles: ['DRIVER_RESCUER'], absence: null },
  { id: 'andrzej_r', name: 'Andrzej R.', roles: ['DRIVER_RESCUER'], absence: null },
  { id: 'artur_r', name: 'Artur R.', roles: ['DRIVER_RESCUER'], absence: null },
]

export interface VehicleAssignment {
  vehicleId: CrewVehicleId
  commanderId: string | null
  driverId: string | null
  rescuerIds: string[]
}

// Ad-hoc person added by hand for a single duty date (e.g. someone from another
// shift). Lives inside the assignment JSON only — never written to the personnel
// table — so it is visible to everyone for that day but not part of the roster.
export interface Guest {
  id: string
  name: string
}

export interface ShiftAssignment {
  shiftCommanderId: string | null
  dutyOfficerIds: string[]
  vehicles: VehicleAssignment[]
  unassignedIds: string[]
  absenceMap?: Record<string, AbsenceType> // personId → absence type for this specific duty date
  guests?: Guest[]
  dinner?: boolean | null
}

// Build Person entries for an assignment's guests so name lookups / DnD work
// uniformly. Guests have no roles and never count as absent.
export function guestsAsPersons(a: ShiftAssignment | null | undefined): Person[] {
  return (a?.guests ?? []).map(g => ({ id: g.id, name: g.name, roles: [], absence: null, isGuest: true }))
}

// Merge an assignment's guests into a roster list for display.
export function withGuests(personnel: Person[], a: ShiftAssignment | null | undefined): Person[] {
  const guests = guestsAsPersons(a)
  return guests.length ? [...personnel, ...guests] : personnel
}

export function parseShiftAssignment(json: unknown): ShiftAssignment | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const obj = json as Record<string, unknown>
  if (!Array.isArray(obj.dutyOfficerIds)) return null
  if (!Array.isArray(obj.vehicles)) return null
  if (!Array.isArray(obj.unassignedIds)) return null
  let a = obj as unknown as ShiftAssignment
  // Normalise vehicles: ensure every crew vehicle has a slot, in canonical order.
  // This makes vehicles added later (e.g. the airport GCBA 8/50) appear on
  // assignments that were saved before the vehicle existed.
  const known = CREW_VEHICLE_IDS.map(id =>
    a.vehicles.find(v => v.vehicleId === id) ??
    { vehicleId: id, commanderId: null, driverId: null, rescuerIds: [] }
  )
  const extras = a.vehicles.filter(v => !CREW_VEHICLE_IDS.includes(v.vehicleId))
  a = { ...a, vehicles: [...known, ...extras] }
  // Normalise: if shiftCommanderId is missing, derive from first vehicle commander
  if (!a.shiftCommanderId) {
    const fallback = a.vehicles.find(v => v.commanderId)?.commanderId ?? null
    if (fallback) return { ...a, shiftCommanderId: fallback }
  }
  return a
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateCrew(personnel: Person[]): ShiftAssignment {
  // Auto-generation works off the roster only; ad-hoc guests are never assigned.
  const available = personnel.filter(p => !p.absence && !p.isGuest)
  const assigned = new Set<string>()

  function pool(role: RoleType): Person[] {
    return shuffle(available.filter(p => !assigned.has(p.id) && p.roles.includes(role)))
  }

  const isPureDuty = (p: Person) => p.roles.length === 1 && p.roles[0] === 'DUTY_OFFICER'

  // 1. All duty officers stay at station — assign every available DUTY_OFFICER
  const dutyOfficers = pool('DUTY_OFFICER')
  dutyOfficers.forEach(p => assigned.add(p.id))

  // 2. Shift commander — prefer pure SHIFT_COMMANDER (Łukasz S. when present)
  const shiftPool = pool('SHIFT_COMMANDER')
  const shiftCommander =
    shiftPool.find(p => !p.roles.includes('VEHICLE_COMMANDER')) ?? shiftPool[0] ?? null
  if (shiftCommander) assigned.add(shiftCommander.id)

  // 3. Drivers — prefer person's preferredVehicleId (auto-staffed vehicles only)
  const driverMap: Partial<Record<CrewVehicleId, string>> = {}
  for (const vid of AUTO_CREW_VEHICLE_IDS) {
    const driverPool = pool('DRIVER_RESCUER')
    const preferred = driverPool.find(p => p.preferredVehicleId === vid)
    const driver = preferred ?? driverPool[0] ?? null
    if (driver) { driverMap[vid] = driver.id; assigned.add(driver.id) }
  }

  // 4. Vehicle commanders: GBA → shift commander; then fill GCBA 5/32 and GCBA 10/60 if available
  const cmdMap: Partial<Record<CrewVehicleId, string>> = {}
  if (shiftCommander) {
    cmdMap['gba'] = shiftCommander.id
  } else {
    const fallback = pool('VEHICLE_COMMANDER')[0] ?? null
    if (fallback) { cmdMap['gba'] = fallback.id; assigned.add(fallback.id) }
  }
  const secondCdr = pool('VEHICLE_COMMANDER')[0] ?? null
  if (secondCdr) { cmdMap['gcba532'] = secondCdr.id; assigned.add(secondCdr.id) }
  const thirdCdr = pool('VEHICLE_COMMANDER')[0] ?? null
  if (thirdCdr) { cmdMap['gcba1060'] = thirdCdr.id; assigned.add(thirdCdr.id) }

  // 5. Fill remaining seats — pure duty officers never ride in vehicles
  const fillPool = shuffle(available.filter(p => !assigned.has(p.id) && !isPureDuty(p)))

  const vehicles: VehicleAssignment[] = CREW_VEHICLE_IDS.map(vid => {
    const commanderId = cmdMap[vid] ?? null
    const driverId = driverMap[vid] ?? null
    const rescuerIds: string[] = []
    // Only auto-fill seats for the primary vehicles; the airport truck is
    // left empty and staffed manually when needed.
    if (AUTO_CREW_VEHICLE_IDS.includes(vid)) {
      const cap = VEHICLE_SEATS[vid]
      let seats = 2 // always reserve commander + driver seats
      while (seats < cap) {
        const r = fillPool.find(p => !assigned.has(p.id))
        if (!r) break
        assigned.add(r.id)
        rescuerIds.push(r.id)
        seats++
      }
    }
    return { vehicleId: vid, commanderId, driverId, rescuerIds }
  })

  const absenceMap: Record<string, AbsenceType> = {}
  for (const p of personnel) {
    if (p.absence) absenceMap[p.id] = p.absence
  }

  // If no explicit shift commander, derive from first staffed vehicle commander
  const derivedShiftCmdId =
    shiftCommander?.id ?? vehicles.find(v => v.commanderId !== null)?.commanderId ?? null

  return {
    shiftCommanderId: derivedShiftCmdId,
    dutyOfficerIds: dutyOfficers.map(p => p.id),
    vehicles,
    unassignedIds: available.filter(p => !assigned.has(p.id)).map(p => p.id),
    absenceMap: Object.keys(absenceMap).length > 0 ? absenceMap : undefined,
  }
}

export function removePersonFromAssignment(a: ShiftAssignment, personId: string): ShiftAssignment {
  return {
    ...a,
    shiftCommanderId: a.shiftCommanderId === personId ? null : a.shiftCommanderId,
    dutyOfficerIds: a.dutyOfficerIds.filter(id => id !== personId),
    unassignedIds: a.unassignedIds.filter(id => id !== personId),
    vehicles: a.vehicles.map(v => ({
      ...v,
      commanderId: v.commanderId === personId ? null : v.commanderId,
      driverId: v.driverId === personId ? null : v.driverId,
      rescuerIds: v.rescuerIds.filter(id => id !== personId),
    })),
  }
}

export const ROLE_SORT_ORDER: Record<RoleType, number> = {
  SHIFT_COMMANDER: 0,
  VEHICLE_COMMANDER: 1,
  DUTY_OFFICER: 2,
  DRIVER_RESCUER: 3,
  RESCUER: 4,
}

export function isPersonInAssignment(a: ShiftAssignment, personId: string): boolean {
  if (a.shiftCommanderId === personId) return true
  if (a.dutyOfficerIds.includes(personId)) return true
  if (a.unassignedIds.includes(personId)) return true
  return a.vehicles.some(v =>
    v.commanderId === personId || v.driverId === personId || v.rescuerIds.includes(personId)
  )
}

export function resolveName(persons: Person[], id: string | null): string {
  if (!id) return '—'
  return persons.find(p => p.id === id)?.name ?? '—'
}

// Pojazd, do którego przypisana jest dana osoba w tej obsadzie (lub null).
export function findPersonVehicleId(a: ShiftAssignment, personId: string): CrewVehicleId | null {
  const v = a.vehicles.find(v =>
    v.commanderId === personId || v.driverId === personId || v.rescuerIds.includes(personId),
  )
  return v ? v.vehicleId : null
}

// ── Drag-and-drop helpers ─────────────────────────────────────────────────────
// Slot key format:
//   "v:{vehicleId}:commander"
//   "v:{vehicleId}:driver"
//   "v:{vehicleId}:rescuer:{index}"
//   "unassigned:{personId}"  (source — specific unassigned person)
//   "unassigned"             (target — the unassigned drop zone)

function getPersonAtSlot(a: ShiftAssignment, key: string): string | null {
  if (key === 'unassigned') return null
  const [ns, vid, role, idxStr] = key.split(':')
  if (ns === 'unassigned') return vid // 'unassigned:personId'
  if (ns === 'special') {
    if (vid === 'shift-commander') return a.shiftCommanderId
    if (vid === 'duty-officer') return a.dutyOfficerIds[Number(role)] ?? null
    return null
  }
  if (ns !== 'v') return null
  const v = a.vehicles.find(x => x.vehicleId === vid)
  if (!v) return null
  if (role === 'commander') return v.commanderId
  if (role === 'driver') return v.driverId
  if (role === 'rescuer') return v.rescuerIds[Number(idxStr)] ?? null
  return null
}

function setPersonAtSlot(a: ShiftAssignment, key: string, personId: string | null): ShiftAssignment {
  if (key === 'unassigned') {
    if (!personId) return a
    return { ...a, unassignedIds: [...a.unassignedIds, personId] }
  }
  const [ns, vid, role, idxStr] = key.split(':')
  if (ns === 'unassigned') {
    // 'unassigned:personId' — replace that specific entry or remove it
    const oldId = vid
    if (personId === null)
      return { ...a, unassignedIds: a.unassignedIds.filter(id => id !== oldId) }
    return { ...a, unassignedIds: a.unassignedIds.map(id => id === oldId ? personId : id) }
  }
  if (ns === 'special') {
    if (vid === 'shift-commander') {
      const gbaCurrentCmd = a.vehicles.find(v => v.vehicleId === 'gba')?.commanderId ?? null
      // Sync GBA only when GBA is already staffed (has a commander)
      if (gbaCurrentCmd !== null) {
        const withGba = {
          ...a,
          shiftCommanderId: personId,
          vehicles: a.vehicles.map(v =>
            v.vehicleId === 'gba' ? { ...v, commanderId: personId } : v
          ),
        }
        // If clearing shift commander, fall back to first other vehicle commander
        if (personId === null) {
          const fallback = withGba.vehicles
            .filter(v => v.vehicleId !== 'gba')
            .find(v => v.commanderId !== null)?.commanderId ?? null
          return { ...withGba, shiftCommanderId: fallback }
        }
        return withGba
      }
      return { ...a, shiftCommanderId: personId }
    }
    if (vid === 'duty-officer') {
      const idx = Number(role)
      if (personId === null)
        return { ...a, dutyOfficerIds: a.dutyOfficerIds.filter((_, i) => i !== idx) }
      const dutyOfficerIds = [...a.dutyOfficerIds]
      if (idx < dutyOfficerIds.length) dutyOfficerIds[idx] = personId
      else dutyOfficerIds.push(personId)
      return { ...a, dutyOfficerIds }
    }
    return a
  }
  if (ns !== 'v') return a
  const vehicles = a.vehicles.map(v => {
    if (v.vehicleId !== vid) return v
    if (role === 'commander') return { ...v, commanderId: personId }
    if (role === 'driver') return { ...v, driverId: personId }
    if (role === 'rescuer') {
      const idx = Number(idxStr)
      if (personId === null)
        return { ...v, rescuerIds: v.rescuerIds.filter((_, i) => i !== idx) }
      const rescuerIds = [...v.rescuerIds]
      if (idx < rescuerIds.length) rescuerIds[idx] = personId
      else rescuerIds.push(personId)
      return { ...v, rescuerIds }
    }
    return v
  })
  const result = { ...a, vehicles }
  // GBA commander drives shift commander — when GBA is cleared, fall back to next vehicle
  if (vid === 'gba' && role === 'commander') {
    if (personId !== null) {
      return { ...result, shiftCommanderId: personId }
    }
    const fallback = result.vehicles
      .filter(v => v.vehicleId !== 'gba')
      .find(v => v.commanderId !== null)?.commanderId ?? null
    return { ...result, shiftCommanderId: fallback }
  }
  return result
}

export function applyDrop(a: ShiftAssignment, srcKey: string, dstKey: string): ShiftAssignment {
  if (srcKey === dstKey) return a
  const srcPerson = getPersonAtSlot(a, srcKey)
  if (!srcPerson) return a
  const dstPerson = getPersonAtSlot(a, dstKey)
  let next = setPersonAtSlot(a, srcKey, dstPerson)
  next = setPersonAtSlot(next, dstKey, srcPerson)
  return next
}
