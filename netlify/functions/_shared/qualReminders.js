// Logika push-przypomnień o terminach (tabela `qualifications`) — używana przez
// netlify/functions/qualifications-remind.js. Czysta, bez I/O (testy: qualReminders.test.js).

export const KIND_LABELS = {
  komora: 'Komora dymowa',
  medyk: 'Medyk (KPP)',
  badania: 'Badania okresowe',
}

// Horyzont podsumowania dla dowódcy zmiany w dzień służby
export const CREW_ALERT_DAYS = 60

// Dowódcy zmiany dostają push o terminie każdego strażaka tyle dni przed końcem — jedna
// wartość dla wszystkich (`qualification_settings.commander_remind_days`), niezależna od
// własnego `remind_days` strażaka. Domyślnie pół roku — kopia z src/lib/qualifications.ts.
export const COMMANDER_REMIND_DAYS = 182

// Kolejne progi przypomnień dla strażaka — każdy wysyłany raz (`notified_stage`)
const STAGES = ['window', 'month', 'week', 'expired']

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

// Przypomnienia dla poszczególnych osób: [{ personId, qualIds, stageById, title, body }]
export function personalReminders(quals, today) {
  const byPerson = new Map()
  for (const q of quals) {
    if (!q.valid_until) continue
    const days = daysBetweenKeys(today, q.valid_until)
    const stage = reminderStage(days, q.remind_days)
    if (!shouldNotify(q.notified_stage, stage)) continue
    const list = byPerson.get(q.person_id) ?? []
    list.push({ q, days, stage })
    byPerson.set(q.person_id, list)
  }

  const out = []
  for (const [personId, items] of byPerson) {
    items.sort((a, b) => a.days - b.days)
    const expired = items.some(i => i.days < 0)
    const title = items.length === 1
      ? `${expired ? '❗' : '⏳'} ${qualTitle(items[0].q)} — ${describeDays(items[0].days)}`
      : `${expired ? '❗' : '⏳'} Kończą się Twoje terminy (${items.length})`
    const body = items
      .map(i => `${qualTitle(i.q)}: ${formatDate(i.q.valid_until)} (${describeDays(i.days)})`)
      .join('\n')
    out.push({
      personId,
      stageById: Object.fromEntries(items.map(i => [i.q.id, i.stage])),
      title,
      body,
    })
  }
  return out
}

// Próg dla dowódców: `windowDays` przed końcem, potem po terminie — każdy raz (`commander_notified`)
export function commanderStage(days, windowDays = COMMANDER_REMIND_DAYS) {
  if (days < 0) return 'expired'
  if (days <= windowDays) return 'window'
  return null
}

// „pół roku” / „rok” / „90 dni” — do tytułu powiadomienia
export function describeWindow(windowDays) {
  if (windowDays === 182) return 'pół roku'
  if (windowDays === 365) return 'rok'
  return dni(windowDays)
}

// Jeden zbiorczy push do dowódców zmiany o terminach, które właśnie weszły w okno
// (albo minęły). null = nic nowego. stageById → do zapisania w `commander_notified`.
export function commanderAlerts(quals, namesById, today, windowDays = COMMANDER_REMIND_DAYS) {
  const items = []
  for (const q of quals) {
    if (!q.valid_until) continue
    const days = daysBetweenKeys(today, q.valid_until)
    const stage = commanderStage(days, windowDays)
    if (shouldNotify(q.commander_notified, stage)) items.push({ q, days, stage })
  }
  if (!items.length) return null
  items.sort((a, b) => a.days - b.days)

  const lines = items.slice(0, 8).map(({ q, days }) =>
    `${namesById[q.person_id] ?? q.person_id} — ${qualTitle(q)} ${formatDate(q.valid_until)} (${describeDays(days)})`)
  if (items.length > 8) lines.push(`…i ${items.length - 8} więcej`)
  const expired = items.some(i => i.days < 0)

  return {
    stageById: Object.fromEntries(items.map(i => [i.q.id, i.stage])),
    title: items.length === 1
      ? `${expired ? '❗' : '📋'} ${namesById[items[0].q.person_id] ?? 'Strażak'}: ${qualTitle(items[0].q)} — ${describeDays(items[0].days)}`
      : `${expired ? '❗' : '📋'} Terminy załogi (${items.length}) — koniec w ciągu ${describeWindow(windowDays)}`,
    body: lines.join('\n'),
  }
}

// Podsumowanie dla dowódcy zmiany: terminy załogi kończące się w CREW_ALERT_DAYS
// lub po terminie + liczba zgłoszeń czekających na zatwierdzenie. null = nic do zgłoszenia.
export function commanderSummary(quals, namesById, today) {
  const urgent = quals
    .filter(q => q.valid_until && daysBetweenKeys(today, q.valid_until) <= CREW_ALERT_DAYS)
    .map(q => ({ q, days: daysBetweenKeys(today, q.valid_until) }))
    .sort((a, b) => a.days - b.days)
  const pending = quals.filter(q => q.pending_valid_until).length
  if (!urgent.length && !pending) return null

  const lines = urgent.slice(0, 6).map(({ q, days }) =>
    `${namesById[q.person_id] ?? q.person_id} — ${qualTitle(q)} ${formatDate(q.valid_until)} (${describeDays(days)})`)
  if (urgent.length > 6) lines.push(`…i ${urgent.length - 6} więcej`)
  if (pending) lines.push(`Do zatwierdzenia: ${pending}`)

  return {
    title: urgent.length
      ? `📋 Kończące się terminy załogi: ${urgent.length}`
      : '📋 Terminy załogi do zatwierdzenia',
    body: lines.join('\n'),
  }
}
