import type { CadenceState, Sprint } from '../types'

/**
 * Le "sprint courant" unique de l'application — ne jamais recoder cette logique
 * ailleurs, toujours passer par ce helper (Chantier A).
 *
 * Priorité au sprint marqué `active: true` ; à défaut, le premier sprint non
 * clôturé ; à défaut (tous les sprints sont clôturés), le dernier sprint —
 * le plus récent, puisque `state.sprints` est garanti trié par `number`
 * (Chantier K). Retourne `undefined` seulement si `state.sprints` est vide.
 */
export function getCurrentSprint(state: CadenceState): Sprint | undefined {
  return (
    state.sprints.find(s => s.active) ??
    state.sprints.find(s => !s.closed) ??
    state.sprints[state.sprints.length - 1]
  )
}
