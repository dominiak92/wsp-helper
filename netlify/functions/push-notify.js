import webpush from 'web-push'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const VAPID_SUBJECT  = process.env.VAPID_SUBJECT
  const VAPID_PUBLIC   = process.env.VAPID_PUBLIC_KEY
  const VAPID_PRIVATE  = process.env.VAPID_PRIVATE_KEY
  // Używamy tych samych zmiennych co weather.js — są już ustawione w Netlify
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

  // Zbuduj filtr Supabase
  let filterParam
  if (type === 'new_message') {
    // Powiadom wszystkich adminów i dyżurnych
    filterParam = 'user_role=in.(admin,officer)'
  } else if (type === 'confirmed' && targetLogin) {
    // Powiadom konkretnego nadawcę
    filterParam = `user_login=eq.${encodeURIComponent(targetLogin)}`
  } else {
    return { statusCode: 400, body: 'Invalid type or missing targetLogin' }
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?${filterParam}&select=subscription`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  )
  if (!res.ok) {
    return { statusCode: 502, body: `Supabase error: ${res.status}` }
  }

  const rows = await res.json()
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

  const results = await Promise.allSettled(
    rows.map(row => webpush.sendNotification(row.subscription, pushPayload))
  )

  const sent   = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sent, failed }),
  }
}
