import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Pencil, X, Check, RefreshCw, MessageSquare, Bell, Trash2, Flame, Wind, Thermometer, Droplets, Leaf } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  currentOrNextDutyDate,
  previousDutyDate,
  todayYmdKey,
  formatDateShort,
  formatDateLong,
} from '../lib/duty'
import { cn } from '../lib/utils'
import type { Person, ShiftAssignment, RoleType, AbsenceType } from '../lib/crew'
import { ABSENCE_LABELS } from '../lib/crew'
import { DutyAssignmentView } from '../components/DutyAssignmentView'
import { useAuth } from '../lib/auth'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">
      {children}
    </p>
  )
}

function StatCard({
  value,
  label,
  accent = 'slate',
}: {
  value: string | number
  label: string
  accent?: 'green' | 'red' | 'slate'
}) {
  const colors = { green: 'text-emerald-400', red: 'text-red-400', slate: 'text-white' }
  return (
    <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-4 flex flex-col gap-1">
      <span className={cn('text-2xl font-bold tabular-nums', colors[accent])}>{value}</span>
      <span className="text-xs font-medium text-slate-400">{label}</span>
    </div>
  )
}

// ── Weather widget ────────────────────────────────────────────────────────────

interface WeatherData {
  moisture: string | null
  temperature: string | null
  humidity: string | null
  precipitation: string | null
  windSpeed: string | null
  windDir: string | null
  fireThreat: string | null
  fireThreatForecast: string | null
  updatedAt: string | null
}

const FIRE_STYLES: Record<number, { text: string; bg: string; border: string }> = {
  0: { text: 'text-slate-400',   bg: 'bg-surface-700/50',     border: 'border-slate-700/40'   },
  1: { text: 'text-emerald-400', bg: 'bg-emerald-950/40',     border: 'border-emerald-900/50' },
  2: { text: 'text-amber-400',   bg: 'bg-amber-950/40',       border: 'border-amber-900/50'   },
  3: { text: 'text-orange-400',  bg: 'bg-orange-950/40',      border: 'border-orange-900/50'  },
  4: { text: 'text-red-400',     bg: 'bg-red-950/40',         border: 'border-red-900/50'     },
  5: { text: 'text-red-300',     bg: 'bg-red-950/60',         border: 'border-red-800/60'     },
}

function parseFireLevel(threat: string | null): number {
  if (!threat) return 0
  const m = threat.match(/^(\d)/)
  return m ? Math.min(5, Math.max(0, parseInt(m[1]))) : 0
}

