export interface User {
  id: string
  email: string
  role: 'admin' | 'member' | 'viewer'
}

export interface CadenceState {
  sprints: Sprint[]
  items: Item[]
  team: TeamMember[]
  clients: Client[]
  kanbanCols: KanbanCol[]
  settings: Settings
}

export interface Sprint {
  id: string
  number: number
  label: string
  startDate: string
  endDate: string
  capacity: number
  closed: boolean
  items: Item[]
}

export interface Item {
  id: string
  key: string
  desc: string
  sp: number
  status: string
  clientId: string
  sprintId: string | null
  priority: 'critical' | 'high' | 'medium' | 'low'
  assignee: string
  tags: string[]
}

export interface TeamMember {
  id: string
  name: string
  role: string
  spPerDay: number
  tags: string[]
}

export interface Client {
  id: string
  name: string
  tier: string
  annualRevenue: number
  rag: 'R' | 'A' | 'G'
}

export interface KanbanCol {
  id: string
  label: string
  color: string
  isDone: boolean
}

export interface Settings {
  sprintDuration: number
  defaultCapacity: number
  theme: 'light' | 'dark'
}
