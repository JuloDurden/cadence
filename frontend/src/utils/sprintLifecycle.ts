// Helper partagé pour l'activation/clôture/réouverture d'un sprint.
// Extrait de RoadmapPage.tsx et PlanningPage.tsx (Chantier B, tranche Roadmap/Release Planning) :
// les deux pages dupliquaient exactement la même logique de mutation ; on la centralise ici
// et on y ajoute la construction de l'entrée d'Historique correspondante, pour ne pas
// recoder ce couple mutation+traçabilité une 3e fois si une future page en a besoin.

import type { CadenceState, Item, Sprint, HistoryEntry, HistoryEventType } from '../types'

export type SprintLifecycleAction = 'activate' | 'close' | 'reopen'

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
}
const ACTION_LABEL: Record<SprintLifecycleAction, string> = {
  activate: 'activé',
  close: 'clôturé',
  reopen: 'réouvert',
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
