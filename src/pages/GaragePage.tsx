import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  currentOrNextDutyDate, todayYmdKey, formatDateShort, formatDateLong,
} from '../lib/duty'
import type { Person, ShiftAssignment, VehicleAssignment, RoleType, AbsenceType } from '../lib/crew'

// ── Static bay definitions ────────────────────────────────────────────────────

type VehicleType = 'gba' | 'gcba' | 'glbm'

interface Bay {
  number: number
  brand: string
  model: string
  callsign: string | null
  vehicleId: string | null   // null = not in duty assignment system
  note?: string
  type: VehicleType
}

const BAYS: Bay[] = [
  { number: 1, brand: 'IVECO',      model: 'GBA 2,5/16',  callsign: '21', vehicleId: 'gba',      type: 'gba'  },
  { number: 2, brand: 'SCANIA',     model: 'GCBA 5/32',   callsign: '25', vehicleId: 'gcba532',  type: 'gcba' },
  { number: 3, brand: 'SCANIA',     model: 'GCBA 10/60',  callsign: '26', vehicleId: 'gcba1060', type: 'gcba' },
  { number: 4, brand: 'SCANIA',     model: 'GCBA 8/50',   callsign: '35', vehicleId: null,       type: 'gcba', note: 'Lotniskowy' },
  { number: 5, brand: 'Mitsubishi', model: 'GLBM 0.3',    callsign: '20', vehicleId: null,       type: 'glbm' },
]

const TYPE_STYLES: Record<VehicleType, { door: string; callsign: string; border: string }> = {
  gba:  { door: 'from-red-950/60 to-slate-900',    callsign: 'text-red-400',    border: 'border-red-900/40'    },
  gcba: { door: 'from-orange-950/50 to-slate-900', callsign: 'text-orange-400', border: 'border-orange-900/40' },
  glbm: { door: 'from-emerald-950/50 to-slate-900',callsign: 'text-emerald-400',border: 'border-emerald-900/40'},
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CrewRow({ role, personName, dim }: { role: string; personName: string; dim?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-semibold text-slate-500 w-9 shrink-0">{role}</span>
      <span className={`text-sm font-medium truncate ${dim ? 'text-slate-500' : 'text-white'}`}>
        {personName}
      </span>
    </div>
  )
}

interface BayCardProps {
  bay: Bay
  va: VehicleAssignment | null
  hasAssignment: boolean
  name: (id: string | null) => string
}

function BayCard({ bay, va, hasAssignment, name }: BayCardProps) {
  const s = TYPE_STYLES[bay.type]
  const isActive = bay.vehicleId !== null

  return (
    <div className={`flex flex-col w-[200px] rounded-xl border bg-surface-900 overflow-hidden shrink-0 ${isActive ? s.border : 'border-slate-800'}`}>

      {/* ── Garage door ────────────────────────────────────────── */}
      <div className={`relative h-24 bg-gradient-to-b ${s.door} flex-shrink-0`}>
        {/* Slats */}
        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className="absolute inset-x-0 h-px bg-slate-800/70"
            style={{ top: `${(i + 1) * 13}px` }}
          />
        ))}
        {/* Bay number watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-5xl font-black text-slate-800/60 select-none tabular-nums leading-none">
            {bay.number}
          </span>
        </div>
        {/* Door handle */}
        <div className="absolute bottom-2.5 inset-x-0 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-slate-700" />
        </div>
        {/* Brama label */}
        <div className="absolute top-2 left-3">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
            Brama {bay.number}
          </span>
        </div>
      </div>

      {/* ── Vehicle info ────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{bay.brand}</p>
        <p className="text-sm font-bold text-white leading-tight mt-0.5">{bay.model}</p>
        {bay.note && (
          <p className="text-[11px] text-slate-500 mt-0.5">{bay.note}</p>
        )}
        {bay.callsign && (
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={`text-2xl font-black tabular-nums leading-none ${s.callsign}`}>
              {bay.callsign}
            </span>
            <span className="text-[9px] text-slate-600 font-semibold uppercase tracking-widest">kryptonim</span>
          </div>
        )}
      </div>

      {/* ── Crew ────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex-1">
        {!isActive ? (
          <p className="text-[11px] text-slate-600 italic">Poza obsadą służby</p>
        ) : !hasAssignment ? (
          <p className="text-[11px] text-slate-600 italic">Obsada nie zapisana</p>
        ) : va ? (
          <div className="space-y-1.5">
            {va.commanderId && (
              <CrewRow role="Dowódca zastępu" personName={name(va.commanderId)} />
            )}
            {va.driverId && va.driverId !== va.commanderId && (
              <CrewRow role="Kier." personName={name(va.driverId)} />
            )}
            {va.rescuerIds.map((id, i) => (
              <CrewRow key={i} role="Rat." personName={name(id)} />
            ))}
            {!va.commanderId && !va.driverId && va.rescuerIds.length === 0 && (
              <p className="text-[11px] text-slate-600 italic">Brak przydziału</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-600 italic">Brak przydziału</p>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function GaragePage() {
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

  function name(id: string | null): string {
    if (!id) return '—'
    return personnel.find(p => p.id === id)?.name ?? '—'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Special roles (not in any bay)
  const dutyOfficers = assignment?.dutyOfficerIds ?? []
  const shiftCommanderId = assignment?.shiftCommanderId ?? null

  return (
    <div className="p-4 sm:p-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-800 mb-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
            {isToday ? 'Dzisiejsza służba' : 'Następna służba'}
          </p>
          <h1 className="text-2xl font-bold text-white">Garaż</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatDateShort(dutyDate)} · {formatDateLong(dutyDate)}
          </p>
        </div>
      </div>

      {/* Special roles strip */}
      {assignment && (shiftCommanderId || dutyOfficers.length > 0) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {shiftCommanderId && (
            <div className="flex items-center gap-2 bg-brand-900/30 border border-brand-800/50 rounded-lg px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-500">Dowódca zmiany</span>
              <span className="text-sm font-semibold text-white">{name(shiftCommanderId)}</span>
            </div>
          )}
          {dutyOfficers.map(id => (
            <div key={id} className="flex items-center gap-2 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Dyżurny</span>
              <span className="text-sm font-semibold text-white">{name(id)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bay grid — horizontal scroll on small screens */}
      <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pb-2">
        <div className="flex gap-3">
          {BAYS.map(bay => {
            const va = bay.vehicleId
              ? (assignment?.vehicles.find(v => v.vehicleId === bay.vehicleId) ?? null)
              : null
            return (
              <BayCard
                key={bay.number}
                bay={bay}
                va={va}
                hasAssignment={!!assignment}
                name={name}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
