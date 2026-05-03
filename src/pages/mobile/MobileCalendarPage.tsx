import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { isDutyDay, ymdKey, todayYmdKey, formatDateShort, formatDateLong } from '../../lib/duty'
import { DutyAssignmentView } from '../../components/DutyAssignmentView'
import { cn } from '../../lib/utils'
import type { Person, ShiftAssignment, RoleType, AbsenceType } from '../../lib/crew'

const DAY_ABBR = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
const MONTH_NAMES = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

export function MobileCalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [savedDates, setSavedDates] = useState<Set<string>>(new Set())
  const [personnel, setPersonnel] = useState<Person[]>([])
  const [assignment, setAssignment] = useState<ShiftAssignment | null>(null)
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const todayK = todayYmdKey()

  useEffect(() => {
    Promise.all([
      supabase.from('personnel').select('*'),
      supabase.from('duty_assignments').select('duty_date'),
    ]).then(([{ data: pData }, { data: dData }]) => {
      if (pData) {
        setPersonnel(pData.map(row => ({
          id: row.id,
          name: row.name,
          roles: row.roles as RoleType[],
          preferredVehicleId: row.preferred_vehicle_id ?? undefined,
          absence: row.absence as AbsenceType | null,
        })))
      }
      if (dData) setSavedDates(new Set(dData.map(r => r.duty_date as string)))
    })
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setAssignmentLoading(true)
    setAssignment(null)
    supabase
      .from('duty_assignments')
      .select('assignment_json')
      .eq('duty_date', selectedDate)
      .single()
      .then(({ data }) => {
        if (data?.assignment_json) {
          const parsed = data.assignment_json as ShiftAssignment
          if (Array.isArray(parsed.dutyOfficerIds)) setAssignment(parsed)
        }
        setAssignmentLoading(false)
      })
  }, [selectedDate])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  const cells = useMemo(() => {
    const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay()
    const startOffset = firstDow === 0 ? 6 : firstDow - 1
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const result: (number | null)[] = [
      ...Array<null>(startOffset).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ]
    while (result.length % 7 !== 0) result.push(null)
    return result
  }, [year, month])

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-4">
        <button onClick={prevMonth} className="p-2 rounded-lg text-slate-400 active:bg-surface-800 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-bold text-white">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg text-slate-400 active:bg-surface-800 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="px-3">
        <div className="grid grid-cols-7 mb-1">
          {DAY_ABBR.map((d, i) => (
            <span key={d} className={cn('text-center text-[10px] font-medium py-1',
              i >= 5 ? 'text-slate-600' : 'text-slate-700')}>
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1.5">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />
            const key = ymdKey(year, month, day)
            const duty = isDutyDay(year, month, day)
            const hasSaved = savedDates.has(key)
            const isToday = key === todayK
            const isSelected = key === selectedDate
            const isSun = (i % 7) === 6
            return (
              <button
                key={key}
                disabled={!duty}
                onClick={() => setSelectedDate(isSelected ? null : key)}
                className={cn(
                  'relative flex items-center justify-center aspect-square text-[13px] rounded-xl leading-none font-medium transition-all',
                  duty
                    ? isSelected
                      ? 'bg-brand-500 text-white font-bold shadow-lg shadow-brand-900/50'
                      : 'bg-brand-800/70 text-brand-200 font-bold active:bg-brand-600'
                    : isSun ? 'text-slate-700' : 'text-slate-700',
                  isToday && !isSelected && 'ring-2 ring-amber-400 ring-offset-1 ring-offset-surface-950',
                )}
              >
                {day}
                {duty && hasSaved && !isSelected && (
                  <span className="absolute top-[3px] right-[3px] w-[5px] h-[5px] rounded-full bg-emerald-400" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Assignment panel */}
      {selectedDate ? (
        <div className="mt-5 border-t border-slate-800">
          <div className="px-4 pt-4 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-0.5">Obsada</p>
            <h3 className="text-lg font-bold text-white">{formatDateShort(selectedDate)}</h3>
            <p className="text-xs text-slate-500">{formatDateLong(selectedDate)}</p>
          </div>
          <DutyAssignmentView personnel={personnel} assignment={assignment} loading={assignmentLoading} />
        </div>
      ) : (
        <div className="flex items-center justify-center py-10 px-6 mt-2">
          <p className="text-xs text-slate-600 text-center">
            Dotknij dnia służby (niebieski) aby zobaczyć obsadę
          </p>
        </div>
      )}
    </div>
  )
}
