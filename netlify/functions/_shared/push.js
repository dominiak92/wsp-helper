// Wysyłka Web Push do wybranych loginów — dla funkcji zaplanowanych (qualifications-remind).
// push-notify.js ma własną (starszą) wersję tej pętli; martwe subskrypcje (410/404) usuwamy tak samo.
import webpush from 'web-push'

export function configureWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com', pub, priv)
  return true
}

// payload: { title, body, url, tag } — kształt czytany przez public/sw.js
export async function sendPushToLogins(supabaseUrl, supabaseKey, logins, payload) {
  const list = [...new Set(logins.filter(Boolean))]
  if (!list.length) return { sent: 0, failed: 0 }
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
  const res = await fetch(
    `${supabaseUrl}/rest/v1/push_subscriptions?user_login=in.(${list.map(l => encodeURIComponent(l)).join(',')})&select=subscription`,
    { headers },
  )
  if (!res.ok) throw new Error(`push_subscriptions ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  const body = JSON.stringify(payload)

  const results = await Promise.allSettled(rows.map(async (row) => {
    try {
      await Promise.race([
        webpush.sendNotification(row.subscription, body),
        new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Timeout after 7s'), { statusCode: 0 })), 7000)),
      ])
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        const endpoint = row.subscription?.endpoint
        await fetch(
          `${supabaseUrl}/rest/v1/push_subscriptions?subscription->>endpoint=eq.${encodeURIComponent(endpoint)}`,
          { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } },
        ).catch(() => {})
      }
      throw err
    }
  }))
  return {
    sent: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length,
  }
}
