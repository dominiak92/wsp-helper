// Terminy ważności (komora dymowa, medyk/KPP, badania okresowe + własne terminy)
// — tabela `qualifications`. Strażak wpisuje nową datę po odnowieniu → czeka ona
// w `pending_valid_until` na zatwierdzenie przez admina albo dowódcę.
// Push-przypomnienia wysyła netlify/functions/qualifications-remind.js.
import { supabase, throwIfError, NETWORK_ERROR_MSG } from './supabase'
import type { RoleType } from './crew'

export type StandardQualKind = 'komora' | 'medyk' | 'badania'
export type QualKind = StandardQualKind | 'custom'

export const STANDARD_QUAL_KINDS: StandardQualKind[] = ['komora', 'medyk', 'badania']

export const QUAL_KIND_LABELS: Record<StandardQualKind, string> = {
  komora: 'Komora dymowa',
  medyk: 'Medyk (KPP)',
  badania: 'Badania okresowe',
}

// Domyślnie przypominaj pół roku przed końcem ważności
export const DEFAULT_REMIND_DAYS = 182
export const REMIND_DAYS_OPTIONS = [14, 30, 60, 90, 182, 365]

// Ile dni przed końcem terminu KAŻDEGO strażaka powiadamiać dowódców zmiany — jedna wartość
// dla wszystkich, w `qualification_settings`; to domyślna (pół roku). Kopia w
// netlify/functions/_shared/qualReminders.js — trzymaj w zgodzie.
export const COMMANDER_REMIND_DAYS = 182

// Poniżej tylu dni termin jest „pilny” (pomarańczowy) — o ile jest już w oknie przypomnienia
export const CRITICAL_DAYS = 30

export interface Qualification {
  id: string
  person_id: string
  kind: QualKind
  label: string | null              // tylko dla kind = 'custom'
  valid_until: string | null        // YYYY-MM-DD
  remind_days: number
  pending_valid_until: string | null
  pending_by: string | null         // login zgłaszającego
  pending_at: string | null
  approved_by: string | null
  approved_at: string | null
  planned_on?: string | null        // zapis na termin (np. komora 12.03); brak kolumny w starszej bazie → undefined
  planned_by?: string | null
}

export type QualStatus = 'expired' | 'soon' | 'ok' | 'missing'

// Liczba dni od `from` do `to` (klucze YYYY-MM-DD), ujemna gdy `to` jest wcześniej
export function daysBetweenKeys(from: string, to: string): number {
  const utc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(to) - utc(from)) / 86400000)
}

export function daysLeft(q: Pick<Qualification, 'valid_until'>, today: string): number | null {
  return q.valid_until ? daysBetweenKeys(today, q.valid_until) : null
}

// Ważne do dnia `valid_until` włącznie; „soon” = w oknie przypomnienia
export function qualStatus(q: Pick<Qualification, 'valid_until' | 'remind_days'>, today: string): QualStatus {
  const days = daysLeft(q, today)
  if (days === null) return 'missing'
  if (days < 0) return 'expired'
  if (days <= q.remind_days) return 'soon'
  return 'ok'
}

export function qualTitle(q: Pick<Qualification, 'kind' | 'label'>): string {
  return q.kind === 'custom' ? (q.label?.trim() || 'Własny termin') : QUAL_KIND_LABELS[q.kind]
}

// Aktualny zapis na termin (dzień zapisu jeszcze nie minął)
export function isPlanned(q: { planned_on?: string | null }, today: string): boolean {
  return !!q.planned_on && q.planned_on >= today
}

// Zapis, którego dzień minął, a nowej daty ważności nadal brak — „wpisz nową datę”
export function plannedPassed(q: { planned_on?: string | null }, today: string): boolean {
  return !!q.planned_on && q.planned_on < today
}

// Poziom do kolorów: jak status, ale „soon” dzieli się na pilne (≤ CRITICAL_DAYS) i zwykłe,
// a termin w oknie / po terminie z aktualnym zapisem to „planned” (już załatwiane)
export type QualLevel = 'expired' | 'critical' | 'soon' | 'planned' | 'ok' | 'missing'

export function qualLevel(
  q: Pick<Qualification, 'valid_until' | 'remind_days'> & { planned_on?: string | null },
  today: string,
): QualLevel {
  const status = qualStatus(q, today)
  if ((status === 'soon' || status === 'expired') && isPlanned(q, today)) return 'planned'
  if (status !== 'soon') return status
  return (daysLeft(q, today) ?? 0) <= CRITICAL_DAYS ? 'critical' : 'soon'
}

