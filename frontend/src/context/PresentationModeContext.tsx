import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCadence } from './StateContext'
import { resolvePresentationPages } from '../data/presentablePages'
import type { PresentablePageDef } from '../data/presentablePages'

// Phase 3 (roadmap v1), Mode présentation — pour un compte déjà connecté (bouton "Présenter" du
// Header, voir Header.tsx), à distinguer de PresentationPublicPage.tsx (l'équivalent sans compte,
// via le lien de partage public). Sidebar masquée (voir AppShell, App.tsx), navigation ←/→ entre
// les pages ci-dessous, Echap pour quitter — décision actée avec Julien (AskUserQuestion,
// 2026-08-01) : les deux points d'entrée (bouton connecté + lien public) donnent le même mode
// d'affichage, seul le point d'entrée diffère.
//
// Chantier "Config pages présentables" (2026-08-02, retour Julien du 2026-08-01) : la liste des
// pages n'est plus une constante figée (`PRESENTATION_PAGES`) — elle est résolue depuis
// `state.settings.presentationPages` (ids choisis/ordonnés par un Admin/PO en Réglages, voir
// data/presentablePages.ts et PresentationPagesSection.tsx), avec repli sur la sélection/ordre
// d'origine si ce réglage est absent. D'où la dépendance à `useCadence()` ici, absente avant ce
// chantier.
export type { PresentablePageDef } from '../data/presentablePages'

// Retour Julien (2026-08-01, test E2E) : `active` n'était qu'un `useState` en mémoire — une vraie
// navigation par URL (taper une adresse et valider, contrairement à un clic sur un lien SPA) fait
// un rechargement complet de la page, qui réinitialise tout l'état React AVANT que le garde-fou
// d'AppShell (App.tsx) n'ait la moindre chance de s'appliquer : `active` retombait à `false` au
// remontage, laissant passer la page hors périmètre que le garde-fou est censé bloquer. Persisté
// dans `sessionStorage` (pas `localStorage`) : le mode doit survivre à un rechargement dans le même
// onglet, mais pas ressurgir plusieurs jours plus tard à la prochaine ouverture du navigateur.
const ACTIVE_KEY = 'cadence_presentation_active'

interface PresentationModeValue {
  active: boolean
  enter: () => void
  exit: () => void
  /** Pages configurées (Réglages > Mode présentation), résolues et dans l'ordre choisi. */
  pages: PresentablePageDef[]
}

const PresentationModeContext = createContext<PresentationModeValue | null>(null)

export function PresentationModeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(() => sessionStorage.getItem(ACTIVE_KEY) === '1')
  const navigate = useNavigate()
  const location = useLocation()
  const { state } = useCadence()

  const pages = useMemo(
    () => resolvePresentationPages(state.settings?.presentationPages),
    [state.settings?.presentationPages]
  )

  const enter = useCallback(() => {
    sessionStorage.setItem(ACTIVE_KEY, '1')
    setActive(true)
  }, [])
  const exit = useCallback(() => {
    sessionStorage.removeItem(ACTIVE_KEY)
    setActive(false)
  }, [])

  useEffect(() => {
    if (!active) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { exit(); return }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const current = location.pathname + location.search
      const idx = pages.findIndex(p => p.path === current)
      // Page courante hors des pages présentables : ne devrait plus arriver (AppShell redirige
      // désormais vers pages[0] si le mode est actif sur une autre page, voir App.tsx), gardé par
      // prudence — pas de page de repli à deviner, on ignore la flèche.
      if (idx === -1) return
      const dir = e.key === 'ArrowRight' ? 1 : -1
      const next = (idx + dir + pages.length) % pages.length
      navigate(pages[next].path)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, location.pathname, location.search, pages, navigate, exit])

  return (
    <PresentationModeContext.Provider value={{ active, enter, exit, pages }}>
      {children}
    </PresentationModeContext.Provider>
  )
}

export function usePresentationMode() {
  const ctx = useContext(PresentationModeContext)
  if (!ctx) throw new Error('usePresentationMode must be used inside PresentationModeProvider')
  return ctx
}
