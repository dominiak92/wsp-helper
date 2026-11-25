// Kropka na zakładce „Terminy” (dolne menu na telefonie, boczne menu admina).
// Odświeżana przy każdej zmianie strony — po zatwierdzeniu/zapisie kropka znika
// od razu po wyjściu z zakładki. Błąd sieci → brak kropki (to tylko podpowiedź).
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { todayYmdKey } from './duty'
import type { RoleType } from './crew'
import { fetchQualifications, isApprover, needsAttention } from './qualifications'

export function useQualificationsBadge(): boolean {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    Promise.all([
      supabase.from('personnel').select('id, roles').eq('login', user.login).maybeSingle(),
      fetchQualifications(),
    ])
      .then(([{ data: me }, quals]) => {
        if (cancelled) return
        const approver = isApprover((me?.roles ?? []) as RoleType[], user.role)
        setShow(needsAttention(quals, me?.id ?? null, approver, user.role === 'admin', todayYmdKey()))
      })
      .catch(() => { if (!cancelled) setShow(false) })
    return () => { cancelled = true }
  }, [user, pathname])

  return show
}
