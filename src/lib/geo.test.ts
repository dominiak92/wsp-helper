import { describe, it, expect } from 'vitest'
import { buildRoadRegex, computeBearing, shortestAngleDelta, vehicleSizeForZoom } from './geo'

describe('computeBearing', () => {
  it('returns compass bearings for the cardinal directions', () => {
    expect(computeBearing(52, 15, 53, 15)).toBeCloseTo(0)
    expect(computeBearing(0, 0, 0, 1)).toBeCloseTo(90)
    expect(computeBearing(53, 15, 52, 15)).toBeCloseTo(180)
    expect(computeBearing(0, 1, 0, 0)).toBeCloseTo(270)
  })
})

describe('shortestAngleDelta', () => {
  it('wraps around north instead of spinning the long way', () => {
    expect(shortestAngleDelta(350, 10)).toBe(20)
    expect(shortestAngleDelta(10, 350)).toBe(-20)
    expect(shortestAngleDelta(90, 90)).toBe(0)
  })
})

describe('buildRoadRegex', () => {
  it('guards numeric edges so "12" does not match "123"', () => {
    const re = new RegExp(buildRoadRegex('12'))
    expect(re.test('DW 12')).toBe(true)
    expect(re.test('12')).toBe(true)
    expect(re.test('123')).toBe(false)
    expect(re.test('112')).toBe(false)
  })

  it('escapes regex metacharacters', () => {
    expect(new RegExp(buildRoadRegex('a.b')).test('axb')).toBe(false)
  })
})

describe('vehicleSizeForZoom', () => {
  it('clamps between 34 and 96 px', () => {
    expect(vehicleSizeForZoom(0)).toBe(34)
    expect(vehicleSizeForZoom(12)).toBe(49)
    expect(vehicleSizeForZoom(20)).toBe(96)
  })
})
