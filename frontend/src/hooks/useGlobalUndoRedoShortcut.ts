import { useEffect, useRef } from 'react'

interface Options {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

/**
 * Raccourcis clavier Ctrl+Z / Ctrl+Y (et Ctrl+Shift+Z) pour le undo/redo global
 * (state.past/state.future dans StateContext.tsx, boutons du Header).
 *
 * Volontairement inactif quand le canevas NNL (Vision > NNL) est monté à l'écran :
 * NNL garde son propre stack isolé et ses propres raccourcis (voir NNLCanvas.tsx),
 * pour pouvoir annuler un tracé de stylo à la volée sans dépiler l'historique global
 * (post-its/sprints/items...). Décision explicite de l'utilisateur (2026-07-28) :
 * pas d'unification des deux stacks — voir docs/roadmap-v1.md (Phase 0).
 */
export function useGlobalUndoRedoShortcut({ undo, redo, canUndo, canRedo }: Options) {
  const undoRef = useRef(undo)
  const redoRef = useRef(redo)
  const canUndoRef = useRef(canUndo)
  const canRedoRef = useRef(canRedo)
  undoRef.current = undo
  redoRef.current = redo
  canUndoRef.current = canUndo
  canRedoRef.current = canRedo

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      // NNL monté à l'écran : il gère déjà Ctrl+Z/Y sur son propre stack, ne pas doubler.
      if (document.querySelector('[data-testid="nnl-canvas"]')) return
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndoRef.current) undoRef.current()
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        if (canRedoRef.current) redoRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