// Kolejność „co najpilniejsze”: najpierw wg poziomu (po terminie → do 30 dni → kończy się →
// zaplanowane → ważne → brak), potem wg daty — do sortowania osób u dowódcy
const LEVEL_RANK: Record<QualLevel, number> = { expired: 0, critical: 1, soon: 2, planned: 3, ok: 4, missing: 5 }

export function compareAttention(a: Qualification, b: Qualification, today: string): number {
  return LEVEL_RANK[qualLevel(a, today)] - LEVEL_RANK[qualLevel(b, today)] || compareUrgency(a, b)
}

// Kropka na zakładce „Terminy”: mój termin po terminie / do 30 dni (bez zapisu),
// a dla zatwierdzającego także ktoś z załogi po terminie (bez zapisu) albo zgłoszenie do zatwierdzenia
export function needsAttention(
  quals: Qualification[], myPersonId: string | null, approver: boolean, isAdmin: boolean, today: string,
): boolean {
  return quals.some(q => {
    const level = qualLevel(q, today)
    if (q.person_id === myPersonId) return level === 'expired' || level === 'critical'
    if (!approver) return false
    return level === 'expired' || !!q.pending_valid_until
  }) || (isAdmin && quals.some(q => !!q.pending_valid_until))
}

// Ile zostało z okna przypomnienia (0–1) — szerokość paska; poza oknem pełny pasek
export function remainingFraction(q: Pick<Qualification, 'valid_until' | 'remind_days'>, today: string): number {
  const days = daysLeft(q, today)
  if (days === null || days <= 0) return 0
  if (q.remind_days <= 0 || days >= q.remind_days) return 1
  return days / q.remind_days
}

// Zatwierdzać nowe daty może admin albo dowódca zmiany (rola w personelu, nie tylko dzisiejszy slot)
export function isApprover(roles: RoleType[] | undefined, authRole: 'admin' | 'user' | undefined): boolean {
  return authRole === 'admin' || !!roles?.includes('SHIFT_COMMANDER')
}

// Najpilniejsze pierwsze: przeterminowane, potem wg dni do końca; bez daty na końcu
export function compareUrgency(a: Pick<Qualification, 'valid_until'>, b: Pick<Qualification, 'valid_until'>): number {
  if (!a.valid_until) return b.valid_until ? 1 : 0
  if (!b.valid_until) return -1
  return a.valid_until.localeCompare(b.valid_until)
}

// Terminy wymagające uwagi: przeterminowane lub kończące się w ciągu `withinDays`
export function urgentQualifications<Q extends Qualification>(quals: Q[], today: string, withinDays: number): Q[] {
  return quals
    .filter(q => {
      const d = daysLeft(q, today)
      return d !== null && d <= withinDays
    })
    .sort(compareUrgency)
}

// 'YYYY-MM-DD' → 'DD.MM.YYYY'
export function formatQualDate(key: string | null): string {
  if (!key) return '—'
  const [y, m, d] = key.split('-')
  return `${d}.${m}.${y}`
}

function dni(n: number): string {
  return n === 1 ? '1 dzień' : `${n} dni`
}

export function formatDaysLeft(days: number | null): string {
  if (days === null) return 'brak daty'
  if (days < 0) return `po terminie ${dni(-days)}`
  if (days === 0) return 'kończy się dziś'
  return `za ${dni(days)}`
}

