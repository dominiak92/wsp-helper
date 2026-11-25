// Logika push-przypomnień o terminach (tabela `qualifications`) — używana przez
// netlify/functions/qualifications-remind.js. Czysta, bez I/O (testy: qualReminders.test.js).
// Całą decyzję „komu, co i czy już pora” podejmuje planPushes().

export const KIND_LABELS = {
  komora: 'Komora dymowa',
  medyk: 'Medyk (KPP)',
  badania: 'Badania okresowe',
}

// Dowódcy zmiany dostają push o terminie każdego strażaka tyle dni przed końcem — jedna
// wartość dla wszystkich (`qualification_settings.commander_remind_days`), niezależna od
// własnego `remind_days` strażaka. Domyślnie pół roku — kopia z src/lib/qualifications.ts.
export const COMMANDER_REMIND_DAYS = 182

// Domyślne częstotliwości (`notification_prefs`) — kopia z src/lib/qualifications.ts
export const DEFAULT_OWN_REPEAT_DAYS = 30
export const DEFAULT_CREW_REPEAT_DAYS = 7
export const CREW_ON_DUTY = -1 // dowódca: przypominaj w dni, gdy jestem dowódcą zmiany w obsadzie

// Kluczowe momenty dla strażaka — każdy wysyłany raz (`notified_stage`), niezależnie od powtórek
const STAGES = ['window', 'month', 'week', 'expired']

export function addDaysKey(key, n) {
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

// Aktualny zapis na termin (np. komora 12.03) — takie terminy nie dostają przypomnień
export function isPlanned(q, today) {
  return !!q.planned_on && q.planned_on >= today
}

export function daysBetweenKeys(from, to) {
  const utc = k => {
    const [y, m, d] = k.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(to) - utc(from)) / 86400000)
}

// Próg dla `days` dni do końca ważności; null = jeszcze poza oknem przypomnienia.
// 30/7 dni liczą się tylko w oknie — krótsze okno (np. 14 dni) nie dostaje „miesiąc przed”.
export function reminderStage(days, remindDays) {
  if (days < 0) return 'expired'
  if (days > remindDays) return null
  if (days <= 7) return 'week'
  if (days <= 30) return 'month'
  return 'window'
}

export function shouldNotify(prevStage, stage) {
  if (!stage) return false
  return STAGES.indexOf(stage) > STAGES.indexOf(prevStage ?? '')
}

// Czy minęło już `repeatDays` od ostatniego przypomnienia (0 / ujemne = bez powtórek)
export function isRepeatDue(repeatDays, lastSent, today) {
  if (!(repeatDays > 0)) return false
  return !lastSent || daysBetweenKeys(lastSent, today) >= repeatDays
}

export function qualTitle(q) {
  return q.kind === 'custom' ? (q.label?.trim() || 'Własny termin') : (KIND_LABELS[q.kind] ?? q.kind)
}

// 'YYYY-MM-DD' → 'DD.MM.YYYY'
export function formatDate(key) {
  const [y, m, d] = String(key).split('-')
  return `${d}.${m}.${y}`
}

function dni(n) {
  return n === 1 ? '1 dzień' : `${n} dni`
}

export function describeDays(days) {
  if (days < 0) return `po terminie ${dni(-days)}`
  if (days === 0) return 'kończy się dziś'
  return `za ${dni(days)}`
}

// „pół roku” / „rok” / „90 dni” — do tytułu powiadomienia
export function describeWindow(windowDays) {
  if (windowDays === 182) return 'pół roku'
  if (windowDays === 365) return 'rok'
  return dni(windowDays)
}

function withDays(q, today) {
  return { q, days: daysBetweenKeys(today, q.valid_until) }
}

// Treść powiadomienia o terminach jednej osoby
function personalMessage(items) {
  items.sort((a, b) => a.days - b.days)
  const icon = items.some(i => i.days < 0) ? '❗' : '⏳'
  return {
    title: items.length === 1
      ? `${icon} ${qualTitle(items[0].q)}: ${describeDays(items[0].days)}`
      : `${icon} Kończą się Twoje terminy (${items.length})`,
    body: items.map(i => `${qualTitle(i.q)}: ${formatDate(i.q.valid_until)} (${describeDays(i.days)})`).join('\n'),
  }
}

