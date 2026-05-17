import { useState, useEffect } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { cn } from '../lib/utils'
import { isPushSupported, isSubscribed, subscribePush, unsubscribePush } from '../lib/pushNotifications'

interface Props {
  userLogin: string
  userRole: string
  className?: string
  onSubscribedChange?: (subscribed: boolean) => void
}

export function PushBell({ userLogin, userRole, className, onSubscribedChange }: Props) {
  const [subscribed, setSubscribed]   = useState(false)
  const [permission, setPermission]   = useState<NotificationPermission | null>(null)
  const [loading, setLoading]         = useState(false)
  const supported = isPushSupported()

  useEffect(() => {
    if (!supported) return
    setPermission(Notification.permission)
    isSubscribed().then(setSubscribed)
  }, [supported])

  if (!supported) return null

  const denied = permission === 'denied'

  async function toggle() {
    if (denied) return
    setLoading(true)
    try {
      if (subscribed) {
        await unsubscribePush(userLogin)
        setSubscribed(false)
        onSubscribedChange?.(false)
      } else {
        const result = await subscribePush(userLogin, userRole)
        if (result === 'ok') {
          setSubscribed(true)
          setPermission('granted')
          onSubscribedChange?.(true)
        } else if (result === 'denied') {
          setPermission('denied')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading || denied}
      title={
        denied      ? 'Powiadomienia zablokowane w ustawieniach przeglądarki' :
        subscribed  ? 'Powiadomienia włączone — kliknij, aby wyłączyć' :
                      'Włącz powiadomienia push'
      }
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0',
        subscribed
          ? 'text-brand-400 bg-brand-500/10 hover:bg-brand-500/20'
          : denied
            ? 'text-slate-700 cursor-not-allowed'
            : 'text-slate-500 hover:text-slate-300 hover:bg-surface-700',
        className,
      )}
    >
      {subscribed
        ? <Bell    className="w-4 h-4" />
        : <BellOff className="w-4 h-4" />
      }
    </button>
  )
}
