import { describe, it, expect } from 'vitest'
import {
  reminderStage, shouldNotify, isRepeatDue, personalReminders, commanderAlerts, crewDigest, planPushes,
} from './qualReminders.js'

const q = (over) => ({
  id: 'q1', person_id: 'p1', kind: 'komora', label: null, valid_until: null,
  remind_days: 182, pending_valid_until: null, notified_stage: null, commander_notified: null, ...over,
})
const today = '2026-11-25'
const names = { p1: 'Łukasz S.', p2: 'Michał Ł.' }

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

describe('shouldNotify / isRepeatDue', () => {
  it('fires once per stage and never goes back', () => {
    expect(shouldNotify(null, 'window')).toBe(true)
    expect(shouldNotify('window', 'window')).toBe(false)
    expect(shouldNotify('window', 'week')).toBe(true)
    expect(shouldNotify('week', 'month')).toBe(false)
    expect(shouldNotify('expired', null)).toBe(false)
  })
  it('repeats after the chosen number of days', () => {
    expect(isRepeatDue(7, null, today)).toBe(true)
    expect(isRepeatDue(7, '2026-11-19', today)).toBe(false) // 6 days
    expect(isRepeatDue(7, '2026-11-18', today)).toBe(true)  // 7 days
    expect(isRepeatDue(0, null, today)).toBe(false)
    expect(isRepeatDue(-1, null, today)).toBe(false)
  })
})

describe('personalReminders', () => {
  it('groups due items per person and skips already-notified stages', () => {
    const out = personalReminders([
      q({ id: 'a', valid_until: '2027-01-21' }),
      q({ id: 'b', kind: 'medyk', valid_until: '2026-11-20' }),
      q({ id: 'c', kind: 'badania', valid_until: '2027-01-21', notified_stage: 'window' }),
      q({ id: 'd', person_id: 'p2', valid_until: '2028-01-01' }),
    ], today)
    expect(out).toHaveLength(1)
    expect(out[0].stageById).toEqual({ a: 'window', b: 'expired' })
    expect(out[0].title).toBe('❗ Kończą się Twoje terminy (2)')
    expect(out[0].body).toBe('Medyk (KPP): 20.11.2026 (po terminie 5 dni)\nKomora dymowa: 21.01.2027 (za 57 dni)')
  })
})

describe('commanderAlerts / crewDigest', () => {
  it('notifies commanders when an item enters their window, regardless of the personal setting', () => {
    const a = commanderAlerts([
      q({ id: 'a', person_id: 'p2', kind: 'badania', valid_until: '2027-01-09', remind_days: 14 }),
      q({ id: 'b', valid_until: '2027-05-25' }),
      q({ id: 'c', valid_until: '2027-06-01' }),
      q({ id: 'd', valid_until: '2027-01-21', commander_notified: 'window' }),
    ], names, today)
    expect(a.stageById).toEqual({ a: 'window', b: 'window' })
    expect(a.title).toBe('📋 Terminy zmiany (2), koniec w ciągu pół roku')
  })
  it('uses the one commander lead time set for everyone', () => {
    const a = commanderAlerts([q({ id: 'a', valid_until: '2027-01-09' }), q({ id: 'b', valid_until: '2027-05-25' })], names, today, 90)
    expect(a.stageById).toEqual({ a: 'window' })
  })
  it('digest lists everything in the window plus pending approvals', () => {
    const d = crewDigest([
      q({ id: 'a', person_id: 'p2', kind: 'badania', valid_until: '2027-01-09', commander_notified: 'window' }),
      q({ id: 'b', valid_until: '2028-01-01', pending_valid_until: '2031-01-01' }),
    ], names, today)
    expect(d.title).toBe('📋 Terminy zmiany: 1 w ciągu pół roku')
    expect(d.body).toBe('Michał Ł.: Badania okresowe 09.01.2027 (za 45 dni)\nDo zatwierdzenia: 1')
  })
})

