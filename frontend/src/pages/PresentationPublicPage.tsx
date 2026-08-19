import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { StateProvider, useCadence } from '../context/StateContext'
import { AuthOverrideProvider } from '../context/AuthOverrideContext'
import { ToastProvider } from '../context/ToastContext'
import { DialogProvider } from '../context/DialogContext'
import { OnboardingProvider } from '../context/OnboardingContext'
import { PersonalSettingsProvider } from '../context/PersonalSettingsContext'
import { PresentationModeProvider, usePresentationMode } from '../context/PresentationModeContext'
import { ChatProvider } from '../context/ChatContext'
import { PresentationThumbnails } from '../components/presentation/PresentationThumbnails'
import type { PresentablePageId } from '../data/presentablePages'
import { DashboardPage } from './DashboardPage'
import { RoadmapPage } from './RoadmapPage'
import { VisionPage } from './VisionPage'
import { SprintReviewPage } from './SprintReviewPage'
import { BacklogPage } from './BacklogPage'
import { PlanningPage } from './PlanningPage'
import { AutoPlanningPage } from './AutoPlanningPage'
import { SprintPlanningPage } from './SprintPlanningPage'
import { KanbanPage } from './KanbanPage'

// Phase 3 (roadmap v1), Mode présentation — route publique `/present/:token` (hors ProtectedRoute,
// voir App.tsx), pour un visiteur sans compte qui ouvre un lien de partage généré par un Admin/PO
// (Réglages > Mode présentation). Réutilise TEL QUEL les vraies pages (Dashboard, Roadmap,
// Vision/NNL, Sprint Review, Backlog, Release Planning, Auto-planning, Sprint Planning, Kanban)
// plutôt que de les réécrire en version "lecture seule" dédiée : elles sont déjà lecture seule
// pour le rôle STAKEHOLDER (`isReadOnlyForRole` pour la plupart, `canExploreWhatIf`/
// `canApplyScenario` pour Auto-planning, `canManageBacklog`/`canEditBacklogOperational` pour le
// Backlog — voir utils/permissions.ts, verrouillage Stakeholder v0.94.1) — `AuthOverrideProvider`
// impose exactement ce rôle à tout ce sous-arbre (voir AuthOverrideContext.tsx, consulté par
// hooks/useAuth.ts), sans qu'aucune de ces pages n'ait besoin d'être modifiée pour ce chantier.
//
// Chantier "Config pages présentables" (2026-08-02) — catalogue étendu à 10 pages (dont Vision et
// NNL séparément, voir data/presentablePages.ts), sélection/ordre réels lus depuis
// `state.settings.presentationPages` via `usePresentationMode().pages`, plus la même liste figée.
function VisionNNLPage() {
  // `?view=nnl` n'a aucun effet ici : cette vue ne navigue pas par une vraie URL React Router
  // (voir plus bas, PresentationPublicView — navigation par état local), d'où ce prop dédié.
  return <VisionPage initialView="nnl" />
}

const PAGE_COMPONENTS: Record<PresentablePageId, () => JSX.Element> = {
  dashboard: DashboardPage,
  vision: VisionPage,
  nnl: VisionNNLPage,
  backlog: BacklogPage,
  roadmap: RoadmapPage,
  planning: PlanningPage,
  auto: AutoPlanningPage,
  'sprint-planning': SprintPlanningPage,
  kanban: KanbanPage,
  'sprint-review': SprintReviewPage,
}

