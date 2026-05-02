import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface AuthUser {
  id: string
  login: string
  role: 'admin' | 'user'
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: (login: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function toAuthUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null
  const u = session.user
  return {
    id: u.id,
    login: (u.user_metadata?.login as string) ?? u.email?.split('@')[0] ?? 'unknown',
    role: (u.user_metadata?.role as 'admin' | 'user') ?? 'user',
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(toAuthUser(session))
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAuthUser(session))
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(login: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({
      email: `${login.trim().toLowerCase()}@wsp.internal`,
      password,
    })
    return error ? 'Nieprawidłowy login lub hasło.' : null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
