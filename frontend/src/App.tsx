import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { BacklogPage } from './pages/BacklogPage'
import { KanbanPage } from './pages/KanbanPage'
import { PlanningPage } from './pages/PlanningPage'
import { DailyPage } from './pages/DailyPage'
import { DashboardPage } from './pages/DashboardPage'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { StateProvider } from './context/StateContext'
import { TimerProvider } from './context/TimerContext'
import { useAuth } from './hooks/useAuth'

function PlaceholderPage({ title }: { title: string }) {
  return <div className="page-content"><p style={{ color: 'var(--text-muted)' }}>{title} — en cours de migration</p></div>
}

function AppLayout() {
  return (
    <TimerProvider>
      <StateProvider>
        <div className="app-shell">
          <Sidebar />
          <div className="main-area">
            <Routes>
              <Route path="/backlog" element={<BacklogPage />} />
              <Route path="/planning" element={<PlanningPage />} />
              <Route path="/kanban" element={<KanbanPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/daily" element={<DailyPage />} />
              <Route path="/retro" element={<><Header title="Rétrospective" /><PlaceholderPage title="Rétrospective" /></>} />
              <Route path="/clients" element={<><Header title="Clients" /><PlaceholderPage title="Clients" /></>} />
              <Route path="/settings" element={<><Header title="Réglages" /><PlaceholderPage title="Réglages" /></>} />
              <Route path="*" element={<Navigate to="/backlog" replace />} />
            </Routes>
          </div>
        </div>
      </StateProvider>
    </TimerProvider>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
