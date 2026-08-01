import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
import { VisionPage } from './pages/VisionPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { SprintPlanningPage } from './pages/SprintPlanningPage'
import { SprintReviewPage } from './pages/SprintReviewPage'
import { Sidebar } from './components/layout/Sidebar'
import { StateProvider, useCadence } from './context/StateContext'
import { TimerProvider } from './context/TimerContext'
import { ToastProvider } from './context/ToastContext'
import { DialogProvider } from './context/DialogContext'
import { useAuth } from './hooks/useAuth'
import { useGlobalUndoRedoShortcut } from './hooks/useGlobalUndoRedoShortcut'
import { canAccessRoute } from './utils/permissions'

// Tant que les vraies données du serveur ne sont pas arrivées, l'app affichait déjà le contenu
// (Sidebar + pages) en s'appuyant sur DEMO_STATE, sans empêcher de saisir quoi que ce soit dedans.
// Si le GET /api/state initial met du temps à répondre, toute saisie faite entre-temps était
// silencieusement écrasée dès que la réponse arrivait (SET_STATE remplace tout l'état) — bug
// constaté sur Sprint Review le 2026-07-22 (voir docs/corrections.md), mais la course concerne en
// réalité toute l'application. On bloque donc l'affichage éditable tant que stateLoaded est faux.
function AppShell() {
  const { stateLoaded, undo, redo, canUndo, canRedo } = useCadence()
  useGlobalUndoRedoShortcut({ undo, redo, canUndo, canRedo })
  const { userRole } = useAuth()
  const location = useLocation()

  // Phase 2.5 (roadmap v1) — verrouillage Stakeholder : certaines pages lui sont entièrement
  // interdites (voir `canAccessRoute`, utils/permissions.ts). Vérifié ici plutôt que route par
  // route : couvre toute navigation, y compris une URL tapée directement, sans dépendre du lien
  // de la Sidebar (lui-même masqué pour ces mêmes routes, voir Sidebar.tsx — la Sidebar n'est que
  // le reflet de cette règle, pas le seul rempart).
  if (!canAccessRoute(userRole, location.pathname)) {
    return <Navigate to="/dashboard" replace />
  }

  if (!stateLoaded) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--text-muted)', fontSize: 13,
      }}>
        Chargement…
      </div>
    )
  }

  return (
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
          <Route path="/sprint-review" element={<SprintReviewPage />} />
          <Route path="/historique" element={<HistoriquePage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/vision" element={<VisionPage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="*" element={<Navigate to="/backlog" replace />} />
        </Routes>
      </div>
    </div>
  )
}

function AppLayout() {
  return (
    <ToastProvider>
    <DialogProvider>
    <TimerProvider>
      <StateProvider>
        <AppShell />
      </StateProvider>
    </TimerProvider>
    </DialogProvider>
    </ToastProvider>
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
