import { useState, useEffect } from 'react'
import { ChevronDown, Flame, Thermometer, Droplets, Leaf, Wind } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { WeatherReading, WeatherData } from '../../lib/weather'
import { FIRE_STYLES, parseFireLevel } from '../../lib/weather'

// ── weather helpers ───────────────────────────────────────────────────────────

function FireThreatCard({
  label, reading, selected, onClick,
}: {
  label: string
  reading: WeatherReading | null
  selected?: boolean
  onClick?: () => void
}) {
  const level = parseFireLevel(reading?.fireThreat ?? null)
  const ls = FIRE_STYLES[level]
  const time = reading?.updatedAt?.match(/\d{2}:\d{2}/)?.[0] ?? null
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 text-left w-full transition-all',
        ls.bg, ls.border,
        selected && 'ring-2 ring-brand-500 ring-offset-1 ring-offset-surface-800',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
        {label}{time ? <span className="text-slate-600 font-normal"> · {time}</span> : null}
      </p>
      <p className={cn('text-sm font-bold leading-snug', reading ? ls.text : 'text-slate-600')}>
        {reading?.fireThreat ?? '—'}
      </p>
      {reading?.fireThreatForecast && (
        <p className="text-[10px] text-slate-500 mt-0.5">
          prognoza: <span className="text-slate-400">{reading.fireThreatForecast}</span>
        </p>
      )}
    </button>
  )
}

export function WeatherCollapsible({ data, loading }: { data: WeatherData | null; loading: boolean }) {
  const [open, setOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<'morning' | 'afternoon'>('morning')

  useEffect(() => {
    if (!data) return
    const hour = new Date().getHours()
    setSelectedSlot(hour >= 12 && data.afternoon ? 'afternoon' : 'morning')
  }, [data])

  const displayed = data?.[selectedSlot] ?? data?.afternoon ?? data?.morning ?? null
  const latest = data?.afternoon ?? data?.morning ?? null
  const level = parseFireLevel(latest?.fireThreat ?? null)
  const ls = FIRE_STYLES[level]

  return (
    <div>
      <div
        className={cn(
          'w-full flex items-center justify-between bg-surface-800 rounded-xl border px-4 py-3 transition-colors cursor-pointer',
          ls.border,
        )}
        onClick={() => setOpen(v => !v)}
        role="button"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <Flame className={cn('w-4 h-4 shrink-0', ls.text)} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Zagrożenie pożarowe</p>
            {loading ? (
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span className="inline-block w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse shrink-0" />
                {data ? 'Odświeżanie…' : 'Ładowanie…'}
              </p>
            ) : data ? (
              <p className={cn('text-[11px] font-semibold mt-0.5', ls.text)}>
                {latest?.fireThreat ?? 'Brak danych'}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 mt-0.5">Oczekiwanie na dane dnia</p>
            )}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-500 shrink-0 transition-transform duration-300', open && 'rotate-180')} />
      </div>

        <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', open ? 'max-h-[450px] opacity-100' : 'max-h-0 opacity-0')}>
          <div className={cn('mt-2 bg-surface-800 rounded-xl border border-slate-700/40 p-4 space-y-3', loading && 'opacity-50 pointer-events-none')}>
            {!data ? (
              <p className="text-xs text-slate-600 text-center py-2">Dane zostaną pobrane o godz. 9:00 i 13:00</p>
            ) : (
              <>
                {/* Dwa pomiary — klikalne */}
                <div className="grid grid-cols-2 gap-2">
                  <FireThreatCard
                    label="Godz. 9"
                    reading={data.morning}
                    selected={selectedSlot === 'morning'}
                    onClick={() => setSelectedSlot('morning')}
                  />
                  <FireThreatCard
                    label="Godz. 13"
                    reading={data.afternoon}
                    selected={selectedSlot === 'afternoon'}
                    onClick={() => setSelectedSlot('afternoon')}
                  />
                </div>

                {/* Dane meteorologiczne dla wybranego odczytu */}
                {displayed && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center bg-surface-700/30 rounded-lg py-2">
                        <Thermometer className="w-3.5 h-3.5 text-red-400 mx-auto mb-0.5" />
                        <p className="text-sm font-bold text-white tabular-nums">
                          {displayed.temperature ? `${displayed.temperature}°` : '—'}
                        </p>
                        <p className="text-[10px] text-slate-600 uppercase tracking-wide">temp.</p>
                      </div>
                      <div className="text-center bg-surface-700/30 rounded-lg py-2">
                        <Leaf className="w-3.5 h-3.5 text-amber-500 mx-auto mb-0.5" />
                        <p className="text-sm font-bold text-white tabular-nums">{displayed.moisture ?? '—'}</p>
                        <p className="text-[10px] text-slate-600 uppercase tracking-wide">ściółka</p>
                      </div>
                      <div className="text-center bg-surface-700/30 rounded-lg py-2">
                        <Droplets className="w-3.5 h-3.5 text-blue-400 mx-auto mb-0.5" />
                        <p className="text-sm font-bold text-white tabular-nums">
                          {displayed.humidity ?? '—'}<span className="text-[10px] font-normal text-slate-500">%</span>
                        </p>
                        <p className="text-[10px] text-slate-600 uppercase tracking-wide">wilgotność</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                      <span className="flex items-center gap-1">
                        <Wind className="w-3 h-3 text-slate-600" />
                        <span className="text-slate-400">{displayed.windSpeed ?? '—'} m/s {displayed.windDir ?? ''}</span>
                      </span>
                      <span>Opady: <span className="text-slate-400">{displayed.precipitation ?? '0'} mm</span></span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
    </div>
  )
}