// Kluczowe momenty strażaków: [{ personId, stageById, title, body }]
export function personalReminders(quals, today) {
  const byPerson = new Map()
  for (const q of quals) {
    if (!q.valid_until || isPlanned(q, today)) continue // zapisany na termin — sprawa w toku
    const item = withDays(q, today)
    const stage = reminderStage(item.days, q.remind_days)
    if (!shouldNotify(q.notified_stage, stage)) continue
    const list = byPerson.get(q.person_id) ?? []
    list.push({ ...item, stage })
    byPerson.set(q.person_id, list)
  }
  return [...byPerson].map(([personId, items]) => ({
    personId,
    stageById: Object.fromEntries(items.map(i => [i.q.id, i.stage])),
    ...personalMessage(items),
  }))
}

// Próg dla dowódców: `windowDays` przed końcem, potem po terminie — każdy raz (`commander_notified`)
export function commanderStage(days, windowDays = COMMANDER_REMIND_DAYS) {
  if (days < 0) return 'expired'
  if (days <= windowDays) return 'window'
  return null
}

function crewLines(items, namesById, today) {
  const lines = items.slice(0, 8).map(({ q, days }) =>
    `${namesById[q.person_id] ?? q.person_id}: ${qualTitle(q)} ${formatDate(q.valid_until)} (${describeDays(days)})` +
    (isPlanned(q, today) ? ` · zapisany ${formatDate(q.planned_on).slice(0, 5)}` : ''))
  if (items.length > 8) lines.push(`…i ${items.length - 8} więcej`)
  return lines
}

// Jeden zbiorczy push do dowódców o terminach, które właśnie weszły w okno
// (albo minęły). null = nic nowego. stageById → do zapisania w `commander_notified`.
export function commanderAlerts(quals, namesById, today, windowDays = COMMANDER_REMIND_DAYS) {
  const items = []
  for (const q of quals) {
    if (!q.valid_until) continue
    const item = withDays(q, today)
    const stage = commanderStage(item.days, windowDays)
    if (shouldNotify(q.commander_notified, stage)) items.push({ ...item, stage })
  }
  if (!items.length) return null
  items.sort((a, b) => a.days - b.days)
  const icon = items.some(i => i.days < 0) ? '❗' : '📋'
  return {
    stageById: Object.fromEntries(items.map(i => [i.q.id, i.stage])),
    title: items.length === 1
      ? `${icon} ${namesById[items[0].q.person_id] ?? 'Strażak'}: ${qualTitle(items[0].q)}: ${describeDays(items[0].days)}`
      : `${icon} Terminy zmiany (${items.length}), koniec w ciągu ${describeWindow(windowDays)}`,
    body: crewLines(items, namesById, today).join('\n'),
  }
}

// Powtórka dla dowódcy: wszystkie terminy zmiany w oknie dowódców + zgłoszenia. null = nic.
export function crewDigest(quals, namesById, today, windowDays = COMMANDER_REMIND_DAYS) {
  const items = quals
    .filter(q => q.valid_until && commanderStage(daysBetweenKeys(today, q.valid_until), windowDays))
    .map(q => withDays(q, today))
    .sort((a, b) => a.days - b.days)
  const pending = quals.filter(q => q.pending_valid_until).length
  if (!items.length && !pending) return null
  const lines = crewLines(items, namesById, today)
  if (pending) lines.push(`Do zatwierdzenia: ${pending}`)
  return {
    title: items.length
      ? `📋 Terminy zmiany: ${items.length} w ciągu ${describeWindow(windowDays)}`
      : '📋 Terminy zmiany do zatwierdzenia',
    body: lines.join('\n'),
  }
}

