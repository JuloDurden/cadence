import type { HierarchyNode, Item } from '../types'

/**
 * SP affiché pour un nœud de regroupement (Epic ou Initiative) — généralisation
 * (2026-07-28, Phase 1) de l'ancien `getEpicSP()` (utils/epicScore.ts, supprimé), qui ne
 * savait calculer que pour un Epic dont les enfants étaient des `Item`. Même règle,
 * applicable récursivement à un niveau de plus : soit un score attribué arbitrairement
 * au nœud lui-même (champ `sp` propre), soit la somme des SP de ses enfants — jamais les
 * deux additionnés. Un score arbitraire (`sp > 0`) prime sur la somme quand il est
 * renseigné ; sinon, la somme des enfants sert de valeur.
 *
 * Pour un Epic, les enfants sont des `Item` (stories/bugs/tasks/spikes) ; pour une
 * Initiative, les enfants sont des `HierarchyNode` de niveau 'epic' — leur SP doit alors
 * déjà avoir été calculé récursivement via cette même fonction avant d'être sommé ici.
 *
 * Utilisé par PlanningEpicGroup.tsx (Release Planning, Swimlanes) et RoadmapPage.tsx.
 */
export function getHierarchyNodeSP(node: HierarchyNode | undefined, childrenSP: number[]): number {
  const sumChildren = childrenSP.reduce((acc, sp) => acc + sp, 0)
  const hasArbitraryScore = !!node && (node.sp ?? 0) > 0
  return hasArbitraryScore ? node!.sp! : sumChildren
}

/** Raccourci pour le cas le plus courant : un Epic dont les enfants sont des `Item`. */
export function getEpicSP(epic: HierarchyNode | undefined, stories: Item[]): number {
  return getHierarchyNodeSP(epic, stories.map(s => s.sp))
}
