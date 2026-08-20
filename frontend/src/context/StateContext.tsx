import { createContext, useContext, useReducer, useCallback, useEffect, useState, useRef } from 'react'
import type { ReactNode } from 'react'
import type { CadenceState, Item, Sprint, RoadmapGoal, DisplayDensity } from '../types'
import { DEMO_STATE } from '../data/demo'
import { api, BASE_URL, isStateConflictError } from '../services/api'
import { useToast } from './ToastContext'
import { isItemInFrame, frameBounds, ejectPointFromFrame } from '../utils/nnlFrames'
import { R1_DEFAULT, R2_DEFAULT, zoneFromWorld, clampDistanceToZone } from '../utils/nnlZones'
// Synchronisation temps réel générale (voir SYNCABLE plus bas) : même dérivation que pour le canal
// Daily Standup (hooks/useDailyRealtime.ts), dupliquée volontairement ici plutôt que partagée - les
// deux canaux restent deux connexions WebSocket distinctes (voir le commentaire dans
// backend/src/routes/realtimeWs.ts sur ce choix).
const SYNC_WS_BASE_URL = BASE_URL.replace(/^http/, 'ws')

// Phase 6bis (roadmap v1), sous-chantier 4 (2026-08-13) : 5 crans de densité, valeurs alignées sur
// les paddings d'origine de .backlog-table td/th et .kanban-card/.kanban-cards (index.css) pour le
// cran 'comfortable', qui reste le comportement par défaut inchangé.
export const DENSITY_SCALE: Record<DisplayDensity, { th: string; td: string; cardPad: string; cardsGap: string }> = {
  'compact-2':   { th: '4px 8px',  td: '2px 8px',  cardPad: '6px 8px',   cardsGap: '3px' },
  'compact':     { th: '5px 8px',  td: '3px 8px',  cardPad: '8px 10px',  cardsGap: '4px' },
  'comfortable': { th: '7px 8px',  td: '5px 8px',  cardPad: '10px 12px', cardsGap: '6px' },
  'spacious':    { th: '9px 10px', td: '7px 10px', cardPad: '13px 15px', cardsGap: '9px' },
  'spacious-2':  { th: '11px 12px', td: '9px 12px', cardPad: '16px 18px', cardsGap: '12px' },
}

const UNDOABLE = new Set([
  'ADD_ITEM','UPDATE_ITEM','DELETE_ITEM',
  'ADD_SPRINT','UPDATE_SPRINT','DELETE_SPRINT',
  'ADD_CLIENT','UPDATE_CLIENT','DELETE_CLIENT',
  'ADD_MEMBER','UPDATE_MEMBER','DELETE_MEMBER',
  'UPDATE_SETTINGS','UPDATE_KANBAN_COLS',
  'ADD_ROADMAP_GOAL','UPDATE_ROADMAP_GOAL','DELETE_ROADMAP_GOAL',
  'ADD_ABSENCE','UPDATE_ABSENCE','DELETE_ABSENCE',
  'DELETE_RETRO_SESSION','DELETE_SR_SESSION',
  'ADD_HIERARCHY_NODE','UPDATE_HIERARCHY_NODE','DELETE_HIERARCHY_NODE',
])

// Synchronisation temps réel générale (2026-08-19, retour Julien : "quand plusieurs utilisateurs
// sont en même temps sur l'outil, si l'un d'eux met quelque chose à jour, personne ne voit la
// modification sauf en faisant un refresh" - exemple donné : un Dev met à jour un item pendant un
// sprint, le PO ne le voit pas sans recharger). Extension du principe déjà en place pour le Daily
// Standup (canal WebSocket dédié, voir dailyWs.ts) : ici, c'est l'action du reducer elle-même qui
// est diffusée aux autres clients connectés (voir plus bas, wrappedDispatch et la connexion
// WebSocket dans StateProvider), qui l'appliquent à leur tour à leur état local. Aucun changement
// requis page par page : toute page qui lit `state` depuis ce contexte profite automatiquement de
// la mise à jour, comme si l'action avait été dispatchée localement.
//
// Liste blanche explicite (même esprit que UNDOABLE ci-dessus) plutôt qu'une liste noire : une
// nouvelle action ajoutée plus tard au reducer n'est PAS synchronisée par défaut tant qu'elle n'est
// pas ajoutée ici sciemment - plus sûr qu'un oubli d'exclusion. Volontairement absents de cette
// liste :
// - SET_STATE (chargement initial ET undo/redo) : jamais diffusé, ce sont des actions locales à
//   chaque utilisateur (annuler une action chez soi ne doit pas annuler l'écran de quelqu'un
//   d'autre), et un SET_STATE transporte tout l'état, bien plus coûteux qu'une action ciblée.
// - UPSERT_DAILY_ENTRY : déjà couvert par son propre canal dédié, plus fin (frappe caractère par
//   caractère, voir dailyWs.ts/useDailyRealtime.ts) - le diffuser aussi ici ferait doublon et
//   risquerait une course entre les deux canaux sur la fonctionnalité tout juste stabilisée hier.
// - Toutes les actions NNL_* (tableau blanc Now/Next/Later) : périmètre volontairement exclu de
//   cette première passe. Le glisser-déposer d'un post-it peut dispatcher en continu pendant un
//   drag (même risque de volume que la frappe caractère par caractère du Daily Standup), et NNL a
//   déjà son propre système d'undo isolé du reste de l'app (décision explicite de Julien) : un
//   traitement dédié, comme celui fait pour le Daily Standup, sera nécessaire plutôt qu'un simple
//   ajout à cette liste. Noté dans docs/corrections futures.md.
const SYNCABLE = new Set([
  'ADD_ITEM','UPDATE_ITEM','DELETE_ITEM',
  'ADD_HIERARCHY_NODE','UPDATE_HIERARCHY_NODE','DELETE_HIERARCHY_NODE',
  'APPLY_SPRINT_PLAN',
  'ADD_SPRINT','UPDATE_SPRINT','DELETE_SPRINT',
  'UPSERT_RETRO_SESSION','DELETE_RETRO_SESSION',
  'ADD_CLIENT','UPDATE_CLIENT','DELETE_CLIENT',
  'ADD_MEMBER','UPDATE_MEMBER','DELETE_MEMBER',
  'ADD_HISTORY',
  'UPDATE_SETTINGS','UPDATE_KANBAN_COLS',
  'ADD_ROADMAP_GOAL','UPDATE_ROADMAP_GOAL','DELETE_ROADMAP_GOAL',
  'SET_CUSTOM_TAGS','SET_REMOVED_BASE_TAGS',
  'ADD_ABSENCE','UPDATE_ABSENCE','DELETE_ABSENCE',
  'ADD_DAILY_ARCHIVE','DELETE_DAILY_ARCHIVE','CLEAR_DAILY_ENTRIES_DATE',
  'ADD_RETRO_ARCHIVE','DELETE_RETRO_ARCHIVE',
  'ADD_CLIENT_GROUP','UPDATE_CLIENT_GROUP','DELETE_CLIENT_GROUP',
  'UPDATE_VISION_BOARD',
  'UPSERT_SR_SESSION','DELETE_SR_SESSION',
  'ADD_SR_ARCHIVE','DELETE_SR_ARCHIVE',
  'UPDATE_SR_ITEM_RECORD','UPDATE_SR_UNFINISHED_RECORD','UPDATE_SR_NOTE',
  'ADD_SR_DECISION','DELETE_SR_DECISION','APPLY_SR_DECISION',
  'ADD_SR_NOTE','DELETE_SR_NOTE',
])