describe('planPushes', () => {
  const people = [
    { id: 'p1', name: 'Łukasz S.', login: 'lukasz', roles: ['SHIFT_COMMANDER'] },
    { id: 'p2', name: 'Michał Ł.', login: 'michal', roles: ['RESCUER'] },
    { id: 'p3', name: 'Bez loginu', login: null, roles: [] },
  ]
  // Wszystko już raz zgłoszone — zostają tylko powtórki
  const settled = [
    q({ id: 'a', person_id: 'p2', valid_until: '2027-01-21', notified_stage: 'window', commander_notified: 'window' }),
    q({ id: 'b', person_id: 'p1', valid_until: '2029-01-01' }),
  ]

  it('sends key moments and new crew items regardless of preferences', () => {
    const plan = planPushes({ quals: [q({ id: 'x', person_id: 'p2', valid_until: '2027-01-21' })], people, today, prefsAvailable: false })
    expect(plan.pushes.map(p => p.login)).toEqual(['michal', 'lukasz'])
    expect(plan.qualPatches).toEqual({ x: { notified_stage: 'window', commander_notified: 'window' } })
    expect(plan.prefPatches).toEqual({ michal: { own_last_sent: today }, lukasz: { crew_last_sent: today } })
  })

  it('repeats on each person\'s own schedule', () => {
    const prefsByLogin = {
      michal: { own_repeat_days: 14, own_last_sent: '2026-11-11' },   // 14 days → due
      lukasz: { crew_repeat_days: 30, crew_last_sent: '2026-11-11' }, // 14 of 30 → not yet
    }
    const plan = planPushes({ quals: settled, people, prefsByLogin, today })
    expect(plan.pushes.map(p => [p.login, p.title])).toEqual([['michal', '⏳ Komora dymowa: za 57 dni']])
    expect(plan.prefPatches).toEqual({ michal: { own_last_sent: today } })
  })

  it('"only key moments" and "only new items" never repeat', () => {
    const prefsByLogin = { michal: { own_repeat_days: 0 }, lukasz: { crew_repeat_days: 0 } }
    expect(planPushes({ quals: settled, people, prefsByLogin, today }).pushes).toEqual([])
  })

  it('"on my duty days" reminds a commander only when they command the shift', () => {
    const prefsByLogin = { michal: { own_repeat_days: 0 }, lukasz: { crew_repeat_days: -1 } }
    expect(planPushes({ quals: settled, people, prefsByLogin, today, dutyCommanderLogin: 'andrzej' }).pushes).toEqual([])
    const plan = planPushes({ quals: settled, people, prefsByLogin, today, dutyCommanderLogin: 'lukasz' })
    expect(plan.pushes.map(p => [p.login, p.title])).toEqual([['lukasz', '📋 Terminy zmiany: 1 w ciągu pół roku']])
  })

  it('keeps quiet about planned items and reminds the day before the planned date', () => {
    const quals = [
      q({ id: 'a', person_id: 'p2', valid_until: '2026-12-20', planned_on: '2026-11-26' }), // jutro
      q({ id: 'b', person_id: 'p2', kind: 'medyk', valid_until: '2027-01-21', planned_on: '2027-01-10', notified_stage: 'window', commander_notified: 'window' }),
    ]
    const prefsByLogin = { lukasz: { crew_repeat_days: 0 } }
    const plan = planPushes({ quals, people, prefsByLogin, today })
    const michal = plan.pushes.filter(p => p.login === 'michal').map(p => p.title)
    expect(michal).toEqual(['📅 Jutro: Komora dymowa']) // no milestone / repeat for planned items
    expect(plan.qualPatches.a).toEqual({ commander_notified: 'window' }) // commanders still told, with the plan
    expect(plan.pushes.find(p => p.login === 'lukasz').body).toContain('zapisany 26.11')
  })

  it('includes admins as commanders', () => {
    const prefsByLogin = { michal: { own_repeat_days: 0 }, lukasz: { crew_repeat_days: 0 } }
    const plan = planPushes({ quals: settled, people, prefsByLogin, adminLogins: ['admin'], today })
    expect(plan.pushes.map(p => p.login)).toEqual(['admin']) // admin default: weekly, never sent → due
  })
})
