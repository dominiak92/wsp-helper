import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { isDutyDay, isBillingDay, ymdKey, todayYmdKey, formatDateShortWithDay } from '../../lib/duty'
import type { CalendarEvent } from '../../lib/duty'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/utils'
import type { Person, ShiftAssignment, RoleType, AbsenceType } from '../../lib/crew'
import { CREW_VEHICLE_NAMES, AUTO_CREW_VEHICLE_IDS, ABSENCE_LABELS, parseShiftAssignment, withGuests, resolveName } from '../../lib/crew'

// ── helpers ───────────────────────────────────────────────────────────────────

const DAY_ABBR = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']
const MONTH_NAMES = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

type UserStatus =
  | { kind: 'assigned'; role: string; vehicle: string | null }
  | { kind: 'reserve' }
  | { kind: 'absent'; label: string }
  | { kind: 'unsaved' }

function resolveUserStatus(
  assignment: ShiftAssignment | undefined,
  personId: string,
): UserStatus | null {
  if (!assignment) return { kind: 'unsaved' }

  if (assignment.shiftCommanderId === personId)
    return { kind: 'assigned', role: 'Dowódca zmiany', vehicle: null }
  if (assignment.dutyOfficerIds.includes(personId))
    return { kind: 'assigned', role: 'Dyżurny', vehicle: null }
  for (const v of assignment.vehicles) {
    const vName = CREW_VEHICLE_NAMES[v.vehicleId as keyof typeof CREW_VEHICLE_NAMES] ?? v.vehicleId
    if (v.commanderId === personId)
      return { kind: 'assigned', role: 'Dowódca zastępu', vehicle: vName }
    if (v.driverId === personId)
      return { kind: 'assigned', role: 'Kierowca', vehicle: vName }
    if (v.rescuerIds.includes(personId))
      return { kind: 'assigned', role: 'Ratownik', vehicle: vName }
  }
  if (assignment.unassignedIds.includes(personId))
    return { kind: 'reserve' }

  // Not in assignment — use date-specific absence from absenceMap
  const absType = assignment.absenceMap?.[personId]
  const label = absType ? ABSENCE_LABELS[absType] : 'Nieobecny'
  return { kind: 'absent', label }
}

// Short label for calendar cell (max 3-4 chars)
function cellAbsenceTag(status: UserStatus | null): string | null {
  if (!status) return null
  if (status.kind === 'absent') {
    // Try to shorten
    const l = status.label
    if (l.startsWith('WH')) return 'WH'
    if (l.startsWith('8W')) return '8W'
    if (l.startsWith('W –') || l === 'W') return 'W'
    if (l.startsWith('Odd')) return 'Odd'
    if (l.startsWith('L4')) return 'L4'
    return 'Ni.'
  }
  if (status.kind === 'reserve') return 'Rez.'
  return null
}

// ── component ─────────────────────────────────────────────────────────────────

