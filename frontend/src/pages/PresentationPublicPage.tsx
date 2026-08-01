import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { StateProvider, useCadence } from '../context/StateContext'
import { AuthOverrideProvider } from '../context/AuthOverrideContext'
import { ToastProvider } from '../context/ToastContext'
import { DialogProvider } from '../context/DialogContext'
import { OnboardingProvider } from '../context/OnboardingContext'
import { PresentationModeProvider, PRESENTATION_PAGES } from '../context/PresentationModeContext'
import type { PresentationPage } from '../context/PresentationModeContext'
import { DashboardPage } from './DashboardPage'
import { RoadmapPage } from './RoadmapPage'
import { VisionPage } from './VisionPage'
import { SprintReviewPage } from './SprintReviewPage'
import { BacklogPage } from './BacklogPage'

// Phase 3 (roadmap v1), Mode présentation — route publique `/present/:token` (hors ProtectedRoute,
// voir App.tsx), pour un visiteur sans compte qui ouvre un lien de partage généré par un Admin/PO
// (Réglages > Mode présentation). Réutilise TEL QUEL les vraies pages (Dashboard, Roadmap,
// Vision/NNL, Sprint Review, Backlog) plutôt que de les réécrire en version "lecture seule" dédiée :
// elles sont déjà lecture seule pour le rôle STAKEHOLDER (`isReadOnlyForRole` pour les 4 premières,
// `canManageBacklog`/`canEditBacklogOperational` pour le Backlog — voir utils/permissions.ts,
// verrouillage Stakeholder v0.94.1) — `AuthOverrideProvider` impose exactement ce rôle à tout ce
// sous-arbre (voir AuthOverrideContext.tsx, consulté par hooks/useAuth.ts), sans qu'aucune de ces
// pages n'ait besoin d'être modifiée pour ce chantier. Backlog ajouté le 2026-08-01 (retour Julien).
const PAGE_COMPONENTS: Record<PresentationPage, () => JSX.Element> = {
  '/dashboard': DashboardPage,
  '/roadmap': RoadmapPage,
  '/vision': VisionPage,
  '/sprint-review': SprintReviewPage,
  '/backlog': BacklogPage,
}

// Corps de la vue, séparé du composant de route ci-dessous car `useCadence()` exige d'être
// sous `StateProvider`. Navigation par état local (pas de sous-routes `/present/:token/roadmap`
// etc.) : ce n'est pas une page qu'on a besoin de recharger ou de mettre en favori sur une étape
// précise, juste un diaporama — plus simple qu'une vraie navigation React Router imbriquée.
function PresentationPublicView() {
  const { stateLoaded, presentationLinkInvalid } = useCadence()
  const [index, setIndex] = useState(0)

  const next = useCallback(() => setIndex(i => (i + 1) % PRESENTATION_PAGES.length), [])
  const prev = useCallback(() => setIndex(i => (i - 1 + PRESENTATION_PAGES.length) % PRESENTATION_PAGES.length), [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [next, prev])

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

  const CurrentPage = PAGE_COMPONENTS[PRESENTATION_PAGES[index]]

  return (
    <div className="app-shell presentation-active" data-testid="presentation-public-view">
      <div className="main-area">
        <CurrentPage />
      </div>
      <div
        style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10001, display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999,
          boxShadow: 'var(--shadow)', padding: '8px 16px', fontSize: 13,
        }}
      >
        <button data-testid="presentation-public-prev" className="btn-icon" onClick={prev} aria-label="Page précédente">←</button>
        <span style={{ color: 'var(--text-muted, #666)' }}>{index + 1} / {PRESENTATION_PAGES.length}</span>
        <button data-testid="presentation-public-next" className="btn-icon" onClick={next} aria-label="Page suivante">→</button>
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
          <OnboardingProvider>
            <PresentationModeProvider>
              <PresentationPublicView />
            </PresentationModeProvider>
          </OnboardingProvider>
        </AuthOverrideProvider>
      </StateProvider>
    </DialogProvider>
    </ToastProvider>
  )
}