type Action =
  | { type: 'SET_STATE'; payload: CadenceState }
  | { type: 'ADD_ITEM'; payload: Item; keyCounters?: Record<string, number> }
  | { type: 'UPDATE_ITEM'; payload: Item }
  | { type: 'DELETE_ITEM'; payload: string }
  // Nœuds de regroupement (Epic/Initiative) — Phase 1, 2026-07-28 (voir types/index.ts, HierarchyNode)
  | { type: 'ADD_HIERARCHY_NODE'; payload: import('../types').HierarchyNode; keyCounters?: Record<string, number> }
  | { type: 'UPDATE_HIERARCHY_NODE'; payload: import('../types').HierarchyNode }
  | { type: 'DELETE_HIERARCHY_NODE'; payload: string }
  // Phase 6, sous-chantier 4 étape 2/2 (2026-08-12) : apply_sprint_plan (Compagnon IA, routes/ai.ts)
  // peut réaffecter des dizaines d'items et créer plusieurs sprints en une seule action - un merge
  // ciblé plutôt que réutiliser SET_STATE (qui remplacerait TOUT l'état, y compris ce qui a pu
  // changer ailleurs entre-temps). Même non-comportement que le bouton "Appliquer" d'Auto-planning
  // vis-à-vis de Ctrl+Z (SET_STATE n'est pas dans UNDOABLE ci-dessus) : volontairement pas undoable.
  | { type: 'APPLY_SPRINT_PLAN'; payload: { changedItems: Item[]; newItems: Item[]; newSprints: Sprint[]; keyCounters: Record<string, number> } }
  | { type: 'ADD_SPRINT'; payload: Sprint }
  | { type: 'UPDATE_SPRINT'; payload: Sprint }
  | { type: 'DELETE_SPRINT'; payload: string }
  | { type: 'UPSERT_DAILY_ENTRY'; payload: import('../types').DailyEntry }
  | { type: 'UPSERT_RETRO_SESSION'; payload: import('../types').RetroSession }
  | { type: 'DELETE_RETRO_SESSION'; payload: string }
  | { type: 'ADD_CLIENT'; payload: import('../types').Client }
  | { type: 'UPDATE_CLIENT'; payload: import('../types').Client }
  | { type: 'DELETE_CLIENT'; payload: string }
  | { type: 'ADD_MEMBER'; payload: import('../types').TeamMember }
  | { type: 'UPDATE_MEMBER'; payload: import('../types').TeamMember }
  | { type: 'DELETE_MEMBER'; payload: string }
  | { type: 'ADD_HISTORY'; payload: import('../types').HistoryEntry }
  | { type: 'UPDATE_SETTINGS'; payload: import('../types').Settings }
  | { type: 'UPDATE_KANBAN_COLS'; payload: import('../types').KanbanCol[] }
  | { type: 'ADD_ROADMAP_GOAL'; payload: RoadmapGoal }
  | { type: 'UPDATE_ROADMAP_GOAL'; payload: RoadmapGoal }
  | { type: 'DELETE_ROADMAP_GOAL'; payload: string }
  | { type: 'SET_CUSTOM_TAGS'; payload: string[] }
  | { type: 'SET_REMOVED_BASE_TAGS'; payload: string[] }
  | { type: 'ADD_ABSENCE'; payload: import('../types').Absence }
  | { type: 'UPDATE_ABSENCE'; payload: import('../types').Absence }
  | { type: 'DELETE_ABSENCE'; payload: string }
  | { type: 'ADD_DAILY_ARCHIVE'; payload: import('../types').DailyArchive }
  | { type: 'DELETE_DAILY_ARCHIVE'; payload: string }
  | { type: 'CLEAR_DAILY_ENTRIES_DATE'; payload: string }
  | { type: 'ADD_RETRO_ARCHIVE'; payload: import('../types').RetroArchive }
  | { type: 'DELETE_RETRO_ARCHIVE'; payload: string }
  | { type: 'ADD_CLIENT_GROUP'; payload: import('../types').ClientGroup }
  | { type: 'UPDATE_CLIENT_GROUP'; payload: import('../types').ClientGroup }
  | { type: 'DELETE_CLIENT_GROUP'; payload: string }
  | { type: 'UPDATE_VISION_BOARD'; payload: import('../types').VisionBoard }
  | { type: 'ADD_NNL_ITEM';    payload: import('../types').NNLItem }
  | { type: 'UPDATE_NNL_ITEM'; payload: import('../types').NNLItem }
  | { type: 'DELETE_NNL_ITEM'; payload: string }
  | { type: 'SET_NNL_ITEMS';   payload: import('../types').NNLItem[] }
  // Shapes
  | { type: 'ADD_NNL_SHAPE';    payload: import('../types').NNLShape }
  | { type: 'UPDATE_NNL_SHAPE'; payload: import('../types').NNLShape }
  | { type: 'DELETE_NNL_SHAPE'; payload: string }
  // Texts
  | { type: 'ADD_NNL_TEXT';    payload: import('../types').NNLText }
  | { type: 'UPDATE_NNL_TEXT'; payload: import('../types').NNLText }
  | { type: 'DELETE_NNL_TEXT'; payload: string }
  // Strokes
  | { type: 'ADD_NNL_STROKE';    payload: import('../types').NNLStroke }
  | { type: 'UPDATE_NNL_STROKE'; payload: import('../types').NNLStroke }
  | { type: 'DELETE_NNL_STROKE'; payload: string }
  // Layers
  | { type: 'SET_NNL_LAYERS'; payload: import('../types').NNLLayer[] }
  // Cadres Epic/Initiative (Phase 1, sous-chantier 6, 2026-07-29 — voir NNLFrame, types/index.ts)
  | { type: 'ADD_NNL_FRAME';    payload: import('../types').NNLFrame }
  | { type: 'UPDATE_NNL_FRAME'; payload: import('../types').NNLFrame }
  | { type: 'DELETE_NNL_FRAME'; payload: string }
  // Sprint Review
  | { type: 'UPSERT_SR_SESSION'; payload: import('../types').SprintReviewSession }
  | { type: 'DELETE_SR_SESSION'; payload: string }
  | { type: 'ADD_SR_ARCHIVE';    payload: import('../types').SprintReviewArchive }
  | { type: 'DELETE_SR_ARCHIVE'; payload: string }
  // Champs édités frappe par frappe (Note PO, Raison du non-achèvement, Notes globales) : la
  // fusion se fait ICI, dans le reducer, à partir de son propre état à jour — jamais à partir
  // d'un instantané de session capturé dans la page, qui peut être périmé si deux frappes
  // s'enchaînent avant qu'un rendu n'ait eu le temps de s'intercaler (bug constaté 2026-07-22,
  // voir docs/corrections.md).
  | { type: 'UPDATE_SR_ITEM_RECORD'; payload: { sessionDefaults: import('../types').SprintReviewSession; itemId: string; patch: Partial<import('../types').SRItemRecord> } }
  | { type: 'UPDATE_SR_UNFINISHED_RECORD'; payload: { sessionDefaults: import('../types').SprintReviewSession; itemId: string; patch: Partial<import('../types').SRUnfinishedRecord> } }
  | { type: 'UPDATE_SR_NOTE'; payload: { sessionDefaults: import('../types').SprintReviewSession; noteId: string; patch: Partial<import('../types').SRNote> } }
  // Mêmes précautions pour les décisions backlog et notes globales (ajout/suppression) : `save()`
  // reconstruisait tout le tableau dans la page à partir d'un instantané `session`, dispatché tel
  // quel — vulnérable si deux actions s'enchaînent avant qu'un rendu ne s'intercale (constaté
  // 2026-07-22 avec des décisions qui s'écrasaient l'une l'autre, voir docs/corrections.md).
  | { type: 'ADD_SR_DECISION'; payload: { sessionDefaults: import('../types').SprintReviewSession; decision: import('../types').SRDecision } }
  | { type: 'DELETE_SR_DECISION'; payload: { sessionDefaults: import('../types').SprintReviewSession; decisionId: string } }
  | { type: 'APPLY_SR_DECISION'; payload: { sessionDefaults: import('../types').SprintReviewSession; decisionId: string } }
  | { type: 'ADD_SR_NOTE'; payload: { sessionDefaults: import('../types').SprintReviewSession; note: import('../types').SRNote } }
  | { type: 'DELETE_SR_NOTE'; payload: { sessionDefaults: import('../types').SprintReviewSession; noteId: string } }

