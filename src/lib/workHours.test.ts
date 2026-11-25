import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake Supabase query builder: `range(from, to)` serves a slice of `rows`,
// mimicking PostgREST's page cap.
let rows: { person_id: string; date: string; code: string }[] = []
const rangeCalls: [number, number][] = []

vi.mock('./supabase', () => {
  const builder = {
    select: () => builder,
    order: () => builder,
    range: (from: number, to: number) => {
      rangeCalls.push([from, to])
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
    },
  }
  return {
    supabase: { from: () => builder },
    throwIfError: <T,>(res: T) => res,
    NETWORK_ERROR_MSG: '',
  }
})

import { fetchWorkHours } from './workHours'

describe('fetchWorkHours', () => {
  beforeEach(() => {
    rows = []
    rangeCalls.length = 0
  })

  it('reads past the 1000-row page limit', async () => {
    for (let i = 0; i < 2500; i++) {
      rows.push({ person_id: `p${i}`, date: '2026-05-01', code: '24' })
    }
    const map = await fetchWorkHours()
    expect(Object.keys(map)).toHaveLength(2500)
    expect(rangeCalls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]])
  })

  it('maps rows and skips unknown codes', async () => {
    rows = [
      { person_id: 'a', date: '2026-05-01T00:00:00', code: '24' },
      { person_id: 'a', date: '2026-05-05', code: 'bogus' },
    ]
    expect(await fetchWorkHours()).toEqual({ a: { '2026-05-01': '24' } })
  })
})
