import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { BacklogPage } from './pages/BacklogPage'
import { KanbanPage } from './pages/KanbanPage'
import { PlanningPage } from './pages/PlanningPage'
import { DailyPage } from './pages/DailyPage'
import { DashboardPage } from './pages/DashboardPage'
import { RetroPage } from './pages/RetroPage'
import { ClientsPage } from './pages/ClientsPage'
import { TeamPage } from './pages/TeamPage'
import { AutoPlanningPage } from './pages/AutoPlanningPage'
import { HistoriquePage } from './pages/HistoriquePage'
import { SettingsPage } from './pages/SettingsPage'
import { RoadmapPage } from './pages/RoadmapPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { SprintPlanningPage } from './pages/SprintPlanningPage'
import { Sidebar } from './components/layout/Sidebar'
import { StateProvider } from './context/StateContext'
import { TimerProvider } from './context/TimerContext'
import { useAuth } from './hooks/useAuth'

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
              <Route path="/sprint-planning" element={<SprintPlanningPage />} />
              <Route path="/auto" element={<AutoPlanningPage />} />
              <Route path="/kanban" element={<KanbanPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/daily" element={<DailyPage />} />
              <Route path="/retro" element={<RetroPage />} />
              <Route path="/historique" element={<HistoriquePage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/roadmap" element={<RoadmapPage />} />
              <Route path="/changelog" element={<ChangelogPage />} />
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
