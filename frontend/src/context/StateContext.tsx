import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react'
import type { CadenceState, Item, Sprint } from '../types'
import { DEMO_STATE } from '../data/demo'
import { api } from '../services/api'

type Action =
  | { type: 'SET_STATE'; payload: CadenceState }
  | { type: 'ADD_ITEM'; payload: Item }
  | { type: 'UPDATE_ITEM'; payload: Item }
  | { type: 'DELETE_ITEM'; payload: string }
  | { type: 'ADD_SPRINT'; payload: Sprint }
  | { type: 'UPSERT_DAILY_ENTRY'; payload: import('../types').DailyEntry }
  | { type: 'UPSERT_RETRO_SESSION'; payload: import('../types').RetroSession }

function reducer(state: CadenceState, action: Action): CadenceState {
  switch (action.type) {
    case 'SET_STATE': return action.payload
    case 'ADD_ITEM': return { ...state, items: [...state.items, action.payload] }
    case 'UPDATE_ITEM': return { ...state, items: state.items.map(i => i.id === action.payload.id ? action.payload : i) }
    case 'DELETE_ITEM': return { ...state, items: state.items.filter(i => i.id !== action.payload) }
    case 'ADD_SPRINT': return { ...state, sprints: [...state.sprints, action.payload] }
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
}

const StateContext = createContext<StateContextValue | null>(null)

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, DEMO_STATE)

  const saveToServer = useCallback(async (s: CadenceState) => {
    try { await api.putState(s) } catch { /* offline mode */ }
  }, [])

  const loadFromServer = useCallback(async () => {
    try {
      const { data } = await api.getState()
      if (data) dispatch({ type: 'SET_STATE', payload: data as CadenceState })
    } catch { /* use demo data */ }
  }, [])

  return (
    <StateContext.Provider value={{ state, dispatch, saveToServer, loadFromServer }}>
      {children}
    </StateContext.Provider>
  )
}

export function useCadence() {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useCadence must be used inside StateProvider')
  return ctx
}
