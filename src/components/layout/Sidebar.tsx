import { NavLink } from 'react-router-dom'
import {
  Users,
  Truck,
  FileText,
  LayoutDashboard,
  ShieldAlert,
  LogOut,
  ClipboardList,
  UserCog,
  CalendarDays,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { useAuth } from '../../lib/auth'

const navGroups = [
  {
    label: 'GŁÓWNE',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
      { label: 'Stan osobowy', icon: Users, path: '/personal', badge: '18' },
    ],
  },
  {
    label: 'OPERACJE',
    items: [
      { label: 'Wyjazdy / Alarmy', icon: Truck, path: '/deployments', badge: '2' },
      { label: 'Gotowość bojowa', icon: ShieldAlert, path: '/readiness' },
    ],
  },
  {
    label: 'ZASOBY',
    items: [
      { label: 'Dokumentacja', icon: FileText, path: '/documents' },
    ],
  },
  {
    label: 'NARZĘDZIA',
    items: [
      { label: 'Generator opisów', icon: ClipboardList, path: '/incident-generator' },
      { label: 'Tworzenie obsady', icon: UserCog, path: '/crew-generator' },
      { label: 'Kalendarz służb', icon: CalendarDays, path: '/duty-calendar' },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
  const { user, signOut } = useAuth()

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-surface-900 border-r border-slate-800 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo / Unit */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-5 border-b border-slate-800',
          collapsed && 'justify-center px-2'
        )}
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
          WSP
        </div>
        {!collapsed && (
          <div>
            <p className="text-xs font-bold text-white leading-tight">II Zmiana</p>
            <p className="text-[10px] text-slate-500 leading-tight">Wojskowa Straż Pożarna</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-4 mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-2 py-2 rounded-md text-sm font-medium transition-colors',
                        'text-slate-400 hover:text-white hover:bg-surface-700',
                        isActive && 'text-brand-400 bg-brand-900/30 border-l-2 border-brand-400 pl-[6px]',
                        collapsed && 'justify-center'
                      )
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <Badge variant="info" className="text-[10px] px-1.5 py-0">
                            {item.badge}
                          </Badge>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom: user + logout */}
      <div className="border-t border-slate-800 p-2 space-y-0.5">
        {!collapsed && user && (
          <p className="px-2 py-1 text-[10px] text-slate-600 truncate">
            Zalogowany jako <span className="text-slate-400 font-medium">{user.login}</span>
          </p>
        )}
        <button
          onClick={() => signOut()}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm text-slate-500',
            'hover:text-alert-red hover:bg-alert-red/10 transition-colors',
            collapsed && 'justify-center'
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Wyloguj się</span>}
        </button>
      </div>
    </aside>
  )
}
