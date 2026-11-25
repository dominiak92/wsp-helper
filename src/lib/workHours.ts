// CRUD dla godzin służbowych (tabela work_hours) — używane przez kalkulator
// godzin i podstronę pełnego grafiku. Obie strony dzielą te same dane.
import { supabase, throwIfError, NETWORK_ERROR_MSG } from './supabase'
import { buildWorkHoursRows, isHourCode, type HourCode } from './hours'

export interface WorkHoursEntry {
  person_id: string
  date: string // YYYY-MM-DD
  code: HourCode
}

const WORK_HOURS_PAGE = 1000

// Wczytaj wszystkie wpisy godzin jako mapę personId → (date → code)
export async function fetchWorkHours(): Promise<Record<string, Record<string, HourCode>>> {
  // Supabase zwraca domyślnie najwyżej 1000 wierszy na zapytanie (bez błędu) —
  // pobieraj stronami, inaczej starsze/nowsze godziny po cichu znikają z grafiku.
  const rows: { person_id: string; date: string; code: string }[] = []
  for (;;) {
    const { data } = throwIfError(
      await supabase
        .from('work_hours')
        .select('person_id, date, code')
        .order('person_id')
        .order('date')
        .range(rows.length, rows.length + WORK_HOURS_PAGE - 1),
    )
    if (!data?.length) break
    rows.push(...data)
  }
  const map: Record<string, Record<string, HourCode>> = {}
  for (const row of rows) {
    if (!isHourCode(row.code)) continue
    const date = String(row.date).slice(0, 10)
    ;(map[row.person_id] ??= {})[date] = row.code
  }
  return map
}

// Zapisz/usuń jeden wpis — rzuca przy błędzie, żeby UI mógł cofnąć zmianę
export async function setWorkHour(personId: string, date: string, code: HourCode | null): Promise<void> {
  if (code) {
    throwIfError(await supabase.from('work_hours').upsert({ person_id: personId, date, code }), NETWORK_ERROR_MSG)
  } else {
    throwIfError(await supabase.from('work_hours').delete().eq('person_id', personId).eq('date', date), NETWORK_ERROR_MSG)
  }
}

// Import godzin z zapisanych obsad (duty_assignments) → work_hours.
// Zwraca wgrane wiersze (do aktualizacji stanu lokalnego).
export async function importFromAssignments(): Promise<WorkHoursEntry[]> {
  const [pRes, aRes] = await Promise.all([
    supabase.from('personnel').select('id'),
    supabase.from('duty_assignments').select('duty_date, assignment_json'),
  ])
  const READ_ERROR_MSG = 'Nie udało się wczytać obsad — sprawdź połączenie i spróbuj ponownie.'
  const { data: pData } = throwIfError(pRes, READ_ERROR_MSG)
  const { data: aData } = throwIfError(aRes, READ_ERROR_MSG)
  const knownIds = new Set((pData ?? []).map(p => p.id))
  const rows = buildWorkHoursRows(aData ?? [], knownIds)
  if (rows.length) {
    const { error } = await supabase.from('work_hours').upsert(rows)
    if (error) { console.error('[supabase] import work_hours:', error); throw error }
  }
  return rows
}
