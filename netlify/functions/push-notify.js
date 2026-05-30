import webpush from 'web-push'

// Dzień służby (current/next) liczony w strefie Europe/Warsaw — serwer chodzi w UTC,
// a logika dyżuru (anchor 2026-05-01, co 4 dni) jest oparta o lokalną datę jak w src/lib/duty.ts
function currentOrNextDutyDateWarsaw() {
  const REF_UTC = Date.UTC(2026, 4, 1)
  const todayWarsaw = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' }) // 'YYYY-MM-DD'
  const [y, m, d] = todayWarsaw.split('-').map(Number)
  for (let i = 0; i <= 3; i++) {
    const t = Date.UTC(y, m - 1, d + i)
    if (((t - REF_UTC) / 86400000) % 4 === 0) {
      const nd = new Date(t)
      return `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, '0')}-${String(nd.getUTCDate()).padStart(2, '0')}`
    }
  }
  return todayWarsaw
}

// Loginy dyżurnych wyznaczonych na dziś (slot obsady, nie stała rola) — do powiadomień push
async function resolveDutyOfficerLogins(supabaseUrl, supabaseKey) {
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  const dutyDate = currentOrNextDutyDateWarsaw()
  const aRes = await fetch(
    `${supabaseUrl}/rest/v1/duty_assignments?duty_date=eq.${dutyDate}&select=assignment_json&order=created_at.desc&limit=1`,
    { headers },
  )
  if (!aRes.ok) return []
  const aRows = await aRes.json()
  let aj = aRows[0]?.assignment_json
  if (typeof aj === 'string') { try { aj = JSON.parse(aj) } catch { return [] } }
  const ids = Array.isArray(aj?.dutyOfficerIds) ? aj.dutyOfficerIds : []
  if (!ids.length) return []
  const idList = ids.map(id => encodeURIComponent(id)).join(',')
  const pRes = await fetch(
    `${supabaseUrl}/rest/v1/personnel?id=in.(${idList})&select=login`,
    { headers },
  )
  if (!pRes.ok) return []
  const pRows = await pRes.json()
  return pRows.map(r => r.login).filter(Boolean)
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const VAPID_SUBJECT  = process.env.VAPID_SUBJECT
  const VAPID_PUBLIC   = process.env.VAPID_PUBLIC_KEY
  const VAPID_PRIVATE  = process.env.VAPID_PRIVATE_KEY
  const SUPABASE_URL   = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !SUPABASE_URL || !SUPABASE_KEY) {
    const missing = [
      !VAPID_PUBLIC  && 'VAPID_PUBLIC_KEY',
      !VAPID_PRIVATE && 'VAPID_PRIVATE_KEY',
      !SUPABASE_URL  && 'VITE_SUPABASE_URL',
      !SUPABASE_KEY  && 'SUPABASE_SERVICE_KEY / VITE_SUPABASE_ANON_KEY',
    ].filter(Boolean)
    console.error('[push-notify] Missing env vars:', missing.join(', '))
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing env vars', missing }),
    }
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT ?? 'mailto:admin@example.com',
    VAPID_PUBLIC,
    VAPID_PRIVATE,
  )

  let body
  try { body = JSON.parse(event.body ?? '{}') } catch {
    return { statusCode: 400, body: 'Invalid JSON' }
  }

  const { type, senderLogin, senderName, message, targetLogin } = body
  console.log(`[push-notify] type=${type} targetLogin=${targetLogin ?? '-'} senderLogin=${senderLogin ?? '-'}`)

  // Zbuduj filtr Supabase
  let filterParam
  if (type === 'new_message') {
    // Admin/oficer (rola subskrypcji) + dyżurny(-ni) wyznaczony na dziś (po loginie)
    let dutyLogins = []
    try {
      dutyLogins = await resolveDutyOfficerLogins(SUPABASE_URL, SUPABASE_KEY)
    } catch (err) {
      console.error('[push-notify] Nie udało się ustalić dyżurnych:', err.message)
    }
    console.log(`[push-notify] dyżurni dnia: ${dutyLogins.join(', ') || '-'}`)
    if (dutyLogins.length) {
      const list = dutyLogins.map(l => encodeURIComponent(l)).join(',')
      filterParam = `or=(user_role.in.(admin,officer),user_login.in.(${list}))`
    } else {
      filterParam = 'user_role=in.(admin,officer)'
    }
  } else if (type === 'confirmed') {
    if (!targetLogin) {
      console.error('[push-notify] confirmed: brak targetLogin')
      return { statusCode: 400, body: 'Missing targetLogin for confirmed type' }
    }
    filterParam = `user_login=eq.${encodeURIComponent(targetLogin)}`
  } else {
    console.error('[push-notify] Nieznany type:', type)
    return { statusCode: 400, body: `Unknown type: ${type}` }
  }

  console.log(`[push-notify] Supabase filter: ${filterParam}`)

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?${filterParam}&select=subscription`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  )
  if (!res.ok) {
    const text = await res.text()
    console.error(`[push-notify] Supabase error ${res.status}:`, text)
    return { statusCode: 502, body: `Supabase error: ${res.status}` }
  }

  const rows = await res.json()
  console.log(`[push-notify] Znaleziono subskrypcji: ${rows.length}`)

  if (!rows.length) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent: 0, failed: 0, reason: 'no subscribers' }),
    }
  }

  const pushPayload = type === 'new_message'
    ? JSON.stringify({
        title: '📨 Wiadomość do dyżurnego',
        body: `${senderName ?? senderLogin}: ${(message ?? '').substring(0, 100)}`,
        url: '/dashboard',
        tag: 'duty-message',
      })
    : JSON.stringify({
        title: '✅ Wiadomość potwierdzona',
        body: 'Dyżurny potwierdził odbiór Twojej wiadomości.',
        url: '/mobile',
        tag: 'duty-confirmed',
      })

  const sendWithTimeout = (subscription) =>
    Promise.race([
      webpush.sendNotification(subscription, pushPayload),
      new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('Timeout after 7s'), { statusCode: 0 })), 7000)
      ),
    ])

  const results = await Promise.allSettled(
    rows.map(async (row) => {
      try {
        await sendWithTimeout(row.subscription)
      } catch (err) {
        const code = err.statusCode
        // 410 Gone / 404 Not Found = subskrypcja wygasła, usuń z Supabase
        if (code === 410 || code === 404) {
          const endpoint = row.subscription?.endpoint
          console.warn(`[push-notify] Martwa subskrypcja (${code}), usuwam: ${endpoint?.slice(-40)}`)
          await fetch(
            `${SUPABASE_URL}/rest/v1/push_subscriptions?subscription->>endpoint=eq.${encodeURIComponent(endpoint)}`,
            {
              method: 'DELETE',
              headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'return=minimal' },
            },
          ).catch(() => {})
        } else {
          console.error(`[push-notify] sendNotification failed: statusCode=${code}`, err.message)
        }
        throw err
      }
    })
  )

  const sent   = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  console.log(`[push-notify] Wynik: sent=${sent} failed=${failed}`)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sent, failed }),
  }
}
