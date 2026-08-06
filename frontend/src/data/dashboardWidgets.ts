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
  // XL ajouté (2026-08-06) en plus de M/L : même hauteur que L (seule la largeur change entre L et
  // XL, voir WIDGET_SIZE_DIMENSIONS), le graphique s'adapte via `compact` dans VelocityChart.tsx —
  // pas de 3e palier de hauteur à gérer, seulement M (compact) vs L/XL (détaillé, graduations SP).
  { id: 'velocity-chart',     label: 'Graphique de vélocité',   allowedSizes: ['M', 'L', 'XL'], scope: 'product' },
  // Exemple donné par Julien pour justifier la taille XL : un Burndown a besoin de largeur pour
  // rester lisible jour par jour sur tout le sprint.
  { id: 'burndown-chart',     label: 'Burndown (sprint actif)', allowedSizes: ['L', 'XL'], scope: 'sprint' },
  // Exemple donné par Julien pour justifier XLP : une liste de tous les clients tient mieux en
  // hauteur (une ligne par client) qu'en largeur.
  // M ajouté (2026-08-06) en plus de L/XLP : les réglages `clientRagIndicator`/`clientRagScope`
  // (voir plus bas) permettent un affichage suffisamment compact pour tenir en M — un client peut
  // ne pas être traité dans le sprint en cours, ce qui raccourcit encore la liste en scope 'sprint'.
  { id: 'client-rag',         label: 'Santé clients (RAG)',     allowedSizes: ['M', 'L', 'XL', 'XLP'], scope: 'product' },
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

/** Réglage de face cachée du widget "Sprint actuel" (2026-08-04, retour Julien) — quelle métrique
 *  est mise en avant en grand sur la face visible : le nombre de SP fait ('sp', défaut) ou le
 *  pourcentage de complétion ('percent'). Voir SprintProgressCard.tsx et FlipCard.tsx. Champ
 *  optionnel et propre à ce widget pour l'instant (pas de bag générique tant qu'un 2e widget n'a pas
 *  besoin d'un réglage similaire — voir le commentaire d'en-tête de FlipCard.tsx). */
export type SprintCardEmphasis = 'sp' | 'percent'

/** Réglages de face cachée du widget "Graphique de vélocité" (2026-08-06) — voir VelocityChart.tsx
 *  et FlipCard.tsx :
 *  - `velocityShowPlanned` : affiche les barres "Planifié" en plus de "Vélocité", ou "Vélocité"
 *    seule. `true` par défaut (comportement historique, avant ce réglage).
 *  - `velocityShowTrend` : courbe de progression (ligne reliant la vélocité de chaque sprint) en
 *    plus des barres, activable/désactivable indépendamment de `velocityShowPlanned`. `false` par
 *    défaut (nouvel ajout, pas de changement du rendu existant tant qu'on ne l'active pas). */
export interface DashboardWidgetPlacement {
  /** Identifiant unique de CETTE tuile (2026-08-06, retour Julien : "possibilité de rajouter
   *  plusieurs fois des widgets") — distinct de `id`, qui reste le TYPE de widget (partagé par
   *  toutes les instances de ce type). Avant ce champ, `id` servait à la fois de type et de clé
   *  unique de placement (clé React/react-grid-layout, recherche de réglages...) : un widget ne
   *  pouvait donc exister qu'une seule fois sur tout le Dashboard. `key` devient la seule clé
   *  d'identification d'un placement ; `id` ne sert plus qu'à savoir QUEL composant/catalogue
   *  utiliser. Généré à l'ajout (`${id}-${uid()}`, voir `addWidget` dans DashboardWidgetGrid.tsx).
   *  Les layouts déjà persistés (sans ce champ) sont migrés à la volée par
   *  `resolveDashboardLayout()`, qui reprend `id` comme `key` — sûr car ces layouts n'ont jamais
   *  eu de doublon possible avant ce chantier. */
  key: string
  id: DashboardWidgetId
  x: number
  y: number
  size: DashboardWidgetSize
  /** Zone effective d'un placement, quand elle diffère du défaut du catalogue (voir
   *  `placementScope()` plus bas) — `undefined` = la zone suit le défaut du catalogue
   *  (`DASHBOARD_WIDGET_CATALOG[].scope`, comportement historique). Par placement, pas par type :
   *  2 instances du même widget peuvent être chacune dans une zone différente, c'est tout l'intérêt
   *  de pouvoir les dupliquer.
   *
   *  Réglé de 2 façons (2026-08-06, retour Julien) :
   *  1. Explicitement, en choisissant la zone cible dans la modal d'ajout d'un widget (voir
   *     AddWidgetModal.tsx) — seul moyen de placer un widget dans une zone qui n'est pas la sienne
   *     par défaut.
   *  2. Automatiquement pour Santé clients (RAG) uniquement, quand son réglage "périmètre"
   *     (`clientRagScope`) change — ses valeurs 'product'/'sprint' correspondent déjà exactement
   *     aux zones du Dashboard (retour Julien : "je voyais le changement de zone automatique dès
   *     qu'on changeait le périmètre du widget via ses réglages", pas de bouton dédié). Pas
   *     généralisé aux autres widgets : aucun autre réglage actuel n'a cette même correspondance
   *     1:1 avec les 2 zones (voir DashboardPage.tsx, cas 'client-rag'). */
  scopeOverride?: DashboardWidgetScope
  emphasis?: SprintCardEmphasis
  velocityShowPlanned?: boolean
  velocityShowTrend?: boolean
  burndownMode?: BurndownDisplayMode
  burndownShowToday?: boolean
  blockersScope?: BlockersScope
  doneItemsDisplay?: DoneItemsDisplay
  velocityWindow?: VelocityWindow
  clientRagIndicator?: ClientRagIndicator
  clientRagScope?: ClientRagScope
  recentActivityWindow?: RecentActivityWindow
}

