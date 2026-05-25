import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { DailyWeatherCollapsible } from '../../components/DailyWeatherWidget'
import { PushBell } from '../../components/PushBell'
import { sendPushTrigger, isSubscribed, isPushSupported } from '../../lib/pushNotifications'
import {
  currentOrNextDutyDate, todayYmdKey, isDutyDay, ymdKey,
  formatDateShort, formatDateLong,
} from '../../lib/duty'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/utils'
import type { Person, ShiftAssignment, RoleType, AbsenceType } from '../../lib/crew'
import { CREW_VEHICLE_NAMES, CREW_VEHICLE_IDS, VEHICLE_SEATS, ABSENCE_LABELS, ABSENCE_ORDER, isPersonInAssignment, parseShiftAssignment } from '../../lib/crew'
import { UserCircle, UserX, CalendarX, MessageSquare, Send, CheckCircle, ChevronDown, Flame, Thermometer, Droplets, Leaf, Wind, Users, Utensils, CalendarDays, X, Clock, Star, Shield, Truck, HeartPulse, ClipboardList } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CalendarEvent } from '../../lib/duty'
import type { WeatherReading, WeatherData } from '../../lib/weather'
import { FIRE_STYLES, parseFireLevel } from '../../lib/weather'

// ── helpers ───────────────────────────────────────────────────────────────────

interface MyRole {
  label: string
  vehicle: string | null
  colorClass: string
  borderClass: string
  Icon: LucideIcon
  iconClass: string
}

function resolveMyRole(assignment: ShiftAssignment, personId: string): MyRole | null {
  if (assignment.shiftCommanderId === personId)
    return { label: 'Dowódca zmiany', vehicle: null, colorClass: 'text-brand-300', borderClass: 'border-brand-800', Icon: Star, iconClass: 'text-brand-400' }

  if (assignment.dutyOfficerIds.includes(personId))
    return { label: 'Dyżurny', vehicle: null, colorClass: 'text-amber-300', borderClass: 'border-amber-800', Icon: ClipboardList, iconClass: 'text-amber-400' }

  for (const v of assignment.vehicles) {
    const vName = CREW_VEHICLE_NAMES[v.vehicleId as keyof typeof CREW_VEHICLE_NAMES] ?? v.vehicleId
    if (v.commanderId === personId)
      return { label: 'Dowódca zastępu', vehicle: vName, colorClass: 'text-purple-300', borderClass: 'border-purple-800', Icon: Shield, iconClass: 'text-purple-400' }
    if (v.driverId === personId)
      return { label: 'Kierowca-ratownik', vehicle: vName, colorClass: 'text-emerald-300', borderClass: 'border-emerald-800', Icon: Truck, iconClass: 'text-emerald-400' }
    if (v.rescuerIds.includes(personId))
      return { label: 'Ratownik', vehicle: vName, colorClass: 'text-sky-300', borderClass: 'border-sky-800', Icon: HeartPulse, iconClass: 'text-sky-400' }
  }

  if (assignment.unassignedIds.includes(personId))
    return { label: 'Rezerwa', vehicle: null, colorClass: 'text-slate-400', borderClass: 'border-slate-700', Icon: Users, iconClass: 'text-slate-500' }

  return null // absent from this duty
}

// next N duty day keys starting from today
function nextDutyKeys(count: number): string[] {
  const keys: string[] = []
  const d = new Date()
  for (let i = 0; keys.length < count && i < 400; i++) {
    const nd = new Date(d)
    nd.setDate(d.getDate() + i)
    if (isDutyDay(nd.getFullYear(), nd.getMonth(), nd.getDate()))
      keys.push(ymdKey(nd.getFullYear(), nd.getMonth(), nd.getDate()))
  }
  return keys
}

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

function WeatherCollapsible({ data, loading }: { data: WeatherData | null; loading: boolean }) {
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

// ── sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">{children}</p>
  )
}


// ── main page ─────────────────────────────────────────────────────────────────

interface DutyMsg {
  id: string
  sender_login: string
  sender_name: string | null
  message: string
  created_at: string
  read_at: string | null
}

