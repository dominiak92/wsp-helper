// CRUD dla godzin służbowych (tabela work_hours) — używane przez kalkulator
// godzin i podstronę pełnego grafiku. Obie strony dzielą te same dane.
import { supabase } from './supabase'
import { buildWorkHoursRows, isHourCode, type HourCode } from './hours'

export interface WorkHoursEntry {
  person_id: string
  date: string // YYYY-MM-DD
  code: HourCode
}

// Wczytaj wszystkie wpisy godzin jako mapę personId → (date → code)
export async function fetchWorkHours(): Promise<Record<string, Record<string, HourCode>>> {
  const { data } = await supabase.from('work_hours').select('person_id, date, code')
  const map: Record<string, Record<string, HourCode>> = {}
  for (const row of data ?? []) {
    if (!isHourCode(row.code)) continue
    const date = String(row.date).slice(0, 10)
    ;(map[row.person_id] ??= {})[date] = row.code
  }
  return map
}

// Zapisz/usuń jeden wpis
export async function setWorkHour(personId: string, date: string, code: HourCode | null): Promise<void> {
  if (code) {
    const { error } = await supabase.from('work_hours').upsert({ person_id: personId, date, code })
    if (error) console.error('[supabase] upsert work_hours:', error)
  } else {
    const { error } = await supabase.from('work_hours').delete().eq('person_id', personId).eq('date', date)
    if (error) console.error('[supabase] delete work_hours:', error)
  }
}

// Import godzin z zapisanych obsad (duty_assignments) → work_hours.
// Zwraca wgrane wiersze (do aktualizacji stanu lokalnego).
export async function importFromAssignments(): Promise<WorkHoursEntry[]> {
  const [{ data: pData }, { data: aData }] = await Promise.all([
    supabase.from('personnel').select('id'),
    supabase.from('duty_assignments').select('duty_date, assignment_json'),
  ])
  const knownIds = new Set((pData ?? []).map(p => p.id))
  const rows = buildWorkHoursRows(aData ?? [], knownIds)
  if (rows.length) {
    const { error } = await supabase.from('work_hours').upsert(rows)
    if (error) { console.error('[supabase] import work_hours:', error); throw error }
  }
  return rows
}
