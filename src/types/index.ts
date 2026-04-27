export type ReadinessStatus = 'GOTOWY' | 'CZĘŚCIOWY' | 'NIEAKTYWNY'

export interface User {
  id: string
  serviceNumber: string
  name: string
  rank: string
  role: 'admin' | 'officer' | 'firefighter'
}

export interface NavItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  path: string
  badge?: string | number
}
