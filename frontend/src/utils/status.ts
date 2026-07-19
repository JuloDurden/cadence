import type { Item, KanbanCol } from '../types'

/**
 * Ids des colonnes Kanban marquées "Terminé" dans le catalogue courant (state.kanbanCols).
 * Le catalogue est configurable (Réglages / Kanban) : ne jamais coder en dur une liste
 * de statuts ('done', 'delivered'...) ailleurs dans l'app, toujours passer par ce calcul.
 */
export function doneColIds(kanbanCols: KanbanCol[]): string[] {
  return kanbanCols.filter(c => c.isDone).map(c => c.id)
}

/** Un item est "terminé" si son statut correspond à une colonne isDone du catalogue courant. */
export function isItemDone(item: Item, kanbanCols: KanbanCol[]): boolean {
  return kanbanCols.some(c => c.isDone && c.id === item.status)
}
