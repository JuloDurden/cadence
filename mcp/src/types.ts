// Sous-ensemble de CadenceState (frontend/src/types/index.ts) nécessaire aux outils de lecture de
// ce serveur MCP, DUPLIQUÉ à dessein plutôt qu'importé (même convention que
// frontend/src/utils/excelBacklog.ts, qui duplique déjà `nextKeyForPrefix`/TYPE_LABEL depuis
// ItemModal.tsx) : ce package est un module Node ESM autonome, packagé et versionné
// indépendamment du frontend, pas une brique du même bundle Vite. Seuls les champs réellement
// consommés par tools.ts sont repris ; à tenir manuellement à jour si un champ utilisé ici change
// de forme côté app (Phase 1 hiérarchie, Phase 2 rôles... ce fichier ne les revit pas seul).

export interface Item {
  id: string; key: string; desc: string; sp: number; status: string
  clientId: string; sprintId: string | null; priority: string
  assignees: string[]; tags: string[]
  type?: string
  epicId?: string | null
  role?: string; need?: string; benefit?: string
  criteria?: { given: string; when: string; then: string }[]
  deps?: string[]
  createdAt: string
}

export interface HierarchyNode {
  id: string; key: string; level: string; parentId: string | null; desc: string
  clientId?: string; sprintId?: string | null; sp?: number; status?: string
}

export interface Sprint {
  id: string; number: number; label: string
  startDate: string; endDate: string; capacity: number
  closed: boolean; active?: boolean; goal?: string
}

export interface TeamMember {
  id: string; name: string; role: string; spPerDay: number; tags: string[]
}

export interface Client {
  id: string; name: string; tier: string; annualRevenue: number
  rag: string; prefix: string
}

export interface KanbanCol {
  id: string; label: string; isDone: boolean; isDefault?: boolean
}

export interface CadenceState {
  items: Item[]
  hierarchyNodes: HierarchyNode[]
  sprints: Sprint[]
  team: TeamMember[]
  clients: Client[]
  kanbanCols: KanbanCol[]
}
