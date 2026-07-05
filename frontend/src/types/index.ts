export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type RAG = 'R' | 'A' | 'G'
export type UserRole = 'ADMIN' | 'MEMBER' | 'VIEWER'
export type ItemType = 'story' | 'epic' | 'bug' | 'task' | 'spike'
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

export interface Sprint {
  id: string; number: number; label: string
  startDate: string; endDate: string; capacity: number
  closed: boolean; active?: boolean; goal?: string; velocitySnapshot?: number
}

export interface TeamMember {
  id: string; name: string; role: string; spPerDay: number; tags: string[]
  photo?: string  // base64 data URL ou URL externe
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

export interface CadenceState {
  sprints: Sprint[]; items: Item[]; team: TeamMember[]
  clients: Client[]; kanbanCols: KanbanCol[]; settings: Settings
  dailyEntries: DailyEntry[]; retroSessions: RetroSession[]
  history: HistoryEntry[]; roadmap: RoadmapGoal[]
  customTags: string[]   // tags créés par les utilisateurs (hors BASE_TAGS)
  absences: Absence[]
  dailyArchives: DailyArchive[]
  retroArchives: RetroArchive[]
}

export interface DailyEntry {
  memberId: string; date: string; yesterday: string; today: string; blockers: string
}

export type RetroFormat = 'start-stop-continue' | 'mad-sad-glad' | '4ls'

export interface RetroItem {
  id: string; text: string; votes: string[]; dislikes: string[]; authorId?: string
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
}

export type HistoryEventType =
  | 'item_create' | 'item_edit' | 'item_delete' | 'item_status'
  | 'sprint_add' | 'sprint_activate' | 'undo' | 'other'

export interface HistoryEntry {
  id: string; type: HistoryEventType; timestamp: string
  sprintId?: string; itemKey?: string; itemDesc?: string
  author?: string; detail?: string; from?: string; to?: string
}

export interface AuthUser {
  id: string; email: string; name: string; role: UserRole
}
