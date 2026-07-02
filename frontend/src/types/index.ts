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

export interface Client {
  id: string; name: string; tier: string; annualRevenue: number
  rag: RAG; color: string; prefix: string
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
}

export interface DailyEntry {
  memberId: string
  date: string   // YYYY-MM-DD
  yesterday: string
  today: string
  blockers: string
}

export interface AuthUser {
  id: string; email: string; name: string; role: UserRole
}
