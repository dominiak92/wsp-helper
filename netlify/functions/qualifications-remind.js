// Scheduled (netlify.toml → [functions."qualifications-remind"] schedule): raz dziennie rano.
// 1) Strażak dostaje push, gdy jego termin (komora / medyk / badania / własny) wchodzi
//    w okno przypomnienia, potem 30 i 7 dni przed końcem oraz po terminie — każdy próg raz
//    (`qualifications.notified_stage`, zerowany przy nowej dacie).
// 2) Dowódcy zmiany (rola SHIFT_COMMANDER) i admini dostają push o terminie KAŻDEGO strażaka
//    `qualification_settings.commander_remind_days` dni przed końcem (domyślnie pół roku,
//    jedna wartość dla wszystkich) i po terminie — każdy raz (`commander_notified`).
// 3) W dzień służby dowódca zmiany (shiftCommanderId z obsady) dostaje podsumowanie
//    terminów załogi kończących się w CREW_ALERT_DAYS dni + liczbę zgłoszeń do zatwierdzenia.
import { configureWebPush, sendPushToLogins } from './_shared/push.js'
import { personalReminders, commanderAlerts, commanderSummary, COMMANDER_REMIND_DAYS } from './_shared/qualReminders.js'
import { warsawTodayKey, currentOrNextDutyDateWarsaw } from './_shared/dutyDate.js'

const URL_PATH = '/mobile/qualifications'

export const handler = async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key || !configureWebPush()) {
    console.error('[qualifications-remind] Missing VITE_SUPABASE_URL / Supabase key / VAPID keys')
    return { statusCode: 500, body: 'Missing env vars' }
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const get = async (path) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers })
    if (!res.ok) throw new Error(`${path.split('?')[0]} ${res.status}: ${await res.text()}`)
    return res.json()
  }

  try {
    const today = warsawTodayKey()
    const [quals, people, settings, adminSubs] = await Promise.all([
      get('qualifications?select=id,person_id,kind,label,valid_until,remind_days,pending_valid_until,notified_stage,commander_notified'),
      get('personnel?select=id,name,login,roles'),
      get('qualification_settings?id=eq.1&select=commander_remind_days').catch(() => []),
      get('push_subscriptions?user_role=eq.admin&select=user_login').catch(() => []),
    ])
    const personById = Object.fromEntries(people.map(p => [p.id, p]))
    const names = Object.fromEntries(people.map(p => [p.id, p.name]))
    const patch = async (id, fields) => {
      const res = await fetch(`${url}/rest/v1/qualifications?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) console.error(`[qualifications-remind] patch ${id}: ${res.status}`)
    }

    // 1) Przypomnienia osobiste
    let personal = 0
    for (const r of personalReminders(quals, today)) {
      const login = personById[r.personId]?.login
      if (login) {
        try {
          const res = await sendPushToLogins(url, key, [login], { title: r.title, body: r.body, url: URL_PATH, tag: `qual-${today}` })
          personal += res.sent
        } catch (err) {
          console.error(`[qualifications-remind] push to ${login} failed:`, err.message)
        }
      }
      // Próg odnotowany także bez subskrypcji — przypomnienie i tak widać w aplikacji
      for (const [id, stage] of Object.entries(r.stageById)) await patch(id, { notified_stage: stage })
    }

    // 2) Dowódcy zmiany + admini: terminy każdego strażaka, które weszły w okno dowódców
    const windowDays = Number(settings[0]?.commander_remind_days) || COMMANDER_REMIND_DAYS
    const alerts = commanderAlerts(quals, names, today, windowDays)
    let commanders = 'nothing new'
    if (alerts) {
      const logins = [
        ...people.filter(p => Array.isArray(p.roles) && p.roles.includes('SHIFT_COMMANDER')).map(p => p.login),
        ...adminSubs.map(s => s.user_login),
      ]
      try {
        const res = await sendPushToLogins(url, key, logins, { title: alerts.title, body: alerts.body, url: URL_PATH, tag: `qual-cmd-${today}` })
        commanders = `sent ${res.sent} (${Object.keys(alerts.stageById).length} items, window ${windowDays} d)`
      } catch (err) {
        console.error('[qualifications-remind] commander push failed:', err.message)
      }
      for (const [id, stage] of Object.entries(alerts.stageById)) await patch(id, { commander_notified: stage })
    }

    // 3) Podsumowanie dla dowódcy zmiany — tylko w dzień służby (po zmianie o 7:30)
    let commander = 'not a duty day'
    if (currentOrNextDutyDateWarsaw() === today) {
      const rows = await get(`duty_assignments?duty_date=eq.${today}&select=assignment_json&order=created_at.desc&limit=1`)
      let aj = rows[0]?.assignment_json
      if (typeof aj === 'string') { try { aj = JSON.parse(aj) } catch { aj = null } }
      const login = personById[aj?.shiftCommanderId]?.login
      const summary = commanderSummary(quals, names, today)
      if (!login) commander = 'no shift commander login'
      else if (!summary) commander = 'nothing to report'
      else {
        const res = await sendPushToLogins(url, key, [login], { ...summary, url: URL_PATH, tag: `qual-crew-${today}` })
        commander = `sent ${res.sent} to ${login}`
      }
    }

    console.log(`[qualifications-remind] ${today}: personal pushes=${personal}, commanders: ${commanders}, duty-day summary: ${commander}`)
    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    console.error('[qualifications-remind] failed:', err)
    return { statusCode: 500, body: String(err?.message ?? err) }
  }
}
