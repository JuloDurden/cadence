// Catalogue partagé des statuts Kanban — extrait de KanbanPage.tsx (2026-07-23) pour être
// consommable depuis n'importe quel composant sans dépendance circulaire (ItemModal.tsx en a
// besoin pour son sélecteur STATUT, tout en étant lui-même importé par KanbanPage.tsx : un import
// direct depuis la page aurait créé un cycle KanbanPage → ItemModal → KanbanPage).
// Principe 1 (docs/interactions idéales.md) : un seul catalogue de statuts, jamais recodé page
// par page — BacklogPage.tsx (filtre de statut) et ItemModal.tsx (sélecteur STATUT) fusionnent
// tous deux `state.kanbanCols` (colonnes réellement actives) avec `EXTRA_STAGES` (statuts pas
// encore ajoutés comme colonne, mais qu'un item peut déjà porter).
import type { KanbanCol } from '../types'

export const BASE_COL_IDS = ['todo', 'doing', 'done']

/** Canonical workflow order — used to position columns on insertion */
export const WORKFLOW_ORDER = [
  'backlog', 'todo', 'doing', 'review', 'testing',
  'waiting', 'blocked', 'validation', 'done', 'deferred', 'cancelled',
]

/** Définition canonique du statut "Annulé" (Chantier G, 2026-07-23) — source unique réutilisée
 *  par `EXTRA_STAGES` et `statusOptionsForItemModal()` ci-dessous, pour ne jamais désynchroniser
 *  label/couleur entre les deux. */
export const CANCELLED_COL: KanbanCol = { id: 'cancelled', label: 'Annulé', color: '#000000', isDone: false }

/** All extra stages selectable as Kanban columns */
export const EXTRA_STAGES: KanbanCol[] = [
  { id: 'backlog',    label: 'Backlog',     color: '#9ca3af', isDone: false },
  { id: 'deferred',  label: 'Ajourné',     color: '#78716c', isDone: false },
  { id: 'review',    label: 'En révision', color: '#8b5cf6', isDone: false },
  { id: 'testing',   label: 'En test',     color: '#3b82f6', isDone: false },
  { id: 'waiting',   label: 'En attente',  color: '#f59e0b', isDone: false },
  { id: 'blocked',   label: 'Bloqué',      color: '#ef4444', isDone: false },
  { id: 'validation',label: 'Validation',  color: '#ec4899', isDone: false },
  // Chantier G, 2e complément (2026-07-23) : optionnelle comme les autres — pas dans le catalogue
  // par défaut (demo.ts), ajoutable ici depuis "+ Ajouter colonne" au Kanban. Un board avec
  // beaucoup d'items annulés n'est pas obligé de lui dédier en permanence une colonne.
  CANCELLED_COL,
]

/**
 * Statuts proposés par le sélecteur STATUT de l'`ItemModal` (2026-07-23, sur demande explicite de
 * l'utilisateur) : strictement les colonnes réellement visibles au Kanban (`state.kanbanCols`),
 * jamais l'ensemble plus large `EXTRA_STAGES` (qui inclut des statuts jamais ajoutés comme
 * colonne — Backlog, En révision, En test, En attente, Bloqué, Validation — et n'a donc pas sa
 * place dans un sélecteur d'édition d'item). "Annulé" est garanti présent même si retiré du board
 * (`handleDeleteCol`, Kanban) : un item ne doit jamais perdre la possibilité d'être annulé.
 */
export function statusOptionsForItemModal(kanbanCols: KanbanCol[]): KanbanCol[] {
  return kanbanCols.some(c => c.id === 'cancelled') ? kanbanCols : [...kanbanCols, CANCELLED_COL]
}

/**
 * Palette "liée aux statuts" pour le color picker des colonnes Kanban (Réglages, 2026-07-27,
 * sur demande explicite de l'utilisateur — la palette générique du canevas NNL n'avait pas de
 * rapport avec les couleurs réellement utilisées par l'app). Reprend les couleurs canoniques
 * des statuts de base (`demo.ts` — todo/doing/done/staging/delivered, dupliquées ici car non
 * exportées séparément de `DEMO_STATE`) et des statuts optionnels (`EXTRA_STAGES` ci-dessus),
 * pour que choisir une couleur de colonne rappelle un statut existant plutôt qu'une teinte
 * arbitraire de palette de dessin.
 */
export const STATUS_COLOR_PALETTE: { color: string; label: string }[] = [
  { color: '#9ca3af', label: 'Backlog' },
  { color: '#6b7280', label: 'À faire' },
  { color: '#d97706', label: 'En cours' },
  { color: '#0891b2', label: 'En recette' },
  { color: '#8b5cf6', label: 'En révision' },
  { color: '#3b82f6', label: 'En test' },
  { color: '#f59e0b', label: 'En attente' },
  { color: '#ef4444', label: 'Bloqué' },
  { color: '#ec4899', label: 'Validation' },
  { color: '#16a34a', label: 'Terminé' },
  { color: '#0d9488', label: 'Livré' },
  { color: '#78716c', label: 'Ajourné' },
  { color: '#000000', label: 'Annulé' },
]
