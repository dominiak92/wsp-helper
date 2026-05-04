import { useState, useEffect } from 'react'
import { PanelLeftClose, PanelLeftOpen, Bell } from 'lucide-react'
import { useClock } from '../../hooks/useClock'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'

interface TopBarProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export function TopBar({ sidebarCollapsed, onToggleSidebar }: TopBarProps) {
  const { timeStr, dateStr } = useClock()
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)
  const [latestSender, setLatestSender] = useState<string | null>(null)

  useEffect(() => {
    if (user?.role !== 'admin') return

    async function fetchUnread() {
      const { data } = await supabase
        .from('duty_messages')
        .select('id, sender_name, sender_login')
        .is('read_at', null)
        .order('created_at', { ascending: false })
      if (data) {
        setUnreadCount(data.length)
        setLatestSender(data.length > 0 ? (data[0].sender_name ?? data[0].sender_login) : null)
      }
    }

    fetchUnread()

    const channel = supabase
      .channel('topbar-duty-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_messages' }, fetchUnread)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.role])

  return (
    <header className="flex items-center h-14 px-4 bg-surface-900 border-b border-slate-800 gap-4 flex-shrink-0">
      {/* Sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        className="text-slate-400"
        title="Zwiń / rozwiń sidebar"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="w-4 h-4" />
        ) : (
          <PanelLeftClose className="w-4 h-4" />
        )}
      </Button>

      {/* Alert — nowa wiadomość od użytkownika */}
      {user?.role === 'admin' && unreadCount > 0 && latestSender && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-900/60 border border-brand-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow shrink-0" />
          <Bell className="w-3.5 h-3.5 text-brand-400 shrink-0" />
          <span className="text-xs font-medium text-brand-300">
            {latestSender} napisał{unreadCount > 1 ? ` (+${unreadCount - 1} więcej)` : ''}
          </span>
        </div>
      )}

      <div className="flex-1" />

      {/* Date & time */}
      <div className="hidden sm:flex flex-col items-end leading-tight">
        <span className="font-mono text-sm font-semibold text-slate-100 tracking-widest">
          {timeStr}
        </span>
        <span className="text-[10px] text-slate-500 capitalize">{dateStr}</span>
      </div>
    </header>
  )
}
