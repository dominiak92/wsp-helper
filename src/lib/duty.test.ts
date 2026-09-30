import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isDutyDay, isDutyDayKey, isBillingStartKey, billingPeriodStartKey, addDaysKey,
  nextDutyKeys, currentOrNextDutyDate, previousDutyDate, nextDutyDate,
  formatDateShort, formatDateLong,
} from './duty'

describe('duty cycle (every 4 days, anchored 2026-05-01)', () => {
  it('recognises the anchor and every 4th day around it', () => {
    expect(isDutyDayKey('2026-05-01')).toBe(true)
    expect(isDutyDayKey('2026-05-05')).toBe(true)
    expect(isDutyDayKey('2026-04-27')).toBe(true) // before the anchor
    expect(isDutyDayKey('2026-05-02')).toBe(false)
    expect(isDutyDayKey('2026-04-28')).toBe(false)
  })

  it('isDutyDay uses 0-based months', () => {
    expect(isDutyDay(2026, 4, 1)).toBe(true)
    expect(isDutyDay(2026, 5, 1)).toBe(false)
  })

  it('steps to previous / next duty date across month and year boundaries', () => {
    expect(nextDutyDate('2026-05-29')).toBe('2026-06-02')
    expect(previousDutyDate('2026-05-01')).toBe('2026-04-27')
    expect(nextDutyDate('2026-12-30')).toBe('2027-01-03')
  })
})

describe('billing cycle (every 28 days, anchored 2026-04-21)', () => {
  it('marks period start days', () => {
    expect(isBillingStartKey('2026-04-21')).toBe(true)
    expect(isBillingStartKey('2026-05-19')).toBe(true)
    expect(isBillingStartKey('2026-05-20')).toBe(false)
  })

  it('finds the start of the period containing a date', () => {
    expect(billingPeriodStartKey('2026-04-21')).toBe('2026-04-21')
    expect(billingPeriodStartKey('2026-05-18')).toBe('2026-04-21')
    expect(billingPeriodStartKey('2026-05-19')).toBe('2026-05-19')
    expect(billingPeriodStartKey('2026-04-20')).toBe('2026-03-24') // before the anchor
  })
})

describe('addDaysKey', () => {
  it('handles month, year and leap-day boundaries', () => {
    expect(addDaysKey('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDaysKey('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('nextDutyKeys', () => {
  it('includes the start day when it is a duty day', () => {
    expect(nextDutyKeys(2, new Date(2026, 4, 1))).toEqual(['2026-05-01', '2026-05-05'])
  })

  it('stays aligned across the DST change (2026-03-29)', () => {
    expect(nextDutyKeys(3, new Date(2026, 2, 27))).toEqual(['2026-03-30', '2026-04-03', '2026-04-07'])
  })
})

describe('currentOrNextDutyDate', () => {
  afterEach(() => { vi.useRealTimers() })

  it('returns today on a duty day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 5, 10, 0))
    expect(currentOrNextDutyDate()).toBe('2026-05-05')
  })

  it('returns the upcoming duty day otherwise', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 2, 23, 30))
    expect(currentOrNextDutyDate()).toBe('2026-05-05')
  })
})

describe('date formatting (Polish)', () => {
  it('formats short and long dates', () => {
    expect(formatDateShort('2026-05-01')).toBe('1 maja')
    expect(formatDateLong('2026-05-01')).toBe('Piątek, 1 maja 2026')
  })
})
