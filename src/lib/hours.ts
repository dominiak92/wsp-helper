// Kalkulator godzin służbowych żołnierzy — rozliczenie 28-dniowe (norma 160h).
// Kody służb i ich wartość godzinowa. Każde całodniowe wolne / L4 / oddelegowanie
// zalicza się jako 24h; 8W to 8h wolnego; 8 to dodatkowe 8h przepracowane.
import { addDaysKey, billingPeriodStartKey } from './duty'

export type HourCode = '24' | '8' | 'W' | 'WH' | '8W' | 'L4' | 'oddelegowanie'

export const NORM = 160 // godzin na 28-dniowy okres rozliczeniowy (tylko żołnierze)

export const HOUR_VALUES: Record<HourCode, number> = {
  '24': 24,
  '8': 8,
  W: 24,
  WH: 24,
  L4: 24,
  oddelegowanie: 24,
  '8W': 8,
}

export const HOUR_CODE_LABELS: Record<HourCode, string> = {
  '24': '24h — służba',
  '8': '8h',
  W: 'W — urlop',
  WH: 'WH — wolna służba',
  '8W': '8W — 8h wolnego',
  L4: 'L4 — zwolnienie',
  oddelegowanie: 'Oddelegowanie',
}

// Krótki tekst wyświetlany w komórce siatki
export const HOUR_CODE_SHORT: Record<HourCode, string> = {
  '24': '24',
  '8': '8',
  W: 'W',
  WH: 'WH',
  '8W': '8W',
  L4: 'L4',
  oddelegowanie: 'OD',
}

// Klasy Tailwind dla komórki z danym kodem
export const HOUR_CODE_CELL_CLASS: Record<HourCode, string> = {
  '24': 'bg-emerald-900/50 text-emerald-200 border-emerald-700/60',
  '8': 'bg-sky-900/50 text-sky-200 border-sky-700/60',
  W: 'bg-amber-900/40 text-amber-200 border-amber-700/60',
  WH: 'bg-purple-900/40 text-purple-200 border-purple-700/60',
  '8W': 'bg-slate-700/60 text-slate-200 border-slate-500/60',
  L4: 'bg-red-900/40 text-red-200 border-red-700/60',
  oddelegowanie: 'bg-teal-900/40 text-teal-200 border-teal-700/60',
}

// Kolejność w menu wyboru kodu
export const HOUR_CODES: HourCode[] = ['24', '8', 'W', 'WH', '8W', 'L4', 'oddelegowanie']

export function codeHours(code: HourCode | null | undefined): number {
  return code ? HOUR_VALUES[code] : 0
}

export function isHourCode(v: string): v is HourCode {
  return v in HOUR_VALUES
}

export interface PeriodStat {
  start: string // YYYY-MM-DD — pierwszy dzień okresu
  worked: number // suma godzin w okresie
  diff: number // worked - NORM
  cumulative: number // saldo narastające (z seedem)
}

// Statystyki per okres 28-dniowy dla JEDNEJ osoby, z saldem narastającym.
// `seed` = saldo przeniesione na start śledzenia (przed pierwszym okresem z danymi).
// `lastNeededStart` = początek najpóźniejszego okresu, jaki chcemy pokazać
// (żeby policzyć saldo także dla bieżącego/przyszłego, jeszcze pustego okresu).
export function computePeriods(
  entries: Record<string, HourCode>,
  seed: number,
  lastNeededStart: string,
): Map<string, PeriodStat> {
  const workedByStart = new Map<string, number>()
  for (const [date, code] of Object.entries(entries)) {
    const s = billingPeriodStartKey(date)
    workedByStart.set(s, (workedByStart.get(s) ?? 0) + codeHours(code))
  }

  const dataStarts = [...workedByStart.keys()].sort()
  const firstData = dataStarts[0]
  const lastData = dataStarts[dataStarts.length - 1]

  // Dolna granica: pierwszy okres z danymi (albo oglądany, jeśli brak danych).
  const lower = firstData ?? lastNeededStart
  // Górna granica: max(oglądany, ostatni z danymi).
  const upper = lastData && lastData > lastNeededStart ? lastData : lastNeededStart

  const out = new Map<string, PeriodStat>()
  let cum = seed
  let cur = lower
  // Zabezpieczenie przed pętlą, gdyby coś poszło nie tak (max ~10 lat okresów).
  for (let guard = 0; guard < 200; guard++) {
    const worked = workedByStart.get(cur) ?? 0
    const diff = worked - NORM
    cum += diff
    out.set(cur, { start: cur, worked, diff, cumulative: cum })
    if (cur >= upper) break
    cur = addDaysKey(cur, 28)
  }
  return out
}

// Odczyt statystyk dla konkretnego okresu — z bezpiecznym fallbackiem dla
// okresów sprzed startu śledzenia (saldo = seed, 0 przepracowanych godzin).
export function periodStatFor(
  periods: Map<string, PeriodStat>,
  start: string,
  seed: number,
): PeriodStat {
  return periods.get(start) ?? { start, worked: 0, diff: 0, cumulative: seed }
}
