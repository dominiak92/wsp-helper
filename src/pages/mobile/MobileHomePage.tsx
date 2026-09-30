import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { DailyWeatherCollapsible } from '../../components/DailyWeatherWidget'
import { PushBell } from '../../components/PushBell'
import { sendPushTrigger, isSubscribed, isPushSupported } from '../../lib/pushNotifications'
import {
  currentOrNextDutyDate, todayYmdKey, nextDutyKeys,
  formatDateShort, formatDateLong, formatDateShortWithDay,
} from '../../lib/duty'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/utils'
import type { Person, ShiftAssignment, RoleType, AbsenceType } from '../../lib/crew'
import { CREW_VEHICLE_NAMES, ABSENCE_LABELS, ABSENCE_ORDER, isPersonInAssignment, parseShiftAssignment, guestsAsPersons, emptyAssignment, applySelfAbsence, withdrawSelfAbsence } from '../../lib/crew'
import { UserCircle, UserX, CalendarX, MessageSquare, Send, CheckCircle, Users, Utensils, CalendarDays, X, Clock, Star, Shield, Truck, HeartPulse, ClipboardList, Undo2, CalendarOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CalendarEvent } from '../../lib/duty'
import type { WeatherData } from '../../lib/weather'
import { WeatherCollapsible } from '../../components/mobile/WeatherCollapsible'
import { CrewAbsencesCollapsible } from '../../components/mobile/CrewAbsencesCollapsible'
import { VehicleReadinessStrip } from '../../components/mobile/VehicleReadinessStrip'
import { FullAssignmentCollapsible } from '../../components/mobile/FullAssignmentCollapsible'
import { ReportAbsencePanel } from '../../components/mobile/ReportAbsencePanel'
import { Badge8h, Partial8hCard } from '../../components/Partial8h'
import { partial8hPersons } from '../../lib/crew'

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


// ── sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">{children}</p>
  )
}

