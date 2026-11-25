import { describe, it, expect } from 'vitest'
import {
  daysBetweenKeys, qualStatus, qualTitle, isApprover, urgentQualifications,
  formatDaysLeft, formatQualDate, formatRemindDays, type Qualification,
  qualLevel, remainingFraction, formatRemaining, formatRemainingShort,
  isPlanned, plannedPassed, compareAttention, needsAttention,
} from './qualifications'

function q(partial: Partial<Qualification>): Qualification {
  return {
    id: 'x', person_id: 'p', kind: 'komora', label: null, valid_until: null, remind_days: 182,
    pending_valid_until: null, pending_by: null, pending_at: null, approved_by: null, approved_at: null,
    ...partial,
  }
}

describe('daysBetweenKeys', () => {
  it('counts calendar days across DST and year boundaries', () => {
    expect(daysBetweenKeys('2026-11-25', '2026-11-25')).toBe(0)
    expect(daysBetweenKeys('2026-03-28', '2026-03-30')).toBe(2) // DST change in Poland
    expect(daysBetweenKeys('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetweenKeys('2027-01-21', '2026-11-25')).toBe(-57)
  })
})

describe('qualStatus', () => {
  const today = '2026-11-25'
  it('is valid through the expiry day itself', () => {
    expect(qualStatus(q({ valid_until: today }), today)).toBe('soon')
    expect(qualStatus(q({ valid_until: '2026-11-24' }), today)).toBe('expired')
  })
  it('uses the per-item reminder window', () => {
    expect(qualStatus(q({ valid_until: '2027-01-21', remind_days: 182 }), today)).toBe('soon')
    expect(qualStatus(q({ valid_until: '2027-01-21', remind_days: 30 }), today)).toBe('ok')
  })
  it('reports a missing date', () => {
    expect(qualStatus(q({}), today)).toBe('missing')
  })
})

describe('urgentQualifications', () => {
  it('keeps expired and soon-ending items, most urgent first', () => {
    const items = [
      q({ id: 'later', valid_until: '2027-01-20' }),
      q({ id: 'far', valid_until: '2028-01-01' }),
      q({ id: 'expired', valid_until: '2026-10-01' }),
      q({ id: 'none' }),
    ]
    expect(urgentQualifications(items, '2026-11-25', 60).map(i => i.id)).toEqual(['expired', 'later'])
  })
})

describe('labels', () => {
  it('names standard and custom items', () => {
    expect(qualTitle(q({ kind: 'badania' }))).toBe('Badania okresowe')
    expect(qualTitle(q({ kind: 'custom', label: ' Prawo jazdy C ' }))).toBe('Prawo jazdy C')
    expect(qualTitle(q({ kind: 'custom', label: '' }))).toBe('Własny termin')
  })
  it('formats dates and day counts in Polish', () => {
    expect(formatQualDate('2029-01-27')).toBe('27.01.2029')
    expect(formatDaysLeft(1)).toBe('za 1 dzień')
    expect(formatDaysLeft(57)).toBe('za 57 dni')
    expect(formatDaysLeft(0)).toBe('kończy się dziś')
    expect(formatDaysLeft(-3)).toBe('po terminie 3 dni')
    expect(formatRemindDays(182)).toBe('pół roku wcześniej')
    expect(formatRemindDays(30)).toBe('30 dni wcześniej')
  })
})

describe('isApprover', () => {
  it('allows admins and shift commanders only', () => {
    expect(isApprover([], 'admin')).toBe(true)
    expect(isApprover(['SHIFT_COMMANDER'], 'user')).toBe(true)
    expect(isApprover(['VEHICLE_COMMANDER'], 'user')).toBe(false)
    expect(isApprover(['RESCUER', 'DUTY_OFFICER'], 'user')).toBe(false)
    expect(isApprover(undefined, 'user')).toBe(false)
  })
})

describe('qualLevel / remainingFraction', () => {
  const today = '2026-11-25'
  it('splits the reminder window into soon and critical', () => {
    expect(qualLevel(q({ valid_until: '2027-01-21' }), today)).toBe('soon')       // 57 days
    expect(qualLevel(q({ valid_until: '2026-12-20' }), today)).toBe('critical')   // 25 days
    expect(qualLevel(q({ valid_until: '2026-12-20', remind_days: 14 }), today)).toBe('ok')
    expect(qualLevel(q({ valid_until: '2026-11-01' }), today)).toBe('expired')
    expect(qualLevel(q({}), today)).toBe('missing')
  })
  it('measures how much of the window is left', () => {
    expect(remainingFraction(q({ valid_until: '2028-01-01' }), today)).toBe(1)
    expect(remainingFraction(q({ valid_until: '2026-12-25', remind_days: 60 }), today)).toBe(0.5)
    expect(remainingFraction(q({ valid_until: '2026-11-01' }), today)).toBe(0)
  })
})

describe('planned (zapis na termin)', () => {
  const today = '2026-11-25'
  it('turns an expiring or expired item into "planned" while the planned day is ahead', () => {
    expect(qualLevel(q({ valid_until: '2026-12-20', planned_on: '2026-12-10' }), today)).toBe('planned')
    expect(qualLevel(q({ valid_until: '2026-11-01', planned_on: today }), today)).toBe('planned')
    expect(qualLevel(q({ valid_until: '2028-01-01', planned_on: '2026-12-10' }), today)).toBe('ok')
  })
  it('falls back to the normal level once the planned day has passed', () => {
    const item = q({ valid_until: '2026-12-20', planned_on: '2026-11-20' })
    expect(qualLevel(item, today)).toBe('critical')
    expect(plannedPassed(item, today)).toBe(true)
    expect(isPlanned(item, today)).toBe(false)
  })
  it('sorts by attention: unplanned urgent items before planned ones', () => {
    const expiredPlanned = q({ id: 'a', valid_until: '2026-11-01', planned_on: '2026-12-01' })
    const soon = q({ id: 'b', valid_until: '2027-03-01' })
    expect([expiredPlanned, soon].sort((x, y) => compareAttention(x, y, today)).map(i => i.id)).toEqual(['b', 'a'])
  })
})

describe('needsAttention (kropka na zakładce)', () => {
  const today = '2026-11-25'
  const mine = (over: Partial<Qualification>) => q({ person_id: 'me', ...over })
  const other = (over: Partial<Qualification>) => q({ person_id: 'p2', ...over })
  it('flags my expired or ≤30-day items unless planned', () => {
    expect(needsAttention([mine({ valid_until: '2026-12-10' })], 'me', false, false, today)).toBe(true)
    expect(needsAttention([mine({ valid_until: '2027-03-01' })], 'me', false, false, today)).toBe(false)
    expect(needsAttention([mine({ valid_until: '2026-12-10', planned_on: '2026-12-01' })], 'me', false, false, today)).toBe(false)
  })
  it('flags crew problems and pending approvals only for approvers', () => {
    const crew = [other({ valid_until: '2026-11-01' })]
    expect(needsAttention(crew, 'me', false, false, today)).toBe(false)
    expect(needsAttention(crew, 'me', true, false, today)).toBe(true)
    expect(needsAttention([other({ valid_until: '2028-01-01', pending_valid_until: '2031-01-01' })], 'me', true, false, today)).toBe(true)
    expect(needsAttention([mine({ valid_until: '2028-01-01', pending_valid_until: '2031-01-01' })], 'me', true, false, today)).toBe(false)
  })
})

describe('formatRemaining', () => {
  it('switches from days to months and years', () => {
    expect(formatRemaining(57)).toBe('57 dni')
    expect(formatRemaining(1)).toBe('1 dzień')
    expect(formatRemaining(0)).toBe('dziś')
    expect(formatRemaining(-3)).toBe('−3 dni')
    expect(formatRemaining(250)).toBe('8 mies.')
    expect(formatRemaining(365)).toBe('1 rok')
    expect(formatRemaining(794)).toBe('2 lata 2 mies.')
    expect(formatRemaining(1900)).toBe('5 lat 2 mies.')
    expect(formatRemaining(null)).toBe('—')
  })
  it('has a one-line short form for narrow tiles', () => {
    expect(formatRemainingShort(57)).toBe('57 dni')
    expect(formatRemainingShort(250)).toBe('8 mies.')
    expect(formatRemainingShort(365)).toBe('1 rok')
    expect(formatRemainingShort(730)).toBe('2 lata')
    expect(formatRemainingShort(1035)).toBe('2,8 roku') // 34 months
    expect(formatRemainingShort(-3)).toBe('−3 dni')
  })
})
