import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { currentOrNextDutyDate, todayYmdKey, formatDateShort, formatDateLong } from '../../lib/duty'
import { DutyAssignmentView } from '../../components/DutyAssignmentView'
import type { Person, ShiftAssignment, RoleType, AbsenceType } from '../../lib/crew'

export function MobileHomePage() {
  const dutyDate = currentOrNextDutyDate()
  const isToday = dutyDate === todayYmdKey()

  const [personnel, setPersonnel] = useState<Person[]>([])
  const [assignment, setAssignment] = useState<ShiftAssignment | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('personnel').select('*'),
      supabase.from('duty_assignments').select('assignment_json').eq('duty_date', dutyDate).single(),
    ]).then(([{ data: pData }, { data: aData }]) => {
      if (pData) {
        setPersonnel(pData.map(row => ({
          id: row.id,
          name: row.name,
          roles: row.roles as RoleType[],
          preferredVehicleId: row.preferred_vehicle_id ?? undefined,
          absence: row.absence as AbsenceType | null,
        })))
      }
      if (aData?.assignment_json) {
        const parsed = aData.assignment_json as ShiftAssignment
        if (Array.isArray(parsed.dutyOfficerIds)) setAssignment(parsed)
      }
      setLoading(false)
    })
  }, [dutyDate])

  return (
    <div>
      {/* Date header */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-800">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
          {isToday ? 'Dzisiejsza służba' : 'Następna służba'}
        </p>
        <h2 className="text-2xl font-bold text-white">{formatDateShort(dutyDate)}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{formatDateLong(dutyDate)}</p>
      </div>

      <DutyAssignmentView personnel={personnel} assignment={assignment} loading={loading} />
    </div>
  )
}
