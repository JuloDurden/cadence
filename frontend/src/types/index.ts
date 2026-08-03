import type { DashboardWidgetPlacement } from '../data/dashboardWidgets'

export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type RAG = 'R' | 'A' | 'G'
// Phase 2 (roadmap v1), sous-chantier 1 : roles specifiques Cadence, remplace l'ancien trio
// generique ADMIN/MEMBER/VIEWER — doit rester synchronise avec l'enum Prisma `Role`
// (backend/prisma/schema.prisma).
export type UserRole = 'ADMIN' | 'PO' | 'SCRUM_MASTER' | 'DEV' | 'STAKEHOLDER'
export const USER_ROLES: UserRole[] = ['ADMIN', 'PO', 'SCRUM_MASTER', 'DEV', 'STAKEHOLDER']
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  PO: 'Product Owner',
  SCRUM_MASTER: 'Scrum Master',
  DEV: 'Développeur',
  STAKEHOLDER: 'Stakeholder',
}
export type ItemType = 'story' | 'bug' | 'task' | 'spike'

/**
 * Niveau de regroupement au-dessus des items de travail (2026-07-28, Phase 1 —
 * docs/roadmap-v1.md). Un Epic et une Initiative sont structurellement la même
 * sorte de chose : un conteneur d'organisation, jamais un travail réalisable
 * lui-même (pas de SP réel, pas de sprint au même sens qu'une US) — contrairement
 * à l'ancien modèle où un Epic était un `Item` comme un autre (`type: 'epic'`).
 * `'initiative'` est extensible si un niveau supplémentaire devient utile un jour.
 */
export type HierarchyLevel = 'epic' | 'initiative'
export type BugSeverity = 'critical' | 'major' | 'minor'

export interface CheckItem { id: string; text: string; done: boolean }

export interface BDDCriterion {
  id: string
  given: string
  when: string
  then: string
}

/** @deprecated Remplacé par Note */
export interface Comment {
  id: string
  author: string
  text: string
  imageUrl?: string
  createdAt: string
  updatedAt?: string
}

export type NoteAttachmentType = 'image' | 'pdf' | 'link'

export interface NoteAttachment {
  id: string
  type: NoteAttachmentType
  name: string      // nom de fichier ou titre du lien
  url: string       // data:... base64 pour fichiers, URL pour liens
  mimeType?: string // pour images et PDF
}

export interface NoteReply {
  id: string
  text: string
  authorId?: string
  createdAt: string
  attachments: NoteAttachment[]
}

export interface Note {
  id: string
  text: string
  authorId?: string
  createdAt: string
  attachments: NoteAttachment[]
  replies: NoteReply[]
}

export type MoscowValue = 'must' | 'should' | 'could' | 'wont'
export type ScoringFramework = 'moscow' | 'wsjf' | 'rice' | 'manual'

export interface Deadline {
  date: string
  type: 'none' | 'imposed' | 'negotiable'
}

export interface WSJFScore {
  businessValue: number    // 1-10
  timeCriticality: number  // 1-10
  riskReduction: number    // 1-10
}

export interface RICEScore {
  reach: number        // users/quarter
  impact: number       // 0.25 | 0.5 | 1 | 2 | 3
  confidence: number   // 0.5 | 0.8 | 1.0
  effort: number       // person-weeks
}

export interface Item {
  id: string; key: string; desc: string; sp: number; status: string
  clientId: string; sprintId: string | null; priority: Priority
  assignees: string[]; tags: string[]
  type?: ItemType
  severity?: BugSeverity
  epicId?: string | null
  role?: string; need?: string; benefit?: string
  bdd?: string               // deprecated, use criteria
  criteria?: BDDCriterion[]
  deps?: string[]
  dor?: CheckItem[]
  dod?: CheckItem[]
  notes?: Note[]
  deadline?: Deadline
  moscow?: MoscowValue
  scoringFramework?: ScoringFramework
  wsjf?: WSJFScore
  rice?: RICEScore
  createdAt: string
}

