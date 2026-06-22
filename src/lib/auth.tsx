import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface AuthUser {
  id: string
  login: string
  role: 'admin' | 'user'
  displayName: string
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: (login: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function baseFromSession(session: Session | null): AuthUser | null {
  if (!session?.user) return null
  const u = session.user
  const login = (u.user_metadata?.login as string) ?? u.email?.split('@')[0] ?? 'unknown'
  return {
    id: u.id,
    login,
    role: (u.user_metadata?.role as 'admin' | 'user') ?? 'user',
    displayName: login, // fallback — replaced async below
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch real name from personnel and patch user state (non-blocking)
  function hydrateDisplayName(base: AuthUser) {
    supabase
      .from('personnel')
      .select('name')
      .eq('login', base.login)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) {
          setUser(prev =>
            prev?.id === base.id ? { ...prev, displayName: data.name! } : prev
          )
        }
      })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = baseFromSession(session)
      setUser(u)
      setLoading(false)
      if (u) hydrateDisplayName(u)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = baseFromSession(session)
      setUser(u)
      if (u) hydrateDisplayName(u)
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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