export function MobileHomePage() {
  const { user } = useAuth()
  const dutyDate = currentOrNextDutyDate()
  const isToday = dutyDate === todayYmdKey()

  const [personnel, setPersonnel] = useState<Person[]>([])
  const [assignment, setAssignment] = useState<ShiftAssignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [showMsgForm, setShowMsgForm] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [msgSentOk, setMsgSentOk] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)
  const [myMessages, setMyMessages] = useState<DutyMsg[]>([])
  const [pushSubscribed, setPushSubscribed] = useState(false)
  // Map of dutyKey → has saved assignment (for upcoming absence scan)
  const [savedMap, setSavedMap] = useState<Map<string, ShiftAssignment>>(new Map())

  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([])
  // WeatherData = { morning, afternoon } — shape matches weather.js response

  useEffect(() => {
    const upcomingKeys = nextDutyKeys(16) // next 16 duty days
    const [firstKey, ...restKeys] = upcomingKeys

    Promise.all([
      supabase.from('personnel').select('*'),
      // current/next duty assignment
      supabase
        .from('duty_assignments')
        .select('assignment_json')
        .eq('duty_date', firstKey ?? dutyDate)
        .order('created_at', { ascending: false })
        .limit(1),
      // upcoming saved assignments for absence detection
      supabase
        .from('duty_assignments')
        .select('duty_date, assignment_json')
        .in('duty_date', restKeys)
        .order('duty_date', { ascending: true }),
      // announcement
      supabase.from('announcements').select('message').eq('id', 1).maybeSingle(),
    ]).then(([{ data: pData }, { data: aData }, { data: futureData }, { data: noteData }]) => {
      // Resolve assignment first so personnel absences can be derived from its absenceMap.
      const aRow = aData?.[0]
      const loadedAssignment = parseShiftAssignment(aRow?.assignment_json)
      if (pData) {
        setPersonnel(pData.map(row => ({
          id: row.id,
          name: row.name,
          roles: row.roles as RoleType[],
          preferredVehicleId: row.preferred_vehicle_id ?? undefined,
          // Use date-specific absence from absenceMap; ignore global personnel.absence
          absence: (loadedAssignment?.absenceMap?.[row.id] ?? null) as AbsenceType | null,
          login: row.login ?? null,
        })))
      }
      if (loadedAssignment) setAssignment(loadedAssignment)

      if (futureData) {
        const m = new Map<string, ShiftAssignment>()
        for (const r of futureData) {
          const parsed = parseShiftAssignment(r.assignment_json)
          if (parsed) m.set(r.duty_date as string, parsed)
        }
        setSavedMap(m)
      }

      if (noteData?.message) setAnnouncement(noteData.message)
      setLoading(false)
    })

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    supabase
      .from('calendar_events')
      .select('*')
      .gte('event_date', todayStr)
      .order('event_date')
      .limit(5)
      .then(({ data }) => {
        if (data) setUpcomingEvents(data as CalendarEvent[])
      })
  }, [dutyDate])

  function fetchWeather() {
    setWeatherLoading(true)
    fetch('/.netlify/functions/weather')
      .then(r => (r.ok ? r.json() : null))
      .then((data: WeatherData | null) => {
        if (data) {
          const today = new Date().toLocaleDateString('en-CA')
          const slotIsToday = (r: WeatherData['morning']) =>
            !!r?.updatedAt?.startsWith(today)
          const cleaned: WeatherData = {
            morning:   slotIsToday(data.morning)   ? data.morning   : null,
            afternoon: slotIsToday(data.afternoon) ? data.afternoon : null,
          }
          setWeather(cleaned.morning || cleaned.afternoon ? cleaned : null)
        } else {
          setWeather(null)
        }
        setWeatherLoading(false)
      })
      .catch(() => setWeatherLoading(false))
  }

  useEffect(() => { fetchWeather() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = setTimeout(() => setWeather(null), midnight.getTime() - now.getTime())
    return () => clearTimeout(timer)
  }, [])

  async function fetchMyMessages() {
    if (!user) return
    const { data } = await supabase
      .from('duty_messages')
      .select('*')
      .eq('sender_login', user.login)
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setMyMessages(data as DutyMsg[])
  }

  useEffect(() => {
    fetchMyMessages()
  }, [user?.login]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    isSubscribed().then(setPushSubscribed)
  }, [])

  // Poll every 30s while there are pending (unconfirmed) messages
  useEffect(() => {
    if (!myMessages.some(m => !m.read_at)) return
    const interval = setInterval(fetchMyMessages, 30_000)
    return () => clearInterval(interval)
  }, [myMessages]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="px-3 sm:px-5 py-4 space-y-5 pb-8 animate-pulse">
        <div className="border-b border-slate-800 pb-4 space-y-2">
          <div className="h-2.5 w-24 bg-surface-700 rounded" />
          <div className="h-7 w-44 bg-surface-700 rounded" />
          <div className="h-2.5 w-32 bg-surface-800 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-2.5 w-28 bg-surface-700 rounded" />
          <div className="h-16 bg-surface-800 rounded-xl" />
        </div>
        <div className="h-14 bg-surface-800 rounded-xl" />
        <div className="space-y-2">
          <div className="h-2.5 w-20 bg-surface-700 rounded" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-20 bg-surface-800 rounded-xl" />
            <div className="h-20 bg-surface-800 rounded-xl" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-2.5 w-36 bg-surface-700 rounded" />
          <div className="h-12 bg-surface-800 rounded-xl" />
        </div>
      </div>
    )
  }

  const myPerson = user ? personnel.find(p => p.login === user.login) ?? null : null
  const myRole = (assignment && myPerson) ? resolveMyRole(assignment, myPerson.id) : null

  // person.absence is already date-specific (populated from absenceMap at load time)
  const myAbsenceNow = myPerson?.absence ?? null
  const isAbsentNow = myAbsenceNow != null

  const absentPersonnel = personnel
    .filter(p => p.absence)
    .sort((a, b) => ABSENCE_ORDER.indexOf(a.absence!) - ABSENCE_ORDER.indexOf(b.absence!))
  const availableCount = personnel.length - absentPersonnel.length
  const total = personnel.length

  // Upcoming duties where user is absent (saved assignment exists but user not in it)
  const upcomingAbsences: { date: string; label: string }[] = []
  if (myPerson) {
    for (const [date, a] of savedMap.entries()) {
      if (!isPersonInAssignment(a, myPerson.id)) {
        const absType = a.absenceMap?.[myPerson.id]
        const label = absType ? ABSENCE_LABELS[absType] : 'Poza obsadą'
        upcomingAbsences.push({ date, label })
        if (upcomingAbsences.length >= 3) break
      }
    }
  }
  upcomingAbsences.sort((a, b) => a.date.localeCompare(b.date))

  async function sendDutyMessage() {
    if (!user || !msgText.trim()) return
    setSendingMsg(true)
    setMsgError(null)
    const text = msgText.trim()
    try {
      const { error } = await supabase.from('duty_messages').insert({
        sender_login: user.login,
        sender_name: user.displayName,
        message: text,
      })
      if (error) {
        setMsgError('Błąd wysyłania: ' + error.message)
      } else {
        setMsgText('')
        setMsgSentOk(true)
        setShowMsgForm(false)
        setTimeout(() => setMsgSentOk(false), 4000)
        await fetchMyMessages()
        sendPushTrigger({ type: 'new_message', senderLogin: user.login, senderName: user.displayName, message: text })
      }
    } catch (err) {
      setMsgError('Błąd wysyłania: ' + (err instanceof Error ? err.message : 'nieznany błąd'))
    } finally {
      setSendingMsg(false)
    }
  }

  return (
    <div className="px-3 sm:px-5 py-4 space-y-5 pb-8">

      {/* Announcement */}
      {announcement && (
        <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-3 flex gap-3">
          <MessageSquare className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100 leading-relaxed whitespace-pre-wrap break-words">{announcement}</p>
        </div>
      )}

      {/* Date header + upcoming events */}
      <div className={cn(
        'border-b border-slate-800 pb-4',
        upcomingEvents.length > 0 && 'grid grid-cols-2 gap-3 items-start',
      )}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
            {isToday ? 'Dzisiejsza służba' : 'Następna służba'}
          </p>
          <h2 className="text-2xl font-bold text-white">{formatDateShort(dutyDate)}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{formatDateLong(dutyDate)}</p>
        </div>

        {upcomingEvents.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-1.5">
              Zdarzenia
            </p>
            <div className="space-y-1.5">
              {upcomingEvents.map(ev => (
                <div key={ev.id} className="flex items-start gap-2 bg-red-950/30 border border-red-900/50 rounded-lg px-2.5 py-2">
                  <CalendarDays className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-red-200 leading-tight">{ev.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{formatDateLong(ev.event_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* My assignment */}
      {myPerson && (
        <div>
          <SectionLabel>Moje przydzielenie</SectionLabel>
          {!assignment ? (
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-4 flex items-center gap-3">
              <UserCircle className="w-8 h-8 text-slate-600 shrink-0" />
              <p className="text-sm text-slate-500">Obsada nie została jeszcze wygenerowana</p>
            </div>
          ) : myRole ? (
            <div className={cn('bg-surface-800 rounded-xl border p-4 flex items-center gap-4', myRole.borderClass)}>
              <myRole.Icon className={cn('w-7 h-7 shrink-0', myRole.iconClass)} />
              <div className="min-w-0">
                <p className={cn('text-base font-bold truncate', myRole.colorClass)}>{myRole.label}</p>
                {myRole.vehicle && (
                  <p className="text-xs text-slate-400 mt-0.5">{myRole.vehicle}</p>
                )}
              </div>
            </div>
          ) : isAbsentNow ? (
            <div className="bg-surface-800 rounded-xl border border-red-900/40 p-4 flex items-center gap-3">
              <UserX className="w-8 h-8 text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">Nieobecny</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ABSENCE_LABELS[myAbsenceNow!]}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-4 flex items-center gap-3">
              <UserX className="w-8 h-8 text-slate-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-400">Nieobecny tej służby</p>
                <p className="text-xs text-slate-600 mt-0.5">Nie figurujesz w aktywnej obsadzie</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Informacja dla dyżurnego */}
      <div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMsgForm(v => !v)}
            className="flex-1 flex items-center justify-between bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3 text-left hover:border-slate-600 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Send className="w-4 h-4 text-brand-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Informacja dla dyżurnego</p>
                <p className="text-[11px] text-slate-500">Stan licznika, zmiana w służbach, inne</p>
              </div>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-slate-500 shrink-0 transition-transform duration-300', showMsgForm && 'rotate-180')} />
          </button>
          {user && <PushBell userLogin={user.login} userRole={user.role} onSubscribedChange={setPushSubscribed} />}
        </div>

        {msgSentOk && (
          <div className="mt-2 flex items-center gap-2 bg-emerald-950/40 border border-emerald-900/50 rounded-xl px-4 py-3">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-300">Wiadomość wysłana do dyżurnego</p>
          </div>
        )}
        {msgSentOk && !pushSubscribed && isPushSupported() && (
          <div className="mt-1.5 flex items-center gap-3 bg-brand-950/50 border border-brand-800/60 rounded-xl px-4 py-3">
            <p className="text-[12px] text-brand-300 flex-1 leading-snug">
              Włącz 🔔 powiadomienia, żeby dostać info kiedy dyżurny potwierdzi
            </p>
            <PushBell userLogin={user!.login} userRole={user!.role} onSubscribedChange={setPushSubscribed} />
          </div>
        )}

        <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', showMsgForm ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0')}>
          <div className="mt-2 bg-surface-800 rounded-xl border border-slate-700/40 p-3 space-y-2">
            <textarea
              className="w-full bg-surface-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-none placeholder:text-slate-600"
              rows={3}
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              placeholder="Np. stan licznika GBA 2,5/16: 45231 km, zmiana kierowcy/ratownika: Kowalski ↔ Nowak..."
              autoFocus={showMsgForm}
            />
            {msgError && (
              <p className="text-[11px] text-red-400">{msgError}</p>
            )}
            <div className="flex justify-end">
              <button
                onClick={sendDutyMessage}
                disabled={sendingMsg || !msgText.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-brand-700 hover:bg-brand-600 text-white transition-colors disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                {sendingMsg ? 'Wysyłanie…' : 'Wyślij'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Moje wiadomości do dyżurnego */}
      {myMessages.length > 0 && (
        <div>
          <SectionLabel>Moje wiadomości do dyżurnego</SectionLabel>
          <div className="space-y-2">
            {myMessages.map(msg => (
              <div
                key={msg.id}
                className={cn(
                  'bg-surface-800 rounded-xl border p-3 space-y-2',
                  msg.read_at ? 'border-emerald-900/50' : 'border-amber-900/40',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    'flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border',
                    msg.read_at
                      ? 'text-emerald-400 bg-emerald-950/40 border-emerald-900/50'
                      : 'text-amber-400 bg-amber-950/40 border-amber-900/40',
                  )}>
                    {msg.read_at
                      ? <><CheckCircle className="w-3 h-3" /> Potwierdzona</>
                      : <><Clock className="w-3 h-3" /> Oczekuje</>}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-600">
                      {new Date(msg.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
                      {' '}
                      {new Date(msg.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.read_at && (
                      <button
                        onClick={async () => {
                          await supabase.from('duty_messages').delete().eq('id', msg.id)
                          setMyMessages(prev => prev.filter(m => m.id !== msg.id))
                        }}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                        title="Zamknij"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                  {msg.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crew counter */}
      <div>
        <SectionLabel>Stan obsady</SectionLabel>
        <div className="bg-surface-800 rounded-xl border border-slate-700/40 overflow-hidden">
          <div className="flex items-center gap-4 px-4 pt-4 pb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums text-emerald-400">{availableCount}</span>
                <span className="text-sm text-slate-500">/ {total} dostępnych</span>
              </div>
              {total > 0 && (
                <div className="mt-2 h-2 rounded-full bg-surface-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${(availableCount / total) * 100}%` }}
                  />
                </div>
              )}
            </div>
            {absentPersonnel.length > 0 ? (
              <div className="shrink-0 text-center">
                <span className="text-2xl font-bold tabular-nums text-red-400">{absentPersonnel.length}</span>
                <p className="text-[11px] text-slate-500">nieobecnych</p>
              </div>
            ) : (
              <div className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-950/40 px-2.5 py-1.5 rounded-lg border border-emerald-900/40">
                <CheckCircle className="w-3.5 h-3.5" />
                Pełna obsada
              </div>
            )}
          </div>
          <VehicleReadinessStrip assignment={assignment} personnel={personnel} />
        </div>
      </div>

      {/* Full assignment summary — under Stan obsady */}
      {assignment && (
        <FullAssignmentCollapsible personnel={personnel} assignment={assignment} myPersonId={myPerson?.id ?? null} />
      )}

      {/* Absent personnel */}
      {absentPersonnel.length > 0 && (
        <div>
          <SectionLabel>Nieobecni ({absentPersonnel.length})</SectionLabel>
          <div className="bg-surface-800 rounded-xl border border-slate-700/40 divide-y divide-slate-800/60 overflow-hidden">
            {absentPersonnel.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                <span className="text-sm text-slate-300 truncate">{p.name}</span>
                <span className="text-[11px] font-medium text-red-400 shrink-0 bg-red-950/40 px-2 py-0.5 rounded-md border border-red-900/40">
                  {ABSENCE_LABELS[p.absence!]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming absences across all personnel */}
      <UpcomingDutyAbsencesCollapsible
        personnel={personnel}
        savedMap={savedMap}
        currentDutyDate={dutyDate}
        myPersonId={myPerson?.id ?? null}
      />

      {/* Upcoming absences for logged-in user */}
      {myPerson && (
        <div>
          <SectionLabel>Twoje nadchodzące nieobecności</SectionLabel>
          {upcomingAbsences.length === 0 ? (
            <div className="flex items-center gap-2.5 bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3">
              <CalendarX className="w-4 h-4 text-slate-600 shrink-0" />
              <p className="text-xs text-slate-600">
                Brak zaplanowanych nieobecności w zapisanych służbach
              </p>
            </div>
          ) : (
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 divide-y divide-slate-800/60 overflow-hidden">
              {upcomingAbsences.map(({ date, label }) => (
                <div key={date} className="flex items-center gap-3 px-4 py-3">
                  <CalendarX className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{formatDateShort(date)}</p>
                    <p className="text-[11px] text-slate-500">{formatDateLong(date)}</p>
                  </div>
                  <span className="ml-auto text-[10px] font-medium text-amber-500 shrink-0 bg-amber-950/30 px-2 py-0.5 rounded-md border border-amber-900/40">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pogoda godzinowa */}
      <DailyWeatherCollapsible />

      {/* Zagrożenie pożarowe */}
      <WeatherCollapsible data={weather} loading={weatherLoading} />

      {/* Obiad */}
      {assignment && (
        <div>
          <SectionLabel>Obiad</SectionLabel>
          {assignment.dinner === true ? (
            <div className="bg-surface-800 rounded-xl border border-emerald-900/50 px-4 py-3 flex items-center gap-3">
              <Utensils className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-sm font-semibold text-emerald-300">Na służbie jest obiad</p>
            </div>
          ) : assignment.dinner === false ? (
            <div className="bg-surface-800 rounded-xl border border-red-900/50 px-4 py-3 flex items-center gap-3">
              <Utensils className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm font-semibold text-red-300">Na służbie nie ma obiadu</p>
            </div>
          ) : (
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3 flex items-center gap-3">
              <Utensils className="w-4 h-4 text-slate-600 shrink-0" />
              <p className="text-sm text-slate-500">Brak danych</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Upcoming duty absences ────────────────────────────────────────────────────

function UpcomingDutyAbsencesCollapsible({
  personnel,
  savedMap,
  currentDutyDate,
  myPersonId,
}: {
  personnel: Person[]
  savedMap: Map<string, ShiftAssignment>
  currentDutyDate: string
  myPersonId: string | null
}) {
  const [open, setOpen] = useState(false)

  const upcoming5 = nextDutyKeys(6).filter(k => k !== currentDutyDate).slice(0, 5)

  const rows = upcoming5.map(date => {
    const a = savedMap.get(date) ?? null
    if (!a) return { date, absent: null as null }
    const absent = personnel
      .filter(p => a.absenceMap?.[p.id])
      .map(p => ({ id: p.id, name: p.name, absence: a.absenceMap![p.id] as AbsenceType }))
      .sort((a, b) => ABSENCE_ORDER.indexOf(a.absence) - ABSENCE_ORDER.indexOf(b.absence))
    return { date, absent }
  })

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3 text-left hover:border-slate-600 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <CalendarX className="w-4 h-4 text-red-400/70 shrink-0" />
          <p className="text-sm font-medium text-white">Nieobecni na przyszłych służbach</p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-500 shrink-0 transition-transform duration-300', open && 'rotate-180')} />
      </button>

      <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', open ? 'max-h-[1500px] opacity-100' : 'max-h-0 opacity-0')}>
        <div className="mt-2 bg-surface-800 rounded-xl border border-slate-700/40 divide-y divide-slate-800/60 overflow-hidden">
          {rows.map(({ date, absent }) => (
            <DutyDayAbsenceRow key={date} date={date} absent={absent} myPersonId={myPersonId} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DutyDayAbsenceRow({
  date,
  absent,
  myPersonId,
}: {
  date: string
  absent: { id: string; name: string; absence: AbsenceType }[] | null
  myPersonId: string | null
}) {
  const [open, setOpen] = useState(false)
  const weekday = formatDateLong(date).split(',')[0]
  const hasAbsent = absent && absent.length > 0
  const iAmAbsent = !!myPersonId && !!absent?.some(p => p.id === myPersonId)

  return (
    <div className={cn(iAmAbsent && 'border-l-2 border-amber-500')}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={!hasAbsent}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left disabled:cursor-default"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{formatDateShort(date)}</p>
          <p className="text-[11px] text-slate-500">{weekday}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {iAmAbsent && (
            <span className="text-[11px] font-medium text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-900/40">
              Nieobecny
            </span>
          )}
          {absent === null ? (
            <span className="text-[11px] text-slate-600">Brak obsady</span>
          ) : hasAbsent ? (
            <span className="text-[11px] font-medium text-red-400 bg-red-950/40 px-2 py-0.5 rounded-md border border-red-900/40">
              {absent.length} {absent.length === 1 ? 'nieobecny' : 'nieobecnych'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
              <CheckCircle className="w-3 h-3" />
              Wszyscy obecni
            </span>
          )}
          {hasAbsent && (
            <ChevronDown className={cn('w-3.5 h-3.5 text-slate-600 transition-transform duration-200', open && 'rotate-180')} />
          )}
        </div>
      </button>

      {hasAbsent && (
        <div className={cn('overflow-hidden transition-all duration-200 ease-in-out', open ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0')}>
          <div className="border-t border-slate-800/60 divide-y divide-slate-800/40">
            {absent.map(p => {
              const isMe = p.id === myPersonId
              return (
                <div key={p.id} className={cn(
                  'flex items-center justify-between py-2.5 gap-2 bg-surface-900/40',
                  isMe ? 'pl-3 pr-4 border-l-2 border-brand-500' : 'px-4',
                )}>
                  <span className={cn('text-sm truncate', isMe ? 'text-brand-200 font-semibold' : 'text-slate-400')}>
                    {p.name}
                  </span>
                  <span className={cn(
                    'text-[11px] font-medium shrink-0 px-2 py-0.5 rounded-md border',
                    isMe
                      ? 'text-amber-400 bg-amber-950/40 border-amber-900/40'
                      : 'text-red-400 bg-red-950/40 border-red-900/40',
                  )}>
                    {ABSENCE_LABELS[p.absence]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Vehicle readiness strip ───────────────────────────────────────────────────

function VehicleReadinessStrip({ assignment, personnel }: { assignment: ShiftAssignment | null; personnel: Person[] }) {
  if (!assignment) return null

  return (
    <div className="border-t border-slate-800">
      {CREW_VEHICLE_IDS.map((id, i) => {
        const v = assignment.vehicles.find(v => v.vehicleId === id)
        const cap = VEHICLE_SEATS[id]
        const rescuerCap = cap - 2
        const commanderFilled = !!v?.commanderId
        const driverFilled = !!v?.driverId
        const rescuersFilled = v?.rescuerIds.length ?? 0
        const filled = (commanderFilled ? 1 : 0) + (driverFilled ? 1 : 0) + rescuersFilled
        const full = filled === cap
        const partial = filled > 0 && filled < cap

        return (
          <div
            key={id}
            className={cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-slate-800/60')}
          >
            <span className={cn(
              'text-xs font-semibold w-24 shrink-0 truncate',
              full ? 'text-emerald-300' : partial ? 'text-amber-300' : 'text-slate-500',
            )}>
              {CREW_VEHICLE_NAMES[id]}
            </span>
            <div className="flex items-center gap-2 flex-1">
              <Shield className={cn('w-3.5 h-3.5 shrink-0 transition-colors', commanderFilled ? 'text-purple-400' : 'text-slate-700')} />
              <Truck className={cn('w-3.5 h-3.5 shrink-0 transition-colors', driverFilled ? 'text-emerald-400' : 'text-slate-700')} />
              {Array.from({ length: rescuerCap }, (_, j) => (
                <HeartPulse key={j} className={cn('w-3.5 h-3.5 shrink-0 transition-colors', j < rescuersFilled ? 'text-sky-400' : 'text-slate-700')} />
              ))}
            </div>
            <span className={cn(
              'text-xs font-bold tabular-nums shrink-0',
              full ? 'text-emerald-400' : partial ? 'text-amber-400' : 'text-slate-500',
            )}>
              {filled}/{cap}
            </span>
          </div>
        )
      })}
      {assignment.unassignedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-800/60">
          <span className="text-xs font-semibold w-24 shrink-0 truncate text-slate-400">Rezerwa</span>
          <div className="flex-1 text-xs text-slate-400 truncate">
            {assignment.unassignedIds.map(id => personnel.find(p => p.id === id)?.name ?? '—').join(', ')}
          </div>
          <span className="text-xs font-bold tabular-nums text-slate-400 shrink-0">
            {assignment.unassignedIds.length}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Collapsible full assignment ───────────────────────────────────────────────

function FullAssignmentCollapsible({ personnel, assignment, myPersonId }: {
  personnel: Person[]
  assignment: ShiftAssignment
  myPersonId: string | null
}) {
  const [open, setOpen] = useState(false)

  function name(id: string | null) {
    if (!id) return '—'
    return personnel.find(p => p.id === id)?.name ?? '—'
  }

  const isMe = (id: string | null) => !!id && id === myPersonId

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3 text-left hover:border-slate-600 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Users className="w-4 h-4 text-brand-400 shrink-0" />
          <p className="text-sm font-medium text-white">Pełna obsada służby</p>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-500 shrink-0 transition-transform duration-300', open && 'rotate-180')} />
      </button>

      <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0')}>
          <div className="space-y-2 mt-1">
            {/* Special roles */}
            <div className="bg-surface-800 rounded-xl border border-slate-700/40 divide-y divide-slate-800/60 overflow-hidden">
              <RowInline label="Dowódca zmiany" value={name(assignment.shiftCommanderId)} Icon={Star} iconClass="text-brand-400" isMe={isMe(assignment.shiftCommanderId)} />
              {assignment.dutyOfficerIds.map(id => (
                <RowInline key={id} label="Dyżurny" value={name(id)} Icon={ClipboardList} iconClass="text-amber-400" isMe={isMe(id)} />
              ))}
            </div>

            {/* Vehicles */}
            {assignment.vehicles.map(v => {
              const vName = CREW_VEHICLE_NAMES[v.vehicleId as keyof typeof CREW_VEHICLE_NAMES] ?? v.vehicleId
              const rows: { label: string; id: string; Icon: LucideIcon; iconClass: string }[] = []
              if (v.commanderId) rows.push({ label: 'Dowódca zastępu', id: v.commanderId, Icon: Shield, iconClass: 'text-purple-400' })
              if (v.driverId) rows.push({ label: 'Kierowca', id: v.driverId, Icon: Truck, iconClass: 'text-emerald-400' })
              v.rescuerIds.forEach(id => rows.push({ label: 'Ratownik', id, Icon: HeartPulse, iconClass: 'text-sky-400' }))
              if (!rows.length) return null
              return (
                <div key={v.vehicleId} className="bg-surface-800 rounded-xl border border-slate-700/40 overflow-hidden">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400 px-4 py-2 border-b border-slate-800">
                    {vName}
                  </p>
                  <div className="divide-y divide-slate-800/60">
                    {rows.map((r, i) => (
                      <RowInline key={i} label={r.label} value={name(r.id)} Icon={r.Icon} iconClass={r.iconClass} isMe={isMe(r.id)} />
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Reserve */}
            {assignment.unassignedIds.length > 0 && (
              <div className="bg-surface-800 rounded-xl border border-slate-700/40 overflow-hidden">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-2 border-b border-slate-800">
                  Rezerwa
                </p>
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  {assignment.unassignedIds.map(id => (
                    <span
                      key={id}
                      className={cn(
                        'text-sm rounded-lg px-3 py-1.5 border',
                        isMe(id)
                          ? 'text-brand-200 bg-brand-950/40 border-brand-700/60 font-semibold'
                          : 'text-slate-300 bg-surface-900 border-slate-700',
                      )}
                    >
                      {name(id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  )
}

function RowInline({ label, value, Icon, iconClass, isMe }: {
  label: string
  value: string
  Icon?: LucideIcon
  iconClass?: string
  isMe?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center justify-between gap-2 py-2.5',
      isMe ? 'px-3 border-l-2 border-brand-500 bg-brand-950/40' : 'px-4',
    )}>
      <span className={cn('flex items-center gap-1.5 text-xs shrink-0', isMe ? 'text-brand-300/80' : 'text-slate-500')}>
        {Icon && <Icon className={cn('w-3 h-3 shrink-0', iconClass)} />}
        {label}
      </span>
      <span className={cn('text-sm font-semibold truncate text-right', isMe ? 'text-brand-200' : 'text-white')}>
        {isMe && <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-400 mr-1.5 mb-0.5 shrink-0" />}
        {value}
      </span>
    </div>
  )
}
