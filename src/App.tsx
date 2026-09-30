import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { MobileLayout } from './components/layout/MobileLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { IncidentGeneratorPage } from './pages/IncidentGeneratorPage'
import { CrewGeneratorPage } from './pages/CrewGeneratorPage'
import { DutyCalendarPage } from './pages/DutyCalendarPage'
import { GaragePage } from './pages/GaragePage'
import { SchedulePage } from './pages/SchedulePage'
import { VademecumPage } from './pages/VademecumPage'
import { MobileHomePage } from './pages/mobile/MobileHomePage'
import { MobileCalendarPage } from './pages/mobile/MobileCalendarPage'
import { MobileCrewPage } from './pages/mobile/MobileCrewPage'
import { ErrorBoundary } from './components/ErrorBoundary'

// FireMapPage ciągnie Leaflet + markercluster — ładuj leniwie, żeby nie
// powiększać głównego bundla dla tras, które mapy nie używają.
// Po deployu stary plik chunka znika — nieudany import raz przeładowuje stronę
// (świeży index.html wskaże nowe pliki), zamiast zostawić biały ekran.
const CHUNK_RELOAD_KEY = 'wsp-chunk-reload'
const FireMapPage = lazy(() =>
  import('./pages/FireMapPage')
    .then(m => {
      try { sessionStorage.removeItem(CHUNK_RELOAD_KEY) } catch { /* private mode */ }
      return { default: m.FireMapPage }
    })
    .catch(err => {
      let reloaded = false
      try { reloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1' } catch { /* private mode */ }
      if (reloaded) throw err // drugi raz z rzędu — pokaż ErrorBoundary
      try { sessionStorage.setItem(CHUNK_RELOAD_KEY, '1') } catch { /* private mode */ }
      window.location.reload()
      return new Promise<never>(() => {})
    }),
)

function MapFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-950 text-surface-500">
      Ładowanie mapy…
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<MobileLayout />}>
            <Route path="/mobile" element={<MobileHomePage />} />
            <Route path="/mobile/calendar" element={<MobileCalendarPage />} />
            <Route path="/mobile/crew-generator" element={<MobileCrewPage />} />
            <Route path="/mobile/map" element={<Suspense fallback={<MapFallback />}><FireMapPage /></Suspense>} />
          </Route>

          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/incident-generator" element={<IncidentGeneratorPage />} />
            <Route path="/crew-generator" element={<CrewGeneratorPage />} />
            <Route path="/duty-calendar" element={<DutyCalendarPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/garage" element={<GaragePage />} />
            <Route path="/vademecum" element={<VademecumPage />} />
            <Route path="/map" element={<Suspense fallback={<MapFallback />}><FireMapPage /></Suspense>} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
