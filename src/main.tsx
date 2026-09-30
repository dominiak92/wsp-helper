import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Vite: nie udało się doładować zależności dynamicznego importu (zwykle po deployu) — przeładuj
// Flaga w sessionStorage chroni przed pętlą przeładowań, gdy błąd nie znika po odświeżeniu.
const PRELOAD_RELOAD_KEY = 'wsp-preload-reload'
window.addEventListener('vite:preloadError', event => {
  try {
    if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) return
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})
// Po udanym starcie zdejmij flagę, żeby kolejny deploy w tej samej sesji też mógł przeładować
setTimeout(() => { try { sessionStorage.removeItem(PRELOAD_RELOAD_KEY) } catch { /* private mode */ } }, 10_000)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