/** Réglages de face cachée du widget "Burndown" (2026-08-06) — voir BurndownChart.tsx et
 *  FlipCard.tsx :
 *  - `burndownMode` : 'remaining' (SP restants, décroissant vers 0 — comportement historique,
 *    défaut) ou 'done' (burnup, SP terminés, croissant vers le total). Même trajectoire de données,
 *    juste retournée (`totalSP - valeur`) plutôt que recalculée.
 *  - `burndownShowToday` : repère vertical sur le jour courant du sprint, désactivé par défaut. */
export type BurndownDisplayMode = 'remaining' | 'done'

/** Réglages de face cachée des 3 widgets KPI simples (2026-08-06) — voir BlockersCard.tsx,
 *  DoneItemsCard.tsx, AvgVelocityCard.tsx et FlipCard.tsx :
 *  - `blockersScope` : 'today' (blocages du jour — comportement historique, défaut) ou 'sprint'
 *    (blocages sur tout le sprint en cours, de son début à aujourd'hui). Même logique de comptage
 *    (nombre d'entrées de Daily avec un champ "blocages" renseigné, pas de membres uniques) dans
 *    les 2 cas, seule la fenêtre de dates change.
 *  - `doneItemsDisplay` : 'count' (nombre d'US terminées — comportement historique, défaut) ou
 *    'percent' (pourcentage du total produit).
 *  - `velocityWindow` : 'all' (moyenne sur tous les sprints clôturés — comportement historique,
 *    défaut) ou 'last3' (moyenne glissante sur les 3 derniers sprints clôturés, plus représentative
 *    d'une tendance récente). */
export type BlockersScope = 'today' | 'sprint'
export type DoneItemsDisplay = 'count' | 'percent'
export type VelocityWindow = 'all' | 'last3'

/** Réglages de face cachée du widget "Santé clients (RAG)" (2026-08-06) — voir ClientRAG.tsx et
 *  FlipCard.tsx :
 *  - `clientRagIndicator` : 'gauge' (ligne complète, ventilée US directes + une ligne par Epic —
 *    comportement par défaut) ou 'dot' (ligne compacte, pastille + nom + libellé RAG seulement,
 *    sans ventilation). Indépendant de la taille du widget — permet de voir plus de clients sans
 *    défilement à taille égale.
 *  - `clientRagScope` : 'product' (US du client sur l'ensemble du produit, tous sprints confondus —
 *    comportement historique, défaut) ou 'sprint' (US du client dans le sprint en cours uniquement).
 *    Un client sans US dans le sprint en cours est exclu de la liste (retour Julien : "si on ne
 *    traite pas un client sur un sprint, on ne l'affiche pas"), pas affiché en grisé.
 *  Ventilation Initiative>Epic>Item (retour Julien, 2026-08-06) : les US d'un client peuvent
 *  appartenir à un Epic ou être directes — comptées séparément plutôt que mélangées dans un seul
 *  pourcentage. Un Epic assigné au client mais pas encore découpé en US reste visible ("Pas encore
 *  découpé en US") en scope 'product' — voir le commentaire d'en-tête de ClientRAG.tsx pour le
 *  détail des règles.
 *  Taille XL (2 S de plus en largeur que L, même hauteur) affichée en 2 colonnes plutôt qu'une
 *  liste étirée, pour profiter de la largeur supplémentaire. */
export type ClientRagIndicator = 'gauge' | 'dot'
export type ClientRagScope = 'product' | 'sprint'

