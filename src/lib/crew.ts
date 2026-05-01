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
  SHIFT_COMMANDER: 'Ddca zmiany',
  VEHICLE_COMMANDER: 'Ddca zastępu',
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

export interface Person {
  id: string
  name: string
  roles: RoleType[]
  preferredVehicleId?: string
  absence: AbsenceType | null
}

export const CREW_VEHICLE_IDS = ['gba', 'gcba532', 'gcba1060'] as const
export type CrewVehicleId = (typeof CREW_VEHICLE_IDS)[number]

export const VEHICLE_SEATS: Record<CrewVehicleId, number> = {
  gba: 4,
  gcba532: 3,
  gcba1060: 3,
}

export const CREW_VEHICLE_NAMES: Record<CrewVehicleId, string> = {
  gba: 'GBA 2,5/16',
  gcba532: 'GCBA 5/32',
  gcba1060: 'GCBA 10/60',
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
  { id: 'maciej_sk', name: 'Maciej Sk.', roles: ['RESCUER'], absence: null },
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

export interface ShiftAssignment {
  shiftCommanderId: string | null
  dutyOfficerId: string | null
  vehicles: VehicleAssignment[]
  unassignedIds: string[]
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
  const available = personnel.filter(p => !p.absence)
  const assigned = new Set<string>()

  function pool(role: RoleType): Person[] {
    return shuffle(available.filter(p => !assigned.has(p.id) && p.roles.includes(role)))
  }

  // Pure duty-officer check — people whose ONLY role is DUTY_OFFICER never go to vehicles
  const isPureDuty = (p: Person) => p.roles.length === 1 && p.roles[0] === 'DUTY_OFFICER'

  // 1. Duty officer (stays at station, never in a vehicle)
  const dutyOfficer = pool('DUTY_OFFICER')[0] ?? null
  if (dutyOfficer) assigned.add(dutyOfficer.id)

  // 2. Shift commander — prefer the person whose ONLY role is SHIFT_COMMANDER (Łukasz S.)
  //    If he's absent, fall back to someone with SHIFT_COMMANDER + VEHICLE_COMMANDER
  const shiftPool = pool('SHIFT_COMMANDER')
  const shiftCommander =
    shiftPool.find(p => !p.roles.includes('VEHICLE_COMMANDER')) ?? shiftPool[0] ?? null
  if (shiftCommander) assigned.add(shiftCommander.id)

  // 3. Drivers — prefer person's preferredVehicleId
  const driverMap: Partial<Record<CrewVehicleId, string>> = {}
  for (const vid of CREW_VEHICLE_IDS) {
    const driverPool = pool('DRIVER_RESCUER')
    const preferred = driverPool.find(p => p.preferredVehicleId === vid)
    const driver = preferred ?? driverPool[0] ?? null
    if (driver) { driverMap[vid] = driver.id; assigned.add(driver.id) }
  }

  // 4. Vehicle commanders: shift commander → GBA; optional 2nd → GCBA 5/32
  const cmdMap: Partial<Record<CrewVehicleId, string>> = {}
  if (shiftCommander) {
    cmdMap['gba'] = shiftCommander.id
  } else {
    const fallback = pool('VEHICLE_COMMANDER')[0] ?? null
    if (fallback) { cmdMap['gba'] = fallback.id; assigned.add(fallback.id) }
  }
  const secondCdr = pool('VEHICLE_COMMANDER')[0] ?? null
  if (secondCdr) { cmdMap['gcba532'] = secondCdr.id; assigned.add(secondCdr.id) }

  // 5. Fill remaining seats — pure duty officers never go into vehicles
  const fillPool = shuffle(available.filter(p => !assigned.has(p.id) && !isPureDuty(p)))

  const vehicles: VehicleAssignment[] = CREW_VEHICLE_IDS.map(vid => {
    const cap = VEHICLE_SEATS[vid]
    const commanderId = cmdMap[vid] ?? null
    const driverId = driverMap[vid] ?? null
    let seats = (commanderId ? 1 : 0) + (driverId && driverId !== commanderId ? 1 : 0)
    const rescuerIds: string[] = []
    while (seats < cap) {
      const r = fillPool.find(p => !assigned.has(p.id))
      if (!r) break
      assigned.add(r.id)
      rescuerIds.push(r.id)
      seats++
    }
    return { vehicleId: vid, commanderId, driverId, rescuerIds }
  })

  return {
    shiftCommanderId: shiftCommander?.id ?? null,
    dutyOfficerId: dutyOfficer?.id ?? null,
    vehicles,
    unassignedIds: available.filter(p => !assigned.has(p.id)).map(p => p.id),
  }
}

export function resolveName(persons: Person[], id: string | null): string {
  if (!id) return '—'
  return persons.find(p => p.id === id)?.name ?? '—'
}
