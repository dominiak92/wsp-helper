import { useState, useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useAuth } from '../../lib/auth'

export function DashboardLayout() {
  const { user, loading } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const isMapPage = location.pathname === '/map'

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'user') return <Navigate to="/mobile" replace />

  function handleToggle() {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setMobileOpen(v => !v)
    } else {
      setCollapsed(v => !v)
    }
  }

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — fixed overlay on mobile, inline on desktop */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 transition-transform duration-300',
          'md:relative md:inset-auto md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar collapsed={collapsed} />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar
          sidebarCollapsed={collapsed}
          onToggleSidebar={handleToggle}
        />
        <main className={cn('flex-1', isMapPage ? 'overflow-hidden' : 'overflow-y-auto')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
