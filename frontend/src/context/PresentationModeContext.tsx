import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

// Phase 3 (roadmap v1), Mode présentation — pour un compte déjà connecté (bouton "Présenter" du
// Header, voir Header.tsx), à distinguer de PresentationPublicPage.tsx (l'équivalent sans compte,
// via le lien de partage public). Sidebar masquée (voir AppShell, App.tsx), navigation ←/→ entre
// les pages ci-dessous, Echap pour quitter — décision actée avec Julien (AskUserQuestion,
// 2026-08-01) : les deux points d'entrée (bouton connecté + lien public) donnent le même mode
// d'affichage, seul le point d'entrée diffère. Backlog ajouté le 2026-08-01 (retour Julien, après
// la 1re livraison qui reprenait la liste d'origine de docs/roadmap-v1.md sans Backlog).
export const PRESENTATION_PAGES = ['/dashboard', '/roadmap', '/vision', '/sprint-review', '/backlog'] as const
export type PresentationPage = typeof PRESENTATION_PAGES[number]

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
}

const PresentationModeContext = createContext<PresentationModeValue | null>(null)

export function PresentationModeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(() => sessionStorage.getItem(ACTIVE_KEY) === '1')
  const navigate = useNavigate()
  const location = useLocation()

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
      const idx = PRESENTATION_PAGES.indexOf(location.pathname as PresentationPage)
      // Page courante hors des pages présentables : ne devrait plus arriver (AppShell redirige
      // désormais vers PRESENTATION_PAGES[0] si le mode est actif sur une autre page, voir
      // App.tsx), gardé par prudence — pas de page de repli à deviner, on ignore la flèche.
      if (idx === -1) return
      const dir = e.key === 'ArrowRight' ? 1 : -1
      const next = (idx + dir + PRESENTATION_PAGES.length) % PRESENTATION_PAGES.length
      navigate(PRESENTATION_PAGES[next])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, location.pathname, navigate, exit])

  return (
    <PresentationModeContext.Provider value={{ active, enter, exit }}>
      {children}
    </PresentationModeContext.Provider>
  )
}

export function usePresentationMode() {
  const ctx = useContext(PresentationModeContext)
  if (!ctx) throw new Error('usePresentationMode must be used inside PresentationModeProvider')
  return ctx
}
