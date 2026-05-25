import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, User } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { cn } from '../lib/utils'
import { useAuth } from '../lib/auth'

export function LoginPage() {
  const { user, loading: authLoading, signIn } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!authLoading && user) {
    return <Navigate to={user.role === 'user' ? '/mobile' : '/dashboard'} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!login.trim() || !password.trim()) {
      setError('Podaj login i hasło.')
      return
    }

    setLoading(true)
    const err = await signIn(login, password)
    setLoading(false)

    if (err) {
      setError(err)
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(14,165,233,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(14,165,233,0.5) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo block */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <img src="/logo.png" alt="WSP" className="w-24 h-24 object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">System Przebiegu Służby</h1>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">
              Wojskowa Straż Pożarna
            </p>
          </div>
        </div>

        {/* Form card */}
        <div className="rounded-xl bg-surface-800 border border-slate-700/60 shadow-2xl shadow-black/60 overflow-hidden">
          {/* Accent bar */}
          <div className="h-0.5 bg-gradient-to-r from-brand-700 via-brand-500 to-transparent" />

          <form onSubmit={handleSubmit} className="p-7 space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-4">
                Autoryzacja dostępu
              </p>

              {/* Login */}
              <div className="space-y-1.5 mb-4">
                <label className="text-xs font-medium text-slate-400">Login</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    type="text"
                    placeholder="imię"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    className="pl-9"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Hasło</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-alert-red bg-alert-red/10 border border-alert-red/20 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className={cn('w-full', loading && 'opacity-70 cursor-not-allowed')}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Weryfikacja…
                </span>
              ) : (
                'Zaloguj się'
              )}
            </Button>

            <p className="text-center text-[11px] text-slate-600">
              Problem z dostępem? Skontaktuj się z administratorem systemu.
            </p>
          </form>
        </div>

        {/* Version stamp */}
        <p className="text-center text-[10px] text-slate-700 mt-6 font-mono">
          WSP-CC v0.1.0 — STREFA ZASTRZEŻONA
        </p>
      </div>
    </div>
  )
}