/**
 * Nœud de regroupement (Epic ou Initiative) — Phase 1, 2026-07-28. Remplace l'ancien
 * modèle où un Epic était un `Item` (`type: 'epic'`) : les items de travail (`Item`,
 * via `epicId`) et les Epics (via `parentId`) pointent vers un `HierarchyNode`, jamais
 * vers un autre `Item`. `parentId` est générique (comme `parent` dans Jira) plutôt que
 * nommé par niveau (pas de `initiativeId` séparé) : un Epic peut avoir un `parentId`
 * pointant vers une Initiative, une Initiative n'a aujourd'hui aucun parent possible
 * (`level` au-dessus non défini), mais le champ reste générique pour rester extensible.
 *
 * Champ volontairement minimaliste par rapport à `Item` : ni rôle/besoin/bénéfice, ni
 * critères, ni DoR/DoD — ces champs n'ont pas de sens pour un conteneur d'organisation
 * (confirmé par audit du code existant, voir docs/corrections.md : aucun de ces champs
 * n'était lu nulle part pour un Epic).
 *
 * `deadline` ajouté le 2026-07-29 (retour Julien) : l'audit du sous-chantier 1 avait conclu
 * qu'aucun champ de ce type n'était lu pour un Epic — ce cas avait en fait été manqué (un
 * ancien Epic-Item portait bien une deadline propre avant la Phase 1). Décision : restaurer
 * la capacité plutôt que d'accepter la perte, voir docs/corrections.md.
 */
export interface HierarchyNode {
  id: string
  key: string                    // même convention que Item.key (ex: "FAX-007"), partage state.itemKeyCounters
  level: HierarchyLevel
  parentId: string | null        // id d'un autre HierarchyNode (niveau au-dessus), ou non rattaché
  desc: string
  clientId?: string
  sprintId?: string | null       // un Epic peut être "affiché sous" un sprint (Roadmap) — même limite de conception qu'avant, non corrigée ici
  color?: string
  icon?: string
  sp?: number                    // score arbitraire ; sinon somme des enfants — voir utils/hierarchyScore.ts
  status?: string                // ex: déclenche la cascade "Epic terminé → enfants terminés" du Backlog
  deadline?: Deadline
  notes?: Note[]
  createdAt: string
}

export interface Sprint {
  id: string; number: number; label: string
  startDate: string; endDate: string; capacity: number
  closed: boolean; active?: boolean; goal?: string; velocitySnapshot?: number
}

export interface TeamMember {
  id: string; name: string; role: string; spPerDay: number; tags: string[]
  photo?: string  // base64 data URL ou URL externe
  // Phase 2 (roadmap v1), sous-chantier 3 : compte utilisateur (User, réservé Admin de le lier
  // depuis la page Team) correspondant à ce membre — permet de savoir que "cette carte Daily
  // c'est la sienne" et de n'en autoriser l'édition qu'au compte concerné. Absent par défaut :
  // tant qu'un membre n'est pas lié, sa carte reste en lecture seule pour tout le monde (Admin
  // excepté), y compris pour lui-même une fois connecté.
  linkedUserId?: string
}

export type AbsenceType = 'Congés payés' | 'Formation' | 'Urgence' | 'Maladie' | 'Autre'

export interface Absence {
  id: string
  memberId: string
  type: AbsenceType
  title: string
  start: string  // YYYY-MM-DD
  end: string    // YYYY-MM-DD
}

export interface Contact {
  id: string; name: string; role: string; email: string; phone?: string
  // Phase 2.5 (roadmap v1), verrouillage Stakeholder — présent si ce contact est le pendant
  // client d'un compte applicatif (Stakeholder invité, voir createLinkedClientContact côté
  // backend), même principe que TeamMember.linkedUserId pour les rôles internes.
  linkedUserId?: string
}

export interface Client {
  id: string; name: string; tier: string; annualRevenue: number
  rag: RAG; color: string; prefix: string
  contacts?: Contact[]
  notes?: string
  excludeFromPlanning?: boolean  // exclure du critère "Importance client" en auto-planning
}

export interface KanbanCol {
  id: string; label: string; color: string; isDone: boolean; isDefault?: boolean
}

export interface ClientGroup {
  id: string
  name: string
  color?: string        // couleur optionnelle pour l'affichage
  clientIds: string[]   // ids des clients membres (ordonnés)
}