// Corps de la vue, séparé du composant de route ci-dessous car `useCadence()` exige d'être
// sous `StateProvider`. Navigation par état local (pas de sous-routes `/present/:token/roadmap`
// etc.) : ce n'est pas une page qu'on a besoin de recharger ou de mettre en favori sur une étape
// précise, juste un diaporama — plus simple qu'une vraie navigation React Router imbriquée.
function PresentationPublicView() {
  const { stateLoaded, presentationLinkInvalid } = useCadence()
  // `pages` résolu depuis state.settings.presentationPages (même logique que le mode présentation
  // pour un compte connecté, voir PresentationModeContext.tsx) — `active`/`enter`/`exit` ne sont
  // pas utilisés ici : cette vue est toujours "en présentation", sans bouton pour en sortir.
  const { pages } = usePresentationMode()
  const [index, setIndex] = useState(0)

  const next = useCallback(() => setIndex(i => (i + 1) % pages.length), [pages.length])
  const prev = useCallback(() => setIndex(i => (i - 1 + pages.length) % pages.length), [pages.length])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [next, prev])

  // La liste peut changer de taille (réglage modifié entre deux visites) — évite un index hors
  // bornes plutôt que de planter sur PAGE_COMPONENTS[undefined].
  useEffect(() => {
    if (index >= pages.length) setIndex(0)
  }, [pages.length, index])

  if (presentationLinkInvalid) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 8 }}>
        <p data-testid="presentation-invalid" style={{ fontSize: 14, color: 'var(--text-muted, #666)' }}>
          Ce lien de présentation n'est plus valide.
        </p>
      </div>
    )
  }

  if (!stateLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)', fontSize: 13 }}>
        Chargement…
      </div>
    )
  }

  const safeIndex = index < pages.length ? index : 0
  const CurrentPage = PAGE_COMPONENTS[pages[safeIndex].id]
  const currentPath = pages[safeIndex].path

  return (
    <div className="app-shell presentation-active" data-testid="presentation-public-view">
      <div className="main-area">
        <CurrentPage />
      </div>
      {/* Chantier "Vignettes au survol" (2026-08-02) — même panneau que PresentationBar.tsx (mode
          présentation d'un compte connecté), voir PresentationThumbnails.tsx. Sélection directe par
          `setIndex` plutôt que `navigate` : cette vue ne fait aucune vraie navigation React Router
          (voir commentaire en tête de fichier). */}
      <div className="presentation-bar-wrap" data-testid="presentation-bar-wrap">
        <PresentationThumbnails
          pages={pages}
          currentPath={currentPath}
          onSelect={page => {
            const i = pages.findIndex(p => p.id === page.id)
            if (i !== -1) setIndex(i)
          }}
        />
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999,
            boxShadow: 'var(--shadow)', padding: '8px 16px', fontSize: 13,
          }}
        >
          <button data-testid="presentation-public-prev" className="btn-icon" onClick={prev} aria-label="Page précédente">←</button>
          <span style={{ color: 'var(--text-muted, #666)' }}>{safeIndex + 1} / {pages.length}</span>
          <button data-testid="presentation-public-next" className="btn-icon" onClick={next} aria-label="Page suivante">→</button>
        </div>
      </div>
    </div>
  )
}

export function PresentationPublicPage() {
  const { token } = useParams<{ token: string }>()
  // Garde défensive pour le typage uniquement : la route `/present/:token` (App.tsx) ne matche
  // jamais sans un segment de token.
  if (!token) return null

  return (
    <ToastProvider>
    <DialogProvider>
      <StateProvider publicToken={token}>
        <AuthOverrideProvider value={{ userRole: 'STAKEHOLDER', userName: 'Invité' }}>
          {/* Préférences personnelles (2026-08-19) : même bug que ChatProvider ci-dessous, constaté
              après un run E2E (les 4 tests de ce fichier échouaient tous en amont d'une vraie
              assertion, `.hdr-page-title` introuvable). Le Header partagé appelle désormais aussi
              `usePersonalSettings()` sans condition (voir Header.tsx) : sans ce Provider, ce
              sous-arbre plante entièrement dès qu'une page s'affiche ici. `token: null` (voir
              useAuth.ts/AuthOverrideProvider ci-dessus) désactive proprement le fetch
              `/api/personal-settings` (PersonalSettingsContext.tsx), ce visiteur invité n'a de
              toute façon aucun compte à charger ; seules les valeurs de repli `state.settings`
              s'appliquent (thème/couleur/densité du workspace). */}
          <PersonalSettingsProvider>
          <OnboardingProvider>
            <PresentationModeProvider>
              {/* Phase 6 (roadmap v1), Compagnon IA, 2026-08-08 : le Header partagé (rendu par
                  chaque page réutilisée ci-dessus) appelle `useChat()` sans condition, et sans ce
                  Provider ce sous-arbre plante entièrement dès qu'une page s'affiche ici (bug
                  réel, corrigé après un run E2E : les 4 tests de ce fichier échouaient tous en
                  amont d'une vraie assertion). Le bouton lui-même reste caché pour ce visiteur
                  invité (`token: null`, voir Header.tsx), seul le Provider est nécessaire. */}
              <ChatProvider>
                <PresentationPublicView />
              </ChatProvider>
            </PresentationModeProvider>
          </OnboardingProvider>
          </PersonalSettingsProvider>
        </AuthOverrideProvider>
      </StateProvider>
    </DialogProvider>
    </ToastProvider>
  )
}
