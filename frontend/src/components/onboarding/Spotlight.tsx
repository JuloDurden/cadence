import { useEffect, useState } from 'react'
import { useOnboarding } from '../../context/OnboardingContext'

// Phase 2.5 (roadmap v1), Onboarding, point 2 (tooltips progressifs) — surligne un élément d'UI
// existant plutôt qu'un overlay sombre plein écran : l'app a déjà beaucoup de modales avec leur
// propre z-index (ItemModal, etc.), un fond assombri global serait entré en conflit avec elles,
// en particulier pendant le tunnel guidé "Créer votre première US" où certaines cibles
// (item-desc-input, onglets...) sont À L'INTÉRIEUR d'une modale. Le cadre de surbrillance a
// `pointer-events: none` pour ne jamais bloquer le clic réel sur l'élément ciblé — seule la bulle
// d'explication est cliquable.
const POLL_MS = 100
const MAX_ATTEMPTS = 40 // ~4s : au-delà, on cesse de chercher mais la bulle reste affichée quand
// même (position de repli) — un rôle qui n'a pas l'élément ciblé (ex. bouton "+ Sprint" absent en
// lecture seule) ne doit jamais bloquer silencieusement tout un tunnel.

export function SpotlightHost() {
  const { spotlight, hideSpotlight, nextTourStep, prevTourStep } = useOnboarding()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [searching, setSearching] = useState(true)

  useEffect(() => {
    if (!spotlight) { setRect(null); return }
    setSearching(true)
    let attempts = 0
    const interval = setInterval(() => {
      const el = document.querySelector(spotlight.selector)
      if (el) {
        setRect(el.getBoundingClientRect())
        setSearching(false)
      } else {
        attempts++
        setRect(null)
        if (attempts >= MAX_ATTEMPTS) { clearInterval(interval); setSearching(false) }
      }
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [spotlight])

  useEffect(() => {
    if (!spotlight) return
    function onEscape(e: KeyboardEvent) { if (e.key === 'Escape') hideSpotlight() }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [spotlight, hideSpotlight])

  if (!spotlight) return null
  // Toujours chercher un peu avant d'afficher la bulle en position de repli, pour éviter un
  // flash "en bas à droite" le temps qu'une navigation/un rendu de page se termine.
  if (searching && !rect) return null

  const pad = 6
  const hasTarget = !!rect
  const boxTop = hasTarget ? rect!.top - pad : 0
  const boxLeft = hasTarget ? rect!.left - pad : 0
  const boxWidth = hasTarget ? rect!.width + pad * 2 : 0
  const boxHeight = hasTarget ? rect!.height + pad * 2 : 0

  // Bulle sous l'élément par défaut, au-dessus si pas assez de place en bas. Certaines cibles
  // (ex. `.kanban-board`, presque toute la hauteur de l'écran) n'ont assez de place ni en dessous
  // ni au-dessus — placer la bulle "au-dessus" la faisait alors déborder hors de l'écran (coupée,
  // retour Julien). Dans ce cas comme dans celui où la cible n'a jamais été trouvée sur la page,
  // repli en bas à gauche de l'écran, quitte à chevaucher un peu le cadre de surbrillance — mieux
  // qu'une bulle partiellement invisible.
  const BUBBLE_MIN_SPACE = 150
  const spaceBelow = window.innerHeight - (boxTop + boxHeight)
  const spaceAbove = boxTop
  const placement: 'below' | 'above' | 'corner' =
    !hasTarget ? 'corner' : spaceBelow >= BUBBLE_MIN_SPACE ? 'below' : spaceAbove >= BUBBLE_MIN_SPACE ? 'above' : 'corner'
  const bubbleAbove = placement === 'above'
  const bubbleTop = placement === 'below' ? boxTop + boxHeight + 10
    : placement === 'above' ? boxTop - 10
    : window.innerHeight - 190
  const bubbleLeft = placement === 'corner' ? 16 : Math.max(12, Math.min(boxLeft, window.innerWidth - 300))

  return (
    <>
      {hasTarget && (
        <div style={{
          position: 'fixed', top: boxTop, left: boxLeft, width: boxWidth, height: boxHeight,
          border: '2px solid var(--primary)', borderRadius: 8,
          boxShadow: '0 0 0 4000px rgba(15, 23, 42, 0.35), 0 0 0 3px rgba(79, 70, 229, .25)',
          pointerEvents: 'none', zIndex: 10000, transition: 'top .15s ease, left .15s ease',
        }} />
      )}
      <div data-testid="onboarding-spotlight" style={{
        position: 'fixed',
        top: bubbleTop,
        left: bubbleLeft,
        transform: bubbleAbove ? 'translateY(-100%)' : undefined,
        width: 280, zIndex: 10003,
        background: 'var(--surface)', color: 'var(--text)',
        border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.22)', padding: '12px 14px',
        fontSize: 13, lineHeight: 1.45,
      }}>
        <button
          onClick={hideSpotlight}
          aria-label="Fermer"
          style={{
            position: 'absolute', top: 6, right: 8, background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
          }}
        >×</button>
        <div style={{ paddingRight: 14 }}>{spotlight.text}</div>
        {spotlight.tour && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{spotlight.tour.index + 1} / {spotlight.tour.count}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {spotlight.tour.index > 0 && (
                <button className="hdr-ctx-btn" onClick={prevTourStep}>Précédent</button>
              )}
              <button className="hdr-btn primary" onClick={nextTourStep}>
                {spotlight.tour.index + 1 >= spotlight.tour.count ? 'Terminer' : 'Suivant'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
