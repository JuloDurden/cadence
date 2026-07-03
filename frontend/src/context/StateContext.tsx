import { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CadenceState, Item, Sprint, RoadmapGoal } from '../types'
import { DEMO_STATE } from '../data/demo'
import { api } from '../services/api'

const UNDOABLE = new Set([
  'ADD_ITEM','UPDATE_ITEM','DELETE_ITEM',
  'ADD_SPRINT','UPDATE_SPRINT','DELETE_SPRINT',
  'ADD_CLIENT','UPDATE_CLIENT','DELETE_CLIENT',
  'ADD_MEMBER','UPDATE_MEMBER','DELETE_MEMBER',
  'UPDATE_SETTINGS','UPDATE_KANBAN_COLS',
  'ADD_ROADMAP_GOAL','UPDATE_ROADMAP_GOAL','DELETE_ROADMAP_GOAL',
])

type Action =
  | { type: 'SET_STATE'; payload: CadenceState }
  | { type: 'ADD_ITEM'; payload: Item }
  | { type: 'UPDATE_ITEM'; payload: Item }
  | { type: 'DELETE_ITEM'; payload: string }
  | { type: 'ADD_SPRINT'; payload: Sprint }
  | { type: 'UPDATE_SPRINT'; payload: Sprint }
  | { type: 'DELETE_SPRINT'; payload: string }
  | { type: 'UPSERT_DAILY_ENTRY'; payload: import('../types').DailyEntry }
  | { type: 'UPSERT_RETRO_SESSION'; payload: import('../types').RetroSession }
  | { type: 'ADD_CLIENT'; payload: import('../types').Client }
  | { type: 'UPDATE_CLIENT'; payload: import('../types').Client }
  | { type: 'DELETE_CLIENT'; payload: string }
  | { type: 'ADD_MEMBER'; payload: import('../types').TeamMember }
  | { type: 'UPDATE_MEMBER'; payload: import('../types').TeamMember }
  | { type: 'DELETE_MEMBER'; payload: string }
  | { type: 'ADD_HISTORY'; payload: import('../types').HistoryEntry }
  | { type: 'UPDATE_SETTINGS'; payload: import('../types').Settings }
  | { type: 'UPDATE_KANBAN_COLS'; payload: import('../types').KanbanCol[] }
  | { type: 'ADD_ROADMAP_GOAL'; payload: RoadmapGoal }
  | { type: 'UPDATE_ROADMAP_GOAL'; payload: RoadmapGoal }
  | { type: 'DELETE_ROADMAP_GOAL'; payload: string }

function reducer(state: CadenceState, action: Action): CadenceState {
  switch (action.type) {
    case 'SET_STATE': return action.payload
    case 'ADD_ITEM': return { ...state, items: [...state.items, action.payload] }
    case 'UPDATE_ITEM': return { ...state, items: state.items.map(i => i.id === action.payload.id ? action.payload : i) }
    case 'DELETE_ITEM': return { ...state, items: state.items.filter(i => i.id !== action.payload) }
    case 'ADD_SPRINT': return { ...state, sprints: [...state.sprints, action.payload] }
    case 'UPDATE_SPRINT': return { ...state, sprints: state.sprints.map(s => s.id === action.payload.id ? action.payload : s) }
    case 'DELETE_SPRINT': return { ...state, sprints: state.sprints.filter(s => s.id !== action.payload) }
    case 'ADD_CLIENT': return { ...state, clients: [...state.clients, action.payload] }
    case 'UPDATE_CLIENT': return { ...state, clients: state.clients.map(c => c.id === action.payload.id ? action.payload : c) }
    case 'DELETE_CLIENT': return { ...state, clients: state.clients.filter(c => c.id !== action.payload) }
    case 'ADD_MEMBER': return { ...state, team: [...state.team, action.payload] }
    case 'UPDATE_MEMBER': return { ...state, team: state.team.map(m => m.id === action.payload.id ? action.payload : m) }
    case 'DELETE_MEMBER': return { ...state, team: state.team.filter(m => m.id !== action.payload) }
    case 'ADD_HISTORY': return { ...state, history: [action.payload, ...(state.history || [])].slice(0, 200) }
    case 'UPDATE_SETTINGS': return { ...state, settings: action.payload }
    case 'UPDATE_KANBAN_COLS': return { ...state, kanbanCols: action.payload }
    case 'ADD_ROADMAP_GOAL': return { ...state, roadmap: [...(state.roadmap || []), action.payload] }
    case 'UPDATE_ROADMAP_GOAL': return { ...state, roadmap: (state.roadmap || []).map(g => g.id === action.payload.id ? action.payload : g) }
    case 'DELETE_ROADMAP_GOAL': return { ...state, roadmap: (state.roadmap || []).filter(g => g.id !== action.payload) }
    case 'UPSERT_RETRO_SESSION': {
      const sessions = state.retroSessions.filter(s => s.id !== action.payload.id)
      return { ...state, retroSessions: [...sessions, action.payload] }
    }
    case 'UPSERT_DAILY_ENTRY': {
      const entries = state.dailyEntries.filter(e => !(e.memberId === action.payload.memberId && e.date === action.payload.date))
      return { ...state, dailyEntries: [...entries, action.payload] }
    }
    default: return state
  }
}

