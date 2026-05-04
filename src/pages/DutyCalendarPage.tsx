import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { cn } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { isDutyDay } from '../lib/duty'

// Meeus/Jones/Butcher algorithm
function getEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month, day))
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000)
}

function ymdKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function dateKey(date: Date): string {
  return ymdKey(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

interface HolidayEntry {
  name: string
  type: 'public' | 'notable'
}

function getHolidays(year: number): Record<string, HolidayEntry> {
  const h: Record<string, HolidayEntry> = {}

  const pub = (month: number, day: number, name: string) => {
    h[ymdKey(year, month, day)] = { name, type: 'public' }
  }
  const notable = (month: number, day: number, name: string) => {
    h[ymdKey(year, month, day)] = { name, type: 'notable' }
  }

  // Fixed public holidays
  pub(0, 1, 'Nowy Rok')
  pub(0, 6, 'Trzech Króli')
  pub(4, 1, 'Święto Pracy')
  pub(4, 3, 'Konstytucja 3 Maja')
  pub(7, 15, 'Wniebowzięcie NMP / Święto Wojska Polskiego')
  pub(10, 1, 'Wszystkich Świętych')
  pub(10, 11, 'Narodowe Święto Niepodległości')
  pub(11, 25, 'Boże Narodzenie')
  pub(11, 26, 'Drugi Dzień Bożego Narodzenia')

  // Easter-based public holidays
  const easter = getEaster(year)
  h[dateKey(easter)] = { name: 'Niedziela Wielkanocna', type: 'public' }
  h[dateKey(addDays(easter, 1))] = { name: 'Poniedziałek Wielkanocny', type: 'public' }
  h[dateKey(addDays(easter, 49))] = { name: 'Zesłanie Ducha Świętego', type: 'public' }
  h[dateKey(addDays(easter, 60))] = { name: 'Boże Ciało', type: 'public' }

  // Notable days relevant for WSP / military fire brigade
  notable(4, 4, 'Dzień Strażaka')
  notable(7, 20, 'Dzień Weterana Działań poza Granicami')
  notable(10, 2, 'Dzień Pamięci')
  notable(5, 12, 'Dzień Ratownika')

  return h
}

const MONTH_NAMES = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

const MONTH_SHORT = [
  'sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
  'lip', 'sie', 'wrz', 'paź', 'lis', 'gru',
]

const DAY_ABBR = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']

const todayKey = (() => {
  const t = new Date()
  return ymdKey(t.getFullYear(), t.getMonth(), t.getDate())
})()

function formatDisplayDate(key: string): string {
  const [, ms, ds] = key.split('-')
  return `${parseInt(ds)} ${MONTH_SHORT[parseInt(ms) - 1]}`
}

// ── Month calendar ────────────────────────────────────────────────────────────

interface MonthProps {
  year: number
  month: number
  holidays: Record<string, HolidayEntry>
  savedDates: Set<string>
  onDutyDayClick: (key: string) => void
}

function MonthCalendar({ year, month, holidays, savedDates, onDutyDayClick }: MonthProps) {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const startOffset = firstDow === 0 ? 6 : firstDow - 1 // Mon = 0
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  const cells: (number | null)[] = [
    ...Array<null>(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-surface-800 border border-slate-700/40 rounded-xl p-3 flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold text-slate-300 text-center tracking-wide">
        {MONTH_NAMES[month]}
      </p>

      {/* Day headers */}
      <div className="grid grid-cols-7">
        {DAY_ABBR.map((d, i) => (
          <span
            key={d}
            className={cn(
              'text-center text-[9px] font-medium pb-0.5',
              i >= 5 ? 'text-slate-600' : 'text-slate-700',
            )}
          >
            {d}
          </span>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />

          const key = ymdKey(year, month, day)
          const duty = isDutyDay(year, month, day)
          const holiday = holidays[key]
          const isToday = key === todayKey
          const colIdx = i % 7
          const isSat = colIdx === 5
          const isSun = colIdx === 6
          const hasSavedAssignment = savedDates.has(key)

          return (
            <div
              key={key}
              title={
                duty
                  ? `${hasSavedAssignment ? '✓ Obsada zapisana · ' : ''}Kliknij aby otworzyć obsadę${holiday ? ` · ${holiday.name}` : ''}`
                  : holiday?.name
              }
              onClick={duty ? () => onDutyDayClick(key) : undefined}
              className={cn(
                'relative flex items-center justify-center aspect-square text-[11px] rounded leading-none select-none',
                duty
                  ? 'bg-brand-600 text-white font-bold cursor-pointer hover:bg-brand-500 transition-colors'
                  : 'cursor-default',
                !duty && (isSun ? 'text-red-400/60' : isSat ? 'text-slate-500' : 'text-slate-500'),
                !duty && holiday?.type === 'public' && 'text-amber-300',
                !duty && holiday?.type === 'notable' && 'text-sky-300',
                isToday && 'ring-2 ring-amber-400 ring-offset-[1.5px] ring-offset-surface-800 z-10',
              )}
            >
              {day}
              {/* Saved assignment indicator */}
              {duty && hasSavedAssignment && (
                <span className="absolute top-[1px] right-[1px] w-[5px] h-[5px] rounded-full bg-emerald-400" />
              )}
              {/* Holiday dot */}
              {holiday && (
                <span
                  className={cn(
                    'absolute bottom-[1px] left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full',
                    holiday.type === 'public' ? 'bg-amber-400' : 'bg-sky-400',
                    duty && 'opacity-80',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DutyCalendarPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState(2026)
  const [savedDates, setSavedDates] = useState<Set<string>>(new Set())
  const holidays = useMemo(() => getHolidays(year), [year])

  useEffect(() => {
    supabase
      .from('duty_assignments')
      .select('duty_date')
      .then(({ data }) => {
        if (data) setSavedDates(new Set(data.map(r => r.duty_date as string)))
      })
  }, [])

  const { totalDutyDays, dutyOnHoliday } = useMemo(() => {
    let totalDutyDays = 0
    const dutyOnHoliday: { key: string; entry: HolidayEntry }[] = []

    for (let m = 0; m < 12; m++) {
      const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
      for (let d = 1; d <= days; d++) {
        if (isDutyDay(year, m, d)) {
          totalDutyDays++
          const k = ymdKey(year, m, d)
          if (holidays[k]) dutyOnHoliday.push({ key: k, entry: holidays[k] })
        }
      }
    }
    return { totalDutyDays, dutyOnHoliday }
  }, [year, holidays])

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-400 flex-shrink-0" />
            Kalendarz służb
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            System 24/72h · <span className="text-brand-400 font-medium">{totalDutyDays} służb</span> w {year}
            <span className="hidden sm:inline"> · kliknij dzień służby aby zarządzać obsadą</span>
          </p>
        </div>

        {/* Year picker */}
        <div className="flex items-center gap-1 bg-surface-800 border border-slate-700/60 rounded-lg p-1">
          <button
            onClick={() => setYear(y => y - 1)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-700 transition-colors"
            title="Poprzedni rok"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-white w-14 text-center tabular-nums">{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-surface-700 transition-colors"
            title="Następny rok"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Duty-day holidays panel */}
      {dutyOnHoliday.length > 0 && (
        <div className="bg-surface-800 border border-slate-700/40 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Służby podczas świąt i ważnych dni — {year}
          </p>
          <div className="flex flex-wrap gap-2">
            {dutyOnHoliday.map(({ key, entry }) => (
              <button
                key={key}
                onClick={() => navigate(`/crew-generator?date=${key}`)}
                className={cn(
                  'flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1 border transition-colors',
                  entry.type === 'public'
                    ? 'bg-amber-950/30 border-amber-800/50 text-amber-200 hover:bg-amber-950/60'
                    : 'bg-sky-950/30 border-sky-800/50 text-sky-200 hover:bg-sky-950/60',
                )}
              >
                <span
                  className={cn(
                    'font-semibold',
                    entry.type === 'public' ? 'text-amber-400' : 'text-sky-400',
                  )}
                >
                  {formatDisplayDate(key)}
                </span>
                <span className="opacity-40">—</span>
                {entry.name}
                {savedDates.has(key) && (
                  <span className="w-[6px] h-[6px] rounded-full bg-emerald-400 ml-0.5" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 12-month grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 12 }, (_, m) => (
          <MonthCalendar
            key={m}
            year={year}
            month={m}
            holidays={holidays}
            savedDates={savedDates}
            onDutyDayClick={key => navigate(`/crew-generator?date=${key}`)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 pt-1 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-brand-600 flex-shrink-0" />
          <span>Dzień służby (kliknij → obsada)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-4 h-4 flex-shrink-0">
            <div className="w-4 h-4 rounded bg-brand-600" />
            <span className="absolute top-[1px] right-[1px] w-[5px] h-[5px] rounded-full bg-emerald-400" />
          </div>
          <span>Obsada zapisana</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-4 h-4 flex-shrink-0 flex items-center justify-center">
            <span className="w-[5px] h-[5px] rounded-full bg-amber-400" />
          </div>
          <span>Święto państwowe</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-4 h-4 flex-shrink-0 flex items-center justify-center">
            <span className="w-[5px] h-[5px] rounded-full bg-sky-400" />
          </div>
          <span>Ważny dzień</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded ring-2 ring-amber-400 bg-transparent flex-shrink-0" />
          <span>Dziś</span>
        </div>
      </div>
    </div>
  )
}