/** Réglage de face cachée du widget "Activité récente" (2026-08-06) — voir RecentActivity.tsx et
 *  FlipCard.tsx. Granularité temporelle du flux de Dailies affiché :
 *  - '2h'    : 2 dernières heures. `DailyEntry` ne porte qu'une date (pas d'horodatage précis) —
 *    tant qu'un vrai journal d'activité horodaté n'existe pas, cette option se comporte comme
 *    'today' (fenêtre la plus étroite possible avec les données actuelles).
 *  - 'today' : aujourd'hui uniquement (comportement par défaut).
 *  - 'week'  : 7 derniers jours glissants (aujourd'hui inclus), pas la semaine calendaire — plus
 *    simple, aucune notion de "début de semaine" ailleurs dans le projet à réutiliser.
 *  - 'sprint': du 1er jour du sprint en cours à aujourd'hui, même fenêtre que `blockersScope`
 *    'sprint'. Vide (avec message dédié) si aucun sprint actif.
 *  Toujours limité aux 8 entrées les plus récentes dans la fenêtre choisie, comme avant ce réglage. */
export type RecentActivityWindow = '2h' | 'today' | 'week' | 'sprint'

// Coordonnées propres à chaque zone (chaque zone a sa propre grille, sa propre origine (0,0)) —
// reprend la disposition d'avant ce chantier, réajustée aux nouvelles tailles XL/XLP (burndown-chart
// et client-rag passent des repères "M" à leurs nouvelles tailles dédiées). Valeur de repli tant
// qu'un workspace n'a pas encore personnalisé son Dashboard.
// `key` = `id` pour chaque entrée par défaut : jamais de doublon possible ici (une seule instance
// de chaque widget), donc pas besoin d'un suffixe généré comme pour un ajout manuel.
export const DEFAULT_DASHBOARD_LAYOUT: DashboardWidgetPlacement[] = [
  // Zone "Sprint en cours" — Burndown en XL (pleine largeur) sous les 2 KPI, Activité récente en L
  // en dessous.
  { key: 'kpi-current-sprint', id: 'kpi-current-sprint', x: 0, y: 0, size: 'S' },
  { key: 'kpi-blockers',       id: 'kpi-blockers',       x: 3, y: 0, size: 'S' },
  { key: 'burndown-chart',     id: 'burndown-chart',     x: 0, y: 3, size: 'XL' },
  { key: 'recent-activity',    id: 'recent-activity',    x: 0, y: 9, size: 'L' },
  // Zone "Vue produit" — Santé clients en XLP (portrait) à droite des 2 KPI, sur toute la hauteur ;
  // Graphique de vélocité en L en dessous des KPI.
  { key: 'kpi-done',           id: 'kpi-done',           x: 0, y: 0, size: 'S' },
  { key: 'kpi-velocity',       id: 'kpi-velocity',       x: 3, y: 0, size: 'S' },
  { key: 'client-rag',         id: 'client-rag',         x: 6, y: 0, size: 'XLP' },
  { key: 'velocity-chart',     id: 'velocity-chart',     x: 0, y: 3, size: 'L' },
]

/**
 * Résout une disposition sauvegardée (`state.settings.dashboardWidgets`) en repli sur la
 * disposition par défaut si absente/vide, et filtre tout id de widget devenu inconnu (catalogue
 * modifié depuis) plutôt que de planter — même principe que `resolvePresentationPages`.
 */
export function resolveDashboardLayout(saved: DashboardWidgetPlacement[] | undefined): DashboardWidgetPlacement[] {
  const source = saved && saved.length > 0 ? saved : DEFAULT_DASHBOARD_LAYOUT
  const resolved = source
    .filter(p => DASHBOARD_WIDGET_CATALOG.some(w => w.id === p.id))
    // Migration à la volée (2026-08-06, ajout de `key`) : un layout persisté avant ce chantier n'a
    // pas ce champ — sûr de reprendre `id` comme `key` ici, ces layouts n'ont jamais eu de doublon
    // possible (voir le commentaire de `DashboardWidgetPlacement.key`).
    .map(p => p.key ? p : { ...p, key: p.id })
  return resolved.length > 0 ? resolved : DEFAULT_DASHBOARD_LAYOUT
}

export function widgetScope(id: DashboardWidgetId): DashboardWidgetScope {
  return DASHBOARD_WIDGET_CATALOG.find(w => w.id === id)?.scope ?? 'product'
}

/** Zone EFFECTIVE d'un placement (2026-08-06, voir `DashboardWidgetPlacement.scopeOverride`) — la
 *  bascule manuelle prime sur le défaut du catalogue si elle est réglée. À utiliser partout où l'on
 *  répartit des placements par zone (DashboardZoneSplit.tsx) — `widgetScope()` reste utile pour
 *  connaître le défaut d'un TYPE de widget (ex. le panneau "+ Ajouter un widget", qui raisonne par
 *  type, pas par placement existant). */
export function placementScope(p: DashboardWidgetPlacement): DashboardWidgetScope {
  return p.scopeOverride ?? widgetScope(p.id)
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
