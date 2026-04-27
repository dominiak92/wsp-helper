import { Users, Truck, Wrench, ShieldCheck } from 'lucide-react'
import { StatCard } from '../components/dashboard/StatCard'
import { RecentActivity } from '../components/dashboard/RecentActivity'
import { ReadinessPanel } from '../components/dashboard/ReadinessPanel'

export function DashboardPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Przegląd dyżuru</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Bieżący status jednostki i zasobów bojowych
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Stan osobowy"
          value="16/18"
          subtitle="2 nieobecnych — urlop"
          icon={Users}
          accent="brand"
        />
        <StatCard
          title="Aktywne wyjazdy"
          value="2"
          subtitle="Alarm bojowy + Techniczny"
          icon={Truck}
          accent="warning"
        />
        <StatCard
          title="Pojazdy sprawne"
          value="4/5"
          subtitle="GBA 3/24 w serwisie"
          icon={Wrench}
          accent="success"
        />
        <StatCard
          title="Gotowość ogólna"
          value="94%"
          subtitle="Wysoka gotowość bojowa"
          icon={ShieldCheck}
          accent="success"
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
        <div>
          <ReadinessPanel />
        </div>
      </div>

      {/* Placeholder modules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {['Harmonogram służb', 'Meldunki i raporty', 'Szkolenia'].map((name) => (
          <div
            key={name}
            className="rounded-lg border border-dashed border-slate-700 bg-surface-800/40 p-6 flex flex-col items-center justify-center text-center gap-2 min-h-[120px]"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">{name}</p>
            <p className="text-xs text-slate-700">Moduł w przygotowaniu</p>
          </div>
        ))}
      </div>
    </div>
  )
}