// ── What-if / Scenarios ───────────────────────────────────────────────────

export type ScenarioType = 'current' | 'auto' | 'manual'

/** Override des attributs d'un item réel dans un scénario (sans toucher la DB) */
export interface ScenarioItemOverride {
  itemId: string
  statusOverride?: string
  priorityOverride?: Priority
  spOverride?: number
  depsOverride?: string[]   // remplace complètement les deps de l'item
}

/** Item fictif qui n'existe que dans un scénario */
export interface VirtualItem {
  id: string                // commence par 'virt-'
  scenarioId: string
  type: ItemType
  desc: string
  sp: number
  priority: Priority
  clientId: string
  status: string
  deps?: string[]           // peut dépendre d'items réels ou d'autres items virtuels
}

/** Override de capacité pour un sprint donné dans un scénario */
export interface ScenarioCapacityOverride {
  sprintId: string
  capacity: number
  note?: string             // ex : "Jean absent 2 sem."
}

export interface ScenarioFork {
  sourceScenarioId: string
  fromSprintIndex: number   // les sprints 0..fromSprintIndex-1 sont hérités (non modifiables)
}

export interface ScenarioMerge {
  targetScenarioId: string
  atSprintIndex: number
}

/** Un slot de planification dans un scénario */
export interface ScenarioSlot {
  sprintId: string; label: string; cap: number; used: number
  assigned: (Item | VirtualItem)[]; isNew: boolean; number: number
  startDate?: string; endDate?: string
  usedItems?: Item[]   // items already done — shown with ✓ badge, not placed by algo
}

export interface ScenarioViolation {
  key: string; desc: string; detail: string; type: 'deadline' | 'dep'
}

export interface Scenario {
  id: string
  name: string
  color: string             // couleur de la lane dans le graph
  type: ScenarioType

  // Critères (pour les scénarios 'auto')
  criteriaActive: Record<string, boolean>   // critId → active
  criteriaOrder: string[]                   // ordre des critères
  clientOrder: string[]                     // ordre des clients pour critère 'client'

  // Modifications d'items
  itemOverrides: ScenarioItemOverride[]
  virtualItems: VirtualItem[]

  // Modifications de capacité
  capacityOverrides: ScenarioCapacityOverride[]
  velocityFactor: number                    // 1.0 = normal, 0.8 = 80%

  // Relations entre scénarios
  forkFrom?: ScenarioFork
  mergeInto?: ScenarioMerge

  // Résultat généré
  slots: ScenarioSlot[]
  violations: ScenarioViolation[]
  newCount: number
  generated: boolean
  locked: boolean                           // sprints hérités (avant fork) sont locked
}

export interface Settings {
  sprintDuration: number; defaultCapacity: number; theme: 'light' | 'dark'
  // Phase 3 (roadmap v1), Mode présentation, chantier "Config pages présentables" (2026-08-02) —
  // ids ordonnés (voir data/presentablePages.ts, PresentablePageId) des pages choisies par un
  // Admin/PO pour le mode présentation, dans l'ordre d'affichage voulu. Absent = comportement
  // d'origine (DEFAULT_PRESENTATION_PAGE_IDS), pour rester compatible avec un WorkspaceState
  // existant qui n'a jamais eu ce champ.
  presentationPages?: string[]
  // Phase 4 (roadmap v1), Dashboard widgets (2026-08-03) — placement libre sur grille des widgets
  // du Dashboard (voir data/dashboardWidgets.ts, DashboardWidgetPlacement). Absent = disposition
  // d'origine (DEFAULT_DASHBOARD_LAYOUT), pour rester compatible avec un WorkspaceState existant
  // qui n'a jamais eu ce champ.
  dashboardWidgets?: DashboardWidgetPlacement[]
  // Phase 4 (roadmap v1), Dashboard widgets, suite (2026-08-03) — orientation et partage de l'espace
  // entre les 2 zones du Dashboard (Sprint en cours / Vue produit, voir DashboardZoneSplit.tsx).
  // `dashboardZoneSplit` : part (0-100) allouée à la zone "Sprint en cours" (1re zone). Absents =
  // valeurs par défaut ('horizontal', 50).
  dashboardZoneOrientation?: 'horizontal' | 'vertical'
  dashboardZoneSplit?: number
}

