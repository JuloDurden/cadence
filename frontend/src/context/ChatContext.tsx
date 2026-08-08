import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useCadence } from './StateContext'
import { api } from '../services/api'
import type { AiToolCall, ChatMessage } from '../types'

// Phase 6 (roadmap v1), Compagnon IA, sous-chantier 1 (aide à la rédaction/création d'items),
// 2026-08-08 : état partagé du chat (panneau latéral pour commencer, décision Julien via
// AskUserQuestion), accessible depuis n'importe quelle page via le bouton dédié du Header. Sans
// persistance : `messages` vit uniquement en mémoire (perdu au rechargement), même principe
// "commencer simple" que le reste de ce sous-chantier. POST /api/ai-chat est lui-même sans état
// côté serveur (voir backend/src/routes/ai.ts), tout l'historique transite à chaque appel.
//
// Contrairement à l'import Jira (qui ne fait que PROPOSER des changements, appliqués ensuite par
// le frontend via `saveToServer`), le backend a déjà persisté chaque item/Epic créé ou modifié au
// moment où la réponse revient ici (chaque tool_use exécuté appelle `saveState` côté serveur, voir
// routes/ai.ts) : `applyToolCalls` ne fait donc que mettre à jour l'état LOCAL (dispatch), sans
// jamais rappeler `saveToServer`, un second appel serait redondant, voire une source de course
// avec une modification concurrente faite entre-temps par un autre écran.
function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function extractApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback
  try {
    const body = err.message.slice(err.message.indexOf(':') + 1).trim()
    const parsed = JSON.parse(body) as { error?: string }
    return parsed.error ?? fallback
  } catch {
    return fallback
  }
}

interface ChatContextValue {
  open: boolean
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  messages: ChatMessage[]
  sending: boolean
  sendMessage: (text: string) => void
  clearConversation: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat doit être utilisé dans un ChatProvider')
  return ctx
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { dispatch } = useCadence()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)

  const openPanel = useCallback(() => setOpen(true), [])
  const closePanel = useCallback(() => setOpen(false), [])
  const togglePanel = useCallback(() => setOpen(o => !o), [])
  const clearConversation = useCallback(() => setMessages([]), [])

  const applyToolCalls = useCallback((toolCalls: AiToolCall[]) => {
    for (const call of toolCalls) {
      switch (call.kind) {
        case 'item_created': dispatch({ type: 'ADD_ITEM', payload: call.item, keyCounters: call.keyCounters }); break
        case 'item_updated': dispatch({ type: 'UPDATE_ITEM', payload: call.item }); break
        case 'node_created': dispatch({ type: 'ADD_HIERARCHY_NODE', payload: call.node, keyCounters: call.keyCounters }); break
        case 'node_updated': dispatch({ type: 'UPDATE_HIERARCHY_NODE', payload: call.node }); break
      }
    }
  }, [dispatch])

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: trimmed }
    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, userMsg])
    setSending(true)

    api.sendChatMessage(history)
      .then(({ reply, toolCalls }) => {
        applyToolCalls(toolCalls)
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: reply || '(Réponse vide.)', toolCalls }])
      })
      .catch(err => {
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: extractApiError(err, "Le Compagnon IA n'a pas pu répondre."), error: true }])
      })
      .finally(() => setSending(false))
  }, [sending, messages, applyToolCalls])

  return (
    <ChatContext.Provider value={{ open, openPanel, closePanel, togglePanel, messages, sending, sendMessage, clearConversation }}>
      {children}
    </ChatContext.Provider>
  )
}
