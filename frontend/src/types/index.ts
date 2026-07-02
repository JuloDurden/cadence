export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type RAG = 'R' | 'A' | 'G'
export type UserRole = 'ADMIN' | 'MEMBER' | 'VIEWER'

export interface CheckItem { id: string; text: string; done: boolean }

export interface Item {
  id: string; key: string; desc: string; sp: number; status: string
  clientId: string; sprintId: string | null; priority: Priority
  assignees: string[]; tags: string[]
  role?: string; need?: string; benefit?: string; bdd?: string
  deps?: string[]; dor?: CheckItem[]; dod?: CheckItem[]
  notes?: string; deadline?: string; createdAt: string
}

export interface Sprint {
  id: string; number: number; label: string
  startDate: string; endDate: string; capacity: number
  closed: boolean; goal?: string; velocitySnapshot?: number
}

export interface TeamMember {
  id: string; name: string; role: string; spPerDay: number; tags: string[]
}

export interface Contact {
  id: string
  name: string
  role: string
  email: string
  phone?: string
}

export interface Client {
  id: string; name: string; tier: string; annualRevenue: number
  rag: RAG; color: string; prefix: string
  contacts?: Contact[]
  notes?: string
}

export interface KanbanCol {
  id: string; label: string; color: string; isDone: boolean; isDefault?: boolean
}

export interface Settings {
  sprintDuration: number; defaultCapacity: number; theme: 'light' | 'dark'
}

export interface CadenceState {
  sprints: Sprint[]; items: Item[]; team: TeamMember[]
  clients: Client[]; kanbanCols: KanbanCol[]; settings: Settings
  dailyEntries: DailyEntry[]; retroSessions: RetroSession[]
  history: HistoryEntry[]
}

export interface DailyEntry {
  memberId: string
  date: string   // YYYY-MM-DD
  yesterday: string
  today: string
  blockers: string
}

export type RetroFormat = 'start-stop-continue' | 'mad-sad-glad' | '4ls'

export interface RetroItem {
  id: string
  text: string
  votes: string[]
  authorId: string
}

export interface RetroAction {
  id: string
  text: string
  ownerId: string
  dueDate?: string
  done: boolean
}

export interface RetroSession {
  id: string
  sprintId: string
  format: RetroFormat
  columns: Record<string, RetroItem[]>
  actions: RetroAction[]
  date: string
}


export type HistoryEventType = 'item_create' | 'item_edit' | 'item_delete' | 'item_status' | 'sprint_add' | 'sprint_activate' | 'undo' | 'other'

export interface HistoryEntry {
  id: string
  type: HistoryEventType
  timestamp: string   // ISO
  sprintId?: string
  itemKey?: string
  itemDesc?: string
  author?: string     // TeamMember.id
  detail?: string
  from?: string
  to?: string
}

export interface AuthUser {
  id: string; email: string; name: string; role: UserRole
}
