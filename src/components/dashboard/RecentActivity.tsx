import { AlertTriangle, CheckCircle2, Clock, Truck } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card'
import { Badge } from '../ui/Badge'

const activities = [
  {
    id: 1,
    type: 'alarm',
    message: 'Alarm bojowy — pożar budynku mieszkalnego',
    time: '08:42',
    status: 'active',
  },
  {
    id: 2,
    type: 'return',
    message: 'Powrót z akcji — GCBA 5/32 GBA',
    time: '07:15',
    status: 'done',
  },
  {
    id: 3,
    type: 'check',
    message: 'Przegląd sprzętu oddychającego — pluton I',
    time: '06:00',
    status: 'done',
  },
  {
    id: 4,
    type: 'alarm',
    message: 'Alarm techniczny — wypadek drogowy',
    time: 'Wczoraj 22:37',
    status: 'done',
  },
]

const iconMap = {
  alarm: { icon: AlertTriangle, cls: 'text-alert-amber' },
  return: { icon: Truck, cls: 'text-brand-400' },
  check: { icon: CheckCircle2, cls: 'text-alert-green' },
}

export function RecentActivity() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Ostatnia aktywność</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-slate-800">
          {activities.map((a) => {
            const { icon: Icon, cls } = iconMap[a.type as keyof typeof iconMap]
            return (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-700/40 transition-colors">
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cls}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 leading-snug">{a.message}</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {a.time}
                  </p>
                </div>
                {a.status === 'active' && (
                  <Badge variant="warning" className="flex-shrink-0 text-[10px]">AKTYWNY</Badge>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