/**
 * Ordre garanti à la source : state.sprints est toujours trié par `number`, jamais supposé
 * par les pages qui le consomment. Un seul point de tri, appliqué à chaque mutation du tableau.
 */
function sortSprints(sprints: Sprint[]): Sprint[] {
  return [...sprints].sort((a, b) => a.number - b.number)
}

/**
 * Nettoyage ponctuel (2026-07-22, voir docs/corrections.md — cause finale de l'alternance "une
 * fois sur deux" sur Sprint Review) : avant correctif, la session par défaut d'un sprint recevait
 * un id aléatoire (`uid()`) recalculé à chaque rendu tant qu'aucune session n'existait encore pour
 * ce sprint — en StrictMode (rendu en double au montage, en développement), deux ids différents
 * pouvaient être générés puis tous deux sauvegardés, produisant deux objets session distincts pour
 * le même `sprintId`. La page ne lisait toujours que le premier trouvé (`.find()`), l'autre restant
 * une "session fantôme" qui pouvait réapparaître selon l'ordre du tableau. Ce nettoyage fusionne les
 * doublons éventuels par `sprintId` au chargement (best-effort : en cas de valeur divergente sur un
 * même champ entre deux doublons, celle du premier rencontré est conservée — cas limite qui ne
 * devrait plus se produire une fois l'id rendu déterministe côté page, voir SprintReviewPage.tsx).
 */
function dedupeSrSessions(sessions: import('../types').SprintReviewSession[]): import('../types').SprintReviewSession[] {
  const bySprintId = new Map<string, import('../types').SprintReviewSession>()
  for (const s of sessions) {
    const prev = bySprintId.get(s.sprintId)
    if (!prev) { bySprintId.set(s.sprintId, s); continue }
    const dedupeBy = <T extends { id?: string; itemId?: string }>(a: T[], b: T[], key: 'id' | 'itemId') =>
      [...a, ...b].filter((item, i, arr) => arr.findIndex(x => x[key] === item[key]) === i)
    bySprintId.set(s.sprintId, {
      ...prev,
      itemRecords: dedupeBy(prev.itemRecords, s.itemRecords, 'itemId'),
      unfinishedRecords: dedupeBy(prev.unfinishedRecords, s.unfinishedRecords, 'itemId'),
      notes: dedupeBy(prev.notes ?? [], s.notes ?? [], 'id'),
      decisions: dedupeBy(prev.decisions, s.decisions, 'id'),
    })
  }
  return [...bySprintId.values()]
}

/**
 * Migration ponctuelle (2026-07-28, Phase 1 — voir HierarchyNode dans types/index.ts) :
 * avant l'introduction de HierarchyNode, un Epic était un `Item` comme un autre
 * (`type: 'epic'`) dans `state.items`. Des données déjà enregistrées côté serveur (avant
 * ce changement) peuvent donc encore porter ce schéma legacy — cette fonction le détecte
 * au chargement et le convertit, en conservant l'`id` à l'identique : les enfants qui
 * pointent déjà vers cet id via `epicId` continuent de résoudre correctement sans aucune
 * autre modification. Idempotente (sans donnée legacy, ne fait rien) ; volontairement
 * défensive au niveau des types (`any`) car les données réelles peuvent ne pas respecter
 * le schéma courant tant qu'elles n'ont pas traversé cette fonction une fois.
 */
function migrateLegacyEpics(state: CadenceState): CadenceState {
  const items = (state.items ?? []) as any[]
  const legacyEpics = items.filter(i => i?.type === 'epic')
  if (legacyEpics.length === 0 && state.hierarchyNodes) return state
  const migratedNodes: import('../types').HierarchyNode[] = legacyEpics.map(i => ({
    id: i.id, key: i.key, level: 'epic', parentId: null,
    desc: i.desc, clientId: i.clientId || undefined, sprintId: i.sprintId ?? null,
    sp: i.sp, status: i.status, notes: i.notes, createdAt: i.createdAt,
  }))
  const legacyIds = new Set(legacyEpics.map(i => i.id))
  return {
    ...state,
    items: items.filter(i => !legacyIds.has(i.id)) as Item[],
    hierarchyNodes: [...(state.hierarchyNodes ?? []), ...migratedNodes],
  }
}

