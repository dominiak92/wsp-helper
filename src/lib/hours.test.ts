import { describe, it, expect } from 'vitest'
import {
  HOUR_VALUES, codeHours, isHourCode, deriveDayCodes, buildWorkHoursRows,
  computePeriods, periodStatFor, NORM,
} from './hours'
import { emptyAssignment, type ShiftAssignment } from './crew'

function assignment(patch: Partial<ShiftAssignment>): ShiftAssignment {
  return { ...emptyAssignment(), ...patch }
}

describe('hour values', () => {
  it('credits full-day leave as 24h but WH (wolna służba) as 0h', () => {
    expect(HOUR_VALUES['24']).toBe(24)
    expect(HOUR_VALUES.W).toBe(24)
    expect(HOUR_VALUES.L4).toBe(24)
    expect(HOUR_VALUES.WH).toBe(0)
    expect(HOUR_VALUES['8W']).toBe(8)
    expect(codeHours(null)).toBe(0)
  })

  it('validates codes', () => {
    expect(isHourCode('oddelegowanie')).toBe(true)
    expect(isHourCode('X')).toBe(false)
  })
})

describe('deriveDayCodes', () => {
  const a = assignment({
    shiftCommanderId: 'sc',
    dutyOfficerIds: ['do'],
    vehicles: emptyAssignment().vehicles.map(v =>
      v.vehicleId === 'gba' ? { ...v, commanderId: 'sc', driverId: 'dr', rescuerIds: ['r1', 'guest'] } : v,
    ),
    unassignedIds: ['res'],
    partial8hIds: ['res'],
    absenceMap: { abs: 'L4' },
  })
  const known = new Set(['sc', 'do', 'dr', 'r1', 'res', 'abs'])

  it('marks present people 24h, partial people 8h and absent people with their leave code', () => {
    expect(deriveDayCodes(a, known)).toEqual({ sc: '24', do: '24', dr: '24', r1: '24', res: '8', abs: 'L4' })
  })

  it('skips people not in knownIds (guests)', () => {
    expect(deriveDayCodes(a, known)).not.toHaveProperty('guest')
    expect(deriveDayCodes(a)).toHaveProperty('guest', '24')
  })

  it('lets an absence override presence', () => {
    const both = assignment({ unassignedIds: ['x'], absenceMap: { x: 'W' } })
    expect(deriveDayCodes(both)).toEqual({ x: 'W' })
  })
})

describe('buildWorkHoursRows', () => {
  it('skips invalid assignment JSON and normalises the date', () => {
    const rows = buildWorkHoursRows(
      [
        { duty_date: '2026-05-01T00:00:00', assignment_json: assignment({ unassignedIds: ['a'] }) },
        { duty_date: '2026-05-05', assignment_json: { broken: true } },
      ],
      new Set(['a']),
    )
    expect(rows).toEqual([{ person_id: 'a', date: '2026-05-01', code: '24' }])
  })
})

describe('computePeriods', () => {
  it('sums hours per 28-day period and carries a cumulative balance from the seed', () => {
    const periods = computePeriods({ '2026-04-21': '24', '2026-04-25': '24' }, 10, '2026-05-19')
    expect(periods.get('2026-04-21')).toEqual({ start: '2026-04-21', worked: 48, diff: 48 - NORM, cumulative: 10 + 48 - NORM })
    expect(periods.get('2026-05-19')?.cumulative).toBe(10 + 48 - NORM - NORM)
  })

  it('falls back to the seed for periods before tracking started', () => {
    const periods = computePeriods({}, 5, '2026-05-19')
    expect(periodStatFor(periods, '2026-04-21', 5)).toEqual({ start: '2026-04-21', worked: 0, diff: 0, cumulative: 5 })
  })
})
