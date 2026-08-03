// Phase 4 (roadmap v1), Dashboard widgets — chantier "poser les bases" (2026-08-03, retour Julien) :
// pas une liste réordonnable façon Réglages (voir presentablePages.ts), mais un vrai placement libre
// sur grille façon iOS Springboard — on pose un widget où on veut, parmi des tailles prédéfinies (pas
// de redimensionnement libre à la souris). `react-grid-layout` gère le placement/drag/collision ;
// ce fichier ne contient que le catalogue des widgets et les dimensions des tailles.
//
// Retour Julien (2026-08-03, après le 1er essai) : deux distinctions à appliquer aux widgets
// existants avant d'en ajouter de nouveaux.
// 1. Un widget à valeur unique (US terminées, Vélocité moyenne, Sprint actuel, Blocages actifs)
//    n'a pas besoin de plusieurs tailles — verrouillé sur une seule (`allowedSizes: ['S']`), ce qui
//    masque déjà le bouton de changement de taille côté DashboardWidgetGrid.tsx (condition
//    `allowedSizes.length > 1`), sans changement nécessaire là-bas.
// 2. Sprint en cours vs vue générale du produit — chaque widget porte désormais un `scope`, utilisé
//    par DashboardPage.tsx pour répartir les widgets dans 2 zones séparées (voir
//    DashboardZoneSplit.tsx), chacune avec sa propre grille. `recent-activity` (Activité récente,
//    flux des dailies) n'était pas dans la liste que Julien a donnée — classé `sprint` par
//    déduction (contenu du jour/du sprint en cours, pas une mesure produit) ; à corriger s'il n'est
//    pas d'accord.
//
// Retour Julien (2026-08-03, "il faut aussi retravailler et normaliser les tailles") : les 3
// tailles S/M/L ne suivaient pas de grille cohérente (M et L avaient la même largeur que S mais
// doublaient les deux dimensions sans logique explicite). Repris sur le modèle des widgets iOS —
// chaque taille est un multiple explicite de S (unité de base, une seule info clé) :
//   - S   : 1 info clé.
//   - M   : largeur de 2 S, hauteur de 1 S — un peu de données.
//   - L   : largeur de 2 S, hauteur de 2 S (= 2 M empilés) — visualisation détaillée.
//   - XL  : largeur de 4 S, hauteur de 2 S (= 2 L côte à côte) — visualisation détaillée + volume
//     d'infos (ex. Burndown).
//   - XLP ("XL Portrait") : même surface que XL mais en portrait (largeur de 2 S, hauteur de 4 S) —
//     pour une liste verticale dense (ex. Santé clients (RAG), un client par ligne).
// Une zone qui rétrécit (poignée entre les 2 zones, voir DashboardZoneSplit.tsx) ne redimensionne
// jamais les widgets qu'elle contient — seule sa grille se recompose (react-grid-layout replace les
// tuiles, mêmes dimensions en unités de grille), jamais leur taille S/M/L/XL/XLP.
export type DashboardWidgetSize = 'S' | 'M' | 'L' | 'XL' | 'XLP'
export type DashboardWidgetScope = 'sprint' | 'product'

export type DashboardWidgetId =
  | 'kpi-done' | 'kpi-velocity' | 'kpi-current-sprint' | 'kpi-blockers'
  | 'velocity-chart' | 'burndown-chart' | 'client-rag' | 'recent-activity'

export interface DashboardWidgetDef {
  id: DashboardWidgetId
  label: string
  /** Tailles autorisées pour ce widget — un widget à valeur unique reste verrouillé sur 'S', un
   *  widget à plusieurs informations (graphique, liste) autorise M/L pour rester lisible. */
  allowedSizes: DashboardWidgetSize[]
  /** Sprint en cours (opérationnel, change à chaque sprint) vs vue générale du produit (tendance,
   *  historique). Détermine dans quelle zone du Dashboard le widget peut être placé. */
  scope: DashboardWidgetScope
}

export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetDef[] = [
  { id: 'kpi-done',           label: 'US terminées',            allowedSizes: ['S'], scope: 'product' },
  { id: 'kpi-velocity',       label: 'Vélocité moyenne',        allowedSizes: ['S'], scope: 'product' },
  { id: 'kpi-current-sprint', label: 'Sprint actuel',           allowedSizes: ['S'], scope: 'sprint' },
  { id: 'kpi-blockers',       label: 'Blocages actifs',         allowedSizes: ['S'], scope: 'sprint' },
  { id: 'velocity-chart',     label: 'Graphique de vélocité',   allowedSizes: ['M', 'L'], scope: 'product' },
  // Exemple donné par Julien pour justifier la taille XL : un Burndown a besoin de largeur pour
  // rester lisible jour par jour sur tout le sprint.
  { id: 'burndown-chart',     label: 'Burndown (sprint actif)', allowedSizes: ['L', 'XL'], scope: 'sprint' },
  // Exemple donné par Julien pour justifier XLP : une liste de tous les clients tient mieux en
  // hauteur (une ligne par client) qu'en largeur.
  { id: 'client-rag',         label: 'Santé clients (RAG)',     allowedSizes: ['L', 'XLP'], scope: 'product' },
  { id: 'recent-activity',    label: 'Activité récente',        allowedSizes: ['M', 'L'], scope: 'sprint' },
]

export const DASHBOARD_ZONE_LABELS: Record<DashboardWidgetScope, string> = {
  sprint: 'Sprint en cours',
  product: 'Vue produit',
}

