// Helper partagé pour éviter un bug de persistance systémique découvert en testant le
// Chantier B (tranche Retrospective, 2026-07-21) : `saveToServer({ ...state, ... })` appelé
// juste après un `dispatch({ type: 'ADD_HISTORY', ... })` utilise `state` capturé AVANT ce
// dispatch — son `history` ne contient donc pas encore la nouvelle entrée. L'entrée reste
// visible localement (le dispatch a bien mis à jour le reducer), mais n'est envoyée au
// serveur que si une action ultérieure déclenche un nouveau saveToServer avec un état à
// jour. Si l'utilisateur recharge avant cela, l'entrée disparaît (perdue côté serveur).
//
// Ce helper reconstruit le champ `history` du payload exactement comme le fait le reducer
// (`ADD_HISTORY` dans StateContext.tsx : `[action.payload, ...(state.history || [])].slice(0, 200)`),
// pour que le payload envoyé à `saveToServer` inclue toujours la nouvelle entrée, quel que
// soit l'état (potentiellement périmé) du reste de l'objet passé en premier argument.

import type { CadenceState, HistoryEntry } from '../types'

export function withHistoryEntry(payload: CadenceState, entry: HistoryEntry): CadenceState {
  return { ...payload, history: [entry, ...(payload.history || [])].slice(0, 200) }
}