function lat(n: number): string {
  if (n === 1) return '1 rok'
  return [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? `${n} lata` : `${n} lat`
}

// Krótko, do kafelków: „57 dni”, „8 mies.”, „2 lata 3 mies.”, „dziś”, „−3 dni”
export function formatRemaining(days: number | null): string {
  if (days === null) return '—'
  if (days < 0) return `−${dni(-days)}`
  if (days === 0) return 'dziś'
  if (days <= 60) return dni(days)
  const months = Math.round(days / 30.44)
  if (months < 12) return `${months} mies.`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest ? `${lat(years)} ${rest} mies.` : lat(years)
}

// Jeszcze krócej, do wąskich kafelków (jedna linia): powyżej roku „2,8 roku” / „2 lata”
export function formatRemainingShort(days: number | null): string {
  if (days === null || days <= 60) return formatRemaining(days)
  const months = Math.round(days / 30.44)
  if (months < 12) return `${months} mies.`
  const tenths = Math.round(months / 1.2) // lata z dokładnością do 0,1
  return tenths % 10 === 0 ? lat(tenths / 10) : `${Math.floor(tenths / 10)},${tenths % 10} roku`
}

export function formatRemindDays(days: number): string {
  if (days === 182) return 'pół roku wcześniej'
  if (days === 365) return 'rok wcześniej'
  return `${dni(days)} wcześniej`
}

// ── Supabase ──────────────────────────────────────────────────────────────────

export async function fetchQualifications(): Promise<Qualification[]> {
  const { data } = throwIfError(
    await supabase.from('qualifications').select('*').order('valid_until', { ascending: true }),
    'Nie udało się wczytać terminów — sprawdź połączenie.',
  )
  return (data ?? []) as Qualification[]
}

// Data ustawiona przez zatwierdzającego (admin/dowódca) — od razu obowiązuje.
// Zmiana daty zeruje `notified_stage`, żeby push-przypomnienia ruszyły od nowa.
export async function setValidUntil(
  target: { id: string } | { person_id: string; kind: QualKind; label?: string | null },
  validUntil: string,
  remindDays: number,
  byLogin: string,
): Promise<void> {
  const fields = {
    valid_until: validUntil,
    remind_days: remindDays,
    pending_valid_until: null,
    pending_by: null,
    pending_at: null,
    approved_by: byLogin,
    approved_at: new Date().toISOString(),
    notified_stage: null,
    commander_notified: null, planned_on: null, planned_by: null,
  }
  if ('id' in target) {
    throwIfError(await supabase.from('qualifications').update(fields).eq('id', target.id), NETWORK_ERROR_MSG)
  } else {
    throwIfError(await supabase.from('qualifications').insert({ ...target, ...fields }), NETWORK_ERROR_MSG)
  }
}

// Strażak zgłasza nową datę (po odnowieniu) — czeka na zatwierdzenie
export async function submitPending(
  target: { id: string } | { person_id: string; kind: StandardQualKind },
  newDate: string,
  byLogin: string,
): Promise<void> {
  const fields = { pending_valid_until: newDate, pending_by: byLogin, pending_at: new Date().toISOString() }
  if ('id' in target) {
    throwIfError(await supabase.from('qualifications').update(fields).eq('id', target.id), NETWORK_ERROR_MSG)
  } else {
    throwIfError(
      await supabase.from('qualifications').insert({ ...target, remind_days: DEFAULT_REMIND_DAYS, ...fields }),
      NETWORK_ERROR_MSG,
    )
  }
}

// Zatwierdź zgłoszoną datę. Warunek na `pending_valid_until` chroni przed zatwierdzeniem
// innej daty niż ta, którą widział zatwierdzający (ktoś zmienił ją w międzyczasie).
export async function approvePending(q: Qualification, byLogin: string): Promise<void> {
  if (!q.pending_valid_until) return
  const { data } = throwIfError(
    await supabase
      .from('qualifications')
      .update({
        valid_until: q.pending_valid_until,
        pending_valid_until: null,
        pending_by: null,
        pending_at: null,
        approved_by: byLogin,
        approved_at: new Date().toISOString(),
        notified_stage: null,
        commander_notified: null, planned_on: null, planned_by: null,
      })
      .eq('id', q.id)
      .eq('pending_valid_until', q.pending_valid_until)
      .select('id'),
    NETWORK_ERROR_MSG,
  )
  if (!data?.length) throw new Error('Zgłoszenie zmieniło się w międzyczasie — odśwież listę.')
}

export async function rejectPending(q: Qualification): Promise<void> {
  throwIfError(
    await supabase
      .from('qualifications')
      .update({ pending_valid_until: null, pending_by: null, pending_at: null })
      .eq('id', q.id),
    NETWORK_ERROR_MSG,
  )
}

export async function setRemindDays(id: string, remindDays: number): Promise<void> {
  throwIfError(await supabase.from('qualifications').update({ remind_days: remindDays }).eq('id', id), NETWORK_ERROR_MSG)
}

// Własny termin (np. prawo jazdy, uprawnienia) — własne przypomnienie, bez zatwierdzania
export async function addCustom(personId: string, label: string, validUntil: string, remindDays: number): Promise<void> {
  throwIfError(
    await supabase.from('qualifications').insert({
      person_id: personId, kind: 'custom', label, valid_until: validUntil, remind_days: remindDays,
    }),
    NETWORK_ERROR_MSG,
  )
}

export async function updateCustom(id: string, label: string, validUntil: string, remindDays: number): Promise<void> {
  throwIfError(
    await supabase
      .from('qualifications')
      .update({ label, valid_until: validUntil, remind_days: remindDays, notified_stage: null, commander_notified: null, planned_on: null, planned_by: null })
      .eq('id', id),
    NETWORK_ERROR_MSG,
  )
}

// ── Jak często przypominać (notification_prefs, jeden wiersz na login) ─────────
// Kopia domyślnych w netlify/functions/_shared/qualReminders.js — trzymaj w zgodzie.

export const DEFAULT_OWN_REPEAT_DAYS = 30
export const DEFAULT_CREW_REPEAT_DAYS = 7
export const CREW_ON_DUTY = -1 // dowódca: w dni, gdy jestem dowódcą zmiany w obsadzie

// 0 = tylko kluczowe momenty (początek okresu, 30 dni, 7 dni, po terminie)
export const OWN_REPEAT_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: 'co tydzień' },
  { value: 14, label: 'co 2 tygodnie' },
  { value: 30, label: 'co miesiąc' },
  { value: 0, label: 'tylko w kluczowych momentach' },
]

