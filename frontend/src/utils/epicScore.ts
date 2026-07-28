import type { Item } from '../types'

/**
 * SP affiché pour un Epic (2026-07-28, corrigé le même jour) : soit un score attribué
 * arbitrairement à l'Epic lui-même (champ `sp` propre, saisi dans Backlog), soit la somme
 * des SP de ses US rattachées — jamais les deux additionnés. Un score arbitraire (sp > 0)
 * prime sur la somme quand il est renseigné ; sinon, la somme des US sert de valeur.
 *
 * Utilisé par PlanningEpicGroup.tsx (Release Planning, Swimlanes) et RoadmapPage.tsx.
 */
export function getEpicSP(epic: Item | undefined, stories: Item[]): number {
  const sumStories = stories.reduce((acc, s) => acc + s.sp, 0)
  const hasArbitraryScore = !!epic && epic.sp > 0
  return hasArbitraryScore ? epic!.sp : sumStories
}
