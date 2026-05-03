const REF_UTC = Date.UTC(2026, 4, 1) // 1 maja 2026 = dzień służby

export function isDutyDay(year: number, month: number, day: number): boolean {
  return ((Date.UTC(year, month, day) - REF_UTC) / 86400000) % 4 === 0
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

const MONTHS_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
]
const WEEKDAYS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota']

export function formatDateShort(key: string): string {
  const [, m, d] = key.split('-').map(Number)
  return `${d} ${MONTHS_GEN[m - 1]}`
}

export function formatDateLong(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${WEEKDAYS[date.getUTCDay()]}, ${d} ${MONTHS_GEN[m - 1]} ${y}`
}
