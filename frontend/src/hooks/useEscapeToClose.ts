import { useEffect, useRef } from 'react'

/**
 * Ferme une modale/panneau au clavier avec Échap (Phase 7, accessibilité, 2026-08-24) - audit du
 * 2026-08-24 : sur 16 `.modal-overlay` du projet, un seul (le dialogue générique de confirmation,
 * `DialogContext.tsx`) fermait déjà au clavier - toutes les autres modales (édition d'item, de
 * client, de node hiérarchique, publication de changelog, recadrage d'image...) n'étaient
 * fermables qu'en cliquant le fond ou le bouton de fermeture, aucune sortie clavier. Ce hook
 * centralise le correctif plutôt que de dupliquer le même `useEffect` dans chacune - suit la même
 * convention que `useGlobalUndoRedoShortcut.ts` (callback lu via une ref, jamais dans les deps de
 * l'effet, pour ne pas ré-attacher l'écouteur à chaque rendu).
 *
 * `active` (défaut `true`) permet de désactiver l'écoute sans démonter le hook - utile pour une
 * modale qui n'est parfois qu'une des variantes d'un même composant (ex. affichée seulement si
 * une condition est vraie), en gardant l'appel du hook inconditionnel (règle des Hooks React).
 *
 * Ne consomme PAS l'événement (pas de `stopPropagation`) : un champ interne à la modale qui gère
 * déjà sa propre touche Échap (ex. fermer une liste de suggestions de tags) doit appeler lui-même
 * `e.stopPropagation()` s'il ne veut pas que la modale entière se ferme dans la foulée - voir
 * `ItemModal.tsx`/`TeamPage.tsx` (suggestions de tags), déjà corrigés en ce sens.
 */
export function useEscapeToClose(onClose: () => void, active: boolean = true) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])
}