interface StateContextValue {
  state: CadenceState
  dispatch: React.Dispatch<Action>
  saveToServer: (s: CadenceState) => Promise<void>
  loadFromServer: () => Promise<void>
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

const StateContext = createContext<StateContextValue | null>(null)

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, DEMO_STATE)
  const [past, setPast] = useState<CadenceState[]>([])
  const [future, setFuture] = useState<CadenceState[]>([])

  // Apply theme on state change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.settings?.theme ?? 'light')
  }, [state.settings?.theme])

  const saveToServer = useCallback(async (s: CadenceState) => {
    try { await api.putState(s) } catch { /* offline mode */ }
  }, [])

  const loadFromServer = useCallback(async () => {
    try {
      const { data } = await api.getState()
      if (data) {
        // Merge deps from DEMO_STATE so demo items keep their dependency chain
        // Also include any DEMO_STATE items not yet on the server (added after last save)
        const loaded = data as CadenceState
        const merged = {
          ...loaded,
          items: [
            // Conserver uniquement les items serveur dont l'ID est encore dans DEMO_STATE
            ...loaded.items
              .filter(item => DEMO_STATE.items.some(d => d.id === item.id))
              .map(item => {
                const demoItem = DEMO_STATE.items.find(d => d.id === item.id)
                if (demoItem?.deps?.length && !item.deps?.length) return { ...item, deps: demoItem.deps }
                return item
              }),
            ...DEMO_STATE.items.filter(d => !loaded.items.some(l => l.id === d.id))
          ]
        }
        dispatch({ type: 'SET_STATE', payload: merged })
      }
    } catch { /* use demo data */ }
  }, [])

  // Charger depuis le serveur au démarrage si un token existe
  useEffect(() => {
    if (localStorage.getItem('cadence_token')) loadFromServer()
  }, [loadFromServer])

  // Dispatch avec snapshot undo/redo
  const wrappedDispatch = useCallback((action: Action) => {
    if (UNDOABLE.has(action.type)) {
      setPast(p => [...p.slice(-49), state])
      setFuture([])
    }
    dispatch(action)
  }, [state])

  const undo = useCallback(() => {
    if (past.length === 0) return
    const prev = past[past.length - 1]
    setPast(p => p.slice(0, -1))
    setFuture(f => [state, ...f.slice(0, 49)])
    dispatch({ type: 'SET_STATE', payload: prev })
  }, [past, state])

  const redo = useCallback(() => {
    if (future.length === 0) return
    const next = future[0]
    setFuture(f => f.slice(1))
    setPast(p => [...p.slice(-49), state])
    dispatch({ type: 'SET_STATE', payload: next })
  }, [future, state])

  return (
    <StateContext.Provider value={{
      state, dispatch: wrappedDispatch, saveToServer, loadFromServer,
      undo, redo, canUndo: past.length > 0, canRedo: future.length > 0
    }}>
      {children}
    </StateContext.Provider>
  )
}

export function useCadence() {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useCadence must be used inside StateProvider')
  return ctx
}
