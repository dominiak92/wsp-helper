import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Bell, Radio } from 'lucide-react'
import { useClock } from '../../hooks/useClock'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import type { ReadinessStatus } from '../../types'

interface TopBarProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

const statusConfig: Record<ReadinessStatus, { label: string; variant: 'success' | 'warning' | 'danger'; pulse: boolean }> = {
  GOTOWY: { label: 'GOTOWOŚĆ BOJOWA', variant: 'success', pulse: true },
  CZĘŚCIOWY: { label: 'CZĘŚCIOWA GOTOWOŚĆ', variant: 'warning', pulse: false },
  NIEAKTYWNY: { label: 'NIEAKTYWNY', variant: 'danger', pulse: false },
}

export function TopBar({ sidebarCollapsed, onToggleSidebar }: TopBarProps) {
  const { timeStr, dateStr } = useClock()
  const [readiness] = useState<ReadinessStatus>('GOTOWY')
  const status = statusConfig[readiness]

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

      {/* Status gotowości */}
      <div className="flex items-center gap-2">
        <Radio className="w-3.5 h-3.5 text-slate-500" />
        <Badge variant={status.variant} className="gap-1.5">
          {status.pulse && (
            <span className="w-1.5 h-1.5 rounded-full bg-alert-green animate-pulse-slow" />
          )}
          {status.label}
        </Badge>
      </div>

      <div className="flex-1" />

      {/* Date & time */}
      <div className="hidden sm:flex flex-col items-end leading-tight">
        <span className="font-mono text-sm font-semibold text-slate-100 tracking-widest">
          {timeStr}
        </span>
        <span className="text-[10px] text-slate-500 capitalize">{dateStr}</span>
      </div>

      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative text-slate-400">
        <Bell className="w-4 h-4" />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-alert-red rounded-full" />
      </Button>

      {/* User avatar */}
      <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
        <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold text-white">
          SD
        </div>
        <div className="hidden md:block text-right leading-tight">
          <p className="text-xs font-semibold text-slate-200">st. asp. Dominiak</p>
          <p className="text-[10px] text-slate-500">nr. 4412</p>
        </div>
      </div>
    </header>
  )
}
