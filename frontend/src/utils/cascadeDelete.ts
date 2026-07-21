/**
 * Nettoyage en cascade centralisé pour les 3 suppressions d'entité qui laissaient
 * jusqu'ici une référence morte ailleurs dans l'état (Chantier C, docs/interactions.md
 * section 4.C) :
 *   - supprimer un Epic laissait les enfants avec un `epicId` mort
 *   - supprimer un Client laissait les items avec un `clientId` mort, et le client
 *     restait listé dans `clientGroups[].clientIds`
 *   - supprimer un membre d'équipe laissait son id dans `item.assignees`, ses
 *     absences orphelines dans `state.absences`, et son id dans
 *     `RetroAction.ownerId`
 *
 * Principe retenu (confirmé avec l'utilisateur) : détacher la référence morte
 * (mettre à `null`/`''` selon le champ) plutôt que supprimer les entités qui la
 * portent — un item ne doit jamais disparaître silencieusement parce qu'une entité
 * qu'il référence a été supprimée ailleurs.
 */
import type { Item, ClientGroup, Absence, RetroSession } from '../types'

/** Items ayant un `epicId` pointant vers l'epic sur le point d'être supprimé. */
export function findEpicChildren(items: Item[], epicId: string): Item[] {
  return items.filter(i => i.epicId === epicId)
}

/**
 * Items référençant l'item sur le point d'être supprimé dans leur tableau `deps`
 * (même schéma que l'epicId : la suppression d'un item quelconque, pas seulement
 * un Epic, laissait un id mort dans les `deps` des autres items).
 */
export function findDependents(items: Item[], itemId: string): Item[] {
  return items.filter(i => i.deps?.includes(itemId))
}

/** Retire l'id d'un item supprimé de tous les tableaux `deps` qui le référençaient. */
export function detachDependents(items: Item[], itemId: string): Item[] {
  return items.map(i => i.deps?.includes(itemId) ? { ...i, deps: i.deps.filter(d => d !== itemId) } : i)
}

/** Détache tous les enfants d'un Epic supprimé : `epicId` remis à `null`, items conservés. */
export function detachEpicChildren(items: Item[], epicId: string): Item[] {
  return items.map(i => i.epicId === epicId ? { ...i, epicId: null } : i)
}

/** Items référençant le client sur le point d'être supprimé. */
export function findClientItems(items: Item[], clientId: string): Item[] {
  return items.filter(i => i.clientId === clientId)
}

/** Détache toutes les références à un client supprimé : `clientId` remis à `''` (= "sans client"). */
export function detachClientReferences(items: Item[], clientId: string): Item[] {
  return items.map(i => i.clientId === clientId ? { ...i, clientId: '' } : i)
}

/** Retire le client de tous les groupes de clients qui le listaient. */
export function removeClientFromGroups(groups: ClientGroup[], clientId: string): ClientGroup[] {
  return groups.map(g => ({ ...g, clientIds: g.clientIds.filter(id => id !== clientId) }))
}

/** Items assignés au membre sur le point d'être supprimé (dev attitré ou co-assigné). */
export function findMemberAssignedItems(items: Item[], memberId: string): Item[] {
  return items.filter(i => i.assignees.includes(memberId))
}

/**
 * Détache toutes les références à un membre d'équipe supprimé :
 * - retiré de `item.assignees` partout où il apparaissait (sans supprimer l'item)
 * - ses absences sont supprimées (une absence sans membre n'a pas de sens, contrairement
 *   à un item détaché qui reste valide)
 * - `RetroAction.ownerId` remis à `''` dans les sessions de rétro courantes (les archives,
 *   figées, ne sont pas modifiées — même logique que pour les autres archives de l'app)
 */
export function detachMemberReferences(
  memberId: string,
  items: Item[],
  absences: Absence[],
  retroSessions: RetroSession[]
): { items: Item[]; absences: Absence[]; retroSessions: RetroSession[] } {
  return {
    items: items.map(i =>
      i.assignees.includes(memberId) ? { ...i, assignees: i.assignees.filter(a => a !== memberId) } : i
    ),
    absences: absences.filter(a => a.memberId !== memberId),
    retroSessions: retroSessions.map(s => ({
      ...s,
      actions: s.actions.map(a => a.ownerId === memberId ? { ...a, ownerId: '' } : a),
    })),
  }
}
