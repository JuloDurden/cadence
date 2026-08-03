// Phase 4 (roadmap v1), Dashboard widgets — chantier "poser les bases" (2026-08-03, retour Julien) :
// pas une liste réordonnable façon Réglages (voir presentablePages.ts), mais un vrai placement libre
// sur grille façon iOS Springboard — on pose un widget où on veut, parmi 3 tailles prédéfinies (pas
// de redimensionnement libre à la souris). `react-grid-layout` gère le placement/drag/collision ;
// ce fichier ne contient que le catalogue des widgets et les dimensions des 3 tailles.
export type DashboardWidgetSize = 'S' | 'M' | 'L'

export type DashboardWidgetId =
  | 'kpi-done' | 'kpi-velocity' | 'kpi-current-sprint' | 'kpi-blockers'
  | 'velocity-chart' | 'burndown-chart' | 'client-rag' | 'recent-activity'

export interface DashboardWidgetDef {
  id: DashboardWidgetId
  label: string
  /** Tailles autorisées pour ce widget — un KPI (une seule valeur à afficher) n'a pas besoin d'une
   *  grande tuile, un graphique a besoin d'assez de place pour rester lisible. */
  allowedSizes: DashboardWidgetSize[]
}

export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetDef[] = [
  { id: 'kpi-done',           label: 'US terminées',          allowedSizes: ['S', 'M'] },
  { id: 'kpi-velocity',       label: 'Vélocité moyenne',      allowedSizes: ['S', 'M'] },
  { id: 'kpi-current-sprint', label: 'Sprint actuel',         allowedSizes: ['S', 'M'] },
  { id: 'kpi-blockers',       label: 'Blocages actifs',       allowedSizes: ['S', 'M'] },
  { id: 'velocity-chart',     label: 'Graphique de vélocité', allowedSizes: ['M', 'L'] },
  { id: 'burndown-chart',     label: 'Burndown (sprint actif)', allowedSizes: ['M', 'L'] },
  { id: 'client-rag',         label: 'Santé clients (RAG)',   allowedSizes: ['M', 'L'] },
  { id: 'recent-activity',    label: 'Activité récente',      allowedSizes: ['M', 'L'] },
]

/** Largeur/hauteur (en unités de grille `react-grid-layout`, 12 colonnes) pour chacune des 3
 *  tailles prédéfinies. Pas de redimensionnement libre : on choisit une taille dans ce jeu de 3,
 *  react-grid-layout se charge de replacer les autres tuiles autour (collision/compaction). */
export const DASHBOARD_GRID_COLS = 12
export const DASHBOARD_ROW_HEIGHT = 32
export const WIDGET_SIZE_DIMENSIONS: Record<DashboardWidgetSize, { w: number; h: number }> = {
  S: { w: 3, h: 3 },
  M: { w: 6, h: 6 },
  L: { w: 12, h: 7 },
}

export interface DashboardWidgetPlacement {
  id: DashboardWidgetId
  x: number
  y: number
  size: DashboardWidgetSize
}

// Reproduit exactement la disposition d'avant ce chantier (4 KPI en ligne, puis Vélocité/Burndown,
// puis Santé clients/Activité récente) — valeur de repli tant qu'un workspace n'a pas encore
// personnalisé son Dashboard.
export const DEFAULT_DASHBOARD_LAYOUT: DashboardWidgetPlacement[] = [
  { id: 'kpi-done',           x: 0, y: 0, size: 'S' },
  { id: 'kpi-velocity',       x: 3, y: 0, size: 'S' },
  { id: 'kpi-current-sprint', x: 6, y: 0, size: 'S' },
  { id: 'kpi-blockers',       x: 9, y: 0, size: 'S' },
  { id: 'velocity-chart',     x: 0, y: 3, size: 'M' },
  { id: 'burndown-chart',     x: 6, y: 3, size: 'M' },
  { id: 'client-rag',         x: 0, y: 9, size: 'M' },
  { id: 'recent-activity',    x: 6, y: 9, size: 'M' },
]

/**
 * Résout une disposition sauvegardée (`state.settings.dashboardWidgets`) en repli sur la
 * disposition par défaut si absente/vide, et filtre tout id de widget devenu inconnu (catalogue
 * modifié depuis) plutôt que de planter — même principe que `resolvePresentationPages`.
 */
export function resolveDashboardLayout(saved: DashboardWidgetPlacement[] | undefined): DashboardWidgetPlacement[] {
  const source = saved && saved.length > 0 ? saved : DEFAULT_DASHBOARD_LAYOUT
  const resolved = source.filter(p => DASHBOARD_WIDGET_CATALOG.some(w => w.id === p.id))
  return resolved.length > 0 ? resolved : DEFAULT_DASHBOARD_LAYOUT
}
