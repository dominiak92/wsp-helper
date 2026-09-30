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

// Zmiana służby o 7:30 — do tej godziny trwa jeszcze służba z poprzedniego dnia.
// Uwaga: netlify/functions/push-notify.js ma kopię tej logiki (strefa Europe/Warsaw).
export const HANDOVER_HOUR = 7
export const HANDOVER_MINUTE = 30

function isBeforeHandover(now: Date): boolean {
  return now.getHours() * 60 + now.getMinutes() < HANDOVER_HOUR * 60 + HANDOVER_MINUTE
}

// Bieżąca (trwająca) albo najbliższa służba. Służba trwa od 7:30 w dniu służby
// do 7:30 dnia następnego, więc po północy nadal wskazuje wczorajszą datę.
export function currentOrNextDutyDate(now: Date = new Date()): string {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (isBeforeHandover(now)) base.setDate(base.getDate() - 1)
  for (let i = 0; i <= 3; i++) {
    const nd = new Date(base)
    nd.setDate(base.getDate() + i)
    if (isDutyDay(nd.getFullYear(), nd.getMonth(), nd.getDate()))
      return ymdKey(nd.getFullYear(), nd.getMonth(), nd.getDate())
  }
  return ymdKey(base.getFullYear(), base.getMonth(), base.getDate())
}

// Jak opisać służbę z `currentOrNextDutyDate` w nagłówku strony:
// 'today' — dzień służby to dziś, 'ongoing' — służba z wczoraj trwa do 7:30, 'next' — kolejna.
export type DutyTiming = 'today' | 'ongoing' | 'next'

export function dutyTiming(dutyDate: string, now: Date = new Date()): DutyTiming {
  const today = ymdKey(now.getFullYear(), now.getMonth(), now.getDate())
  if (dutyDate === today) return 'today'
  if (dutyDate < today && isBeforeHandover(now)) return 'ongoing'
  return 'next'
}

export const DUTY_TIMING_LABEL: Record<DutyTiming, string> = {
  today: 'Dzisiejsza służba',
  ongoing: 'Trwająca służba (do 7:30)',
  next: 'Następna służba',
}

// Najbliższe `count` dni służby (YYYY-MM-DD), licząc od `from` włącznie
export function nextDutyKeys(count: number, from: Date = new Date()): string[] {
  const keys: string[] = []
  for (let i = 0; keys.length < count && i < 400; i++) {
    const nd = new Date(from)
    nd.setDate(from.getDate() + i)
    if (isDutyDay(nd.getFullYear(), nd.getMonth(), nd.getDate()))
      keys.push(ymdKey(nd.getFullYear(), nd.getMonth(), nd.getDate()))
  }
  return keys
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

// ── Operacje na kluczach YYYY-MM-DD ─────────────────────────────────────────

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return ymdKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())
}

export function isDutyDayKey(key: string): boolean {
  const [y, m, d] = key.split('-').map(Number)
  return isDutyDay(y, m - 1, d)
}

export function isBillingStartKey(key: string): boolean {
  const [y, m, d] = key.split('-').map(Number)
  return isBillingDay(y, m - 1, d)
}

// Początek (YYYY-MM-DD) 28-dniowego okresu rozliczeniowego zawierającego `key`.
// Dzień rozliczeniowy = pierwszy dzień okresu (żółta kolumna na harmonogramie).
export function billingPeriodStartKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  const offset = ((Math.floor((t - BILLING_REF_UTC) / 86400000) % 28) + 28) % 28
  return addDaysKey(key, -offset)
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
