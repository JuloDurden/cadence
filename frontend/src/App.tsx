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
import { OnboardingProvider } from './context/OnboardingContext'
import { OnboardingPanel } from './components/onboarding/OnboardingPanel'
import { SpotlightHost } from './components/onboarding/Spotlight'
import { ChatProvider } from './context/ChatContext'
import { ChatPanel } from './components/chat/ChatPanel'
import { PresentationModeProvider, usePresentationMode } from './context/PresentationModeContext'
import { PresentationBar } from './components/presentation/PresentationBar'
import { PresentationPublicPage } from './pages/PresentationPublicPage'
import { useAuth } from './hooks/useAuth'
import { useGlobalUndoRedoShortcut } from './hooks/useGlobalUndoRedoShortcut'
import { canAccessRoute } from './utils/permissions'

// Tant que les vraies données du serveur ne sont pas arrivées, l'app affichait déjà le contenu
// (Sidebar + pages) en s'appuyant sur DEMO_STATE, sans empêcher de saisir quoi que ce soit dedans.
// Si le GET /api/state initial met du temps à répondre, toute saisie faite entre-temps était
// silencieusement écrasée dès que la réponse arrivait (SET_STATE remplace tout l'état) — bug
// constaté sur Sprint Review le 2026-07-22 (voir docs/corrections.md), mais la course concerne en
// réalité toute l'application. On bloque donc l'affichage éditable tant que stateLoaded est faux.
// Phase 6bis (roadmap v1), sous-chantier 4 (2026-08-13) : page de démarrage réglable
// (`settings.defaultStartPage`, Réglages). LoginPage navigue toujours vers "/" sans rien savoir de
// ce réglage, cette route se charge seule de résoudre la vraie destination une fois l'état chargé
// (AppShell garde déjà l'affichage tant que `stateLoaded` est faux, voir plus bas).
function StartRedirect() {
  const { state } = useCadence()
  return <Navigate to={state.settings?.defaultStartPage || '/backlog'} replace />
}

function AppShell() {
  const { stateLoaded, undo, redo, canUndo, canRedo } = useCadence()
  useGlobalUndoRedoShortcut({ undo, redo, canUndo, canRedo })
  const { userRole } = useAuth()
  const location = useLocation()
  // Phase 3 (roadmap v1), Mode présentation — sidebar masquée tant que le mode est actif (bouton
  // "Présenter" du Header, voir PresentationModeContext.tsx). Le contenu des pages reste identique,
  // seule la navigation change (flèches clavier au lieu de la Sidebar, voir ce même contexte).
  const { active: presentationActive, pages: presentationPages } = usePresentationMode()

  // Phase 2.5 (roadmap v1) — verrouillage Stakeholder : certaines pages lui sont entièrement
  // interdites (voir `canAccessRoute`, utils/permissions.ts). Vérifié ici plutôt que route par
  // route : couvre toute navigation, y compris une URL tapée directement, sans dépendre du lien
  // de la Sidebar (lui-même masqué pour ces mêmes routes, voir Sidebar.tsx — la Sidebar n'est que
  // le reflet de cette règle, pas le seul rempart).
  if (!canAccessRoute(userRole, location.pathname)) {
    return <Navigate to="/dashboard" replace />
  }

  // Retour Julien (2026-08-01, capture d'écran à l'appui) : la Sidebar masquée ne suffit pas à
  // empêcher d'atterrir sur une page non prévue pour le mode présentation (Réglages, Backlog avant
  // son ajout à la liste, etc.) — une URL tapée directement, ou un lien resté cliquable ailleurs
  // dans l'UI, y menait quand même. Redirige vers la 1re page présentable tant que le mode est
  // actif, même logique que le garde-fou Stakeholder juste au-dessus. Pages désormais configurables
  // (Réglages, voir data/presentablePages.ts) plutôt qu'une liste figée.
  const currentPath = location.pathname + location.search
  if (presentationActive && !presentationPages.some(p => p.path === currentPath)) {
    return <Navigate to={presentationPages[0]?.path ?? '/dashboard'} replace />
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
    <div className={`app-shell${presentationActive ? ' presentation-active' : ''}`}>
      {!presentationActive && <Sidebar />}
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
          <Route path="/" element={<StartRedirect />} />
          <Route path="*" element={<Navigate to="/backlog" replace />} />
        </Routes>
      </div>
      <OnboardingPanel />
      <SpotlightHost />
      <PresentationBar />
      <ChatPanel />
    </div>
  )
}

function AppLayout() {
  return (
    <ToastProvider>
    <DialogProvider>
    <TimerProvider>
      <StateProvider>
        <OnboardingProvider>
          <PresentationModeProvider>
            <ChatProvider>
              <AppShell />
            </ChatProvider>
          </PresentationModeProvider>
        </OnboardingProvider>
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
        {/* Phase 3 (roadmap v1), Mode présentation — publique, hors ProtectedRoute : le token de
            l'URL fait office d'autorisation (voir PresentationPublicPage.tsx), aucun compte requis. */}
        <Route path="/present/:token" element={<PresentationPublicPage />} />
        <Route path="/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
