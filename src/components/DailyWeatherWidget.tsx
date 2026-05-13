// Hourly weather forecast for today — Sulęcin (52.433°N, 15.117°E)
// Fetches directly from Open-Meteo (free, no API key)

import { useState, useEffect, useRef } from 'react'
import { Cloud, Droplets, Wind, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'

interface HourlyForecast {
  time: string[]
  temperature_2m: number[]
  apparent_temperature: number[]
  precipitation: number[]
  precipitation_probability: number[]
  weathercode: number[]
  windspeed_10m: number[]
  relativehumidity_2m: number[]
}

const WMO_EMOJI: Record<number, string> = {
  0: '☀️',
  1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  56: '🌧️', 57: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  66: '🌧️', 67: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️', 77: '🌨️',
  80: '🌦️', 81: '🌦️', 82: '🌦️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

const WMO_LABEL: Record<number, string> = {
  0: 'Bezchmurnie',
  1: 'Prawie bezchmurnie', 2: 'Częściowe zachmurzenie', 3: 'Zachmurzone',
  45: 'Mgła', 48: 'Mgła szronowa',
  51: 'Mżawka lekka', 53: 'Mżawka', 55: 'Mżawka gęsta',
  61: 'Deszcz słaby', 63: 'Deszcz', 65: 'Intensywny deszcz',
  71: 'Śnieg słaby', 73: 'Śnieg', 75: 'Intensywny śnieg', 77: 'Ziarnistości śnieżne',
  80: 'Przelotne opady', 81: 'Przelotne opady', 82: 'Silne opady',
  85: 'Przelotny śnieg', 86: 'Intensywny śnieg',
  95: 'Burza', 96: 'Burza z gradem', 99: 'Burza z silnym gradem',
}

function wmoEmoji(code: number) { return WMO_EMOJI[code] ?? '🌡️' }
function wmoLabel(code: number) { return WMO_LABEL[code] ?? 'Nieznane' }
function hourOf(timeStr: string) { return parseInt(timeStr.split('T')[1]?.split(':')[0] ?? '0') }

const API_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=52.433&longitude=15.117' +
  '&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weathercode,windspeed_10m,relativehumidity_2m' +
  '&forecast_days=2&timezone=Europe%2FWarsaw'

function useDailyWeather() {
  const [data, setData] = useState<HourlyForecast | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(API_URL)
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (json?.hourly) {
          const today = new Date().toLocaleDateString('en-CA')
          const idx = (json.hourly.time as string[])
            .map((t, i) => ({ t, i }))
            .filter(({ t }) => t.startsWith(today))
            .map(({ i }) => i)

          setData({
            time:                     idx.map(i => json.hourly.time[i]),
            temperature_2m:           idx.map(i => json.hourly.temperature_2m[i]),
            apparent_temperature:     idx.map(i => json.hourly.apparent_temperature[i]),
            precipitation:            idx.map(i => json.hourly.precipitation[i]),
            precipitation_probability:idx.map(i => json.hourly.precipitation_probability[i]),
            weathercode:              idx.map(i => json.hourly.weathercode[i]),
            windspeed_10m:            idx.map(i => json.hourly.windspeed_10m[i]),
            relativehumidity_2m:      idx.map(i => json.hourly.relativehumidity_2m[i]),
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return { data, loading }
}

function daySummary(data: HourlyForecast) {
  const totalPrecip = data.precipitation.reduce((a, b) => a + b, 0)
  const maxTemp = Math.max(...data.temperature_2m)
  const minTemp = Math.min(...data.temperature_2m)
  const maxWind = Math.max(...data.windspeed_10m)

  // dominant condition during daytime (8-20h)
  const daytimeCodes = data.time
    .map((t, i) => ({ h: hourOf(t), i }))
    .filter(({ h }) => h >= 8 && h <= 20)
    .map(({ i }) => data.weathercode[i])
  const freq = daytimeCodes.reduce<Record<number, number>>((acc, c) => {
    acc[c] = (acc[c] ?? 0) + 1; return acc
  }, {})
  const dominantCode = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0)

  return { totalPrecip, maxTemp, minTemp, maxWind, dominantCode }
}

// ── Shared hour card ──────────────────────────────────────────────────────────

function HourCard({ hour, emoji, temp, prob, precip, current }: {
  hour: number; emoji: string; temp: number; prob: number; precip: number; current: boolean
}) {
  return (
    <div className={cn(
      'flex flex-col items-center py-3 px-2.5 shrink-0 min-w-[3.5rem] border-r border-slate-700/30 last:border-r-0',
      current && 'bg-brand-500/10',
    )}>
      <p className={cn('text-[10px] font-bold mb-1', current ? 'text-brand-400' : 'text-slate-500')}>
        {hour.toString().padStart(2, '0')}
      </p>
      <span className="text-base leading-none mb-1">{emoji}</span>
      <p className={cn('text-xs font-semibold tabular-nums', current ? 'text-white' : 'text-slate-300')}>
        {Math.round(temp)}°
      </p>
      <p className={cn('text-[9px] mt-0.5 tabular-nums', prob >= 20 ? 'text-blue-400' : 'text-transparent')}>
        {prob >= 20 ? `${prob}%` : '·'}
      </p>
      {precip > 0.1 ? (
        <p className="text-[9px] text-blue-300 tabular-nums">{precip.toFixed(1)}</p>
      ) : null}
    </div>
  )
}

// ── Mobile: collapsible ───────────────────────────────────────────────────────

export function DailyWeatherCollapsible() {
  const { data, loading } = useDailyWeather()
  const [open, setOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentHour = new Date().getHours()
  const todayLabel = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })

  useEffect(() => {
    if (!open || !data || !scrollRef.current) return
    const idx = data.time.findIndex(t => hourOf(t) === currentHour)
    if (idx >= 0) {
      const card = scrollRef.current.children[idx] as HTMLElement
      card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [open, data]) // eslint-disable-line react-hooks/exhaustive-deps

  const summary = data ? daySummary(data) : null

  return (
    <div>
      <div
        className="w-full flex items-center justify-between bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3 cursor-pointer transition-colors"
        onClick={() => setOpen(v => !v)}
        role="button"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className="text-lg shrink-0 leading-none">
            {summary ? wmoEmoji(summary.dominantCode) : '🌡️'}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white">Pogoda na dziś</p>
              {!loading && (
                <span className="text-[10px] font-medium text-slate-400 bg-surface-700 px-1.5 py-0.5 rounded border border-slate-600/50 shrink-0">
                  {todayLabel}
                </span>
              )}
            </div>
            {loading ? (
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span className="inline-block w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse shrink-0" />
                Ładowanie…
              </p>
            ) : summary ? (
              <p className="text-[11px] text-slate-400 mt-0.5">
                {Math.round(summary.minTemp)}°–{Math.round(summary.maxTemp)}°
                {summary.totalPrecip > 0
                  ? ` · 💧 ${summary.totalPrecip.toFixed(1)} mm`
                  : ' · Bez opadów'}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 mt-0.5">Brak danych</p>
            )}
          </div>
        </div>
        <div className="shrink-0">
          {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </div>

      {open && (
        <div className="mt-2 bg-surface-800 rounded-xl border border-slate-700/40 overflow-hidden">
          {!data ? (
            <p className="text-xs text-slate-600 text-center py-4">Brak danych pogodowych</p>
          ) : (
            <>
              <div ref={scrollRef} className="flex overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {data.time.map((t, i) => (
                  <HourCard
                    key={t}
                    hour={hourOf(t)}
                    emoji={wmoEmoji(data.weathercode[i])}
                    temp={data.temperature_2m[i]}
                    prob={data.precipitation_probability[i]}
                    precip={data.precipitation[i]}
                    current={hourOf(t) === currentHour}
                  />
                ))}
              </div>
              {summary && (
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-700/40 text-[11px]">
                  <span className="flex items-center gap-1 text-slate-500 shrink-0">
                    <Wind className="w-3 h-3 text-slate-600" />
                    <span className="text-slate-400">{Math.round(summary.maxWind)} km/h</span>
                  </span>
                  <span className="flex-1 min-w-0 text-center text-slate-500 truncate">
                    {wmoLabel(summary.dominantCode)}
                  </span>
                  <span className="flex items-center gap-1 text-slate-500 shrink-0">
                    <Droplets className="w-3 h-3 text-blue-600" />
                    <span className="text-slate-400">
                      {summary.totalPrecip > 0 ? `${summary.totalPrecip.toFixed(1)} mm` : 'Sucho'}
                    </span>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Desktop: card (always expanded) ──────────────────────────────────────────

export function DailyWeatherCard({ className }: { className?: string }) {
  const { data, loading } = useDailyWeather()
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentHour = new Date().getHours()
  const todayLabel = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })

  useEffect(() => {
    if (!data || !scrollRef.current) return
    const idx = data.time.findIndex(t => hourOf(t) === currentHour)
    if (idx >= 0) {
      const card = scrollRef.current.children[idx] as HTMLElement
      card?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const summary = data ? daySummary(data) : null

  return (
    <div className={cn('bg-surface-800 rounded-xl border border-slate-700/40', className)}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <Cloud className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pogoda na dziś</p>
            {!loading && (
              <p className="text-[10px] text-slate-500 mt-0.5">{todayLabel} · Sulęcin</p>
            )}
          </div>
        </div>
        {summary && !loading && (
          <p className="text-[11px] text-slate-400 shrink-0">
            {Math.round(summary.minTemp)}°–{Math.round(summary.maxTemp)}°
            {summary.totalPrecip > 0 ? ` · 💧 ${summary.totalPrecip.toFixed(1)}` : ''}
          </p>
        )}
      </div>

      {loading ? (
        <div className="h-20 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-xs text-slate-600 py-4 text-center">Brak danych pogodowych</p>
      ) : (
        <>
          <div ref={scrollRef} className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {data.time.map((t, i) => (
              <HourCard
                key={t}
                hour={hourOf(t)}
                emoji={wmoEmoji(data.weathercode[i])}
                temp={data.temperature_2m[i]}
                prob={data.precipitation_probability[i]}
                precip={data.precipitation[i]}
                current={hourOf(t) === currentHour}
              />
            ))}
          </div>
          {summary && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-800/60 text-[11px]">
              <span className="flex items-center gap-1 text-slate-500 shrink-0">
                <Wind className="w-3 h-3 text-slate-600" />
                <span className="text-slate-400">{Math.round(summary.maxWind)} km/h</span>
              </span>
              <span className="flex-1 min-w-0 text-center text-slate-500 truncate">
                {wmoLabel(summary.dominantCode)}
              </span>
              <span className="flex items-center gap-1 text-slate-500 shrink-0">
                <Droplets className="w-3 h-3 text-blue-600" />
                <span className="text-slate-400">
                  {summary.totalPrecip > 0 ? `${summary.totalPrecip.toFixed(1)} mm` : 'Sucho'}
                </span>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
