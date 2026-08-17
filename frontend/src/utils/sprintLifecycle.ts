// Helper partagé pour l'activation/clôture/réouverture d'un sprint.
// Extrait de RoadmapPage.tsx et PlanningPage.tsx (Chantier B, tranche Roadmap/Release Planning) :
// les deux pages dupliquaient exactement la même logique de mutation ; on la centralise ici
// et on y ajoute la construction de l'entrée d'Historique correspondante, pour ne pas
// recoder ce couple mutation+traçabilité une 3e fois si une future page en a besoin.

import type { CadenceState, Item, Sprint, HistoryEntry, HistoryEventType, RoadmapGoal, RetroSession, SprintReviewSession, HierarchyNode } from '../types'
import { getCurrentSprint } from './sprints'

export type SprintLifecycleAction = 'activate' | 'close' | 'reopen' | 'delete'

/** Active `sprintId` (et désactive tous les autres) ; le rouvre au passage s'il était clos. */
export function activateSprint(sprints: Sprint[], sprintId: string): Sprint[] {
  return sprints.map(s => ({
    ...s,
    active: s.id === sprintId,
    closed: s.id === sprintId ? false : s.closed,
  }))
}

/** Clôture `sprintId` (et le désactive si besoin). Les autres sprints sont inchangés. */
export function closeSprint(sprints: Sprint[], sprintId: string): Sprint[] {
  return sprints.map(s => (s.id === sprintId ? { ...s, closed: true, active: false } : s))
}

/** Rouvre `sprintId` (ne touche pas à `active`). Les autres sprints sont inchangés. */
export function reopenSprint(sprints: Sprint[], sprintId: string): Sprint[] {
  return sprints.map(s => (s.id === sprintId ? { ...s, closed: false } : s))
}

/**
 * Chantier G (2026-07-23) — filet de sécurité à la clôture d'un sprint : items non terminés
 * (pas dans une colonne `isDone`, pas déjà "Annulé") qui n'ont **aucune** décision Sprint Review
 * appliquée (`SRUnfinishedRecord.applied`). Dans le fonctionnement normal, la Sprint Review a
 * lieu avant la clôture — chaque item non terminé y reçoit une décision (Reporter/Annuler/
 * Redimensionner) qui, une fois appliquée, agit déjà sur l'item réel (voir SprintReviewPage.tsx).
 * Ce helper ne sert donc que de garde-fou pour le cas où le sprint est clôturé sans être passé
 * par la Sprint Review, ou où un item y a été oublié — pas un chemin de traitement parallèle qui
 * dupliquerait ou écraserait une décision déjà prise.
 */
export function getUnresolvedUnfinishedItems(state: CadenceState, sprintId: string): Item[] {
  const doneCols = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
  const candidates = state.items.filter(
    i => i.sprintId === sprintId && !doneCols.includes(i.status) && i.status !== 'cancelled'
  )
  const session = (state.sprintReviewSessions ?? []).find(s => s.sprintId === sprintId)
  const resolvedIds = new Set(
    (session?.unfinishedRecords ?? []).filter(r => r.applied).map(r => r.itemId)
  )
  return candidates.filter(i => !resolvedIds.has(i.id))
}

const ACTION_TYPE: Record<SprintLifecycleAction, HistoryEventType> = {
  activate: 'sprint_activate',
  close: 'sprint_close',
  reopen: 'sprint_reopen',
  delete: 'sprint_delete',
}
const ACTION_LABEL: Record<SprintLifecycleAction, string> = {
  activate: 'activé',
  close: 'clôturé',
  reopen: 'réouvert',
  delete: 'supprimé',
}

/**
 * Suppression d'un sprint (Roadmap / Release Planning, 2026-07-27) — décisions de conception :
 * - Éligibilité : le sprint ne doit être ni le sprint courant (voir `getCurrentSprint`), ni
 *   clôturé. `getSprintDeletionBlockReason` centralise ce garde-fou (même convention que le filet
 *   de sécurité de `getUnresolvedUnfinishedItems` à la clôture) — ces deux conditions bloquent,
 *   car un sprint actif ou clôturé porte probablement de l'historique réel à préserver.
 * - Un sprint qui contient encore des items **n'est pas bloqué** : ils sont détachés vers le
 *   Backlog (`status: 'backlog', sprintId: null`) au moment de la suppression — convention déjà
 *   en place dans `KanbanPage.tsx` (`handleDrop`/`handleRemoveFromSprint`). La page appelante
 *   affiche le nombre d'items concernés dans le `confirm()` avant de procéder, pour que ce
 *   déplacement automatique reste visible plutôt que silencieux.
 * - L'objectif de sprint (`RoadmapGoal`) et les sessions "vivantes" (Rétrospective, Sprint Review)
 *   liées à ce sprint sont supprimés avec lui. Les archives (`retroArchives`, `sprintReviewArchives`,
 *   `dailyArchives`) sont figées et historiques : elles ne sont jamais touchées par cette cascade.
 */
export interface SprintDeletionResult {
  sprints: Sprint[]
  items: Item[]
  hierarchyNodes: HierarchyNode[]
  roadmap: RoadmapGoal[]
  retroSessions: RetroSession[]
  sprintReviewSessions: SprintReviewSession[]
  detachedItemIds: string[]
  deletedGoalId: string | null
  deletedRetroSessionIds: string[]
  deletedSrSessionIds: string[]
}