export interface RoadmapGoal {
  id: string; sprintId: string; icon: string; color: string
  name: string; goal: string; metrics: string[]
}

export interface DailyArchive {
  id: string
  date: string           // YYYY-MM-DD
  sprintId?: string
  sprintLabel?: string   // e.g. "Sprint 2 - MODERNISATION"
  entries: DailyEntry[]
  createdAt: string      // ISO timestamp
}

export type NNLZone     = 'now' | 'next' | 'later'
export type NNLItemType = 'feature' | 'release'
export type NNLTool     = 'select' | 'rect' | 'ellipse' | 'frame' | 'arrow' | 'text' | 'pen' | 'marker' | 'eraser'
export type NNLShapeType = 'rect' | 'ellipse' | 'arrow' | 'polygon'

export interface NNLItem {
  id:    string
  type:  NNLItemType
  text:  string           // titre (1 ligne)
  body?: string           // corps / description
  color?: string          // couleur hex libre (ex: '#fbbf24')
  x:     number           // coord monde X
  y:     number           // coord monde Y (inversé vs écran)
  zone:  NNLZone
  w?:    number
  h?:    number
  image?: string          // base64 data URL
  link?:  { url: string; label: string }
  notes?: Note[]
  linkedItemId?: string   // id d'un item Cadence lié
  layerId?: string
}

/** Forme géométrique sur le canvas NNL */
export interface NNLShape {
  id:       string
  shapeType: NNLShapeType
  x:  number; y:  number   // coin haut-gauche, coords monde
  x2: number; y2: number   // coin bas-droite, coords monde (arrow: point d'arrivée)
  fill?:        string      // couleur de remplissage ('none' = transparent)
  fillOpacity?:   number    // 0-1 (défaut 1)
  stroke?:      string      // couleur de contour ('none' = pas de contour)
  strokeOpacity?: number    // 0-1 (défaut 1)
  opacity?:       number    // 0-1 opacité globale de la forme (défaut 1)
  strokeWidth?: number
  rx?:          number      // rayon des coins (rect uniquement)
  pts?: Array<{ x: number; y: number }>  // points de contrôle bezier (flèche uniquement)
  polyPts?: Array<{ x: number; y: number }>  // polygone arbitraire (boolean ops)
  rotation?: number         // degrés (centre de la bounding box)
  layerId?: string
  shapeGroupId?: string     // groupe de formes (v0.90.5)
}

/** Bloc de texte libre positionnable */
export interface NNLText {
  id: string
  x:  number; y: number    // coin haut-gauche, coords monde
  w:  number               // largeur monde
  content: string
  fontSize?:  number
  fontFamily?: string
  color?:     string
  colorOpacity?: number    // 0-1 (défaut 1)
  bold?:      boolean
  italic?:    boolean
  underline?: boolean
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  rotation?: number        // degrés
  layerId?: string
  shapeGroupId?: string    // groupe de formes (v0.90.5)
}

/** Tracé libre (stylo / marqueur) */
export interface NNLStroke {
  id:      string
  pts:     Array<{ x: number; y: number }>   // coords monde
  color?:  string
  width?:  number
  opacity?: number   // 1 = stylo, 0.5 = marqueur
  rotation?: number  // degrés (rotation du tracé autour de son centroïde)
  layerId?: string
  shapeGroupId?: string  // groupe de formes (v0.90.5)
}

/** Calque du canvas NNL */
export interface NNLLayer {
  id:           string
  name:         string
  locked?:      boolean
  visible?:     boolean
  order:        number      // 0 = le plus en arrière
  isGroup?:     boolean     // calque de type dossier
  parentId?:    string      // groupe parent (isGroup=true)
  collapsed?:   boolean     // groupe replié
  autoCreated?: boolean     // créé automatiquement lors du dessin d'une forme (v0.91)
  shapeType?:   string      // type de forme associé (pour le regroupement par type)
}

