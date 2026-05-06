import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { Shield, Home, CalendarDays, Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../../lib/auth'

export function MobileLayout() {
  const { user, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  const navItems = [
    { to: '/mobile', label: 'Dziś', icon: Home, end: true },
    { to: '/mobile/calendar', label: 'Kalendarz', icon: CalendarDays, end: false },
    ...(user.role !== 'user'
      ? [{ to: '/mobile/crew-generator', label: 'Obsada', icon: Users, end: false }]
      : []),
  ]

  return (
    <div className="flex flex-col bg-surface-950 overflow-x-hidden" style={{ height: '100dvh' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-surface-900 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-brand-600 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-tight">WSP - System Przebiegu Służby</p>
            <p className="text-[10px] text-slate-500 leading-tight">{user.displayName}</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="text-[10px] text-slate-600 hover:text-red-400 transition-colors px-2 py-1.5"
        >
          Wyloguj
        </button>
      </header>

      {/* Content — centered on wide screens */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      {/* Bottom navigation */}
      <nav className="flex border-t border-slate-800 bg-surface-900 shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors',
                isActive ? 'text-brand-400' : 'text-slate-500'
              )
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