function reducer(state: CadenceState, action: Action): CadenceState {
  switch (action.type) {
    // Chantier G, 2e complément (2026-07-23) : la colonne "Annulé" n'est plus forcée dans
    // `kanbanCols` à chaque chargement — elle est optionnelle comme Backlog/Ajourné/Bloqué/etc.
    // (demande explicite : ne pas obliger le Kanban à toujours l'afficher, potentiellement
    // beaucoup d'items annulés qui ne seront jamais traités). Si le PO la retire depuis le
    // Kanban, elle ne revient plus au rechargement suivant. Le statut "Annulé" reste toujours
    // sélectionnable depuis le Backlog/Sprint Review indépendamment de cette colonne (voir
    // `statusOptionsForItemModal()`, `utils/kanbanStages.ts`) — seul l'affichage d'une colonne
    // dédiée au Kanban est concerné par ce choix, pas la possibilité d'annuler un item.
    case 'SET_STATE': return migrateLegacyEpics({
      ...action.payload,
      sprints: sortSprints(action.payload.sprints),
      sprintReviewSessions: dedupeSrSessions(action.payload.sprintReviewSessions ?? []),
      // `nnlFrames` (Phase 1, sous-chantier 6, 2026-07-29) n'existe pas encore dans les blobs
      // déjà persistés côté serveur (créés avant l'ajout de ce champ) — sans ce défaut, la clé
      // est carrément absente de `state` après chargement (constaté par Julien : absente de
      // l'export JSON, alors que `nnlShapes`/`nnlTexts`/etc. y sont bien présents, ajoutés lors
      // de migrations antérieures). `?? []` ici, au point d'entrée unique des données chargées
      // (`SET_STATE`, utilisé par `loadFromServer` et par l'undo/redo), plutôt que de compter sur
      // chaque composant consommateur pour le faire défensivement au moment de la lecture.
      nnlFrames: action.payload.nnlFrames ?? [],
    })
    case 'ADD_ITEM': return {
      ...state,
      items: [...state.items, action.payload],
      ...(action.keyCounters ? { itemKeyCounters: action.keyCounters } : {}),
    }
    case 'UPDATE_ITEM': return { ...state, items: state.items.map(i => i.id === action.payload.id ? action.payload : i) }
    case 'DELETE_ITEM': return { ...state, items: state.items.filter(i => i.id !== action.payload) }
    case 'ADD_HIERARCHY_NODE': return {
      ...state,
      hierarchyNodes: [...state.hierarchyNodes, action.payload],
      ...(action.keyCounters ? { itemKeyCounters: action.keyCounters } : {}),
    }
    case 'UPDATE_HIERARCHY_NODE': return { ...state, hierarchyNodes: state.hierarchyNodes.map(n => n.id === action.payload.id ? action.payload : n) }
    case 'DELETE_HIERARCHY_NODE': return { ...state, hierarchyNodes: state.hierarchyNodes.filter(n => n.id !== action.payload) }
    case 'APPLY_SPRINT_PLAN': {
      const changedById = new Map(action.payload.changedItems.map(i => [i.id, i]))
      const items = [
        ...state.items.map(i => changedById.get(i.id) ?? i),
        ...action.payload.newItems,
      ]
      return {
        ...state,
        items,
        sprints: sortSprints([...state.sprints, ...action.payload.newSprints]),
        itemKeyCounters: action.payload.keyCounters,
      }
    }
    case 'ADD_SPRINT': return { ...state, sprints: sortSprints([...state.sprints, action.payload]) }
    case 'UPDATE_SPRINT': return { ...state, sprints: sortSprints(state.sprints.map(s => s.id === action.payload.id ? action.payload : s)) }
    case 'DELETE_SPRINT': return { ...state, sprints: state.sprints.filter(s => s.id !== action.payload) }
    case 'ADD_CLIENT': return { ...state, clients: [...state.clients, action.payload] }
    case 'UPDATE_CLIENT': return { ...state, clients: state.clients.map(c => c.id === action.payload.id ? action.payload : c) }
    case 'DELETE_CLIENT': return { ...state, clients: state.clients.filter(c => c.id !== action.payload) }
    case 'ADD_MEMBER': return { ...state, team: [...state.team, action.payload] }
    case 'UPDATE_MEMBER': return { ...state, team: state.team.map(m => m.id === action.payload.id ? action.payload : m) }
    case 'DELETE_MEMBER': return { ...state, team: state.team.filter(m => m.id !== action.payload) }
    case 'ADD_HISTORY': return { ...state, history: [action.payload, ...(state.history || [])].slice(0, 200) }
    case 'UPDATE_SETTINGS': return { ...state, settings: action.payload }
    case 'UPDATE_KANBAN_COLS': return { ...state, kanbanCols: action.payload }
    case 'ADD_ROADMAP_GOAL': return { ...state, roadmap: [...(state.roadmap || []), action.payload] }
    case 'UPDATE_ROADMAP_GOAL': return { ...state, roadmap: (state.roadmap || []).map(g => g.id === action.payload.id ? action.payload : g) }
    case 'DELETE_ROADMAP_GOAL': return { ...state, roadmap: (state.roadmap || []).filter(g => g.id !== action.payload) }
    case 'SET_CUSTOM_TAGS': return { ...state, customTags: action.payload }
    case 'SET_REMOVED_BASE_TAGS': return { ...state, removedBaseTags: action.payload }
    case 'ADD_ABSENCE': return { ...state, absences: [...(state.absences || []), action.payload] }
    case 'UPDATE_ABSENCE': return { ...state, absences: (state.absences || []).map(a => a.id === action.payload.id ? action.payload : a) }
    case 'DELETE_ABSENCE': return { ...state, absences: (state.absences || []).filter(a => a.id !== action.payload) }
    case 'ADD_DAILY_ARCHIVE': return { ...state, dailyArchives: [...(state.dailyArchives || []), action.payload] }
    case 'DELETE_DAILY_ARCHIVE': return { ...state, dailyArchives: (state.dailyArchives || []).filter(a => a.id !== action.payload) }
    case 'CLEAR_DAILY_ENTRIES_DATE': return { ...state, dailyEntries: state.dailyEntries.filter(e => e.date !== action.payload) }
    case 'ADD_RETRO_ARCHIVE': return { ...state, retroArchives: [...(state.retroArchives || []), action.payload] }
    case 'DELETE_RETRO_ARCHIVE': return { ...state, retroArchives: (state.retroArchives || []).filter(a => a.id !== action.payload) }
    case 'ADD_CLIENT_GROUP': return { ...state, clientGroups: [...(state.clientGroups ?? []), action.payload] }
    case 'UPDATE_CLIENT_GROUP': return { ...state, clientGroups: (state.clientGroups ?? []).map(g => g.id === action.payload.id ? action.payload : g) }
    case 'DELETE_CLIENT_GROUP': return { ...state, clientGroups: (state.clientGroups ?? []).filter(g => g.id !== action.payload) }
    case 'UPDATE_VISION_BOARD': return { ...state, visionBoard: action.payload }
    case 'ADD_NNL_ITEM':    return { ...state, nnlItems: [...(state.nnlItems ?? []), action.payload] }
    case 'UPDATE_NNL_ITEM': return { ...state, nnlItems: (state.nnlItems ?? []).map(n => n.id === action.payload.id ? action.payload : n) }
    case 'DELETE_NNL_ITEM': return { ...state, nnlItems: (state.nnlItems ?? []).filter(n => n.id !== action.payload) }
    case 'SET_NNL_ITEMS':   return { ...state, nnlItems: action.payload }
    case 'ADD_NNL_SHAPE':    return { ...state, nnlShapes: [...(state.nnlShapes ?? []), action.payload] }
    case 'UPDATE_NNL_SHAPE': return { ...state, nnlShapes: (state.nnlShapes ?? []).map(s => s.id === action.payload.id ? action.payload : s) }
    case 'DELETE_NNL_SHAPE': return { ...state, nnlShapes: (state.nnlShapes ?? []).filter(s => s.id !== action.payload) }
    case 'ADD_NNL_TEXT':    return { ...state, nnlTexts: [...(state.nnlTexts ?? []), action.payload] }
    case 'UPDATE_NNL_TEXT': return { ...state, nnlTexts: (state.nnlTexts ?? []).map(t => t.id === action.payload.id ? action.payload : t) }
    case 'DELETE_NNL_TEXT': return { ...state, nnlTexts: (state.nnlTexts ?? []).filter(t => t.id !== action.payload) }
    case 'ADD_NNL_STROKE':    return { ...state, nnlStrokes: [...(state.nnlStrokes ?? []), action.payload] }
    case 'UPDATE_NNL_STROKE': return { ...state, nnlStrokes: (state.nnlStrokes ?? []).map(s => s.id === action.payload.id ? action.payload : s) }
    case 'DELETE_NNL_STROKE': return { ...state, nnlStrokes: (state.nnlStrokes ?? []).filter(s => s.id !== action.payload) }
    case 'SET_NNL_LAYERS':  return { ...state, nnlLayers: action.payload }
    case 'ADD_NNL_FRAME':    return { ...state, nnlFrames: [...(state.nnlFrames ?? []), action.payload] }
    case 'UPDATE_NNL_FRAME': return { ...state, nnlFrames: (state.nnlFrames ?? []).map(f => f.id === action.payload.id ? action.payload : f) }
    case 'DELETE_NNL_FRAME': return { ...state, nnlFrames: (state.nnlFrames ?? []).filter(f => f.id !== action.payload) }
    case 'UPSERT_RETRO_SESSION': {
      const sessions = state.retroSessions.filter(s => s.id !== action.payload.id)
      return { ...state, retroSessions: [...sessions, action.payload] }
    }
    case 'DELETE_RETRO_SESSION': return { ...state, retroSessions: state.retroSessions.filter(s => s.id !== action.payload) }
    case 'UPSERT_SR_SESSION': {
      const sessions = (state.sprintReviewSessions ?? []).filter(s => s.id !== action.payload.id)
      return { ...state, sprintReviewSessions: [...sessions, action.payload] }
    }
    case 'DELETE_SR_SESSION': return { ...state, sprintReviewSessions: (state.sprintReviewSessions ?? []).filter(s => s.id !== action.payload) }
    case 'ADD_SR_ARCHIVE': return { ...state, sprintReviewArchives: [...(state.sprintReviewArchives ?? []), action.payload] }
    case 'DELETE_SR_ARCHIVE': return { ...state, sprintReviewArchives: (state.sprintReviewArchives ?? []).filter(a => a.id !== action.payload) }
    case 'UPDATE_SR_ITEM_RECORD': {
      const sessions = state.sprintReviewSessions ?? []
      const base = sessions.find(s => s.id === action.payload.sessionDefaults.id) ?? action.payload.sessionDefaults
      const prev = base.itemRecords.find(r => r.itemId === action.payload.itemId)
      const updated = { ...(prev ?? { itemId: action.payload.itemId, badge: 'pending' as const, toDemo: false, note: '' }), ...action.payload.patch }
      const nextSession = { ...base, itemRecords: [...base.itemRecords.filter(r => r.itemId !== action.payload.itemId), updated] }
      return { ...state, sprintReviewSessions: [...sessions.filter(s => s.id !== nextSession.id), nextSession] }
    }
    case 'UPDATE_SR_UNFINISHED_RECORD': {
      const sessions = state.sprintReviewSessions ?? []
      const base = sessions.find(s => s.id === action.payload.sessionDefaults.id) ?? action.payload.sessionDefaults
      const prev = base.unfinishedRecords.find(r => r.itemId === action.payload.itemId)
      const updated = { ...(prev ?? { itemId: action.payload.itemId, reason: '', decision: 'report' as const }), ...action.payload.patch }
      const nextSession = { ...base, unfinishedRecords: [...base.unfinishedRecords.filter(r => r.itemId !== action.payload.itemId), updated] }
      return { ...state, sprintReviewSessions: [...sessions.filter(s => s.id !== nextSession.id), nextSession] }
    }
    case 'UPDATE_SR_NOTE': {
      const sessions = state.sprintReviewSessions ?? []
      const base = sessions.find(s => s.id === action.payload.sessionDefaults.id) ?? action.payload.sessionDefaults
      const nextSession = { ...base, notes: (base.notes ?? []).map(n => n.id === action.payload.noteId ? { ...n, ...action.payload.patch } : n) }
      return { ...state, sprintReviewSessions: [...sessions.filter(s => s.id !== nextSession.id), nextSession] }
    }
    case 'ADD_SR_DECISION': {
      const sessions = state.sprintReviewSessions ?? []
      const base = sessions.find(s => s.id === action.payload.sessionDefaults.id) ?? action.payload.sessionDefaults
      const nextSession = { ...base, decisions: [...base.decisions, action.payload.decision] }
      return { ...state, sprintReviewSessions: [...sessions.filter(s => s.id !== nextSession.id), nextSession] }
    }
    case 'DELETE_SR_DECISION': {
      const sessions = state.sprintReviewSessions ?? []
      const base = sessions.find(s => s.id === action.payload.sessionDefaults.id) ?? action.payload.sessionDefaults
      const nextSession = { ...base, decisions: base.decisions.filter(d => d.id !== action.payload.decisionId) }
      return { ...state, sprintReviewSessions: [...sessions.filter(s => s.id !== nextSession.id), nextSession] }
    }
    case 'APPLY_SR_DECISION': {
      const sessions = state.sprintReviewSessions ?? []
      const base = sessions.find(s => s.id === action.payload.sessionDefaults.id) ?? action.payload.sessionDefaults
      const nextSession = { ...base, decisions: base.decisions.map(d => d.id === action.payload.decisionId ? { ...d, applied: true } : d) }
      return { ...state, sprintReviewSessions: [...sessions.filter(s => s.id !== nextSession.id), nextSession] }
    }
    case 'ADD_SR_NOTE': {
      const sessions = state.sprintReviewSessions ?? []
      const base = sessions.find(s => s.id === action.payload.sessionDefaults.id) ?? action.payload.sessionDefaults
      const nextSession = { ...base, notes: [...(base.notes ?? []), action.payload.note] }
      return { ...state, sprintReviewSessions: [...sessions.filter(s => s.id !== nextSession.id), nextSession] }
    }
    case 'DELETE_SR_NOTE': {
      const sessions = state.sprintReviewSessions ?? []
      const base = sessions.find(s => s.id === action.payload.sessionDefaults.id) ?? action.payload.sessionDefaults
      const nextSession = { ...base, notes: (base.notes ?? []).filter(n => n.id !== action.payload.noteId) }
      return { ...state, sprintReviewSessions: [...sessions.filter(s => s.id !== nextSession.id), nextSession] }
    }
    case 'UPSERT_DAILY_ENTRY': {
      const entries = state.dailyEntries.filter(e => !(e.memberId === action.payload.memberId && e.date === action.payload.date))
      return { ...state, dailyEntries: [...entries, action.payload] }
    }
    default: return state
  }
}