export function MobileCalendarPage() {
  const { user } = useAuth()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [personnel, setPersonnel] = useState<Person[]>([])
  // Map: duty_date → ShiftAssignment (for current month's saved assignments)
  const [assignmentMap, setAssignmentMap] = useState<Map<string, ShiftAssignment>>(new Map())
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const [monthLoading, setMonthLoading] = useState(false)
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([])
  const todayK = todayYmdKey()

  useEffect(() => {
    supabase
      .from('calendar_events')
      .select('*')
      .then(({ data }) => {
        if (data) setCalEvents(data as CalendarEvent[])
      })
  }, [])

  const eventDates = useMemo(() => new Set(calEvents.map(e => e.event_date)), [calEvents])

  // Load personnel once
  useEffect(() => {
    supabase.from('personnel').select('*').then(({ data }) => {
      if (data) {
        setPersonnel(data.map(row => ({
          id: row.id,
          name: row.name,
          roles: row.roles as RoleType[],
          preferredVehicleId: row.preferred_vehicle_id ?? undefined,
          absence: row.absence as AbsenceType | null,
          login: row.login ?? null,
        })))
      }
    })
  }, [])

  // Reload assignments when month/year changes
  useEffect(() => {
    setMonthLoading(true)
    const firstDay = ymdKey(year, month, 1)
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const lastDay = ymdKey(year, month, daysInMonth)

    supabase
      .from('duty_assignments')
      .select('duty_date, assignment_json')
      .gte('duty_date', firstDay)
      .lte('duty_date', lastDay)
      .then(({ data }) => {
        const m = new Map<string, ShiftAssignment>()
        for (const row of data ?? []) {
          const parsed = parseShiftAssignment(row.assignment_json)
          if (parsed) {
            const existing = m.get(row.duty_date as string)
            if (!existing) m.set(row.duty_date as string, parsed)
          }
        }
        setAssignmentMap(m)
        setMonthLoading(false)
      })
  }, [year, month])

  // Load selected date assignment
  useEffect(() => {
    if (!selectedDate) return
    // If already in map — use it directly (no extra fetch needed)
    if (assignmentMap.has(selectedDate)) return
    setAssignmentLoading(true)
    supabase
      .from('duty_assignments')
      .select('assignment_json')
      .eq('duty_date', selectedDate)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const parsed = parseShiftAssignment(data?.[0]?.assignment_json)
        if (parsed) setAssignmentMap(prev => new Map(prev).set(selectedDate, parsed))
        setAssignmentLoading(false)
      })
  }, [selectedDate, assignmentMap])

  function prevMonth() {
    setSelectedDate(null)
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    setSelectedDate(null)
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
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

  // Find logged-in user's personnel record
  const myPerson = useMemo(
    () => (user ? personnel.find(p => p.login === user.login) ?? null : null),
    [user, personnel]
  )

  // All duty days in the current month (for summary)
  const dutyDaysInMonth = useMemo(() => {
    const days: string[] = []
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    for (let d = 1; d <= daysInMonth; d++) {
      if (isDutyDay(year, month, d)) days.push(ymdKey(year, month, d))
    }
    return days
  }, [year, month])


  const selectedAssignment = selectedDate ? assignmentMap.get(selectedDate) ?? null : null
  const isLoading = selectedDate
    ? assignmentLoading && !assignmentMap.has(selectedDate)
    : false

  // Personnel with absences derived from the selected assignment's absenceMap,
  // so the popover resolves names with the right per-date partial-8h flags.
  const personnelForView = useMemo(() => {
    if (!selectedAssignment) return personnel.map(p => ({ ...p, absence: null as AbsenceType | null, partial8h: false }))
    return personnel.map(p => ({
      ...p,
      absence: (selectedAssignment.absenceMap?.[p.id] ?? null) as AbsenceType | null,
      partial8h: !!selectedAssignment.partial8hIds?.includes(p.id),
    }))
  }, [personnel, selectedAssignment])

  // Floating popover: anchored under the selected cell, never shifts the grid.
  const selectedCellRef = useRef<HTMLButtonElement | null>(null)
  const calendarRef = useRef<HTMLDivElement>(null)
  const [popoverTop, setPopoverTop] = useState(0)
  const selectedInMonth = useMemo(() => {
    if (!selectedDate) return false
    const [sy, smo] = selectedDate.split('-').map(Number)
    return sy === year && smo === month + 1
  }, [selectedDate, year, month])

  useLayoutEffect(() => {
    const el = selectedCellRef.current
    if (selectedInMonth && el) setPopoverTop(el.offsetTop + el.offsetHeight + 4)
  }, [selectedInMonth, selectedDate, year, month, monthLoading, assignmentMap, cells])

  return (
    <div className="min-h-full">

      {/* ── Calendar column ── */}
      <div ref={calendarRef} className="w-full max-w-md mx-auto scroll-mt-2">

        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 py-4">
          <button onClick={prevMonth} className="p-2 rounded-lg text-slate-400 active:bg-surface-800 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white">{MONTH_NAMES[month]} {year}</h2>
            {monthLoading && (
              <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <button onClick={nextMonth} className="p-2 rounded-lg text-slate-400 active:bg-surface-800 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Calendar grid */}
        <div className="px-2 pb-3">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_ABBR.map((d, i) => (
              <span key={d} className={cn('text-center text-[10px] font-medium py-1',
                i === 6 ? 'text-red-400/70' : i === 5 ? 'text-slate-400' : 'text-slate-500')}>
                {d}
              </span>
            ))}
          </div>

          {/* Day cells */}
          <div className="relative">
          <div className={cn('grid grid-cols-7 gap-y-1 transition-opacity duration-150', monthLoading && 'opacity-40 pointer-events-none')}>
            {cells.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />
              const key = ymdKey(year, month, day)
              const duty = isDutyDay(year, month, day)
              const isToday = key === todayK
              const isSelected = key === selectedDate

              const billing = isBillingDay(year, month, day)
              const hasEvent = eventDates.has(key)

              if (!duty) {
                const col = i % 7
                const isSat = col === 5
                const isSun = col === 6
                return (
                  <div key={key} className={cn(
                    'relative flex items-center justify-center aspect-square text-[12px] leading-none rounded-lg',
                    isToday
                      ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-surface-950 text-amber-400'
                      : hasEvent
                        ? 'bg-red-900/30 text-red-300'
                        : billing
                          ? 'bg-yellow-900/20 text-yellow-400'
                          : isSun
                            ? 'bg-slate-800/40 text-red-400/80'
                            : isSat
                              ? 'bg-slate-800/40 text-slate-300'
                              : 'text-slate-400',
                  )}>
                    {day}
                    {billing && (
                      <span className="absolute top-[1px] left-[1px] text-[6px] font-bold leading-none text-yellow-400">OR</span>
                    )}
                    {hasEvent && (
                      <span className="absolute -bottom-[2px] -right-[2px] w-[10px] h-[10px] rounded-full bg-red-500 flex items-center justify-center text-[7px] font-black text-white leading-none z-20">!</span>
                    )}
                  </div>
                )
              }

              // Determine user status for this duty day
              const userStatus = myPerson
                ? resolveUserStatus(assignmentMap.get(key), myPerson.id)
                : null
              const tag = cellAbsenceTag(userStatus)
              const hasSaved = assignmentMap.has(key)

              // Cell color based on user status
              const cellClass = cn(
                'relative flex flex-col items-center justify-center aspect-square rounded-xl font-bold transition-all cursor-pointer select-none',
                isSelected
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-900/50'
                  : userStatus?.kind === 'absent'
                    ? 'bg-red-950/70 text-red-300 active:bg-red-900/80'
                    : userStatus?.kind === 'reserve'
                      ? 'bg-amber-950/60 text-amber-300 active:bg-amber-900/70'
                      : 'bg-brand-800/70 text-brand-200 active:bg-brand-600',
                isToday && !isSelected && 'ring-2 ring-amber-400 ring-offset-1 ring-offset-surface-950',
              )

              return (
                <button
                  key={key}
                  ref={isSelected ? selectedCellRef : undefined}
                  onClick={() => setSelectedDate(isSelected ? null : key)}
                  className={cellClass}
                >
                  <span className={cn('leading-none', tag ? 'text-[11px]' : 'text-[13px]')}>{day}</span>
                  {tag && !isSelected && (
                    <span className="text-[8px] leading-none mt-0.5 font-semibold opacity-90 tracking-wide">
                      {tag}
                    </span>
                  )}
                  {/* Green dot: saved assignment + user assigned (no tag) */}
                  {!tag && hasSaved && !isSelected && myPerson && userStatus?.kind === 'assigned' && (
                    <span className="absolute top-[3px] right-[3px] w-[5px] h-[5px] rounded-full bg-emerald-400" />
                  )}
                  {/* Grey dot: saved assignment exists but no user match */}
                  {!myPerson && hasSaved && !isSelected && (
                    <span className="absolute top-[3px] right-[3px] w-[5px] h-[5px] rounded-full bg-emerald-400" />
                  )}
                  {/* Billing period label */}
                  {billing && (
                    <span className="absolute top-[2px] left-[2px] text-[7px] font-bold leading-none text-yellow-400">OR</span>
                  )}
                  {/* Event indicator */}
                  {hasEvent && (
                    <span className="absolute -bottom-[2px] -right-[2px] w-[11px] h-[11px] rounded-full bg-red-500 flex items-center justify-center text-[7px] font-black text-white leading-none z-20">!</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Pływający popover ze skróconą obsadą — overlay, nie przesuwa siatki */}
          {selectedInMonth && (
            <div className="absolute left-0 right-0 z-30 px-1" style={{ top: popoverTop }}>
              <DayCrewPopover
                personnel={personnelForView}
                assignment={selectedAssignment}
                loading={isLoading}
                onClose={() => setSelectedDate(null)}
              />
            </div>
          )}
          </div>
        </div>

        {/* ── Monthly status summary ── */}
        {(() => {
          const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
          const eventsInMonth = calEvents.filter(e => e.event_date.startsWith(monthPrefix))
          const daysInMo = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
          const billingInMonth: string[] = []
          for (let d = 1; d <= daysInMo; d++) {
            if (isBillingDay(year, month, d)) billingInMonth.push(ymdKey(year, month, d))
          }
          if (!myPerson && eventsInMonth.length === 0 && billingInMonth.length === 0) return null

          // Merge all entries by date so one day = one row with multiple badges
          type DayFlags = { duty: boolean; billing: boolean; ev?: CalendarEvent }
          const dayMap = new Map<string, DayFlags>()
          for (const date of dutyDaysInMonth)
            dayMap.set(date, { duty: true, billing: false })
          for (const ev of eventsInMonth) {
            const f = dayMap.get(ev.event_date) ?? { duty: false, billing: false }
            dayMap.set(ev.event_date, { ...f, ev })
          }
          for (const date of billingInMonth) {
            const f = dayMap.get(date) ?? { duty: false, billing: false }
            dayMap.set(date, { ...f, billing: true })
          }
          const sortedDates = [...dayMap.keys()].sort()

          return (
            <div className="px-3 pb-4 border-t border-slate-800 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">
                {myPerson ? `Twój status — ${MONTH_NAMES[month]}` : `Zdarzenia — ${MONTH_NAMES[month]}`}
              </p>
              <div className="space-y-0.5">
                {sortedDates.map(date => {
                  const { duty, billing, ev } = dayMap.get(date)!
                  // Skip duty-only rows when no user is logged in
                  if (!ev && !billing && (!duty || !myPerson)) return null

                  const orBadge = billing ? (
                    <span className="text-[10px] font-medium text-yellow-400 bg-yellow-900/20 px-1.5 py-0.5 rounded border border-yellow-800/40 shrink-0 whitespace-nowrap">
                      Okres rozliczeniowy
                    </span>
                  ) : null

                  const eventBadge = ev ? (
                    <span className="text-[10px] font-medium text-red-300 bg-red-950/40 px-1.5 py-0.5 rounded border border-red-900/40 shrink-0 whitespace-nowrap">
                      {ev.label}
                    </span>
                  ) : null

                  if (duty && myPerson) {
                    const status = resolveUserStatus(assignmentMap.get(date), myPerson.id)
                    return (
                      <button
                        key={date}
                        onClick={() => {
                          const next = selectedDate === date ? null : date
                          setSelectedDate(next)
                          // Przewiń do kalendarza, żeby popover w siatce nie zasłaniał tej listy
                          if (next) requestAnimationFrame(() => calendarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                        }}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
                          selectedDate === date ? 'bg-brand-900/40' : 'hover:bg-surface-800',
                        )}
                      >
                        <span className="text-xs text-slate-400 shrink-0">{formatDateShortWithDay(date)}</span>
                        <div className="flex items-center gap-1.5 justify-end min-w-0">
                          {eventBadge}
                          {orBadge}
                          <StatusPill status={status} />
                        </div>
                      </button>
                    )
                  }

                  return (
                    <div key={date} className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="text-xs text-slate-400 shrink-0">{formatDateShortWithDay(date)}</span>
                      <div className="flex items-center gap-1.5 justify-end min-w-0">
                        {eventBadge}
                        {orBadge}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>

    </div>
  )
}

// ── DayCrewPopover ────────────────────────────────────────────────────────────
// Pływający popover ze skróconą obsadą (role specjalne + 3 zastępy z nazwiskami),
// zakotwiczony pod klikniętym dniem; lekko przezroczyste tło, nie blokuje reszty.

function DayCrewPopover({
  personnel,
  assignment,
  loading,
  onClose,
}: {
  personnel: Person[]
  assignment: ShiftAssignment | null
  loading: boolean
  onClose: () => void
}) {
  const ROLE_ABBR: Record<string, string> = { commander: 'D', driver: 'K', rescuer: 'R' }

  const vehicles = assignment
    ? assignment.vehicles
        .filter(v => AUTO_CREW_VEHICLE_IDS.includes(v.vehicleId as typeof AUTO_CREW_VEHICLE_IDS[number]))
        .map(v => {
          const rows: { abbr: string; id: string }[] = []
          if (v.commanderId) rows.push({ abbr: ROLE_ABBR.commander, id: v.commanderId })
          if (v.driverId) rows.push({ abbr: ROLE_ABBR.driver, id: v.driverId })
          v.rescuerIds.forEach(id => rows.push({ abbr: ROLE_ABBR.rescuer, id }))
          return { vehicleId: v.vehicleId, rows }
        })
        .filter(v => v.rows.length > 0)
    : []

  const persons = assignment ? withGuests(personnel, assignment) : []
  const hasSpecial = !!assignment && (!!assignment.shiftCommanderId || assignment.dutyOfficerIds.length > 0)
  const hasAny = !!assignment && (hasSpecial || vehicles.length > 0)

  return (
    <div className="rounded-xl bg-surface-800/90 backdrop-blur-md border border-brand-600/50 shadow-xl shadow-black/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/60">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-300">Obsada</p>
        <button onClick={onClose} className="text-slate-400 active:text-slate-200 -mr-1 px-1.5 py-0.5 text-sm leading-none">✕</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasAny ? (
        <p className="text-xs text-slate-500 text-center py-5 px-4">Brak zapisanej obsady</p>
      ) : (
        <div className="p-2 space-y-1.5">
          {hasSpecial && (
            <div className="rounded-lg bg-surface-900/50 border border-slate-700/40 px-2.5 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Role specjalne</p>
              <div className="space-y-0.5">
                {assignment!.shiftCommanderId && (
                  <div className="flex items-baseline gap-2 text-[12px] leading-tight">
                    <span className="w-7 shrink-0 text-[10px] font-bold text-brand-300">D-ca</span>
                    <span className="text-slate-200 truncate">{resolveName(persons, assignment!.shiftCommanderId)}</span>
                  </div>
                )}
                {assignment!.dutyOfficerIds.map(id => (
                  <div key={id} className="flex items-baseline gap-2 text-[12px] leading-tight">
                    <span className="w-7 shrink-0 text-[10px] font-bold text-amber-300">Dyż.</span>
                    <span className="text-slate-200 truncate">{resolveName(persons, id)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {vehicles.map(v => (
            <div key={v.vehicleId} className="rounded-lg bg-surface-900/60 border border-slate-700/40 px-2.5 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 mb-1">
                {CREW_VEHICLE_NAMES[v.vehicleId as keyof typeof CREW_VEHICLE_NAMES] ?? v.vehicleId}
              </p>
              <div className="space-y-0.5">
                {v.rows.map((r, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-[12px] leading-tight">
                    <span className="w-7 shrink-0 text-[10px] font-bold text-slate-500">{r.abbr}</span>
                    <span className="text-slate-200 truncate">{resolveName(persons, r.id)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── StatusPill ────────────────────────────────────────────────────────────────

function StatusPill({ status, large = false }: { status: UserStatus | null; large?: boolean }) {
  const base = large
    ? 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border'
    : 'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0'

  if (!status || status.kind === 'unsaved') {
    return (
      <span className={cn(base, 'text-slate-600 border-slate-800 bg-surface-900')}>
        Brak obsady
      </span>
    )
  }
  if (status.kind === 'absent') {
    return (
      <span className={cn(base, 'text-red-400 border-red-900/50 bg-red-950/30')}>
        {status.label}
      </span>
    )
  }
  if (status.kind === 'reserve') {
    return (
      <span className={cn(base, 'text-amber-400 border-amber-900/50 bg-amber-950/30')}>
        Rezerwa
      </span>
    )
  }
  // assigned
  return (
    <span className={cn(base, 'text-emerald-400 border-emerald-900/50 bg-emerald-950/30')}>
      {status.role}{status.vehicle ? ` · ${status.vehicle}` : ''}
    </span>
  )
}