// 0 = tylko gdy komuś zacznie się okres przypomnienia (albo minie termin)
export const CREW_REPEAT_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'codziennie' },
  { value: 7, label: 'co tydzień' },
  { value: 14, label: 'co 2 tygodnie' },
  { value: 30, label: 'co miesiąc' },
  { value: CREW_ON_DUTY, label: 'w dni, gdy jestem dowódcą zmiany' },
  { value: 0, label: 'tylko gdy dojdzie nowy termin' },
]

export interface NotificationPrefs {
  own_repeat_days: number
  crew_repeat_days: number
}

export async function fetchNotificationPrefs(login: string): Promise<NotificationPrefs> {
  const { data } = await supabase
    .from('notification_prefs')
    .select('own_repeat_days, crew_repeat_days')
    .eq('user_login', login)
    .maybeSingle()
  return {
    own_repeat_days: data?.own_repeat_days ?? DEFAULT_OWN_REPEAT_DAYS,
    crew_repeat_days: data?.crew_repeat_days ?? DEFAULT_CREW_REPEAT_DAYS,
  }
}

export async function saveNotificationPrefs(login: string, prefs: Partial<NotificationPrefs>): Promise<void> {
  throwIfError(
    await supabase
      .from('notification_prefs')
      .upsert({ user_login: login, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_login' }),
    'Nie udało się zapisać ustawień — sprawdź połączenie.',
  )
}

// „Zaczynaj przypominać” dla wszystkich terminów jednej osoby naraz
export async function setRemindDaysForPerson(personId: string, remindDays: number): Promise<void> {
  throwIfError(
    await supabase.from('qualifications').update({ remind_days: remindDays }).eq('person_id', personId),
    NETWORK_ERROR_MSG,
  )
}

// Ustawienie dla dowódców (jeden wiersz). Brak wiersza/tabeli → wartość domyślna.
export async function fetchCommanderRemindDays(): Promise<number> {
  const { data, error } = await supabase
    .from('qualification_settings')
    .select('commander_remind_days')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) return COMMANDER_REMIND_DAYS
  return data.commander_remind_days ?? COMMANDER_REMIND_DAYS
}

export async function saveCommanderRemindDays(days: number, byLogin: string): Promise<void> {
  throwIfError(
    await supabase
      .from('qualification_settings')
      .upsert({ id: 1, commander_remind_days: days, updated_by: byLogin, updated_at: new Date().toISOString() }),
    NETWORK_ERROR_MSG,
  )
}

// Zapis na termin — bez zatwierdzania (to tylko plan). null = usuń zapis.
export async function setPlannedOn(
  target: { id: string } | { person_id: string; kind: StandardQualKind },
  plannedOn: string | null,
  byLogin: string,
): Promise<void> {
  const fields = { planned_on: plannedOn, planned_by: plannedOn ? byLogin : null }
  if ('id' in target) {
    throwIfError(await supabase.from('qualifications').update(fields).eq('id', target.id), NETWORK_ERROR_MSG)
  } else {
    throwIfError(
      await supabase.from('qualifications').insert({ ...target, remind_days: DEFAULT_REMIND_DAYS, ...fields }),
      NETWORK_ERROR_MSG,
    )
  }
}

export async function deleteQualification(id: string): Promise<void> {
  throwIfError(await supabase.from('qualifications').delete().eq('id', id), NETWORK_ERROR_MSG)
}
