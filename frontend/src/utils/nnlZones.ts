import type { NNLZone } from '../types'

/**
 * Rayons par défaut des anneaux Now/Next/Later du canevas NNL. Déplacés depuis
 * `components/nnl/NNLCanvas.tsx` (sous-chantier 6, point 5, 2026-07-30) pour être réutilisables
 * hors du composant canevas — `context/StateContext.tsx` en a besoin pour recalculer la zone
 * d'un post-it déplacé automatiquement (sync Backlog → NNL) même quand `NNLCanvas` n'est pas
 * monté (l'utilisateur peut changer l'Epic d'un item depuis n'importe quelle page).
 *
 * Ce sont les valeurs par défaut seulement : `NNLCanvas.tsx` garde son propre état local
 * `r1`/`r2` (ajustable par l'utilisateur via l'UI, jamais persisté) — la sync réactive utilise
 * volontairement les valeurs par défaut plutôt qu'une valeur "actuelle" introuvable hors canevas,
 * la catégorisation Now/Next/Later restant secondaire par rapport au rattachement Epic lui-même.
 */
export const R1_DEFAULT = 400
export const R2_DEFAULT = 800

/** Calcule la zone Now/Next/Later d'un point (coords monde) selon sa distance à l'origine. */
export function zoneFromWorld(wx: number, wy: number, r1: number, r2: number): NNLZone {
  const d = Math.sqrt(wx * wx + wy * wy)
  return d < r1 ? 'now' : d < r2 ? 'next' : 'later'
}

/**
 * Ramène un point dans l'anneau Now/Next/Later `zone` en le rapprochant/éloignant de l'origine le
 * long de sa direction actuelle, sans changer d'angle (sous-chantier 6, point 5 bis, 2026-07-30) —
 * utilisé quand un post-it est éjecté d'un cadre suite à une désassociation d'Epic : il doit
 * sortir du cadre mais rester dans la zone où il se trouvait avant l'éjection (décision explicite
 * de Julien : ne pas faire "sauter" un post-it Now vers Next/Later juste parce que son cadre était
 * proche d'une frontière de zone). Point à l'origine exacte (d=0, cas limite) : renvoyé tel quel,
 * la direction n'étant pas définie.
 */
export function clampDistanceToZone(x: number, y: number, zone: NNLZone, r1: number, r2: number): { x: number; y: number } {
  const d = Math.sqrt(x * x + y * y)
  if (d === 0) return { x, y }
  const margin = 1
  const targetD = zone === 'now' ? Math.min(d, r1 - margin)
    : zone === 'next' ? Math.min(Math.max(d, r1 + margin), r2 - margin)
    : Math.max(d, r2 + margin)
  const scale = targetD / d
  return { x: x * scale, y: y * scale }
}
