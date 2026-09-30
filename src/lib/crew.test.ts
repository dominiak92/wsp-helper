import { describe, it, expect } from 'vitest'
import {
  parseShiftAssignment, generateCrew, applyDrop, applySelfAbsence, withdrawSelfAbsence,
  emptyAssignment, findPersonSlot, isPersonInAssignment, CREW_VEHICLE_IDS, DEFAULT_PERSONNEL,
  type ShiftAssignment, type CrewVehicleId,
} from './crew'

function withVehicle(a: ShiftAssignment, id: CrewVehicleId, patch: Partial<ShiftAssignment['vehicles'][number]>): ShiftAssignment {
  return { ...a, vehicles: a.vehicles.map(v => (v.vehicleId === id ? { ...v, ...patch } : v)) }
}

function allAssignedIds(a: ShiftAssignment): string[] {
  return [
    ...(a.shiftCommanderId ? [a.shiftCommanderId] : []),
    ...a.dutyOfficerIds,
    ...a.unassignedIds,
    ...a.vehicles.flatMap(v => [v.commanderId, v.driverId, ...v.rescuerIds].filter((x): x is string => !!x)),
  ]
}

describe('parseShiftAssignment', () => {
  it('rejects malformed JSON', () => {
    expect(parseShiftAssignment(null)).toBeNull()
    expect(parseShiftAssignment([])).toBeNull()
    expect(parseShiftAssignment({ dutyOfficerIds: [], vehicles: [] })).toBeNull()
  })

  it('adds vehicles missing from older saves, in canonical order', () => {
    const parsed = parseShiftAssignment({
      shiftCommanderId: 'sc',
      dutyOfficerIds: [],
      unassignedIds: [],
      vehicles: [{ vehicleId: 'gcba1060', commanderId: null, driverId: 'd', rescuerIds: [] }],
    })
    expect(parsed?.vehicles.map(v => v.vehicleId)).toEqual([...CREW_VEHICLE_IDS])
    expect(parsed?.vehicles.find(v => v.vehicleId === 'gcba1060')?.driverId).toBe('d')
  })

  it('derives a missing shift commander from the first vehicle commander', () => {
    const parsed = parseShiftAssignment({
      dutyOfficerIds: [],
      unassignedIds: [],
      vehicles: [{ vehicleId: 'gcba532', commanderId: 'c', driverId: null, rescuerIds: [] }],
    })
    expect(parsed?.shiftCommanderId).toBe('c')
  })
})

describe('generateCrew', () => {
  const personnel = DEFAULT_PERSONNEL.map(p => (p.id === 'pawel_t' ? { ...p, absence: 'L4' as const } : p))

  it('keeps structural invariants across random runs', () => {
    for (let run = 0; run < 25; run++) {
      const a = generateCrew(personnel)
      const ids = allAssignedIds(a).filter(id => id !== a.shiftCommanderId) // SC also sits in GBA
      expect(new Set(ids).size).toBe(ids.length) // nobody twice
      expect(isPersonInAssignment(a, 'pawel_t')).toBe(false)
      expect(a.absenceMap).toEqual({ pawel_t: 'L4' })
      expect(a.dutyOfficerIds.sort()).toEqual(['mateusz_m', 'sebastian_d'])
      expect(a.vehicles.find(v => v.vehicleId === 'gcba850')).toEqual({
        vehicleId: 'gcba850', commanderId: null, driverId: null, rescuerIds: [],
      })
      expect(a.vehicles.find(v => v.vehicleId === 'gba')?.commanderId).toBe(a.shiftCommanderId)
    }
  })
})

describe('applyDrop', () => {
  it('moves a reserve person into an empty driver seat', () => {
    const a = { ...emptyAssignment(), unassignedIds: ['x'] }
    const next = applyDrop(a, 'unassigned:x', 'v:gcba532:driver')
    expect(next.unassignedIds).toEqual([])
    expect(next.vehicles.find(v => v.vehicleId === 'gcba532')?.driverId).toBe('x')
  })

  it('swaps two occupied seats', () => {
    let a = withVehicle(emptyAssignment(), 'gba', { driverId: 'd1' })
    a = withVehicle(a, 'gcba532', { driverId: 'd2' })
    const next = applyDrop(a, 'v:gba:driver', 'v:gcba532:driver')
    expect(next.vehicles.find(v => v.vehicleId === 'gba')?.driverId).toBe('d2')
    expect(next.vehicles.find(v => v.vehicleId === 'gcba532')?.driverId).toBe('d1')
  })

  it('makes the new GBA commander the shift commander', () => {
    const a = { ...emptyAssignment(), unassignedIds: ['c'] }
    const next = applyDrop(a, 'unassigned:c', 'v:gba:commander')
    expect(next.shiftCommanderId).toBe('c')
  })
})

describe('self-reported absence', () => {
  it('pulls a driver out and restores them on withdraw', () => {
    const a = withVehicle(emptyAssignment(), 'gcba532', { driverId: 'me' })
    const absent = applySelfAbsence(a, 'me', 'W')
    expect(isPersonInAssignment(absent, 'me')).toBe(false)
    expect(absent.absenceMap).toEqual({ me: 'W' })
    expect(absent.selfAbsences?.me).toEqual({ kind: 'vehicle', vehicleId: 'gcba532', role: 'driver' })

    const back = withdrawSelfAbsence(absent, 'me')
    expect(findPersonSlot(back, 'me')).toEqual({ kind: 'vehicle', vehicleId: 'gcba532', role: 'driver' })
    expect(back.absenceMap).toBeUndefined()
    expect(back.selfAbsences).toBeUndefined()
  })

  it('falls back to reserve when the old seat was taken meanwhile', () => {
    const a = withVehicle(emptyAssignment(), 'gcba532', { driverId: 'me' })
    const absent = withVehicle(applySelfAbsence(a, 'me', 'L4'), 'gcba532', { driverId: 'other' })
    const back = withdrawSelfAbsence(absent, 'me')
    expect(findPersonSlot(back, 'me')).toEqual({ kind: 'reserve' })
    expect(back.vehicles.find(v => v.vehicleId === 'gcba532')?.driverId).toBe('other')
  })

  it('restores a shift commander to both the SC role and the GBA commander seat', () => {
    const a = withVehicle({ ...emptyAssignment(), shiftCommanderId: 'sc' }, 'gba', { commanderId: 'sc' })
    const absent = applySelfAbsence(a, 'sc', 'WH')
    expect(absent.shiftCommanderId).toBeNull()
    expect(absent.vehicles.find(v => v.vehicleId === 'gba')?.commanderId).toBeNull()

    const back = withdrawSelfAbsence(absent, 'sc')
    expect(back.shiftCommanderId).toBe('sc')
    expect(back.vehicles.find(v => v.vehicleId === 'gba')?.commanderId).toBe('sc')
  })

  it('keeps other people’s absences intact', () => {
    const a = { ...emptyAssignment(), unassignedIds: ['me'], absenceMap: { other: 'L4' as const } }
    const back = withdrawSelfAbsence(applySelfAbsence(a, 'me', 'W'), 'me')
    expect(back.absenceMap).toEqual({ other: 'L4' })
  })
})
