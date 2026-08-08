import { useEffect, useRef, useState } from 'react'
import { useChat } from '../../context/ChatContext'
import type { AiToolCall } from '../../types'

// Phase 6 (roadmap v1), Compagnon IA, sous-chantier 1, 2026-08-08 : panneau de chat global, monté
// dans AppShell (App.tsx) comme OnboardingPanel/SpotlightHost/PresentationBar. Positionné en
// tiroir plein hauteur ancré à droite (contrairement à OnboardingPanel, en petite boîte 50vh en bas
// à droite) pour limiter le chevauchement visuel si les deux sont ouverts en même temps ;
// `zIndex: 10001`, juste sous OnboardingPanel (10002) et sa bulle de surbrillance (10003).
function toolCallLabel(tc: AiToolCall): string {
  switch (tc.kind) {
    case 'item_created': return `Item créé : ${tc.item.key}`
    case 'item_updated': return `Item mis à jour : ${tc.item.key}`
    case 'node_created': return `${tc.node.level === 'initiative' ? 'Initiative créée' : 'Epic créé'} : ${tc.node.key}`
    case 'node_updated': return `${tc.node.level === 'initiative' ? 'Initiative mise à jour' : 'Epic mis à jour'} : ${tc.node.key}`
  }
}

export function ChatPanel() {
  const { open, closePanel, messages, sending, sendMessage, clearConversation } = useChat()
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closePanel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, closePanel])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  if (!open) return null

  function handleSend() {
    if (!input.trim() || sending) return
    sendMessage(input)
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div
      data-testid="chat-panel"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, maxWidth: '92vw',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 24px rgba(0,0,0,.18)', zIndex: 10001,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Compagnon IA</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Aide à la rédaction et à la création d'items</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {messages.length > 0 && (
            <button
              onClick={clearConversation} data-testid="chat-clear-btn"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
            >
              Effacer
            </button>
          )}
          <button onClick={closePanel} aria-label="Fermer" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Demandez-moi de rédiger une User Story, un Bug, un Epic... ou de créer directement un item dans le Backlog.
          </div>
        )}
        {messages.map(m => (
          <div
            key={m.id}
            data-testid={`chat-message-${m.role}`}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%', padding: '8px 12px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? 'var(--primary)' : (m.error ? 'var(--danger-light, #fee2e2)' : 'var(--surface2)'),
              color: m.role === 'user' ? '#fff' : (m.error ? 'var(--danger, #dc2626)' : 'var(--text)'),
            }}
          >
            {m.content}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {m.toolCalls.map((tc, i) => (
                  <div
                    key={i}
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, background: 'var(--success-light, #dcfce7)', color: 'var(--success, #16a34a)' }}
                  >
                    {toolCallLabel(tc)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Le Compagnon IA rédige…
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          data-testid="chat-input"
          rows={2}
          placeholder="Écrire un message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 1, resize: 'none', borderRadius: 8, border: '1px solid var(--border)', padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' }}
        />
        <button className="hdr-btn primary" data-testid="chat-send-btn" disabled={!input.trim() || sending} onClick={handleSend}>
          Envoyer
        </button>
      </div>
    </div>
  )
}
