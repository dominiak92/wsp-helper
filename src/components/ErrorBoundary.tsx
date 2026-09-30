import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

// Ostatnia linia obrony: zamiast białego ekranu pokaż komunikat z przyciskiem odświeżenia.
// Typowy przypadek: PWA otwarte od godzin, w międzyczasie deploy usunął stare pliki JS.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950 px-6">
        <div className="max-w-sm w-full bg-surface-800 border border-slate-700/60 rounded-xl p-5 text-center space-y-3">
          <p className="text-base font-semibold text-white">Coś poszło nie tak</p>
          <p className="text-sm text-slate-400">
            Aplikacja mogła zostać zaktualizowana w tle. Odśwież, aby wczytać najnowszą wersję.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Odśwież aplikację
          </button>
        </div>
      </div>
    )
  }
}
