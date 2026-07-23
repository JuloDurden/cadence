import type { CadenceState, Sprint, Deadline } from '../types'

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

// ── Chantier G (2026-07-23) : report d'un item non terminé depuis la Sprint Review ──────────

/** Sprints "prévus" candidats à un report : non clôturés, hors le sprint en cours de revue,
 *  triés par numéro (`state.sprints` est déjà garanti trié, Chantier K, mais on ne présuppose
 *  pas l'ordre d'entrée d'un tableau filtré passé par un appelant). */
export function reportableSprintsExcluding(sprints: Sprint[], excludeSprintId: string): Sprint[] {
  return [...sprints]
    .filter(s => !s.closed && s.id !== excludeSprintId)
    .sort((a, b) => a.number - b.number)
}

/** Prochain sprint non clôturé (par numéro), à pré-sélectionner par défaut pour un report. */
export function nextReportableSprint(sprints: Sprint[], excludeSprintId: string): Sprint | undefined {
  return reportableSprintsExcluding(sprints, excludeSprintId)[0]
}

/** Dernier sprint non clôturé dont la date de fin reste avant une échéance donnée — le plus tard
 *  possible sans la dépasser. `undefined` si aucune échéance réelle (`deadline.type === 'none'`
 *  ou absente) ou si aucun sprint ne se termine avant elle. */
export function lastSprintBeforeDeadline(
  sprints: Sprint[], excludeSprintId: string, deadline?: Deadline,
): Sprint | undefined {
  if (!deadline || deadline.type === 'none' || !deadline.date) return undefined
  const candidates = reportableSprintsExcluding(sprints, excludeSprintId)
    .filter(s => s.endDate <= deadline.date)
  return candidates[candidates.length - 1]
}
