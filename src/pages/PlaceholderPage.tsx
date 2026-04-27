import { Construction } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const labels: Record<string, string> = {
  '/personal': 'Stan osobowy',
  '/deployments': 'Wyjazdy / Alarmy',
  '/readiness': 'Gotowość bojowa',
  '/equipment': 'Sprzęt i pojazdy',
  '/documents': 'Dokumentacja',
}

export function PlaceholderPage() {
  const { pathname } = useLocation()
  const label = labels[pathname] ?? 'Moduł'

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-700 flex items-center justify-center">
        <Construction className="w-7 h-7 text-slate-500" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-200">{label}</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-xs">
          Ten moduł jest w trakcie implementacji. Wróć wkrótce.
        </p>
      </div>
    </div>
  )
}
