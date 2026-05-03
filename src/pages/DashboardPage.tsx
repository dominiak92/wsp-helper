import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Pencil, X, Check, RefreshCw, MessageSquare } from 'lucide-react'
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

export function DashboardPage() {
  const { user } = useAuth()
  const dutyDate = currentOrNextDutyDate()
  const prevDate = previousDutyDate(dutyDate)
  const isToday = dutyDate === todayYmdKey()

  const [personnel, setPersonnel] = useState<Person[]>([])
  const [assignment, setAssignment] = useState<ShiftAssignment | null>(null)
  const [loading, setLoading] = useState(true)

  // Announcement
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

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
    ]).then(([{ data: pData }, { data: aData }, { data: noteData }]) => {
      if (pData) {
        setPersonnel(
          pData.map(row => ({
            id: row.id,
            name: row.name,
            roles: row.roles as RoleType[],
            preferredVehicleId: row.preferred_vehicle_id ?? undefined,
            absence: row.absence as AbsenceType | null,
            login: row.login ?? null,
          })),
        )
      }
      const row = aData?.[0]
      if (row?.assignment_json) {
        const parsed = row.assignment_json as ShiftAssignment
        if (Array.isArray(parsed.dutyOfficerIds)) setAssignment(parsed)
      }
      if (noteData?.message) setAnnouncement(noteData.message)
      setLoading(false)
    })
  }, [dutyDate])

  async function saveAnnouncement() {
    setSavingNote(true)
    const msg = noteText.trim() || null
    await supabase
      .from('announcements')
      .upsert({ id: 1, message: msg, updated_by: user?.login ?? null })
    setAnnouncement(msg)
    setEditingNote(false)
    setSavingNote(false)
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
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditingNote(false)}
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
                  <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{announcement}</p>
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