/**
 * Cadre de regroupement Epic/Initiative sur le canevas NNL (Phase 1, sous-chantier 6,
 * 2026-07-29 — décisions prises avec Julien) : objet libre façon Frame Miro/FigJam, dessiné,
 * déplacé et redimensionné comme une forme, lié à un `HierarchyNode` existant (Epic ou
 * Initiative).
 *
 * L'appartenance d'un `NNLItem` (post-it) à un cadre n'est volontairement PAS stockée ici :
 * elle se calcule par containment géométrique (centre x/y du post-it dans les limites du
 * cadre, voir `utils/nnlFrames.ts`) au moment du rendu et des synchronisations Backlog ↔ NNL.
 * Un champ mémorisé sur le post-it risquerait de diverger s'il est déplacé sans que ce champ
 * suive — le même genre de divergence que le bug de calcul SP déjà rencontré et corrigé une
 * fois dans ce projet (voir `docs/corrections.md`, sous-chantier 2).
 *
 * Un cadre Epic dessiné à l'intérieur d'un cadre Initiative donne l'imbrication à 2 niveaux —
 * uniquement par containment géométrique elle aussi, `NNLFrame` n'a pas de `parentId` propre.
 *
 * Tout post-it peut rejoindre un cadre visuellement (containment), qu'il soit lié ou non à un
 * item du Backlog (décision Julien, 2026-07-29) — seul un post-it avec `linkedItemId` déclenche
 * la synchronisation réelle de l'`epicId` de l'item lié.
 *
 * `x`/`y` et `x2`/`y2` : deux coins opposés en coordonnées monde, comme `NNLShape` (pas
 * garanti "haut-gauche"/"bas-droite" — un redimensionnement peut inverser les coins ; les
 * bornes réelles se recalculent via `Math.min`/`Math.max`, voir `frameBounds()` dans
 * `utils/nnlFrames.ts`) — revu ainsi (2026-07-29, pendant l'implémentation du rendu) plutôt que
 * le `x`/`y`/`w`/`h` du tout premier passage, pour rester cohérent avec la convention déjà en
 * place sur les formes et éviter toute ambiguïté "haut-gauche" alors que l'axe Y du monde est
 * inversé par rapport à l'écran.
 */
export interface NNLFrame {
  id:              string
  level:           HierarchyLevel
  hierarchyNodeId: string   // id du HierarchyNode (Epic ou Initiative) lié
  x: number; y: number      // premier coin, coords monde
  x2: number; y2: number    // coin opposé, coords monde
  layerId?: string
  /** Couleur de contour/étiquette personnalisée (point 3.5, 2026-07-29) — remplace la couleur
   *  par défaut du niveau (FRAME_COLOR dans NNLCanvas.tsx) si définie. */
  color?: string
}

export interface VisionBoard {
  productName:   string
  vision:        string
  targetGroup:   string
  needs:         string
  product:       string
  businessGoals: string
}

export interface CadenceState {
  sprints: Sprint[]; items: Item[]; hierarchyNodes: HierarchyNode[]; team: TeamMember[]
  clients: Client[]; kanbanCols: KanbanCol[]; settings: Settings
  dailyEntries: DailyEntry[]; retroSessions: RetroSession[]
  history: HistoryEntry[]; roadmap: RoadmapGoal[]
  customTags: string[]   // tags créés par les utilisateurs (hors BASE_TAGS)
  // Phase 2 (roadmap v1), sous-chantier 2 : tags de base retirés des suggestions (Réglages,
  // ItemModal, TeamPage) par un Admin — ne supprime pas le tag des items qui l'ont déjà, même
  // logique que la suppression d'un tag personnalisé (SET_CUSTOM_TAGS) aujourd'hui.
  removedBaseTags?: string[]
  absences: Absence[]
  dailyArchives: DailyArchive[]
  retroArchives: RetroArchive[]
  clientGroups: ClientGroup[]
  visionBoard: VisionBoard
  nnlItems:   NNLItem[]
  nnlShapes:  NNLShape[]
  nnlTexts:   NNLText[]
  nnlStrokes: NNLStroke[]
  nnlLayers:  NNLLayer[]
  nnlFrames:  NNLFrame[]  // cadres de regroupement Epic/Initiative (Phase 1, sous-chantier 6)
  sprintReviewSessions: SprintReviewSession[]
  sprintReviewArchives: SprintReviewArchive[]
  /** Dernier numéro attribué par préfixe de clé d'item — ne redescend jamais, même après suppression. */
  itemKeyCounters?: Record<string, number>
}