interface StateContextValue {
  state: CadenceState
  dispatch: React.Dispatch<Action>
  saveToServer: (s: CadenceState) => Promise<void>
  loadFromServer: () => Promise<void>
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /** true une fois que l'état initial (serveur si un token existe, sinon démo) est définitivement chargé.
   *  Sert aux pages qui figent un choix par défaut (ex. sprint sélectionné) dans un useState au montage :
   *  sans ce flag, ce choix se ferait sur les données de démo affichées le temps du chargement serveur,
   *  sans jamais se corriger ensuite (voir Chantier A, corrections.md). */
  stateLoaded: boolean
  /** Phase 3 (roadmap v1), Mode présentation — true si `publicToken` a été fourni à `StateProvider`
   *  et que le serveur l'a rejeté (404, lien jamais généré ou révoqué/régénéré depuis). Consulté par
   *  `PresentationPublicPage.tsx` pour afficher "lien invalide" plutôt que le workspace de démo. */
  presentationLinkInvalid: boolean
}

const StateContext = createContext<StateContextValue | null>(null)

// `publicToken` (Phase 3, Mode présentation) : quand fourni, ce Provider sert la vue publique du
// lien de partage (PresentationPublicPage.tsx) plutôt qu'un compte connecté — chargement via la
// route publique `GET /api/presentation/state/:token` (pas de JWT) au lieu de `GET /api/state`, et
// aucune écriture possible (`saveToServer` devient un no-op : un visiteur du lien n'a de toute façon
// aucune action de mutation exposée, `AuthOverrideProvider` lui impose le rôle STAKEHOLDER en lecture
// seule, mais ce garde-fou reste utile en cas d'oubli d'un futur appelant).
export function StateProvider({ children, publicToken }: { children: ReactNode; publicToken?: string }) {
  const [state, dispatch] = useReducer(reducer, DEMO_STATE)
  const [past, setPast] = useState<CadenceState[]>([])
  const [future, setFuture] = useState<CadenceState[]>([])
  const [stateLoaded, setStateLoaded] = useState(false)
  const [presentationLinkInvalid, setPresentationLinkInvalid] = useState(false)

  // stateRef (2026-08-18, retour Julien : la vue Daily Standup "décroche" en frappe rapide malgré
  // React.memo sur MemberCard) : `wrappedDispatch` avait `state` en dépendance (pour le snapshot
  // undo), donc changeait de référence à CHAQUE dispatch - y compris ceux déclenchés par un simple
  // message reçu en direct (voir hooks/useDailyRealtime.ts). Or `dispatch` (issu de ce contexte)
  // est utilisé comme dépendance stable un peu partout (DailyPage.tsx, NNLCanvas.tsx,
  // ChatContext.tsx) : le voir changer à chaque frappe recréait ces callbacks à chaque fois,
  // invalidant tout React.memo qui en dépendait en aval - exactement ce qui empêchait le correctif
  // React.memo(MemberCard) de faire effet. `state` est donc lu ici via une ref tenue à jour à
  // chaque rendu plutôt que par fermeture directe, ce qui permet à `wrappedDispatch` de garder une
  // référence stable, aussi stable que le `dispatch` interne de useReducer lui-même.
  const stateRef = useRef(state)
  stateRef.current = state

  // Contrôle de concurrence optimiste (2026-08-20, voir backend/src/routes/state.ts) : dernière
  // `version` de `workspace_state` connue de ce client, mise à jour au chargement, après chaque
  // sauvegarde réussie, ET à la réception d'un message `state_version` diffusé par le serveur après
  // la sauvegarde d'un AUTRE client (voir plus bas, connexion WebSocket de synchro) - sans ce
  // dernier point, la version locale resterait périmée dès qu'un collègue connecté sauvegarde quoi
  // que ce soit, déclenchant un faux conflit à la sauvegarde suivante de CE client alors que son
  // contenu, lui, est déjà à jour via cette même synchro temps réel. `null` tant qu'aucun état n'a
  // encore été chargé (mode démo, ou tout premier PUT jamais fait sur ce workspace) : `saveToServer`
  // envoie alors la sauvegarde sans version, comportement historique sans contrôle.
  const versionRef = useRef<number | null>(null)
  const { showToast } = useToast()

  // Thème/couleur principale/densité (Phase 6bis, sous-chantier 4, 2026-08-13) : déplacés dans
  // PersonalSettingsContext.tsx (2026-08-19, décision Julien), ces réglages sont désormais
  // propres au compte connecté, pas au workspace partagé par ce contexte (`state.settings` reste
  // la valeur de repli tant qu'un compte n'a rien personnalisé, voir types/index.ts,
  // `PersonalSettings`). PersonalSettingsProvider est monté à l'intérieur de StateProvider
  // (App.tsx) pour pouvoir lire cette valeur de repli via `useCadence()`.

  // ── Sync Backlog → NNL (Phase 1, sous-chantier 6, point 5, 2026-07-30) ─────
  // Quand l'`epicId` d'un item change (ItemModal, cascade de suppression d'Epic, ou la sync
  // inverse du point 4 elle-même), le post-it NNL lié (`linkedItemId`) est déplacé dans le cadre
  // Epic correspondant, SI ce cadre existe déjà sur le canevas (spec initiale : "si un cadre
  // correspondant existe déjà" — sinon, rien à faire, le post-it reste où il est). Volontairement
  // placé ici (StateProvider, toujours monté) plutôt que dans NNLCanvas.tsx : le changement
  // d'epicId peut arriver depuis n'importe quelle page (Backlog, Kanban, Planning...), pas
  // seulement quand le canevas NNL est affiché.
  //
  // epicId vidé (désassociation manuelle via ItemModal OU suppression en cascade de l'Epic —
  // corrigé le 2026-07-30, voir docs/corrections.md) : si le post-it lié se trouve actuellement
  // dans un cadre Epic (y compris un cadre devenu orphelin "(introuvable)" suite à la suppression
  // du nœud), il en est éjecté — repositionné juste à l'extérieur du bord le plus proche
  // (`ejectPointFromFrame`), en restant dans la même zone Now/Next/Later qu'avant l'éjection
  // (`clampDistanceToZone` — décision explicite de Julien : ne pas faire changer de zone un
  // post-it seulement parce qu'il sort d'un cadre). Si le post-it n'est dans aucun cadre Epic,
  // rien à faire.
  const nnlEpicSyncPrevItemsRef = useRef<Item[] | null>(null)
  useEffect(() => {
    // Ne rien comparer tant que le chargement initial (démo ou serveur) n'est pas terminé, sinon
    // la transition DEMO_STATE → données serveur ferait apparaître tous les items comme "changés"
    // et déclencherait un déplacement de post-its en masse au premier chargement.
    if (!stateLoaded) return
    const prev = nnlEpicSyncPrevItemsRef.current
    nnlEpicSyncPrevItemsRef.current = state.items
    if (!prev) return // première exécution après stateLoaded=true : établir la référence seulement

    const prevEpicById = new Map(prev.map(i => [i.id, i.epicId ?? null]))
    const changed = state.items.filter(it => {
      const prevEpicId = prevEpicById.get(it.id)
      return prevEpicId !== undefined && prevEpicId !== (it.epicId ?? null)
    })
    if (changed.length === 0) return

    let nnlItems = state.nnlItems ?? []
    const frames = state.nnlFrames ?? []
    let didChange = false
    for (const item of changed) {
      const nnlItem = nnlItems.find(n => n.linkedItemId === item.id)
      if (!nnlItem) continue

      if (!item.epicId) {
        // Désassociation (manuelle ou cascade de suppression d'Epic) : éjecter le post-it de
        // tout cadre Epic qui le contiendrait encore visuellement (voir commentaire ci-dessus).
        const containingFrame = frames.find(f => f.level === 'epic' && isItemInFrame(nnlItem, f))
        if (!containingFrame) continue // pas dans un cadre : rien à faire
        const currentZone = nnlItem.zone ?? zoneFromWorld(nnlItem.x, nnlItem.y, R1_DEFAULT, R2_DEFAULT)
        const ejected = ejectPointFromFrame(nnlItem.x, nnlItem.y, containingFrame)
        const { x: nx, y: ny } = clampDistanceToZone(ejected.x, ejected.y, currentZone, R1_DEFAULT, R2_DEFAULT)
        nnlItems = nnlItems.map(n => n.id === nnlItem.id ? { ...n, x: nx, y: ny, zone: currentZone } : n)
        didChange = true
        continue
      }

      const targetFrame = frames.find(f => f.level === 'epic' && f.hierarchyNodeId === item.epicId)
      if (!targetFrame) continue // pas de cadre correspondant sur le canevas : rien à faire
      if (isItemInFrame(nnlItem, targetFrame)) continue // déjà dans le bon cadre

      const b = frameBounds(targetFrame)
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2
      // Léger jitter (±15% max des dimensions du cadre) pour éviter un empilement parfait si
      // plusieurs post-its rejoignent le même cadre à la suite (ex. cascade de rattachement).
      const nx = cx + (Math.random() - 0.5) * Math.min(60, (b.maxX - b.minX) * 0.3)
      const ny = cy + (Math.random() - 0.5) * Math.min(60, (b.maxY - b.minY) * 0.3)
      nnlItems = nnlItems.map(n => n.id === nnlItem.id
        ? { ...n, x: nx, y: ny, zone: zoneFromWorld(nx, ny, R1_DEFAULT, R2_DEFAULT) }
        : n)
      didChange = true
    }
    if (didChange) {
      const newState = { ...state, nnlItems }
      dispatch({ type: 'SET_STATE', payload: newState })
      saveToServer(newState)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.items, stateLoaded])

  // File d'attente : deux appels à saveToServer proches dans le temps envoient chacun leur propre
  // requête PUT en parallèle, sans garantie que la requête envoyée en premier arrive au serveur
  // en premier (aléas réseau). Le PUT arrivé en dernier gagne côté serveur, quel que soit l'ordre
  // d'envoi — ce qui peut faire réapparaître une version plus ancienne de l'état après coup. Ce
  // n'est visible que sur les pages qui enchaînent beaucoup de sauvegardes rapprochées (Sprint
  // Review : frappe + clics rapides sur décisions/notes), mais le défaut est présent partout où
  // saveToServer est utilisé. Corrigé en sérialisant les appels : chaque PUT n'est envoyé qu'une
  // fois le précédent terminé, ce qui garantit que l'ordre d'arrivée au serveur respecte l'ordre
  // d'appel (constaté 2026-07-22, voir docs/corrections.md).
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const saveToServer = useCallback((s: CadenceState) => {
    // Mode présentation publique : aucune écriture possible pour un visiteur du lien (voir
    // commentaire sur `StateProvider` ci-dessus) — no-op plutôt que d'appeler `putState` avec le
    // token de présentation, qui ne serait de toute façon pas accepté par une route publique en
    // lecture seule côté serveur.
    if (publicToken) return Promise.resolve()
    const run = saveQueueRef.current
      .catch(() => { /* une sauvegarde précédente en échec ne doit pas bloquer les suivantes */ })
      .then(() => api.putState(s, versionRef.current ?? undefined))
      .then(({ version }) => { versionRef.current = version })
      .catch(err => {
        // Conflit détecté côté serveur (409, voir routes/state.ts) : quelqu'un d'autre a sauvegardé
        // entre la version connue de ce client et cette écriture. Se resynchroniser sur l'état
        // réellement en base plutôt que de réessayer à l'aveugle - `s` a été construit localement à
        // partir d'une base déjà périmée, le renvoyer tel quel referait exactement la même erreur en
        // silence. L'action qui vient d'échouer n'est PAS réappliquée automatiquement : c'est
        // délibéré (voir échange avec Julien, 2026-08-20) - `s` est un instantané COMPLET de l'état
        // recomposé par l'appelant, pas un patch ciblé, le réappliquer sur l'état frais risquerait
        // justement de réécraser ce que l'autre personne vient d'enregistrer.
        if (isStateConflictError(err)) {
          dispatch({ type: 'SET_STATE', payload: err.data as CadenceState })
          versionRef.current = err.version
          showToast('Une autre modification a été enregistrée entre-temps, votre dernier changement n\'a pas été sauvegardé. Réessayez si besoin.', 'error')
          return
        }
        /* autre erreur (réseau...) : offline mode, comportement historique */
      })
    saveQueueRef.current = run
    return run
  }, [publicToken, showToast])

  const loadFromServer = useCallback(async () => {
    try {
      if (publicToken) {
        const { data } = await api.getPresentationState(publicToken)
        if (data) dispatch({ type: 'SET_STATE', payload: data as CadenceState })
      } else {
        const { data, version } = await api.getState()
        versionRef.current = version
        if (data) dispatch({ type: 'SET_STATE', payload: data as CadenceState })
      }
    } catch {
      // Phase 3, Mode présentation : un 404 (lien invalide/révoqué) doit être signalé, pas juste
      // avalé comme le mode "offline" habituel (données de démo affichées silencieusement) — un
      // visiteur externe qui ouvre un lien mort doit voir un message clair, pas le workspace de
      // démonstration de quelqu'un d'autre.
      if (publicToken) setPresentationLinkInvalid(true)
      /* sinon, mode déconnecté normal : garder les données de démo */
    }
    finally { setStateLoaded(true) }
  }, [publicToken])

  // Charger depuis le serveur au démarrage : toujours en mode présentation publique (le token fait
  // office d'autorisation, pas de JWT à vérifier) ; sinon seulement si un vrai token existe — sans
  // token, les données de démo sont déjà définitives, l'état est considéré chargé immédiatement.
  useEffect(() => {
    if (publicToken || localStorage.getItem('cadence_token')) loadFromServer()
    else setStateLoaded(true)
  }, [loadFromServer, publicToken])

  // Connexion WebSocket de synchronisation temps réel (voir SYNCABLE en tête de fichier). Établie
  // ici, dans StateProvider (monté une seule fois au niveau racine de l'app, jamais remonté à la
  // navigation entre pages) : reste active quelle que soit la page affichée, contrairement au canal
  // Daily Standup qui ne vit que le temps où cette page précise est montée. Même stratégie de
  // reconnexion tolérante à l'échec que ce dernier (délai croissant 1s → 15s, pas de nouvelle
  // tentative sur un rejet volontaire du serveur, code 4001). Jamais démarrée en mode présentation
  // publique (`publicToken`) : un visiteur du lien n'a pas de jeton JWT, seulement un jeton de
  // présentation d'une autre nature, que cette route (vérification JWT classique) n'accepte pas.
  const syncWsRef = useRef<WebSocket | null>(null)
  const syncReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncReconnectDelayRef = useRef(1000)

  useEffect(() => {
    if (publicToken) return
    let unmounted = false

    function connect() {
      if (unmounted) return
      const token = localStorage.getItem('cadence_token')
      if (!token) return

      let ws: WebSocket
      try {
        ws = new WebSocket(`${SYNC_WS_BASE_URL}/api/ws/sync?token=${encodeURIComponent(token)}`)
      } catch {
        return
      }
      syncWsRef.current = ws

      ws.onopen = () => { syncReconnectDelayRef.current = 1000 }

      ws.onmessage = e => {
        let msg: { type?: string; action?: Action; version?: number }
        try { msg = JSON.parse(e.data) } catch { return }
        // `state_version` (2026-08-20, contrôle de concurrence optimiste, voir routes/state.ts) :
        // diffusée après CHAQUE sauvegarde réussie d'un client (y compris celui qui vient de
        // sauvegarder, redondant pour lui mais sans effet puisque déjà à la même valeur). Garde ce
        // client à jour sur la version réellement en base sans round-trip, pour ne pas déclencher de
        // faux conflit à sa prochaine sauvegarde alors que son contenu est déjà à jour via
        // `state_action` ci-dessous.
        if (msg?.type === 'state_version' && typeof msg.version === 'number') {
          versionRef.current = msg.version
          return
        }
        if (msg?.type !== 'state_action' || !msg.action) return
        // dispatch BRUT, jamais wrappedDispatch : une action reçue d'un autre utilisateur ne doit
        // ni pousser de snapshot undo local (annuler chez soi ne doit pas défaire l'action de
        // quelqu'un d'autre) ni être rediffusée (éviterait un écho qui reviendrait à l'émetteur).
        dispatch(msg.action)
      }

      ws.onclose = e => {
        // Bug réel trouvé par Julien (2026-08-19, capture DevTools à l'appui : connexion "101"
        // bien établie et visible dans l'onglet Réseau, mais AUCUN message envoyé à l'enregistrement
        // d'un item) : en développement, React (StrictMode) monte l'effet, le nettoie, puis le
        // remonte au chargement de la page - deux WebSocket sont donc créés coup sur coup, le
        // premier (ws_a) fermé quasi aussitôt par le nettoyage, le second (ws_b) restant la vraie
        // connexion active (syncWsRef.current = ws_b après le remontage). Problème : l'événement
        // `close` de ws_a ne se déclenche qu'un peu PLUS TARD, de façon asynchrone - et ce handler
        // mettait `syncWsRef.current = null` SANS vérifier qu'il s'agissait encore de la connexion
        // courante, effaçant donc la référence à ws_b (pourtant bien vivante et ouverte) dès que
        // l'événement `close` de ws_a arrivait. Résultat : `wrappedDispatch` ne trouvait plus aucune
        // connexion valide (`syncWsRef.current` à `null`) et n'envoyait jamais rien, alors que la
        // connexion réellement affichée dans l'onglet Réseau restait active. Corrigé en ne nettoyant
        // la ref que si elle pointe encore vers CETTE connexion précise (garde d'identité).
        if (syncWsRef.current === ws) syncWsRef.current = null
        if (e.code === 4001 || unmounted) return
        syncReconnectTimerRef.current = setTimeout(connect, syncReconnectDelayRef.current)
        syncReconnectDelayRef.current = Math.min(syncReconnectDelayRef.current * 2, 15000)
      }

      // onerror est toujours suivi d'onclose (spec WebSocket) : la reconnexion y est déjà gérée.
      ws.onerror = () => {}
    }

    connect()

    return () => {
      unmounted = true
      if (syncReconnectTimerRef.current) clearTimeout(syncReconnectTimerRef.current)
      syncWsRef.current?.close()
      syncWsRef.current = null
    }
  }, [publicToken])

  // Dispatch avec snapshot undo/redo. Référence stable (voir stateRef ci-dessus) : le snapshot
  // undo lit stateRef.current au moment de l'appel plutôt que `state` en fermeture, donnée tout
  // aussi à jour, mais sans forcer wrappedDispatch à changer de référence à chaque dispatch. Diffuse
  // aussi l'action aux autres clients connectés si elle fait partie de SYNCABLE (voir plus haut) -
  // syncWsRef est une ref, donc sa lecture ici ne casse pas la référence stable de wrappedDispatch.
  const wrappedDispatch = useCallback((action: Action) => {
    if (UNDOABLE.has(action.type)) {
      setPast(p => [...p.slice(-49), stateRef.current])
      setFuture([])
    }
    dispatch(action)
    if (SYNCABLE.has(action.type)) {
      const ws = syncWsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'state_action', action }))
      }
    }
  }, [])

  const undo = useCallback(() => {
    if (past.length === 0) return
    const prev = past[past.length - 1]
    setPast(p => p.slice(0, -1))
    setFuture(f => [state, ...f.slice(0, 49)])
    dispatch({ type: 'SET_STATE', payload: prev })
  }, [past, state])

  const redo = useCallback(() => {
    if (future.length === 0) return
    const next = future[0]
    setFuture(f => f.slice(1))
    setPast(p => [...p.slice(-49), state])
    dispatch({ type: 'SET_STATE', payload: next })
  }, [future, state])

  return (
    <StateContext.Provider value={{
      state, dispatch: wrappedDispatch, saveToServer, loadFromServer,
      undo, redo, canUndo: past.length > 0, canRedo: future.length > 0, stateLoaded,
      presentationLinkInvalid,
    }}>
      {children}
    </StateContext.Provider>
  )
}

export function useCadence() {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useCadence must be used inside StateProvider')
  return ctx
}
