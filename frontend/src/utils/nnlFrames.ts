import type { NNLFrame, NNLItem } from '../types'

/**
 * Cadres de regroupement Epic/Initiative sur le canevas NNL (Phase 1, sous-chantier 6,
 * 2026-07-29) — logique de containment géométrique partagée entre le rendu (NNLCanvas.tsx)
 * et les futures synchronisations Backlog ↔ NNL (points 4/5 du sous-chantier). Voir la JSDoc
 * de `NNLFrame` (types/index.ts) pour la décision de ne stocker l'appartenance nulle part.
 */

/** Rectangle englobant d'un cadre — `x`/`y` et `x2`/`y2` ne sont pas garantis "haut-gauche"/
 *  "bas-droite" (un redimensionnement peut inverser les coins), on recalcule donc toujours les
 *  bornes réelles via `Math.min`/`Math.max`, comme le fait déjà le rendu des `NNLShape` rect. */
export function frameBounds(frame: NNLFrame): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(frame.x, frame.x2),
    maxX: Math.max(frame.x, frame.x2),
    minY: Math.min(frame.y, frame.y2),
    maxY: Math.max(frame.y, frame.y2),
  }
}

function frameArea(frame: NNLFrame): number {
  const b = frameBounds(frame)
  return (b.maxX - b.minX) * (b.maxY - b.minY)
}

/** Un post-it appartient à un cadre si son centre (`item.x`/`item.y`, voir NNLItem) est à
 *  l'intérieur des limites du cadre — bornes incluses. */
export function isItemInFrame(item: Pick<NNLItem, 'x' | 'y'>, frame: NNLFrame): boolean {
  const b = frameBounds(frame)
  return item.x >= b.minX && item.x <= b.maxX && item.y >= b.minY && item.y <= b.maxY
}

/** Tous les cadres contenant un post-it donné, du plus petit (le plus spécifique) au plus
 *  grand — un post-it dans un cadre Epic imbriqué dans un cadre Initiative est contenu par les
 *  deux géométriquement, mais le cadre Epic est le rattachement le plus pertinent. */
export function framesContainingItem(item: Pick<NNLItem, 'x' | 'y'>, frames: NNLFrame[]): NNLFrame[] {
  return frames.filter(f => isItemInFrame(item, f)).sort((a, b) => frameArea(a) - frameArea(b))
}

/** Cadre le plus spécifique (le plus petit) contenant un post-it, ou `undefined` s'il n'est
 *  dans aucun cadre. Pour un post-it dans un Epic imbriqué dans une Initiative, retourne le
 *  cadre Epic — c'est le rattachement à synchroniser côté Backlog (points 4/5). */
export function mostSpecificFrameForItem(item: Pick<NNLItem, 'x' | 'y'>, frames: NNLFrame[]): NNLFrame | undefined {
  return framesContainingItem(item, frames)[0]
}
