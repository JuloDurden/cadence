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

/**
 * Sélection d'un cadre (point 3.5, 2026-07-29) : seul le CONTOUR est cliquable, jamais
 * l'intérieur — l'intérieur d'un cadre doit rester libre pour interagir normalement avec les
 * post-its/formes qu'il contient et pour démarrer un rubber-band de sélection. `thresh` est une
 * marge en coordonnées monde (mêmes unités que les bornes du cadre).
 */
export function isPointNearFrameBorder(point: { x: number; y: number }, frame: NNLFrame, thresh: number): boolean {
  const b = frameBounds(frame)
  const withinX = point.x >= b.minX - thresh && point.x <= b.maxX + thresh
  const withinY = point.y >= b.minY - thresh && point.y <= b.maxY + thresh
  if (!withinX || !withinY) return false
  const nearLeft   = Math.abs(point.x - b.minX) <= thresh
  const nearRight  = Math.abs(point.x - b.maxX) <= thresh
  const nearTop    = Math.abs(point.y - b.minY) <= thresh
  const nearBottom = Math.abs(point.y - b.maxY) <= thresh
  return nearLeft || nearRight || nearTop || nearBottom
}

/** Cadre dont le contour est le plus proche du point donné (le plus petit en cas d'égalité, pour
 *  qu'un cadre Epic imbriqué reste sélectionnable individuellement plutôt que sa seule
 *  Initiative parente), ou `undefined` si aucun contour n'est assez proche. */
export function frameAtBorder(point: { x: number; y: number }, frames: NNLFrame[], thresh: number): NNLFrame | undefined {
  return frames
    .filter(f => isPointNearFrameBorder(point, f, thresh))
    .sort((a, b) => frameArea(a) - frameArea(b))[0]
}

/**
 * Point de sortie d'un cadre (sous-chantier 6, point 5 bis — désassociation d'Epic, 2026-07-30) :
 * repousse un point contenu dans `frame` juste au-delà du bord le plus proche (marge `margin`,
 * coordonnées monde). Utilisé quand l'`epicId` d'un item lié est vidé (désassociation manuelle ou
 * suppression en cascade de l'Epic) — le post-it ne doit plus rester visuellement à l'intérieur
 * d'un cadre auquel l'item n'est plus rattaché côté Backlog.
 */
export function ejectPointFromFrame(x: number, y: number, frame: NNLFrame, margin = 40): { x: number; y: number } {
  const b = frameBounds(frame)
  const distLeft = x - b.minX
  const distRight = b.maxX - x
  const distTop = y - b.minY
  const distBottom = b.maxY - y
  const minDist = Math.min(distLeft, distRight, distTop, distBottom)
  if (minDist === distLeft) return { x: b.minX - margin, y }
  if (minDist === distRight) return { x: b.maxX + margin, y }
  if (minDist === distTop) return { x, y: b.minY - margin }
  return { x, y: b.maxY + margin }
}