// Nagłówek strefy panelu — mocniejszy niż SectionLabel, z cienką kreską i opcjonalnym slotem po prawej
function ZoneLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 shrink-0">{children}</span>
      <span className="flex-1 h-px bg-gradient-to-r from-slate-700/70 to-transparent" />
      {right}
    </div>
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
  const [activeAction, setActiveAction] = useState<'message' | 'absence' | null>(null)
  const [msgText, setMsgText] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [msgSentOk, setMsgSentOk] = useState(false)
  const [msgError, setMsgError] = useState<string | null>(null)
  const [myMessages, setMyMessages] = useState<DutyMsg[]>([])
  const [receivedMsgs, setReceivedMsgs] = useState<DutyMsg[]>([])
  // Świeżo potwierdzone — pokazane jeszcze chwilę jako „Potwierdzona", potem znikają
  const [fadingIds, setFadingIds] = useState<string[]>([])
  const [pushSubscribed, setPushSubscribed] = useState(false)
  // Map of dutyKey → has saved assignment (for upcoming absence scan)
  const [savedMap, setSavedMap] = useState<Map<string, ShiftAssignment>>(new Map())

  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([])
  // WeatherData = { morning, afternoon } — shape matches weather.js response

  // Czy zalogowany jest dyżurnym wyznaczonym na ten dzień (slot obsady, nie stała rola)
  const myPersonId = user ? (personnel.find(p => p.login === user.login)?.id ?? null) : null
  const isDutyOfficer = !!(myPersonId && assignment?.dutyOfficerIds.includes(myPersonId))

  const reload = useCallback(() => {
    const upcomingKeys = nextDutyKeys(16) // next 16 duty days
    const [firstKey, ...restKeys] = upcomingKeys

    return Promise.all([
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
        const roster: Person[] = pData.map(row => ({
          id: row.id,
          name: row.name,
          roles: row.roles as RoleType[],
          preferredVehicleId: row.preferred_vehicle_id ?? undefined,
          // Use date-specific absence from absenceMap; ignore global personnel.absence
          absence: (loadedAssignment?.absenceMap?.[row.id] ?? null) as AbsenceType | null,
          login: row.login ?? null,
          partial8h: !!loadedAssignment?.partial8hIds?.includes(row.id),
        }))
        // Include ad-hoc guests stored in the assignment so their names resolve
        setPersonnel([...roster, ...guestsAsPersons(loadedAssignment)])
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
  }, [dutyDate])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
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
  }, [])

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

  useEffect(() => { fetchWeather() }, [])

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

  // Dyżurny dnia: wiadomości od załogi (wszystkie poza własnymi)
  async function fetchReceivedMessages() {
    if (!user) return
    const { data } = await supabase
      .from('duty_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setReceivedMsgs((data as DutyMsg[]).filter(m => m.sender_login !== user.login))
  }

  useEffect(() => {
    if (isDutyOfficer) fetchReceivedMessages()
  }, [isDutyOfficer]) // eslint-disable-line react-hooks/exhaustive-deps

  // Odpytuj co 30 s, dopóki są niepotwierdzone wiadomości
  useEffect(() => {
    if (!isDutyOfficer || !receivedMsgs.some(m => !m.read_at)) return
    const interval = setInterval(fetchReceivedMessages, 30_000)
    return () => clearInterval(interval)
  }, [isDutyOfficer, receivedMsgs]) // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmReceived(msg: DutyMsg) {
    const now = new Date().toISOString()
    const { error } = await supabase.from('duty_messages').update({ read_at: now }).eq('id', msg.id)
    if (error) return
    setReceivedMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: now } : m))
    sendPushTrigger({ type: 'confirmed', targetLogin: msg.sender_login })
    // pokaż „Potwierdzona" przez chwilę, potem usuń z listy
    setFadingIds(prev => [...prev, msg.id])
    setTimeout(() => setFadingIds(prev => prev.filter(id => id !== msg.id)), 3500)
  }

  function dismissReceived(id: string) {
    setFadingIds(prev => prev.filter(x => x !== id))
  }

  // Kolejka dyżurnego: tylko niepotwierdzone + świeżo potwierdzone (chwilowo)
  const visibleReceived = receivedMsgs.filter(m => !m.read_at || fadingIds.includes(m.id))

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
  const partial8hCount = partial8hPersons(assignment, personnel).length

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
        setActiveAction(null)
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

  // Obsada danego dnia z już załadowanych danych (bieżąca w `assignment`, przyszłe w `savedMap`)
  function dayAssignment(date: string): ShiftAssignment | null {
    if (date === dutyDate) return assignment
    return savedMap.get(date) ?? null
  }

  // Pobierz najświeższy zapis obsady dla danego dnia (tuż przed zapisem, by nie nadpisać zmian dyżurnego)
  async function fetchLatestAssignmentRow(date: string) {
    const { data } = await supabase
      .from('duty_assignments')
      .select('id, assignment_json')
      .eq('duty_date', date)
      .order('created_at', { ascending: false })
      .limit(1)
    const row = data?.[0]
    return { id: (row?.id as string | undefined) ?? null, parsed: parseShiftAssignment(row?.assignment_json) }
  }

  async function notifyDuty(message: string) {
    if (!user) return
    await supabase.from('duty_messages').insert({
      sender_login: user.login,
      sender_name: user.displayName,
      message,
    })
    sendPushTrigger({ type: 'new_message', senderLogin: user.login, senderName: user.displayName, message })
  }

  // User zgłasza nieobecność: ściąga się ze składu danego dnia i informuje dyżurnego
  async function submitAbsence(date: string, type: AbsenceType, note: string) {
    if (!user || !myPersonId) return
    const { id, parsed } = await fetchLatestAssignmentRow(date)
    const base = parsed ?? emptyAssignment()
    const next = applySelfAbsence(base, myPersonId, type)
    if (id) {
      await supabase.from('duty_assignments').update({ assignment_json: next }).eq('id', id)
    } else {
      await supabase.from('duty_assignments').delete().eq('duty_date', date)
      await supabase.from('duty_assignments').insert({ duty_date: date, assignment_json: next })
    }
    const trimmed = note.trim()
    await notifyDuty(`🚫 Zgłoszenie nieobecności — ${user.displayName}\n${formatDateShortWithDay(date)}: ${ABSENCE_LABELS[type]}${trimmed ? `\n${trimmed}` : ''}`)
    await Promise.all([reload(), fetchMyMessages()])
  }

  // User wycofuje własną nieobecność i wraca na swoje poprzednie miejsce w składzie
  async function withdrawAbsence(date: string) {
    if (!user || !myPersonId) return
    const { id, parsed } = await fetchLatestAssignmentRow(date)
    if (!id || !parsed) return
    const next = withdrawSelfAbsence(parsed, myPersonId)
    await supabase.from('duty_assignments').update({ assignment_json: next }).eq('id', id)
    await notifyDuty(`↩️ Wycofanie nieobecności — ${user.displayName}\n${formatDateShortWithDay(date)} (powrót do składu)`)
    await Promise.all([reload(), fetchMyMessages()])
  }

  const myAbsenceIsSelf = !!(myPersonId && assignment?.selfAbsences?.[myPersonId])

  return (
    <div className="px-3 sm:px-5 py-4 space-y-6 pb-8">

      {/* Announcement */}
      {announcement && (
        <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-3 flex gap-3">
          <MessageSquare className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100 leading-relaxed whitespace-pre-wrap break-words">{announcement}</p>
        </div>
      )}

      {/* Dyżurny dnia: wiadomości od załogi (do potwierdzenia) */}
      {isDutyOfficer && visibleReceived.length > 0 && (
        <div>
          <SectionLabel>
            Wiadomości od załogi
            {receivedMsgs.some(m => !m.read_at) && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold align-middle">
                {receivedMsgs.filter(m => !m.read_at).length}
              </span>
            )}
          </SectionLabel>
          <div className="space-y-2">
            {visibleReceived.map(msg => (
              <div
                key={msg.id}
                className={cn(
                  'bg-surface-800 rounded-xl border p-3 space-y-2 transition-opacity duration-500',
                  msg.read_at ? 'border-emerald-900/50 opacity-70' : 'border-brand-800/60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {!msg.read_at && <span className="w-2 h-2 rounded-full bg-brand-400 shrink-0" />}
                    <span className="text-sm font-semibold text-white truncate">
                      {msg.sender_name ?? msg.sender_login}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-600">
                      {new Date(msg.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
                      {' '}
                      {new Date(msg.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.read_at && (
                      <button
                        onClick={() => dismissReceived(msg.id)}
                        className="text-slate-600 hover:text-slate-300 transition-colors"
                        title="Zamknij"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                  {msg.message}
                </p>
                <div className="flex justify-end">
                  {msg.read_at ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <CheckCircle className="w-3 h-3" /> Potwierdzona
                    </span>
                  ) : (
                    <button
                      onClick={() => confirmReceived(msg)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-brand-700 hover:bg-brand-600 text-white transition-colors"
                    >
                      <CheckCircle className="w-3 h-3" /> Potwierdź
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MOJA SŁUŻBA ── */}
      <section className="space-y-3">

      {/* Date header + upcoming events */}
      <div className={cn(
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
                {myPerson.partial8h && (
                  <p className="text-xs font-semibold text-amber-300 mt-1">Tej służby jesteś tylko na 8h</p>
                )}
              </div>
              {myPerson.partial8h && <Badge8h className="ml-auto text-xs" />}
            </div>
          ) : isAbsentNow ? (
            <div className="bg-surface-800 rounded-xl border border-red-900/40 p-4 flex items-center gap-3">
              <UserX className="w-8 h-8 text-red-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-400">Nieobecny</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ABSENCE_LABELS[myAbsenceNow!]}
                </p>
              </div>
              {myAbsenceIsSelf && (
                <button
                  onClick={() => withdrawAbsence(dutyDate)}
                  className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-slate-200 transition-colors shrink-0"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Cofnij
                </button>
              )}
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

      {/* Twoje nadchodzące nieobecności */}
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
      </section>

      {/* ── AKCJE ── */}
      <section className="space-y-3">
      <ZoneLabel right={user ? <PushBell userLogin={user.login} userRole={user.role} onSubscribedChange={setPushSubscribed} /> : undefined}>
        Akcje
      </ZoneLabel>

      {/* Dwa kafelki akcji */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setActiveAction(a => (a === 'message' ? null : 'message'))}
          className={cn(
            'rounded-xl border px-3 py-3 text-left transition-colors flex items-center gap-2.5',
            activeAction === 'message' ? 'border-brand-500 bg-brand-950/30' : 'border-slate-700/40 bg-surface-800 hover:border-slate-600',
          )}
        >
          <Send className="w-4 h-4 text-brand-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white leading-tight">Informacja</p>
            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">dla dyżurnego</p>
          </div>
        </button>
        <button
          onClick={() => setActiveAction(a => (a === 'absence' ? null : 'absence'))}
          className={cn(
            'rounded-xl border px-3 py-3 text-left transition-colors flex items-center gap-2.5',
            activeAction === 'absence' ? 'border-brand-500 bg-brand-950/30' : 'border-slate-700/40 bg-surface-800 hover:border-slate-600',
          )}
        >
          <CalendarOff className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white leading-tight">Zgłoś nieobecność</p>
            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">wybierz dzień i typ</p>
          </div>
        </button>
      </div>

      {/* Panel: informacja dla dyżurnego */}
      {activeAction === 'message' && (
        <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-3 space-y-2">
          <textarea
            className="w-full bg-surface-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-none placeholder:text-slate-600"
            rows={3}
            value={msgText}
            onChange={e => setMsgText(e.target.value)}
            placeholder="Np. stan licznika GBA 2,5/16: 45231 km, zmiana kierowcy/ratownika: Kowalski ↔ Nowak..."
            autoFocus
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
      )}

      {/* Panel: zgłoś nieobecność */}
      {activeAction === 'absence' && myPersonId && (
        <ReportAbsencePanel
          dutyKeys={nextDutyKeys(8)}
          myPersonId={myPersonId}
          dayAssignment={dayAssignment}
          onSubmit={submitAbsence}
          onWithdraw={withdrawAbsence}
        />
      )}

      {/* Potwierdzenie wysłania + zachęta do powiadomień */}
      {msgSentOk && (
        <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-900/50 rounded-xl px-4 py-3">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">Wiadomość wysłana do dyżurnego</p>
        </div>
      )}
      {msgSentOk && !pushSubscribed && isPushSupported() && (
        <div className="flex items-center gap-3 bg-brand-950/50 border border-brand-800/60 rounded-xl px-4 py-3">
          <p className="text-[12px] text-brand-300 flex-1 leading-snug">
            Włącz 🔔 powiadomienia, żeby dostać info kiedy dyżurny potwierdzi
          </p>
          <PushBell userLogin={user!.login} userRole={user!.role} onSubscribedChange={setPushSubscribed} />
        </div>
      )}

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
      </section>

      {/* ── OBSADA ── */}
      <section className="space-y-3">
      <ZoneLabel>Obsada</ZoneLabel>

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
              {partial8hCount > 0 && (
                <p className="text-xs font-semibold text-amber-300 mt-0.5">w tym {partial8hCount} na 8h</p>
              )}
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

      {/* Osoby obecne tylko 8h — widoczne bez rozwijania */}
      <Partial8hCard assignment={assignment} persons={personnel} myPersonId={myPerson?.id ?? null} />

      {/* Full assignment summary — under Stan obsady */}
      {assignment && (
        <FullAssignmentCollapsible personnel={personnel} assignment={assignment} myPersonId={myPerson?.id ?? null} />
      )}

      {/* Nieobecności załogi (dziś + przyszłe służby) */}
      <CrewAbsencesCollapsible
        personnel={personnel}
        savedMap={savedMap}
        currentAssignment={assignment}
        currentDutyDate={dutyDate}
        myPersonId={myPerson?.id ?? null}
      />
      </section>

      {/* ── WARUNKI ── */}
      <section className="space-y-3">
      <ZoneLabel>Warunki</ZoneLabel>

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
      </section>
    </div>
  )
}
