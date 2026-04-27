import { type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '../ui/Card'
import { cn } from '../../lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  accent?: 'brand' | 'success' | 'warning' | 'danger'
}

const accentMap = {
  brand: 'text-brand-400 bg-brand-900/30',
  success: 'text-alert-green bg-alert-green/10',
  warning: 'text-alert-amber bg-alert-amber/10',
  danger: 'text-alert-red bg-alert-red/10',
}

export function StatCard({ title, value, subtitle, icon: Icon, accent = 'brand' }: StatCardProps) {
  return (
    <Card className="hover:border-slate-600/60 transition-colors">
      <CardContent className="flex items-start gap-4 p-5">
        <div className={cn('rounded-lg p-2.5', accentMap[accent])}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
            {title}
          </p>
          <p className="text-2xl font-bold text-slate-100 font-mono">{value}</p>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
