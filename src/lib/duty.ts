const REF_UTC = Date.UTC(2026, 4, 1) // 1 maja 2026 = dzień służby
const BILLING_REF_UTC = Date.UTC(2026, 3, 21) // 21 kwietnia 2026 = pierwsza rozliczeniówka

export function isDutyDay(year: number, month: number, day: number): boolean {
  return ((Date.UTC(year, month, day) - REF_UTC) / 86400000) % 4 === 0
}

export function isBillingDay(year: number, month: number, day: number): boolean {
  return ((Date.UTC(year, month, day) - BILLING_REF_UTC) / 86400000) % 28 === 0
}

export interface CalendarEvent {
  id: string
  event_date: string // YYYY-MM-DD
  label: string
}

export function ymdKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function todayYmdKey(): string {
  const t = new Date()
  return ymdKey(t.getFullYear(), t.getMonth(), t.getDate())
}

export function currentOrNextDutyDate(): string {
  const d = new Date()
  for (let i = 0; i <= 3; i++) {
    const nd = new Date(d)
    nd.setDate(d.getDate() + i)
    if (isDutyDay(nd.getFullYear(), nd.getMonth(), nd.getDate()))
      return ymdKey(nd.getFullYear(), nd.getMonth(), nd.getDate())
  }
  return ymdKey(d.getFullYear(), d.getMonth(), d.getDate())
}

export function previousDutyDate(from: string): string {
  const [y, m, d] = from.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 4)
  return ymdKey(dt.getFullYear(), dt.getMonth(), dt.getDate())
}

export function nextDutyDate(from: string): string {
  const [y, m, d] = from.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + 4)
  return ymdKey(dt.getFullYear(), dt.getMonth(), dt.getDate())
}

export const MONTHS_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
]
const WEEKDAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']

export function formatDateShort(key: string): string {
  const [, m, d] = key.split('-').map(Number)
  return `${d} ${MONTHS_GEN[m - 1]}`
}

export function formatDateShortWithDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${d} ${MONTHS_GEN[m - 1]} — ${WEEKDAYS[date.getDay()]}`
}

export function formatDateLong(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${WEEKDAYS[date.getDay()]}, ${d} ${MONTHS_GEN[m - 1]} ${y}`
}
