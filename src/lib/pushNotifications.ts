import { supabase } from './supabase'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub !== null
  } catch {
    return false
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i)
  return buf
}

export async function subscribePush(
  userLogin: string,
  userRole: string,
): Promise<'ok' | 'denied' | 'error'> {
  if (!isPushSupported()) return 'error'

  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'error'

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidKey) {
    console.error('VITE_VAPID_PUBLIC_KEY not set')
    return 'error'
  }

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { user_login: userLogin, user_role: userRole, subscription: sub.toJSON(), updated_at: new Date().toISOString() },
        { onConflict: 'user_login' },
      )

    if (error) {
      console.error('Supabase upsert failed:', error)
      return 'error'
    }
    return 'ok'
  } catch (err) {
    console.error('subscribePush error:', err)
    return 'error'
  }
}

export async function unsubscribePush(userLogin: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('user_login', userLogin)
  } catch (err) {
    console.error('unsubscribePush error:', err)
  }
}

// Fire-and-forget — push jest best-effort, nie blokuje głównego flow
export function sendPushTrigger(payload: {
  type: 'new_message' | 'confirmed'
  senderLogin?: string
  senderName?: string
  message?: string
  targetLogin?: string
}): void {
  fetch('/.netlify/functions/push-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(err => console.error('[push-notify]', err))
}
