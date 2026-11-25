import { describe, it, expect } from 'vitest'
import { reminderStage, shouldNotify, personalReminders, commanderSummary, commanderAlerts } from './qualReminders.js'

const q = (over) => ({
  id: 'q1', person_id: 'p1', kind: 'komora', label: null, valid_until: null,
  remind_days: 182, pending_valid_until: null, notified_stage: null, ...over,
})

describe('reminderStage', () => {
  it('walks through window → month → week → expired', () => {
    expect(reminderStage(200, 182)).toBe(null)
    expect(reminderStage(182, 182)).toBe('window')
    expect(reminderStage(30, 182)).toBe('month')
    expect(reminderStage(7, 182)).toBe('week')
    expect(reminderStage(0, 182)).toBe('week')
    expect(reminderStage(-1, 182)).toBe('expired')
  })
  it('respects a short reminder window', () => {
    expect(reminderStage(20, 14)).toBe(null)
    expect(reminderStage(14, 14)).toBe('month')
    expect(reminderStage(5, 14)).toBe('week')
  })
})

describe('shouldNotify', () => {
  it('fires once per stage and never goes back', () => {
    expect(shouldNotify(null, 'window')).toBe(true)
    expect(shouldNotify('window', 'window')).toBe(false)
    expect(shouldNotify('window', 'week')).toBe(true) // skipped month (e.g. cron missed a day)
    expect(shouldNotify('week', 'month')).toBe(false)
    expect(shouldNotify('expired', null)).toBe(false)
  })
})

describe('personalReminders', () => {
  const today = '2026-11-25'
  it('groups due items per person and skips already-notified stages', () => {
    const out = personalReminders([
      q({ id: 'a', valid_until: '2027-01-21' }),                              // 57 days → window
      q({ id: 'b', kind: 'medyk', valid_until: '2026-11-20' }),               // expired
      q({ id: 'c', kind: 'badania', valid_until: '2027-01-21', notified_stage: 'window' }), // already sent
      q({ id: 'd', person_id: 'p2', valid_until: '2028-01-01' }),             // far away
    ], today)
    expect(out).toHaveLength(1)
    expect(out[0].personId).toBe('p1')
    expect(out[0].stageById).toEqual({ a: 'window', b: 'expired' })
    expect(out[0].title).toBe('❗ Kończą się Twoje terminy (2)')
    expect(out[0].body).toBe('Medyk (KPP): 20.11.2026 (po terminie 5 dni)\nKomora dymowa: 21.01.2027 (za 57 dni)')
  })
  it('uses a specific title for a single item', () => {
    const [r] = personalReminders([q({ kind: 'custom', label: 'Prawo jazdy C', valid_until: '2026-12-25' })], today)
    expect(r.title).toBe('⏳ Prawo jazdy C — za 30 dni')
  })
})

describe('commanderAlerts', () => {
  const today = '2026-11-25'
  const names = { p1: 'Łukasz S.', p2: 'Michał Ł.' }
  it('notifies commanders half a year ahead regardless of the personal reminder setting', () => {
    const a = commanderAlerts([
      q({ id: 'a', person_id: 'p2', kind: 'badania', valid_until: '2027-01-09', remind_days: 14 }), // 45 days, personal window 14
      q({ id: 'b', valid_until: '2027-05-25' }),                       // 181 days → just entered
      q({ id: 'c', valid_until: '2027-06-01' }),                       // 188 days → not yet
      q({ id: 'd', valid_until: '2027-01-21', commander_notified: 'window' }), // already sent
    ], names, today)
    expect(a.stageById).toEqual({ a: 'window', b: 'window' })
    expect(a.title).toBe('📋 Terminy załogi (2) — koniec w ciągu pół roku')
    expect(a.body).toBe('Michał Ł. — Badania okresowe 09.01.2027 (za 45 dni)\nŁukasz S. — Komora dymowa 25.05.2027 (za 181 dni)')
  })
  it('uses the one commander lead time set for everyone', () => {
    const a = commanderAlerts([
      q({ id: 'a', valid_until: '2027-01-09' }), // 45 days
      q({ id: 'b', valid_until: '2027-05-25' }), // 181 days — outside a 90-day window
    ], names, today, 90)
    expect(a.stageById).toEqual({ a: 'window' })
    expect(commanderAlerts([q({ valid_until: '2027-06-01' })], names, today, 365).title)
      .toBe('📋 Łukasz S.: Komora dymowa — za 188 dni')
  })
  it('sends once more after expiry and then stays quiet', () => {
    const a = commanderAlerts([q({ valid_until: '2026-11-20', commander_notified: 'window' })], names, today)
    expect(a.stageById).toEqual({ q1: 'expired' })
    expect(a.title).toBe('❗ Łukasz S.: Komora dymowa — po terminie 5 dni')
    expect(commanderAlerts([q({ valid_until: '2026-11-20', commander_notified: 'expired' })], names, today)).toBe(null)
  })
})

describe('commanderSummary', () => {
  const today = '2026-11-25'
  const names = { p1: 'Łukasz S.', p2: 'Michał Ł.' }
  it('lists crew items within the horizon and pending approvals', () => {
    const s = commanderSummary([
      q({ id: 'a', valid_until: '2027-01-09', person_id: 'p2', kind: 'badania' }),
      q({ id: 'b', valid_until: '2027-01-21' }),        // 57 days — inside 60
      q({ id: 'c', valid_until: '2028-01-01', pending_valid_until: '2031-01-01' }),
    ], names, today)
    expect(s.title).toBe('📋 Kończące się terminy załogi: 2')
    expect(s.body).toBe([
      'Michał Ł. — Badania okresowe 09.01.2027 (za 45 dni)',
      'Łukasz S. — Komora dymowa 21.01.2027 (za 57 dni)',
      'Do zatwierdzenia: 1',
    ].join('\n'))
  })
  it('returns null when nothing needs attention', () => {
    expect(commanderSummary([q({ valid_until: '2028-01-01' })], names, today)).toBe(null)
  })
})
