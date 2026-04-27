import { Shield, Users, Truck, Wrench } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { cn } from '../../lib/utils'

interface ReadinessRow {
  label: string
  icon: React.ComponentType<{ className?: string }>
  ready: number
  total: number
}

const rows: ReadinessRow[] = [
  { label: 'Stan osobowy', icon: Users, ready: 16, total: 18 },
  { label: 'Pojazdy', icon: Truck, ready: 4, total: 5 },
  { label: 'Sprzęt BA', icon: Wrench, ready: 12, total: 12 },
  { label: 'Łączność', icon: Shield, ready: 6, total: 6 },
]

function ProgressBar({ value }: { value: number }) {
  const color =
    value >= 90 ? 'bg-alert-green' : value >= 60 ? 'bg-alert-amber' : 'bg-alert-red'
  return (
    <div className="w-full h-1.5 bg-surface-600 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', color)}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export function ReadinessPanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Wskaźnik gotowości</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => {
          const pct = Math.round((row.ready / row.total) * 100)
          return (
            <div key={row.label}>
              <div className="flex items-center gap-2 mb-1.5">
                <row.icon className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-300 flex-1">{row.label}</span>
                <span className="text-xs font-mono text-slate-400">
                  {row.ready}/{row.total}
                </span>
                <span
                  className={cn(
                    'text-xs font-bold font-mono',
                    pct >= 90 ? 'text-alert-green' : pct >= 60 ? 'text-alert-amber' : 'text-alert-red'
                  )}
                >
                  {pct}%
                </span>
              </div>
              <ProgressBar value={pct} />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
