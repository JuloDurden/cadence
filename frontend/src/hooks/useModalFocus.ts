import { useEffect, useRef } from 'react'

// Sélecteur volontairement simple (mêmes éléments que la doc WAI-ARIA "focusable" usuelle) -
// suffisant pour les modales de ce projet (formulaires, boutons, liens), pas une librairie de
// gestion de focus complète.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    // `offsetParent === null` exclut les éléments cachés (display:none, onglet non actif...) -
    // suffisant ici, aucune modale du projet ne positionne un champ en `position: fixed`.
    .filter(el => el.offsetParent !== null)
}

/**
 * Focus initial + piège Tab (focus trap) + restauration du focus à la fermeture, pour une modale
 * (Phase 7, accessibilité, 2026-08-23 - suite de `useEscapeToClose.ts` : Échap fermait déjà les
 * modales, mais rien ne gérait le focus lui-même - Tab pouvait sortir de la modale vers la page en
 * dessous, et fermer une modale ne rendait jamais le focus à l'élément qui l'avait ouverte).
 *
 * Usage : `const modalRef = useModalFocus(active)`, puis `ref={modalRef} tabIndex={-1}` sur le
 * conteneur `.modal`/`.modal-side`/`.modal-fullpage` (le même élément qui porte déjà
 * `role="dialog"`/`aria-modal="true"`, voir `docs/corrections.md`).
 *
 * - Focus initial : ne s'impose PAS si un enfant a déjà le focus au moment où l'effet tourne -
 *   respecte un `autoFocus` déjà posé délibérément sur un champ précis (ex. le titre d'un nouveau
 *   Post-it NNL, le mot-clé de `ResetAllDataModal.tsx`) plutôt que de le lui voler pour le premier
 *   élément focusable du DOM (souvent le bouton de fermeture, en haut du modal).
 * - Piège Tab : Tab sur le DERNIER élément focusable revient au premier, Shift+Tab sur le PREMIER
 *   va au dernier - seulement quand le focus est déjà dans le conteneur (n'interfère pas avec Tab
 *   ailleurs sur la page). Lit `containerRef.current` à chaque frappe plutôt qu'une variable
 *   capturée une fois : nécessaire pour `ItemModal.tsx`/`NNLItemModal.tsx`, dont le conteneur réel
 *   change de nœud DOM si l'utilisateur bascule entre les 3 modes d'affichage (modal/volet
 *   latéral/pleine page) en cours de session, sans que le composant ne démonte.
 * - Restauration : à la fermeture (démontage OU `active` qui repasse à `false` pour les modales
 *   qui restent montées et se contentent de retourner `null`), le focus revient sur l'élément
 *   actif juste avant l'ouverture (typiquement le bouton qui a ouvert la modale).
 */
export function useModalFocus<T extends HTMLElement = HTMLDivElement>(active: boolean = true) {
  const containerRef = useRef<T>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const initial = containerRef.current
    if (initial && !initial.contains(document.activeElement)) {
      const focusables = getFocusable(initial)
      ;(focusables[0] ?? initial).focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const container = containerRef.current
      if (!container || !container.contains(document.activeElement)) return
      const focusables = getFocusable(container)
      if (focusables.length === 0) { e.preventDefault(); return }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocusedRef.current?.focus?.()
    }
  }, [active])

  return containerRef
}