function WeatherWidget({
  data,
  loading,
  onRefresh,
}: {
  data: WeatherData | null
  loading: boolean
  onRefresh: () => void
}) {
  const level = parseFireLevel(data?.fireThreat ?? null)
  const ls = FIRE_STYLES[level]

  return (
    <div className={cn('bg-surface-800 rounded-xl border p-4', ls.border)}>
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Flame className={cn('w-4 h-4', ls.text)} />
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Zagrożenie pożarowe</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-slate-600 hover:text-slate-400 transition-colors disabled:opacity-40"
          title="Odśwież"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {loading && !data ? (
        <div className="h-16 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-xs text-slate-600 py-2 text-center">Brak danych pogodowych</p>
      ) : (
        <>
          <div className="flex gap-2 mb-3">
            <div className={cn('flex-1 rounded-lg px-3 py-2 border', ls.bg, ls.border)}>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-0.5">Teraz</p>
              <p className={cn('text-sm font-bold leading-tight', ls.text)}>{data.fireThreat ?? '—'}</p>
            </div>
            {data.fireThreatForecast && (
              <div className="flex-1 rounded-lg px-3 py-2 bg-surface-700/50 border border-slate-700/40">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mb-0.5">Prognoza</p>
                <p className="text-sm font-medium text-slate-300 leading-tight">{data.fireThreatForecast}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center bg-surface-700/30 rounded-lg py-2">
              <Thermometer className="w-3.5 h-3.5 text-red-400 mx-auto mb-0.5" />
              <p className="text-sm font-bold text-white tabular-nums">
                {data.temperature ? `${data.temperature}°` : '—'}
              </p>
              <p className="text-[9px] text-slate-600 uppercase tracking-wide">temp.</p>
            </div>
            <div className="text-center bg-surface-700/30 rounded-lg py-2">
              <Leaf className="w-3.5 h-3.5 text-amber-500 mx-auto mb-0.5" />
              <p className="text-sm font-bold text-white tabular-nums">
                {data.moisture ?? '—'}
              </p>
              <p className="text-[9px] text-slate-600 uppercase tracking-wide">ściółka</p>
            </div>
            <div className="text-center bg-surface-700/30 rounded-lg py-2">
              <Droplets className="w-3.5 h-3.5 text-blue-400 mx-auto mb-0.5" />
              <p className="text-sm font-bold text-white tabular-nums">
                {data.humidity ?? '—'}
                <span className="text-[9px] font-normal text-slate-500">%</span>
              </p>
              <p className="text-[9px] text-slate-600 uppercase tracking-wide">wilgotność</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/60">
            <span className="flex items-center gap-1">
              <Wind className="w-3 h-3 text-slate-600" />
              <span className="text-slate-400">{data.windSpeed ?? '—'} m/s {data.windDir ?? ''}</span>
            </span>
            <span>Opady: <span className="text-slate-400">{data.precipitation ?? '0'} mm</span></span>
          </div>

          {data.updatedAt && (
            <p className="text-[10px] text-slate-700 mt-1.5 text-right">akt. {data.updatedAt}</p>
          )}
        </>
      )}
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const dutyDate = currentOrNextDutyDate()
  const prevDate = previousDutyDate(dutyDate)
  const isToday = dutyDate === todayYmdKey()

  const [personnel, setPersonnel] = useState<Person[]>([])
  const [assignment, setAssignment] = useState<ShiftAssignment | null>(null)
  const [loading, setLoading] = useState(true)

  // Duty messages
  interface DutyMsg { id: string; sender_name: string | null; sender_login: string; message: string; created_at: string; read_at: string | null }
  const [dutyMessages, setDutyMessages] = useState<DutyMsg[]>([])

  // Announcement
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('personnel').select('*'),
      supabase
        .from('duty_assignments')
        .select('assignment_json')
        .eq('duty_date', dutyDate)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('announcements')
        .select('message')
        .eq('id', 1)
        .maybeSingle(),
      supabase
        .from('duty_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30),
    ]).then(([{ data: pData }, { data: aData }, { data: noteData }, { data: msgData }]) => {
      const aRow = aData?.[0]
      let loadedAssignment: ShiftAssignment | null = null
      if (aRow?.assignment_json) {
        const parsed = aRow.assignment_json as ShiftAssignment
        if (Array.isArray(parsed.dutyOfficerIds)) loadedAssignment = parsed
      }
      if (pData) {
        setPersonnel(
          pData.map(row => ({
            id: row.id,
            name: row.name,
            roles: row.roles as RoleType[],
            preferredVehicleId: row.preferred_vehicle_id ?? undefined,
            absence: (loadedAssignment?.absenceMap?.[row.id] ?? null) as AbsenceType | null,
            login: row.login ?? null,
          })),
        )
      }
      if (loadedAssignment) setAssignment(loadedAssignment)
      if (noteData?.message) setAnnouncement(noteData.message)
      if (msgData) setDutyMessages(msgData as DutyMsg[])
      setLoading(false)
    })
  }, [dutyDate])

  useEffect(() => {
    if (user?.role !== 'admin') return
    async function pollMessages() {
      const { data } = await supabase
        .from('duty_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30)
      if (data) setDutyMessages(data as DutyMsg[])
    }
    const interval = setInterval(pollMessages, 20_000)
    return () => clearInterval(interval)
  }, [user?.role])

  function fetchWeather() {
    setWeatherLoading(true)
    fetch('/.netlify/functions/weather')
      .then(r => (r.ok ? r.json() : null))
      .then(data => { setWeather(data); setWeatherLoading(false) })
      .catch(() => setWeatherLoading(false))
  }

  useEffect(() => { fetchWeather() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveAnnouncement() {
    setSavingNote(true)
    setSaveError(null)
    const msg = noteText.trim() || null
    const { error } = await supabase
      .from('announcements')
      .upsert({ id: 1, message: msg, updated_by: user?.login ?? null })
    setSavingNote(false)
    if (error) {
      setSaveError('Błąd zapisu: ' + error.message)
      return
    }
    setAnnouncement(msg)
    setEditingNote(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const availableCount = personnel.filter(p => !p.absence).length
  const absentPersonnel = personnel.filter(p => p.absence)
  const total = personnel.length
  const isAdmin = user?.role === 'admin'

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-6xl">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-800 mb-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
              {isToday ? 'Dzisiejsza służba' : 'Następna służba'}
            </p>
            <h1 className="text-2xl font-bold text-white">{formatDateShort(dutyDate)}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{formatDateLong(dutyDate)}</p>
          </div>
          <Link
            to={`/crew-generator?date=${dutyDate}`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors shrink-0 mt-1"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Edytuj obsadę</span>
          </Link>
        </div>

        {/* ── Two-column grid ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8 items-start">

          {/* LEFT — stats, absences, notatka, link */}
          <div className="space-y-5">

            {/* Stan obsady */}
            <div>
              <SectionLabel>Stan obsady</SectionLabel>
              <div className="grid grid-cols-3 gap-3">
                <StatCard value={total} label="Ogółem" />
                <StatCard value={availableCount} label="Dostępnych" accent="green" />
                <StatCard
                  value={absentPersonnel.length}
                  label="Nieobecnych"
                  accent={absentPersonnel.length > 0 ? 'red' : 'slate'}
                />
              </div>
              {total > 0 && (
                <div className="mt-3 h-1.5 rounded-full bg-surface-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${(availableCount / total) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Wiadomości od użytkowników */}
            {isAdmin && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <SectionLabel>Wiadomości od użytkowników</SectionLabel>
                  {dutyMessages.filter(m => !m.read_at).length > 0 && (
                    <span className="text-[10px] font-bold bg-red-600 text-white rounded-full px-1.5 py-0.5 leading-none -mt-2">
                      {dutyMessages.filter(m => !m.read_at).length}
                    </span>
                  )}
                </div>
                {dutyMessages.length === 0 ? (
                  <div className="flex items-center gap-2.5 bg-surface-800 rounded-xl border border-slate-700/40 px-4 py-3">
                    <Bell className="w-4 h-4 text-slate-600 shrink-0" />
                    <p className="text-xs text-slate-600">Brak wiadomości</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dutyMessages.map(msg => (
                      <div
                        key={msg.id}
                        className={cn(
                          'bg-surface-800 rounded-xl border px-4 py-3 flex flex-col gap-1.5',
                          msg.read_at ? 'border-slate-700/40' : 'border-brand-800/60'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {!msg.read_at && (
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                            )}
                            <span className="text-xs font-semibold text-slate-300 truncate">
                              {msg.sender_name ?? msg.sender_login}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-600">
                              {new Date(msg.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}
                              {' '}
                              {new Date(msg.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {!msg.read_at && (
                              <button
                                onClick={async () => {
                                  await supabase.from('duty_messages').update({ read_at: new Date().toISOString() }).eq('id', msg.id)
                                  setDutyMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: new Date().toISOString() } : m))
                                }}
                                className="text-[10px] text-slate-600 hover:text-brand-400 transition-colors"
                                title="Oznacz jako przeczytane"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                await supabase.from('duty_messages').delete().eq('id', msg.id)
                                setDutyMessages(prev => prev.filter(m => m.id !== msg.id))
                              }}
                              className="text-[10px] text-slate-700 hover:text-red-400 transition-colors"
                              title="Usuń"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                          {msg.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Zagrożenie pożarowe */}
            <WeatherWidget data={weather} loading={weatherLoading} onRefresh={fetchWeather} />

            {/* Nieobecni */}
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

            {/* Notatka */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>Notatka</SectionLabel>
                {isAdmin && !editingNote && (
                  <button
                    onClick={() => { setNoteText(announcement ?? ''); setEditingNote(true) }}
                    className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors mb-2"
                  >
                    {announcement ? 'Edytuj' : 'Dodaj'}
                  </button>
                )}
              </div>

              {editingNote ? (
                <div className="bg-surface-800 rounded-xl border border-brand-900/60 p-3 space-y-2">
                  <textarea
                    className="w-full bg-surface-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-none placeholder:text-slate-600"
                    rows={4}
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Treść notatki widoczna dla wszystkich użytkowników..."
                    autoFocus
                  />
                  {saveError && (
                    <p className="text-[11px] text-red-400">{saveError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setEditingNote(false); setSaveError(null) }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-2 py-1.5 rounded transition-colors"
                    >
                      <X className="w-3 h-3" /> Anuluj
                    </button>
                    <button
                      onClick={saveAnnouncement}
                      disabled={savingNote}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-brand-700 hover:bg-brand-600 text-white transition-colors disabled:opacity-50"
                    >
                      {savingNote
                        ? <RefreshCw className="w-3 h-3 animate-spin" />
                        : <Check className="w-3 h-3" />}
                      Zapisz
                    </button>
                  </div>
                </div>
              ) : announcement ? (
                <div className="bg-surface-800 rounded-xl border border-amber-900/40 px-4 py-3 flex gap-3">
                  <MessageSquare className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{announcement}</p>
                </div>
              ) : isAdmin ? (
                <button
                  onClick={() => { setNoteText(''); setEditingNote(true) }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-dashed border-slate-700 text-xs text-slate-600 hover:border-slate-500 hover:text-slate-500 transition-colors"
                >
                  Kliknij aby dodać notatkę dla użytkowników...
                </button>
              ) : null}
            </div>

            {/* Poprzednia służba — odnośnik */}
            <div>
              <SectionLabel>Skróty</SectionLabel>
              <Link
                to={`/crew-generator?date=${prevDate}`}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-800 border border-slate-700/40 hover:border-slate-600 transition-colors group"
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-0.5">
                    Poprzednia służba
                  </p>
                  <p className="text-sm font-medium text-slate-400 group-hover:text-white transition-colors">
                    {formatDateShort(prevDate)}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
              </Link>
            </div>


          </div>

          {/* RIGHT — obsada służby */}
          <div className="lg:border-l lg:border-slate-800 lg:pl-8">
            <SectionLabel>Obsada służby</SectionLabel>
            <DutyAssignmentView
              personnel={personnel}
              assignment={assignment}
              loading={false}
              hideAbsent
            />
          </div>

        </div>
      </div>
    </div>
  )
}