// Plan jednego przebiegu (raz dziennie). Zwraca pushe do wysłania i zmiany do zapisania.
//  - strażak: kluczowy moment (zawsze) albo powtórka co own_repeat_days, póki termin jest w oknie
//  - dowódcy zmiany (rola) + admini: nowe terminy w oknie dowódców (zawsze) albo powtórka wg
//    crew_repeat_days (N dni / -1 = w dni, gdy jest dowódcą zmiany w obsadzie / 0 = tylko nowe)
// prefsAvailable=false (brak tabeli notification_prefs) → bez powtórek, tylko kluczowe momenty.
export function planPushes({
  quals, people, prefsByLogin = {}, prefsAvailable = true, adminLogins = [],
  today, windowDays = COMMANDER_REMIND_DAYS, dutyCommanderLogin = null,
}) {
  const pushes = []
  const qualPatches = {}
  const prefPatches = {}
  const names = Object.fromEntries(people.map(p => [p.id, p.name]))
  const prefOf = login => ({
    own_repeat_days: DEFAULT_OWN_REPEAT_DAYS,
    crew_repeat_days: DEFAULT_CREW_REPEAT_DAYS,
    own_last_sent: null,
    crew_last_sent: null,
    ...prefsByLogin[login],
  })
  const markPref = (login, field) => { (prefPatches[login] ??= {})[field] = today }

  // 1) Strażacy — o swoich terminach
  const milestones = new Map(personalReminders(quals, today).map(r => [r.personId, r]))
  for (const r of milestones.values()) {
    for (const [id, stage] of Object.entries(r.stageById)) (qualPatches[id] ??= {}).notified_stage = stage
  }
  const tomorrow = addDaysKey(today, 1)
  for (const p of people) {
    if (!p.login) continue
    // Dzień przed zapisem na termin — niezależnie od innych przypomnień
    const plannedTomorrow = quals.filter(q => q.person_id === p.id && q.planned_on === tomorrow)
    if (plannedTomorrow.length) {
      pushes.push({
        login: p.login,
        title: `📅 Jutro: ${plannedTomorrow.map(qualTitle).join(', ')}`,
        body: 'Masz zapis na jutro. Po odnowieniu wpisz nową datę ważności w zakładce Terminy.',
        tag: `qual-plan-${today}`,
      })
    }
    const m = milestones.get(p.id)
    if (m) {
      pushes.push({ login: p.login, title: m.title, body: m.body, tag: `qual-${today}` })
      markPref(p.login, 'own_last_sent')
      continue
    }
    if (!prefsAvailable) continue
    const pref = prefOf(p.login)
    if (!isRepeatDue(pref.own_repeat_days, pref.own_last_sent, today)) continue
    const items = quals
      .filter(q => q.person_id === p.id && q.valid_until && !isPlanned(q, today))
      .map(q => withDays(q, today))
      .filter(i => reminderStage(i.days, i.q.remind_days))
    if (!items.length) continue
    pushes.push({ login: p.login, ...personalMessage(items), tag: `qual-${today}` })
    markPref(p.login, 'own_last_sent')
  }

  // 2) Dowódcy zmiany i admini — o terminach wszystkich strażaków
  const commanderLogins = [...new Set([
    ...people.filter(p => p.login && Array.isArray(p.roles) && p.roles.includes('SHIFT_COMMANDER')).map(p => p.login),
    ...adminLogins.filter(Boolean),
  ])]
  const alerts = commanderAlerts(quals, names, today, windowDays)
  if (alerts) {
    for (const [id, stage] of Object.entries(alerts.stageById)) (qualPatches[id] ??= {}).commander_notified = stage
  }
  const digest = alerts ? null : crewDigest(quals, names, today, windowDays)
  for (const login of commanderLogins) {
    if (alerts) {
      pushes.push({ login, title: alerts.title, body: alerts.body, tag: `qual-crew-${today}` })
      markPref(login, 'crew_last_sent')
      continue
    }
    if (!prefsAvailable || !digest) continue
    const pref = prefOf(login)
    const due = pref.crew_repeat_days === CREW_ON_DUTY
      ? login === dutyCommanderLogin && pref.crew_last_sent !== today
      : isRepeatDue(pref.crew_repeat_days, pref.crew_last_sent, today)
    if (!due) continue
    pushes.push({ login, title: digest.title, body: digest.body, tag: `qual-crew-${today}` })
    markPref(login, 'crew_last_sent')
  }

  return { pushes, qualPatches, prefPatches }
}
