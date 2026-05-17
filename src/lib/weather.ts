export interface WeatherReading {
  moisture: string | null
  temperature: string | null
  humidity: string | null
  precipitation: string | null
  windSpeed: string | null
  windDir: string | null
  fireThreat: string | null
  fireThreatForecast: string | null
  updatedAt: string | null
  cachedAt?: string | null
}

export interface WeatherData {
  morning: WeatherReading | null
  afternoon: WeatherReading | null
}

export const FIRE_STYLES: Record<number, { text: string; bg: string; border: string }> = {
  0: { text: 'text-slate-400',   bg: 'bg-surface-700/50',     border: 'border-slate-700/40'   },
  1: { text: 'text-emerald-400', bg: 'bg-emerald-950/40',     border: 'border-emerald-900/50' },
  2: { text: 'text-amber-400',   bg: 'bg-amber-950/40',       border: 'border-amber-900/50'   },
  3: { text: 'text-orange-400',  bg: 'bg-orange-950/40',      border: 'border-orange-900/50'  },
  4: { text: 'text-red-400',     bg: 'bg-red-950/40',         border: 'border-red-900/50'     },
  5: { text: 'text-red-300',     bg: 'bg-red-950/60',         border: 'border-red-800/60'     },
}

export function parseFireLevel(threat: string | null): number {
  if (!threat) return 0
  const m = threat.match(/^(\d)/)
  return m ? Math.min(5, Math.max(0, parseInt(m[1]))) : 0
}
