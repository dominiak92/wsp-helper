import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { MobileLayout } from './components/layout/MobileLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { IncidentGeneratorPage } from './pages/IncidentGeneratorPage'
import { CrewGeneratorPage } from './pages/CrewGeneratorPage'
import { DutyCalendarPage } from './pages/DutyCalendarPage'
import { MobileHomePage } from './pages/mobile/MobileHomePage'
import { MobileCalendarPage } from './pages/mobile/MobileCalendarPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<MobileLayout />}>
            <Route path="/mobile" element={<MobileHomePage />} />
            <Route path="/mobile/calendar" element={<MobileCalendarPage />} />
          </Route>

          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/personal" element={<PlaceholderPage />} />
            <Route path="/deployments" element={<PlaceholderPage />} />
            <Route path="/readiness" element={<PlaceholderPage />} />
            <Route path="/documents" element={<PlaceholderPage />} />
            <Route path="/incident-generator" element={<IncidentGeneratorPage />} />
            <Route path="/crew-generator" element={<CrewGeneratorPage />} />
            <Route path="/duty-calendar" element={<DutyCalendarPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
