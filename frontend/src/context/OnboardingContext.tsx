import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { getOnboardingChecklist, CREATE_ITEM_CHECKLIST_ID } from '../data/onboardingChecklist'
import type { OnboardingChecklistItem, OnboardingStep } from '../data/onboardingChecklist'

// Phase 2.5 (roadmap v1), Onboarding, points 2-4 (2026-08-01, v0.95 puis retouches suite au 1er
// retour de Julien) : état partagé du "Guide de démarrage" (checklist + tooltips progressifs +
// démo interactive), accessible depuis le bouton Aide du Header ou ouvert automatiquement une
// seule fois pour un compte réellement nouveau.
//
// Deux mécanismes de tunnel, tous deux affichés via le même `spotlight` :
// - `tour` (la quasi-totalité des lignes) : liste de `OnboardingStep` connue à l'avance, navigation
//   Suivant/Précédent/Terminer gérée entièrement ici (`showTour`/`nextTourStep`/`prevTourStep`).
// - "piloté par la page" (uniquement "Créer votre première US", avant l'ouverture de la modale) :
//   `activeGuideId` signale à BacklogPage.tsx qu'elle doit elle-même appeler `showSpotlight` selon
//   son propre état d'UI réel (menu ouvert, modale ouverte) — pas de bouton Suivant, l'étape
//   change quand une vraie action se produit.
interface SpotlightState {
  selector: string
  text: string
  // Présent uniquement pour un tour manuel — affiche Suivant/Précédent/Terminer plutôt qu'une
  // simple croix de fermeture (tunnel piloté par la page, ex. menu "Ajouter" du Backlog).
  tour?: { index: number; count: number }
}

interface OnboardingContextValue {
  checklist: OnboardingChecklistItem[]
  completedItems: string[]
  progress: { done: number; total: number }
  panelOpen: boolean
  openPanel: () => void
  closePanel: () => void
  completeItem: (itemId: string) => void
  activateItem: (item: OnboardingChecklistItem) => void
  resetProgress: () => void
  spotlight: SpotlightState | null
  showSpotlight: (selector: string, text: string) => void
  hideSpotlight: () => void
  showTour: (steps: OnboardingStep[], opts?: { route?: string; onFinish?: () => void }) => void
  nextTourStep: () => void
  prevTourStep: () => void
  activeGuideId: string | null
  stopGuide: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding doit être utilisé dans un OnboardingProvider')
  return ctx
}