/** Renvoie un message explicatif si `sprintId` n'est pas supprimable en l'état, sinon `null`. */
export function getSprintDeletionBlockReason(state: CadenceState, sprintId: string): string | null {
  const sprint = state.sprints.find(s => s.id === sprintId)
  if (!sprint) return null
  if (getCurrentSprint(state)?.id === sprintId) {
    return "Impossible de supprimer le sprint courant. Activez un autre sprint ou clôturez celui-ci d'abord."
  }
  if (sprint.closed) {
    return 'Impossible de supprimer un sprint clôturé (son historique est conservé).'
  }
  return null
}

/** Calcule la cascade de suppression d'un sprint — ne dispatch rien, renvoie l'état résultant à appliquer. */
export function deleteSprintCascade(state: CadenceState, sprintId: string): SprintDeletionResult {
  const detached = state.items.filter(i => i.sprintId === sprintId)
  const items = state.items.map(i =>
    i.sprintId === sprintId ? { ...i, status: 'backlog', sprintId: null } : i
  )
  // Un Epic assigné directement à ce sprint (même sans item, placeholder) perd sa référence
  // en même temps que le sprint disparaît : contrairement à `detachOrphanedEpics()` (qui garde
  // un Epic vide en place tant que son sprint existe), ici le sprint lui-même n'existera plus,
  // donc tout Epic pointant vers lui doit être décroché, item ou pas.
  const hierarchyNodes = state.hierarchyNodes.map(n =>
    n.level === 'epic' && n.sprintId === sprintId ? { ...n, sprintId: null } : n
  )
  const sprints = state.sprints.filter(s => s.id !== sprintId)
  const goal = (state.roadmap || []).find(g => g.sprintId === sprintId)
  const roadmap = (state.roadmap || []).filter(g => g.sprintId !== sprintId)
  const removedRetro = state.retroSessions.filter(s => s.sprintId === sprintId)
  const retroSessions = state.retroSessions.filter(s => s.sprintId !== sprintId)
  const removedSr = (state.sprintReviewSessions ?? []).filter(s => s.sprintId === sprintId)
  const sprintReviewSessions = (state.sprintReviewSessions ?? []).filter(s => s.sprintId !== sprintId)
  return {
    sprints, items, hierarchyNodes, roadmap, retroSessions, sprintReviewSessions,
    detachedItemIds: detached.map(i => i.id),
    deletedGoalId: goal?.id ?? null,
    deletedRetroSessionIds: removedRetro.map(s => s.id),
    deletedSrSessionIds: removedSr.map(s => s.id),
  }
}

// Phase 5 (roadmap v1), Intégration Slack, 2026-08-08 : payloads des notifications additives
// envoyées depuis RoadmapPage.tsx/PlanningPage.tsx juste après closeSprint()/activateSprint()
// (voir services/api.ts, notifySlackSprintClose/notifySlackDependencyBlock). Fonctions pures,
// ne dispatchent rien : à l'appelant d'envoyer le résultat, en fire-and-forget silencieux.

export interface SprintCloseNotificationPayload {
  sprintNumber: number; sprintLabel: string
  spDone: number; spTotal: number; itemsDone: number; itemsTotal: number
}

/** SP/items terminés vs total, pour les items de ce sprint (même convention `isDone` que
 *  `getUnresolvedUnfinishedItems` ci-dessus). */
export function buildSprintCloseNotification(state: CadenceState, sprint: Sprint): SprintCloseNotificationPayload {
  const doneCols = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
  const items = state.items.filter(i => i.sprintId === sprint.id)
  const doneItems = items.filter(i => doneCols.includes(i.status))
  return {
    sprintNumber: sprint.number,
    sprintLabel: sprint.label || '',
    itemsDone: doneItems.length,
    itemsTotal: items.length,
    spDone: doneItems.reduce((sum, i) => sum + (i.sp || 0), 0),
    spTotal: items.reduce((sum, i) => sum + (i.sp || 0), 0),
  }
}

export interface DependencyBlockNotificationPayload {
  sprintLabel: string
  items: { key: string; desc: string; blockedByKeys: string[] }[]
}

/** Items de ce sprint dont au moins une dépendance (`Item.deps`, ids d'items) n'est pas encore
 *  terminée - `null` si aucun (pas la peine d'appeler l'API pour ne rien envoyer). Vérifié à
 *  l'activation seulement (voir AskUserQuestion, périmètre acté avec Julien), pas à chaque
 *  assignation à un sprint pendant la planification, plus bruyant et moins ciblé. */
export function buildDependencyBlockNotification(state: CadenceState, sprint: Sprint): DependencyBlockNotificationPayload | null {
  const doneCols = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
  const itemById = new Map(state.items.map(i => [i.id, i]))
  const items = state.items.filter(i => i.sprintId === sprint.id)

  const blocked = items
    .map(item => {
      const unresolvedDeps = (item.deps ?? [])
        .map(depId => itemById.get(depId))
        .filter((dep): dep is Item => !!dep && !doneCols.includes(dep.status))
      return unresolvedDeps.length > 0 ? { key: item.key, desc: item.desc, blockedByKeys: unresolvedDeps.map(d => d.key) } : null
    })
    .filter((x): x is { key: string; desc: string; blockedByKeys: string[] } => x !== null)

  if (blocked.length === 0) return null
  return { sprintLabel: sprint.label || `Sprint ${sprint.number}`, items: blocked }
}

/** Construit l'entrée d'Historique correspondant à une transition de cycle de vie de sprint. */
export function sprintLifecycleHistoryEntry(
  action: SprintLifecycleAction,
  sprint: Sprint,
  author?: string,
): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    type: ACTION_TYPE[action],
    timestamp: new Date().toISOString(),
    sprintId: sprint.id,
    detail: `Sprint ${sprint.label || `#${sprint.number}`} ${ACTION_LABEL[action]}`,
    author,
  }
}
