import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useCadence } from './StateContext'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { matchChatCommand } from '../data/chatCommands'
import type { AiToolCall, ChatMessage } from '../types'

// Phase 6 (roadmap v1), Compagnon IA, sous-chantier 1 (aide à la rédaction/création d'items),
// 2026-08-08 : état partagé du chat (panneau latéral pour commencer, décision Julien via
// AskUserQuestion), accessible depuis n'importe quelle page via le bouton dédié du Header.
// `messages` vit en mémoire React, persisté à côté dans localStorage (voir loadStoredMessages/
// persistMessages ci-dessous, ajouté 2026-08-09) pour survivre à un rechargement de page - toujours
// pas de persistance côté serveur : POST /api/ai-chat reste sans état (backend/src/routes/ai.ts),
// tout l'historique transite à chaque appel, seul le NAVIGATEUR se souvient de la conversation.
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

// Persistance de la conversation (2026-08-09, 5e retour Julien) : jusqu'ici `messages` ne vivait
// qu'en mémoire React, perdu au moindre F5. localStorage plutôt qu'un endpoint serveur : cohérent
// avec le reste du sous-chantier ("commencer simple"), et la conversation n'a de toute façon aucune
// valeur multi-appareils/multi-utilisateurs à persister en base. `MAX_STORED_MESSAGES` : garde-fou
// pour ne pas laisser grossir indéfiniment le localStorage sur une conversation très longue.
//
// Clé scopée par compte connecté (2026-08-12, retour Julien) : sous une clé fixe, la conversation
// d'un compte restait visible après bascule vers un AUTRE compte (Admin<->Dev, même navigateur) -
// en plus de la confusion évidente (historique de quelqu'un d'autre affiché), cela expliquait aussi
// le refus d'application du Compagnon signalé après un aller-retour Dev->Admin : le rôle est bien
// revérifié côté serveur à CHAQUE appel (donc déjà correct), mais le modèle, voyant dans SA PROPRE
// conversation un refus qu'il avait formulé plus tôt (pendant la session Dev), le répétait par
// cohérence avec l'historique plutôt que de re-tenter l'action. `login()`/`logout()` (useAuth.ts)
// sont des changements d'état purement client (pas de rechargement de page) : `ChatProvider` reste
// monté, d'où l'effet dédié plus bas qui recharge `messages` depuis la clé du nouveau compte dès que
// `userId` change.
const STORAGE_PREFIX = 'cadence.chat.messages'
const MAX_STORED_MESSAGES = 100

function storageKeyFor(userId: string): string {
  return `${STORAGE_PREFIX}.${userId || 'anon'}`
}

function loadStoredMessages(key: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as ChatMessage[] : []
  } catch {
    return []
  }
}

function persistMessages(key: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(key, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)))
  } catch {
    // Quota localStorage dépassé ou indisponible (navigation privée...) : la conversation continue
    // de fonctionner, simplement sans persistance - jamais bloquant.
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
  editMessage: (id: string, newText: string) => void
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
  const { userId } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages(storageKeyFor(userId)))
  const [sending, setSending] = useState(false)

  useEffect(() => { persistMessages(storageKeyFor(userId), messages) }, [userId, messages])

  // Rechargement au changement de compte (2026-08-12, retour Julien) : `login()`/`logout()` ne
  // remontent pas ce composant (voir commentaire sur STORAGE_PREFIX plus haut), donc sans cet effet
  // `messages` garderait la conversation du compte PRÉCÉDENT affichée jusqu'au prochain envoi. Le
  // premier rendu a déjà chargé la bonne conversation via l'initialiseur de useState ci-dessus - ce
  // ref évite de la recharger une seconde fois inutilement au montage.
  const prevUserId = useRef(userId)
  useEffect(() => {
    if (prevUserId.current === userId) return
    prevUserId.current = userId
    setMessages(loadStoredMessages(storageKeyFor(userId)))
  }, [userId])

  const openPanel = useCallback(() => setOpen(true), [])
  const closePanel = useCallback(() => setOpen(false), [])
  const togglePanel = useCallback(() => setOpen(o => !o), [])
  const clearConversation = useCallback(() => {
    setMessages([])
    localStorage.removeItem(storageKeyFor(userId))
  }, [userId])

  const applyToolCalls = useCallback((toolCalls: AiToolCall[]) => {
    for (const call of toolCalls) {
      switch (call.kind) {
        case 'item_created': dispatch({ type: 'ADD_ITEM', payload: call.item, keyCounters: call.keyCounters }); break
        case 'item_updated': dispatch({ type: 'UPDATE_ITEM', payload: call.item }); break
        case 'node_created': dispatch({ type: 'ADD_HIERARCHY_NODE', payload: call.node, keyCounters: call.keyCounters }); break
        case 'node_updated': dispatch({ type: 'UPDATE_HIERARCHY_NODE', payload: call.node }); break
        case 'sprint_plan_applied': dispatch({ type: 'APPLY_SPRINT_PLAN', payload: { changedItems: call.changedItems, newItems: call.newItems, newSprints: call.newSprints, keyCounters: call.keyCounters } }); break
      }
    }
  }, [dispatch])

  // Envoie `history` (déjà mis à jour dans `messages`) à l'API et ajoute la réponse - factorisé
  // pour être partagé par sendMessage (nouveau message) et editMessage (message modifié, historique
  // tronqué à partir de ce point) ci-dessous : même appel, seule la construction de `history` change.
  // `apiContent` (commande slash, voir data/chatCommands.ts) prend le pas sur `content` pour l'API
  // uniquement - l'affichage dans la bulle reste toujours `content`.
  const postHistory = useCallback((history: ChatMessage[]) => {
    setSending(true)
    api.sendChatMessage(history.map(m => ({ role: m.role, content: m.apiContent ?? m.content })))
      .then(({ reply, toolCalls }) => {
        applyToolCalls(toolCalls)
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: reply || '(Réponse vide.)', toolCalls }])
      })
      .catch(err => {
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: extractApiError(err, "Le Compagnon IA n'a pas pu répondre."), error: true }])
      })
      .finally(() => setSending(false))
  }, [applyToolCalls])

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const command = matchChatCommand(trimmed)
    const userMsg: ChatMessage = { id: uid(), role: 'user', content: trimmed, apiContent: command?.prompt }
    const history = [...messages, userMsg]
    setMessages(history)
    postHistory(history)
  }, [sending, messages, postHistory])

  // Édition d'un message utilisateur (2026-08-09, 5e retour Julien) : tronque la conversation à ce
  // message (les échanges suivants, y compris les tool_use déjà exécutés côté serveur, sont
  // abandonnés côté affichage - les items déjà créés dans le Backlog restent tels quels, seule la
  // conversation "repart" du point édité) puis renvoie le message modifié comme un nouveau tour.
  const editMessage = useCallback((id: string, newText: string) => {
    const trimmed = newText.trim()
    if (!trimmed || sending) return
    const idx = messages.findIndex(m => m.id === id)
    if (idx === -1) return

    const command = matchChatCommand(trimmed)
    const editedMsg: ChatMessage = { id: uid(), role: 'user', content: trimmed, apiContent: command?.prompt }
    const history = [...messages.slice(0, idx), editedMsg]
    setMessages(history)
    postHistory(history)
  }, [sending, messages, postHistory])

  return (
    <ChatContext.Provider value={{ open, openPanel, closePanel, togglePanel, messages, sending, sendMessage, editMessage, clearConversation }}>
      {children}
    </ChatContext.Provider>
  )
}
