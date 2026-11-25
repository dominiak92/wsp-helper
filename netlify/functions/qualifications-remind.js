// Scheduled (netlify.toml → [functions."qualifications-remind"] schedule): raz dziennie rano.
// Decyzje „komu, co i czy już pora” podejmuje planPushes() w _shared/qualReminders.js:
//  - strażak: kluczowe momenty (początek okna, 30 dni, 7 dni, po terminie) + powtórki co
//    `notification_prefs.own_repeat_days`, póki termin jest w okresie przypomnienia
//  - dowódcy zmiany (rola) i admini: termin każdego strażaka, gdy wejdzie w okno dowódców
//    (`qualification_settings.commander_remind_days`) + powtórki wg własnego
//    `crew_repeat_days` (co N dni / w dni, gdy jest dowódcą zmiany / tylko nowe)
// Tutaj tylko I/O: odczyt, wysyłka, zapis znaczników.
import { configureWebPush, sendPushToLogins } from './_shared/push.js'
import { planPushes, COMMANDER_REMIND_DAYS } from './_shared/qualReminders.js'
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
    const QUAL_COLS = 'id,person_id,kind,label,valid_until,remind_days,pending_valid_until,notified_stage,commander_notified'
    const [quals, people, settings, adminSubs] = await Promise.all([
      // planned_on doszło migracją 202611251600 — bez niej czytamy bez zapisów na termin
      get(`qualifications?select=${QUAL_COLS},planned_on`).catch(() => get(`qualifications?select=${QUAL_COLS}`)),
      get('personnel?select=id,name,login,roles'),
      get('qualification_settings?id=eq.1&select=commander_remind_days').catch(() => []),
      get('push_subscriptions?user_role=eq.admin&select=user_login').catch(() => []),
    ])

    // Bez tabeli notification_prefs (migracja nieuruchomiona) nie ma gdzie zapisać, kiedy
    // poszła powtórka — wtedy tylko kluczowe momenty, żeby nie wysyłać codziennie
    let prefsAvailable = true
    let prefsByLogin = {}
    try {
      prefsByLogin = Object.fromEntries((await get('notification_prefs?select=*')).map(p => [p.user_login, p]))
    } catch (err) {
      prefsAvailable = false
      console.warn('[qualifications-remind] notification_prefs unavailable — no repeats:', err.message)
    }

    // Dzisiejszy dowódca zmiany z obsady — dla opcji „w dni mojej służby”
    let dutyCommanderLogin = null
    if (currentOrNextDutyDateWarsaw() === today) {
      const rows = await get(`duty_assignments?duty_date=eq.${today}&select=assignment_json&order=created_at.desc&limit=1`)
      let aj = rows[0]?.assignment_json
      if (typeof aj === 'string') { try { aj = JSON.parse(aj) } catch { aj = null } }
      dutyCommanderLogin = people.find(p => p.id === aj?.shiftCommanderId)?.login ?? null
    }

    const plan = planPushes({
      quals, people, prefsByLogin, prefsAvailable, today, dutyCommanderLogin,
      adminLogins: adminSubs.map(s => s.user_login),
      windowDays: Number(settings[0]?.commander_remind_days) || COMMANDER_REMIND_DAYS,
    })

    let sent = 0
    for (const p of plan.pushes) {
      try {
        sent += (await sendPushToLogins(url, key, [p.login], { title: p.title, body: p.body, url: URL_PATH, tag: p.tag })).sent
      } catch (err) {
        console.error(`[qualifications-remind] push to ${p.login} failed:`, err.message)
      }
    }

    // Znaczniki zapisywane także bez subskrypcji — przypomnienie i tak widać w aplikacji
    for (const [id, fields] of Object.entries(plan.qualPatches)) {
      const res = await fetch(`${url}/rest/v1/qualifications?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) console.error(`[qualifications-remind] patch ${id}: ${res.status}`)
    }
    const prefRows = Object.entries(plan.prefPatches).map(([user_login, fields]) => ({ user_login, ...fields }))
    if (prefsAvailable && prefRows.length) {
      // Upsert po loginie — każdy wiersz z tym samym zestawem kolumn (PostgREST tego wymaga)
      for (const row of prefRows) {
        const res = await fetch(`${url}/rest/v1/notification_prefs?on_conflict=user_login`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(row),
        })
        if (!res.ok) console.error(`[qualifications-remind] prefs ${row.user_login}: ${res.status}`)
      }
    }

    console.log(`[qualifications-remind] ${today}: planned=${plan.pushes.length}, delivered=${sent}, duty commander=${dutyCommanderLogin ?? '-'}`)
    return { statusCode: 200, body: 'ok' }
  } catch (err) {
    console.error('[qualifications-remind] failed:', err)
    return { statusCode: 500, body: String(err?.message ?? err) }
  }
}