export interface DailyEntry {
  memberId: string; date: string; yesterday: string; today: string; blockers: string
}

export type RetroFormat = 'start-stop-continue' | 'mad-sad-glad' | '4ls'

export interface RetroItem {
  id: string; text: string; votes: string[]; dislikes: string[]
  authorId?: string
  /** Nom affiché de l'auteur, capturé à la création — aucune liste de tous les comptes
   *  n'est disponible côté frontend pour résoudre `authorId` après coup (voir Chantier J). */
  authorName?: string
}

export interface RetroArchive {
  id: string
  date: string           // YYYY-MM-DD
  sprintId?: string
  sprintLabel?: string
  format: RetroFormat
  columns: Record<string, RetroItem[]>
  actions: RetroAction[]
  createdAt: string
}

export interface RetroAction {
  id: string; text: string; ownerId: string; dueDate?: string; done: boolean
}

export interface RetroSession {
  id: string; sprintId: string; format: RetroFormat
  columns: Record<string, RetroItem[]>; actions: RetroAction[]; date: string
  // Phase 2 (roadmap v1), sous-chantier 3 : masque le highlight "vous avez déjà voté" (J'aime/Je
  // n'aime pas) pour tous les participants, réglage de session activable par le Scrum Master (+
  // Admin) — voir RetroPage.tsx/RetroColumnCard.tsx. Le vote lui-même n'est jamais bloqué, seul
  // l'indicateur visuel de son propre vote est masqué.
  anonymousVotes?: boolean
}

export type HistoryEventType =
  | 'item_create' | 'item_edit' | 'item_delete' | 'item_status'
  | 'sprint_add' | 'sprint_activate' | 'undo' | 'other'
  // Rattachement / dissociation d'un post-it Vision/NNL à un item réel du Backlog (Chantier B, tranche Vision/NNL)
  | 'item_link' | 'item_unlink'
  // Clôture / réouverture d'un sprint (Chantier B, tranche Roadmap/Release Planning) — l'activation utilise 'sprint_activate' déjà existant
  | 'sprint_close' | 'sprint_reopen'
  // Application d'un scénario what-if Auto-planning sur l'état réel (Chantier B, tranche Auto-planning)
  | 'scenario_apply'
  // Changement des assignés d'un item (Sprint Planning) / changement de sprint d'un item par glisser-déposer (Release Planning) — Chantier B, tranche Sprint Planning
  | 'item_assignee' | 'item_sprint_change'
  // Archivage d'une session (Daily / Sprint Review / Rétrospective) — Chantier B, tranches Daily/Sprint Review/Retrospective
  | 'daily_archive' | 'sprint_review_archive' | 'retro_archive'
  // Suppression d'un sprint vide, non actif, non clôturé (Roadmap / Release Planning)
  | 'sprint_delete'
  // CRUD d'un nœud de regroupement (Epic/Initiative) — Phase 1, 2026-07-28 (voir HierarchyNode)
  | 'hierarchy_node_create' | 'hierarchy_node_edit' | 'hierarchy_node_delete'
  // Changement d'epicId d'un item déclenché par le déplacement de son post-it lié dans/hors
  // d'un cadre NNL — Phase 1, sous-chantier 6, point 4 (2026-07-30). Un seul type couvrant
  // rattachement/ré-attachement/détachement, `detail` précise le cas — même principe que
  // `item_sprint_change` pour un changement de rattachement analogue.
  | 'item_epic_change'

export interface HistoryEntry {
  id: string; type: HistoryEventType; timestamp: string
  sprintId?: string; itemKey?: string; itemDesc?: string
  author?: string; detail?: string; from?: string; to?: string
}

export interface AuthUser {
  id: string; email: string; name: string; role: UserRole
}

// Phase 2 (roadmap v1), sous-chantier 1 : compte tel que renvoyé par /api/users (gestion des
// utilisateurs, réservée Admin) — même forme qu'AuthUser, plus la date de création.
export interface ManagedUser extends AuthUser {
  createdAt: string
}

