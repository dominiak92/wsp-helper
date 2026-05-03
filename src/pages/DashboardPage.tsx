import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { currentOrNextDutyDate, todayYmdKey, formatDateShort, formatDateLong } from '../lib/duty'
import { cn } from '../lib/utils'
import type { Person, ShiftAssignment, RoleType, AbsenceType } from '../lib/crew'
import { ABSENCE_LABELS } from '../lib/crew'
import { DutyAssignmentView } from '../components/DutyAssignmentView'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mb-2">{children}</p>
  )
}

function StatCard({ value, label, sub, accent = 'slate' }: {
  value: string | number
  label: string
  sub?: string
  accent?: 'green' | 'red' | 'slate'
}) {
  const colors = { green: 'text-emerald-400', red: 'text-red-400', slate: 'text-white' }
  return (
    <div className="bg-surface-800 rounded-xl border border-slate-700/40 p-4 flex flex-col gap-1">
      <span className={cn('text-2xl font-bold tabular-nums', colors[accent])}>{value}</span>
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {sub && <span className="text-[11px] text-slate-600">{sub}</span>}
    </div>
  )
}

export function DashboardPage() {
  const dutyDate = currentOrNextDutyDate()
  const isToday = dutyDate === todayYmdKey()

  const [personnel, setPersonnel] = useState<Person[]>([])
  const [assignment, setAssignment] = useState<ShiftAssignment | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('personnel').select('*'),
      supabase
        .from('duty_assignments')
        .select('assignment_json')
        .eq('duty_date', dutyDate)
        .order('created_at', { ascending: false })
        .limit(1),
    ]).then(([{ data: pData }, { data: aData }]) => {
      if (pData) {
        setPersonnel(pData.map(row => ({
          id: row.id,
          name: row.name,
          roles: row.roles as RoleType[],
          preferredVehicleId: row.preferred_vehicle_id ?? undefined,
          absence: row.absence as AbsenceType | null,
          login: row.login ?? null,
        })))
      }
      const row = aData?.[0]
      if (row?.assignment_json) {
        const parsed = row.assignment_json as ShiftAssignment
        if (Array.isArray(parsed.dutyOfficerIds)) setAssignment(parsed)
      }
      setLoading(false)
    })
  }, [dutyDate])

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

  return (
    <div className="p-3 sm:p-6 space-y-5 max-w-3xl">

      {/* Date header */}
      <div className="border-b border-slate-800 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
          {isToday ? 'Dzisiejsza służba' : 'Następna służba'}
        </p>
        <h1 className="text-2xl font-bold text-white">{formatDateShort(dutyDate)}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{formatDateLong(dutyDate)}</p>
      </div>

      {/* Crew counters */}
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
          <div className="mt-2 h-1.5 rounded-full bg-surface-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${(availableCount / total) * 100}%` }}
            />
          </div>
        )}
      </div>

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

      {/* Full shift assignment */}
      <div>
        <SectionLabel>Obsada służby</SectionLabel>
        <DutyAssignmentView personnel={personnel} assignment={assignment} loading={false} />
      </div>

    </div>
  )
}
