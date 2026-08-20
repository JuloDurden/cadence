import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { usePersonalSettings } from '../context/PersonalSettingsContext'

// Amplitude du "sinking" sous le curseur (degres), reprise telle quelle du prototype valide par
// Julien (prototype-cards-hierarchie.html).
const MAX_TILT = 10

/**
 * Cartes hierarchiques Initiative/Epic/Item (2026-08-20) : parallaxe 3D + reflet holographique au
 * survol, portes par le plus grand conteneur `.hc-card` du groupe survole (voir topCard ci-dessous)
 * plutot que par la carte individuellement survolee - retour Julien sur le prototype : "les divers
 * elements bougent d'un seul tenant, comme si c'etait une seule div". Un seul hook, branche sur le
 * conteneur de la liste de cartes (le board Kanban, le tableau Release Planning, la timeline Sprint
 * Planning...) : aucune config cote page au-dela du ref + du marquage `.hc-card` sur chaque niveau
 * (Initiative/Epic/Item). Respecte les 2 reglages perso (Reglages > Apparence, voir
 * AppearanceSection.tsx, PersonalSettingsContext.tsx) : holo desactive => jamais de classe
 * holo-active ; parallaxe desactivee => pas d'inclinaison 3D, mais --mx/--my continuent d'etre
 * poses (necessaires au positionnement du halo/reflet quand seul l'holo est actif).
 */
export function useHierCardTilt(containerRef: RefObject<HTMLElement | null>) {
  const { effective } = usePersonalSettings()
  const currentRef = useRef<HTMLElement | null>(null)
  const holoEnabled = effective.holoEnabled
  const parallaxEnabled = effective.parallaxEnabled

  useEffect(() => {
    const board = containerRef.current
    if (!board) return

    function topCard(el: Element | null): HTMLElement | null {
      const node = (el && (el as HTMLElement).closest?.('.hc-card')) as HTMLElement | null
      if (!node) return null
      let top = node
      let parent = (top.parentElement && top.parentElement.closest('.hc-card')) as HTMLElement | null
      while (parent) {
        top = parent
        parent = (top.parentElement && top.parentElement.closest('.hc-card')) as HTMLElement | null
      }
      return top
    }

    function clearAll() {
      board!.querySelectorAll<HTMLElement>('.hc-card').forEach(el => {
        el.style.transform = ''
        el.style.removeProperty('--rx')
        el.style.removeProperty('--ry')
        el.classList.remove('holo-active', 'ancestor-lit')
      })
      currentRef.current = null
    }

    function onMouseMove(e: MouseEvent) {
      const top = topCard(e.target as Element)
      if (!top) { clearAll(); return }
      if (top !== currentRef.current) {
        clearAll()
        currentRef.current = top
        top.classList.add('ancestor-lit')
      }
      const r = top.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      top.style.setProperty('--mx', (px * 100).toFixed(1) + '%')
      top.style.setProperty('--my', (py * 100).toFixed(1) + '%')

      let rx = 0, ry = 0
      if (parallaxEnabled) {
        rx = (0.5 - py) * MAX_TILT
        ry = (px - 0.5) * MAX_TILT
        top.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.015)`
      } else {
        top.style.transform = ''
      }
      // Utilises par la contre-rotation du texte (voir .hc-text dans hierCards.css) pour annuler
      // visuellement cette meme inclinaison sur le texte uniquement.
      top.style.setProperty('--rx', rx.toFixed(2) + 'deg')
      top.style.setProperty('--ry', ry.toFixed(2) + 'deg')
      // Ombre "objet souleve" : decalee a l'oppose de l'inclinaison, comme une source de lumiere
      // fixe au-dessus du plateau.
      top.style.setProperty('--shx', (-ry * 1.1).toFixed(1) + 'px')
      top.style.setProperty('--shy', (10 + rx * 0.6).toFixed(1) + 'px')
      // Intensite du reflet holographique : suit l'inclinaison, base discrete des le survol.
      const tiltMag = Math.min(1, (Math.abs(rx) + Math.abs(ry)) / (MAX_TILT * 2))
      top.style.setProperty('--tilt', (0.15 + tiltMag * 0.45).toFixed(2))
      top.classList.toggle('holo-active', holoEnabled)
    }

    function onMouseLeave() { clearAll() }

    board.addEventListener('mousemove', onMouseMove)
    board.addEventListener('mouseleave', onMouseLeave)
    return () => {
      board.removeEventListener('mousemove', onMouseMove)
      board.removeEventListener('mouseleave', onMouseLeave)
      clearAll()
    }
  }, [containerRef, holoEnabled, parallaxEnabled])
}