// Phase 2.5 (roadmap v1), Onboarding — lien d'invitation Stakeholder généré par un Admin (voir
// /api/invitations, UsersSettingsSection.tsx). `usedAt` null tant que le lien n'a pas été
// complété (POST /api/auth/accept-invite).
export interface Invitation {
  id: string
  token: string
  createdBy: string
  usedAt: string | null
  createdAt: string
  // Client auquel le futur Stakeholder sera rattaché comme Contact (voir accept-invite côté
  // backend). Optionnel/nullable uniquement pour rester compatible avec une invitation créée
  // avant ce champ (aucune en pratique, la seule existante est déjà utilisée) — toute nouvelle
  // invitation en a toujours un (requis côté API, voir services/api.ts createInvitation).
  clientId: string | null
}

// Phase 3 (roadmap v1), Mode présentation — lien de partage public (sans authentification), voir
// backend/src/routes/presentation.ts. Contrairement à Invitation, pas de `usedAt` : réutilisable,
// pas à usage unique. Un seul lien actif à la fois dans ce prototype.
export interface PresentationLink {
  id: string
  token: string
  createdBy: string
  createdAt: string
}

// ── Sprint Review ─────────────────────────────────────────────────────────────

export type SRBadge = 'accepted' | 'refused' | 'pending'
export type SRUnfinishedDecision = 'report' | 'cancel' | 'resize'
export type SRDecisionType = 'new-item' | 'reprioritize'

/** Enregistrement PO local par item livré (non stocké sur Item) */
export interface SRItemRecord {
  itemId: string
  badge: SRBadge
  toDemo: boolean   // badge "À démontrer"
  note: string      // note PO libre
}

/** Item non terminé du sprint */
export interface SRUnfinishedRecord {
  itemId: string
  reason: string
  decision: SRUnfinishedDecision
  /** true une fois que `decision` a réellement été appliquée à l'item (Chantier G) —
   *  distingue un simple choix dans la liste déroulante d'une action effectivement
   *  dispatchée sur l'item réel. Sert de garde-fou à closeSprint() : un item non
   *  terminé sans décision appliquée bloque la clôture du sprint plutôt que d'être
   *  silencieusement ignoré. */
  applied?: boolean
  /** Sprint cible choisi si decision === 'report' (undefined = "Plus tard", non planifié). */
  resolvedSprintId?: string | null
}

/** Décision backlog issue de la revue */
export interface SRDecision {
  id: string
  type: SRDecisionType
  desc: string       // description libre ou item existant ciblé
  sp?: number        // pour new-item
  itemId?: string    // pour reprioritize : référence l'item existant
  applied?: boolean  // true si l'item a déjà été créé / modifié dans le Backlog
}

/** Participant externe (ni équipe ni contact client) ajouté manuellement */
export interface SROtherParticipant {
  id: string
  text: string  // "Nom" ou "Nom (Rôle)"
}

/** Note globale de la Sprint Review (peut être liée à un item) */
export interface SRNote {
  id: string
  text: string
  linkedItemId?: string  // lien optionnel à un item du backlog
  createdAt: string
}

export interface SprintReviewSession {
  id: string
  sprintId: string
  date: string                      // YYYY-MM-DD
  participantIds: string[]          // IDs depuis state.team (membres équipe)
  participantContactIds: string[]   // IDs contacts clients (Contact.id)
  participantsOther: SROtherParticipant[]  // participants externes (libre)
  notes: SRNote[]                   // notes globales (multiples)
  itemRecords: SRItemRecord[]
  unfinishedRecords: SRUnfinishedRecord[]
  decisions: SRDecision[]
}

export interface SprintReviewArchive {
  id: string
  sprintId?: string
  sprintLabel?: string
  date: string
  participantIds: string[]
  participantContactIds: string[]
  participantsOther: SROtherParticipant[]
  notes: SRNote[]
  itemRecords: SRItemRecord[]
  unfinishedRecords: SRUnfinishedRecord[]
  decisions: SRDecision[]
  createdAt: string
}