function resolveSelector(step: OnboardingStep, route: string): string {
  if (step.testId) return `[data-testid="${step.testId}"]`
  if (step.selector) return step.selector
  return `a[href="${route}"]`
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { token, userRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [completedItems, setCompletedItems] = useState<string[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [spotlight, setSpotlight] = useState<SpotlightState | null>(null)
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null)
  // Tour manuel en cours (Suivant/Précédent) — `route` sert à annuler proprement le tour si
  // l'utilisateur navigue ailleurs en plein milieu (lien de Sidebar cliqué, retour arrière...).
  const [tour, setTour] = useState<{ steps: OnboardingStep[]; index: number; route: string; onFinish?: () => void } | null>(null)
  const loadedForToken = useRef<string | null>(null)

  const checklist = getOnboardingChecklist(userRole)

  // Chargement de la progression + ouverture automatique une seule fois pour un compte
  // réellement nouveau (`onboardingSeenAt` encore null côté serveur). Un seul chargement par
  // connexion (loadedForToken évite un rechargement à chaque re-render du Provider).
  useEffect(() => {
    if (!token || loadedForToken.current === token) return
    loadedForToken.current = token
    api.getOnboarding()
      .then(({ onboardingSeenAt, onboardingCompletedItems }) => {
        setCompletedItems(onboardingCompletedItems)
        if (!onboardingSeenAt) {
          setPanelOpen(true)
          api.markOnboardingSeen().catch(() => {})
        }
      })
      .catch(() => {})
  }, [token])

  // Un tunnel en cours (piloté par la page ou tour manuel) n'a de sens que sur la page où il a
  // démarré — navigation ailleurs (Sidebar, retour arrière, autre ligne de checklist) l'annule
  // proprement. Comparaison de valeurs plutôt qu'un effet de nettoyage au démontage d'un
  // composant de page : robuste au double-appel des effets de React.StrictMode en développement
  // (un `useEffect` de nettoyage dans BacklogPage.tsx causait ce bug exact la 1re fois, voir
  // docs/corrections.md).
  useEffect(() => {
    if (activeGuideId && location.pathname !== '/backlog') {
      setActiveGuideId(null)
      setSpotlight(null)
    }
    if (tour && location.pathname !== tour.route) {
      setTour(null)
      setSpotlight(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const openPanel = useCallback(() => setPanelOpen(true), [])
  const closePanel = useCallback(() => setPanelOpen(false), [])

  const hideSpotlight = useCallback(() => setSpotlight(null), [])

  const stopGuide = useCallback(() => {
    setActiveGuideId(null)
    setTour(null)
    setSpotlight(null)
  }, [])

  const completeItem = useCallback((itemId: string) => {
    setCompletedItems(items => (items.includes(itemId) ? items : [...items, itemId]))
    api.completeOnboardingItem(itemId).catch(() => {})
  }, [])

  const resetProgress = useCallback(() => {
    setCompletedItems([])
    stopGuide()
    api.resetOnboarding().catch(() => {})
  }, [stopGuide])

  const showSpotlight = useCallback((selector: string, text: string) => {
    setSpotlight({ selector, text })
  }, [])

  const showTour = useCallback((steps: OnboardingStep[], opts?: { route?: string; onFinish?: () => void }) => {
    if (steps.length === 0) return
    const route = opts?.route ?? location.pathname
    setTour({ steps, index: 0, route, onFinish: opts?.onFinish })
    setSpotlight({ selector: resolveSelector(steps[0], route), text: steps[0].text, tour: { index: 0, count: steps.length } })
  }, [location.pathname])

  const nextTourStep = useCallback(() => {
    setTour(t => {
      if (!t) return t
      const nextIndex = t.index + 1
      if (nextIndex >= t.steps.length) {
        t.onFinish?.()
        setSpotlight(null)
        return null
      }
      setSpotlight({ selector: resolveSelector(t.steps[nextIndex], t.route), text: t.steps[nextIndex].text, tour: { index: nextIndex, count: t.steps.length } })
      return { ...t, index: nextIndex }
    })
  }, [])

  const prevTourStep = useCallback(() => {
    setTour(t => {
      if (!t || t.index === 0) return t
      const prevIndex = t.index - 1
      setSpotlight({ selector: resolveSelector(t.steps[prevIndex], t.route), text: t.steps[prevIndex].text, tour: { index: prevIndex, count: t.steps.length } })
      return { ...t, index: prevIndex }
    })
  }, [])

  // Ligne cliquée depuis le panneau : navigue vers sa page (si besoin), puis lance soit le tunnel
  // piloté par la page (démo interactive "Créer votre première US", suite ensuite dans
  // BacklogPage.tsx), soit un tour manuel (Suivant/Précédent) à partir de `item.steps`. Le
  // panneau reste ouvert (retour Julien) — seule une fermeture explicite (croix/Echap) le ferme.
  const activateItem = useCallback((item: OnboardingChecklistItem) => {
    if (location.pathname !== item.route) navigate(item.route)
    if (item.id === CREATE_ITEM_CHECKLIST_ID) {
      setTour(null)
      setSpotlight(null)
      setActiveGuideId(item.id)
      return
    }
    setActiveGuideId(null)
    showTour(item.steps, { route: item.route, onFinish: () => completeItem(item.id) })
  }, [location.pathname, navigate, showTour, completeItem])

  const progress = { done: checklist.filter(i => completedItems.includes(i.id)).length, total: checklist.length }

  return (
    <OnboardingContext.Provider value={{
      checklist, completedItems, progress,
      panelOpen, openPanel, closePanel,
      completeItem, activateItem, resetProgress,
      spotlight, showSpotlight, hideSpotlight,
      showTour, nextTourStep, prevTourStep,
      activeGuideId, stopGuide,
    }}>
      {children}
    </OnboardingContext.Provider>
  )
}