/** Largeur/hauteur (en unités de grille `react-grid-layout`, 12 colonnes) pour chacune des 5
 *  tailles prédéfinies — chacune un multiple explicite de S (voir commentaire d'en-tête). Pas de
 *  redimensionnement libre : on choisit une taille dans ce jeu de 5, react-grid-layout se charge de
 *  replacer les autres tuiles autour (collision/compaction).
 *
 * Correctif (2026-08-03, retour Julien répété : "je ne veux en aucun cas qu'un widget soit resizé
 * si on réduit ou augmente sa zone" + "S doit être un carré, en permanence") — `DashboardWidgetGrid`
 * n'utilise plus `WidthProvider`, qui recalculait la largeur d'une colonne en fonction de la largeur
 * mesurée du conteneur (donc de la zone) à chaque rendu. Une tuile S (3 colonnes × 3 lignes)
 * n'était carrée qu'à une largeur de zone précise ; réduire/agrandir la zone changeait la largeur de
 * colonne sans toucher `DASHBOARD_ROW_HEIGHT` (fixe), donc déformait toutes les tuiles.
 *
 * Correctif du correctif (même jour) : la largeur de colonne réelle ne dépend pas que de `width` /
 * `cols` / `margin`, mais aussi de `containerPadding`, que `react-grid-layout` fait par défaut égal
 * à `margin` si on ne le précise pas (voir `ReactGridLayout.js`, `containerPadding: containerPadding
 * || margin`). Comme `containerPadding` n'était pas fourni ici, la largeur de colonne réellement
 * calculée ne valait PAS `DASHBOARD_ROW_HEIGHT` malgré la formule de `DASHBOARD_GRID_WIDTH_PX` — le
 * widget S n'était donc pas réellement carré. Fixé en passant `containerPadding={[0, 0]}` de façon
 * explicite dans `DashboardWidgetGrid.tsx`, ce qui aligne le calcul de colonne sur la formule
 * ci-dessous (`cols * unité + (cols - 1) * marge`, sans terme supplémentaire).
 *
 * Tailles cibles (2026-08-03, rectification Julien) : S = 160×160, M = 356×160, L = 356×356,
 * XL = 748×356, XL Portrait = 356×748. Résolues à partir de `taille(n unités) = n·U + (n-1)·G` :
 * S (n=3) donne 3U+2G=160, XL (n=12) donne 12U+11G=748 → G=36 (inchangé), U=88/3 (≈29,333px, non
 * entier mais un pixel CSS accepte les valeurs fractionnaires, aucune perte visuelle). Toutes les
 * autres tailles (M, L, XLP) tombent juste avec ces 2 valeurs — cohérence vérifiée sur les 5 tailles. */
export const DASHBOARD_GRID_COLS = 12
export const DASHBOARD_ROW_HEIGHT = 88 / 3 // unité de grille carrée (colonne = ligne), ≈29,333px
export const DASHBOARD_GRID_MARGIN = 36
export const DASHBOARD_GRID_WIDTH_PX =
  DASHBOARD_GRID_COLS * DASHBOARD_ROW_HEIGHT + (DASHBOARD_GRID_COLS - 1) * DASHBOARD_GRID_MARGIN
export const WIDGET_SIZE_DIMENSIONS: Record<DashboardWidgetSize, { w: number; h: number }> = {
  S:   { w: 3,  h: 3 },
  M:   { w: 6,  h: 3 },
  L:   { w: 6,  h: 6 },
  XL:  { w: 12, h: 6 },
  XLP: { w: 6,  h: 12 },
}

export interface DashboardWidgetPlacement {
  id: DashboardWidgetId
  x: number
  y: number
  size: DashboardWidgetSize
}

// Coordonnées propres à chaque zone (chaque zone a sa propre grille, sa propre origine (0,0)) —
// reprend la disposition d'avant ce chantier, réajustée aux nouvelles tailles XL/XLP (burndown-chart
// et client-rag passent des repères "M" à leurs nouvelles tailles dédiées). Valeur de repli tant
// qu'un workspace n'a pas encore personnalisé son Dashboard.
export const DEFAULT_DASHBOARD_LAYOUT: DashboardWidgetPlacement[] = [
  // Zone "Sprint en cours" — Burndown en XL (pleine largeur) sous les 2 KPI, Activité récente en L
  // en dessous.
  { id: 'kpi-current-sprint', x: 0, y: 0, size: 'S' },
  { id: 'kpi-blockers',       x: 3, y: 0, size: 'S' },
  { id: 'burndown-chart',     x: 0, y: 3, size: 'XL' },
  { id: 'recent-activity',    x: 0, y: 9, size: 'L' },
  // Zone "Vue produit" — Santé clients en XLP (portrait) à droite des 2 KPI, sur toute la hauteur ;
  // Graphique de vélocité en L en dessous des KPI.
  { id: 'kpi-done',           x: 0, y: 0, size: 'S' },
  { id: 'kpi-velocity',       x: 3, y: 0, size: 'S' },
  { id: 'client-rag',         x: 6, y: 0, size: 'XLP' },
  { id: 'velocity-chart',     x: 0, y: 3, size: 'L' },
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

export function widgetScope(id: DashboardWidgetId): DashboardWidgetScope {
  return DASHBOARD_WIDGET_CATALOG.find(w => w.id === id)?.scope ?? 'product'
}

/**
 * Nombre de lignes de grille occupées par une zone (max `y + h` parmi ses widgets) — sert
 * d'approximation de son "remplissage" pour calculer une part minimale lors du redimensionnement
 * de la séparation entre les 2 zones (voir DashboardZoneSplit.tsx). Pas une mesure DOM réelle
 * (largeur/hauteur en pixels dépend de la taille de l'écran) : juste un indicateur relatif de
 * combien de contenu chaque zone a par rapport à l'autre.
 */
export function zoneRowSpan(placements: DashboardWidgetPlacement[]): number {
  return placements.reduce((max, p) => Math.max(max, p.y + WIDGET_SIZE_DIMENSIONS[p.size].h), 0)
}
