import { useEffect, useRef, useState } from 'react'
import { useChat } from '../../context/ChatContext'
import type { AiToolCall, ChatMessage } from '../../types'

// Phase 6 (roadmap v1), Compagnon IA, sous-chantier 1, 2026-08-08 : panneau de chat global, monté
// dans AppShell (App.tsx) comme OnboardingPanel/SpotlightHost/PresentationBar. Positionné en
// tiroir plein hauteur ancré à droite par défaut (contrairement à OnboardingPanel, en petite boîte
// 50vh en bas à droite) pour limiter le chevauchement visuel si les deux sont ouverts en même temps ;
// `zIndex: 10001`, juste sous OnboardingPanel (10002) et sa bulle de surbrillance (10003).
//
// 2026-08-09 (6e retour Julien, usage réel) : le tiroir fixe ne convenait plus dès qu'il fallait
// consulter le Backlog en même temps que la conversation. Le panneau a deux modes - `docked`
// (tiroir ancré à droite, largeur redimensionnable par un poignée sur le bord gauche) et `floating`
// (fenêtre détachée, déplaçable par sa barre de titre et redimensionnable par le coin bas-droit) -
// plus un état `collapsed` (réduit à une pastille cliquable, sans perdre la conversation). Les
// préférences (mode, taille, position, collapsed) sont persistées en localStorage comme la
// conversation elle-même (voir ChatContext.tsx).
function toolCallLabel(tc: AiToolCall): string {
  switch (tc.kind) {
    case 'item_created': return `Item créé : ${tc.item.key}`
    case 'item_updated': return `Item mis à jour : ${tc.item.key}`
    case 'node_created': return `${tc.node.level === 'initiative' ? 'Initiative créée' : 'Epic créé'} : ${tc.node.key}`
    case 'node_updated': return `${tc.node.level === 'initiative' ? 'Initiative mise à jour' : 'Epic mis à jour'} : ${tc.node.key}`
  }
}

/* ── Tiny inline SVG helper ─────────────────────────────────────── (même convention que
   Header.tsx/BacklogPage.tsx/ItemModal.tsx : un composant local par fichier, pas de partage) */
function Svg({ d, size = 13 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}

// Boutons texte -> icônes (2026-08-09, 7e retour Julien apres tests reels).
const SVG = {
  copy:      '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  pencil:    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  eraser:    '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/>',
  detach:    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 14v1"/><path d="M15 19v2"/><path d="M15 3v2"/><path d="M15 9v1"/>',
  dock:      '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>',
  check:     '<path d="M20 6 9 17l-5-5"/>',
}

interface PanelPrefs {
  mode: 'docked' | 'floating'
  dockedWidth: number
  floating: { x: number; y: number; w: number; h: number }
  collapsed: boolean
}

const PANEL_PREFS_KEY = 'cadence.chat.panelPrefs'
const DOCKED_MIN = 320
const DOCKED_MAX = 900
const FLOAT_MIN_W = 340
const FLOAT_MIN_H = 340
const INPUT_MAX_HEIGHT = 160

function defaultPrefs(): PanelPrefs {
  return {
    mode: 'docked',
    dockedWidth: 380,
    floating: { x: Math.max(20, window.innerWidth - 460), y: 70, w: 420, h: 560 },
    collapsed: false,
  }
}

function loadPanelPrefs(): PanelPrefs {
  const fallback = defaultPrefs()
  try {
    const raw = localStorage.getItem(PANEL_PREFS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>
    return { ...fallback, ...parsed, floating: { ...fallback.floating, ...(parsed.floating ?? {}) } }
  } catch {
    return fallback
  }
}

function persistPanelPrefs(prefs: PanelPrefs) {
  try {
    localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Quota localStorage dépassé ou indisponible : le panneau reste utilisable, juste sans mémoriser
    // ses préférences de position/taille d'une session à l'autre.
  }
}

const ACTION_BTN: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5,
  padding: '2px 5px', borderRadius: 4, color: 'inherit', opacity: 0.75,
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      title={copied ? 'Copié' : 'Copier'} aria-label="Copier"
      style={ACTION_BTN}
      onClick={() => {
        navigator.clipboard?.writeText(text)
          .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) })
          .catch(() => {})
      }}
    >
      {copied ? <Svg d={SVG.check} /> : <Svg d={SVG.copy} />}
    </button>
  )
}

// Édition d'un message utilisateur (2026-08-09, 5e retour Julien) : repasse en mode saisie, la
// validation tronque la conversation à ce message et la renvoie via editMessage (ChatContext.tsx) -
// même principe qu'"éditer et regénérer" dans les chats classiques.
function MessageBubble({ message }: { message: ChatMessage }) {
  const { editMessage, sending } = useChat()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const isUser = message.role === 'user'

  if (editing) {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '92%', width: '92%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          autoFocus
          data-testid="chat-edit-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={Math.min(8, Math.max(2, draft.split('\n').length))}
          style={{
            fontSize: 12.5, fontFamily: 'inherit', padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--primary)', background: 'var(--bg)', color: 'var(--text)', resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="hdr-btn" data-testid="chat-edit-cancel-btn" style={{ fontSize: 11 }} onClick={() => { setDraft(message.content); setEditing(false) }}>
            Annuler
          </button>
          <button
            className="hdr-btn primary" data-testid="chat-edit-save-btn" style={{ fontSize: 11 }} disabled={!draft.trim() || sending}
            onClick={() => { editMessage(message.id, draft); setEditing(false) }}
          >
            Enregistrer et renvoyer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div data-testid={`chat-message-${message.role}`} style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          padding: '8px 12px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
          background: isUser ? 'var(--primary)' : (message.error ? 'var(--danger-light, #fee2e2)' : 'var(--surface2)'),
          color: isUser ? '#fff' : (message.error ? 'var(--danger, #dc2626)' : 'var(--text)'),
        }}
      >
        {message.content}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {message.toolCalls.map((tc, i) => (
              <div key={i} style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, background: 'var(--success-light, #dcfce7)', color: 'var(--success, #16a34a)' }}>
                {toolCallLabel(tc)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignSelf: isUser ? 'flex-end' : 'flex-start', color: 'var(--text-muted)' }}>
        <CopyButton text={message.content} />
        {isUser && (
          <button title="Modifier" aria-label="Modifier" style={{ ...ACTION_BTN, opacity: sending ? 0.4 : 0.75 }} disabled={sending} onClick={() => setEditing(true)}>
            <Svg d={SVG.pencil} />
          </button>
        )}
      </div>
    </div>
  )
}

export function ChatPanel() {
  const { open, closePanel, messages, sending, sendMessage, clearConversation } = useChat()
  const [input, setInput] = useState('')
  const [prefs, setPrefs] = useState<PanelPrefs>(loadPanelPrefs)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { persistPanelPrefs(prefs) }, [prefs])

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
    if (open && !prefs.collapsed) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open, prefs.collapsed])

  if (!open) return null

  function autosizeInput(el: HTMLTextAreaElement | null) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT)}px`
  }

  function handleSend() {
    if (!input.trim() || sending) return
    sendMessage(input)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // Poignée de redimensionnement du tiroir ancré (bord gauche) : glisser vers la gauche agrandit
  // le panneau (delta négatif de clientX -> largeur croissante), symétrique au fait qu'il est ancré
  // à droite. Même convention window.addEventListener('mousemove'/'mouseup') que NNLCanvas.tsx.
  function startDockResize(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = prefs.dockedWidth
    function onMove(ev: MouseEvent) {
      const next = Math.min(DOCKED_MAX, Math.max(DOCKED_MIN, Math.min(window.innerWidth * 0.92, startWidth + (startX - ev.clientX))))
      setPrefs(p => ({ ...p, dockedWidth: next }))
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Déplacement du panneau flottant par sa barre de titre - ignore un mousedown parti d'un bouton
  // du header (Effacer/Détacher/Réduire/Fermer) pour ne pas capturer leur clic.
  function startFloatMove(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const startX = e.clientX, startY = e.clientY
    const startPos = { x: prefs.floating.x, y: prefs.floating.y }
    function onMove(ev: MouseEvent) {
      const nx = Math.min(window.innerWidth - 80, Math.max(0, startPos.x + (ev.clientX - startX)))
      const ny = Math.min(window.innerHeight - 40, Math.max(0, startPos.y + (ev.clientY - startY)))
      setPrefs(p => ({ ...p, floating: { ...p.floating, x: nx, y: ny } }))
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startFloatResize(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const startSize = { w: prefs.floating.w, h: prefs.floating.h }
    function onMove(ev: MouseEvent) {
      const nw = Math.min(window.innerWidth * 0.95, Math.max(FLOAT_MIN_W, startSize.w + (ev.clientX - startX)))
      const nh = Math.min(window.innerHeight * 0.9, Math.max(FLOAT_MIN_H, startSize.h + (ev.clientY - startY)))
      setPrefs(p => ({ ...p, floating: { ...p.floating, w: nw, h: nh } }))
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Réduit : pastille cliquable qui préserve la conversation (rien n'est démonté, juste masqué) -
  // distinct de "Fermer" (closePanel) qui masque tout le composant (voir `if (!open) return null`
  // ci-dessus). Positionnée à l'emplacement du panneau flottant s'il y en a un, sinon en bas à
  // droite (mode ancré).
  if (prefs.collapsed) {
    return (
      <button
        data-testid="chat-panel-collapsed"
        onClick={() => setPrefs(p => ({ ...p, collapsed: false }))}
        style={{
          position: 'fixed', zIndex: 10001,
          ...(prefs.mode === 'floating' ? { left: prefs.floating.x, top: prefs.floating.y } : { right: 20, bottom: 20 }),
          borderRadius: 999, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--primary)', color: '#fff', border: 'none',
          boxShadow: '0 4px 14px rgba(0,0,0,.22)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        }}
      >
        Compagnon IA
        {messages.length > 0 && (
          <span style={{ background: 'rgba(255,255,255,.25)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{messages.length}</span>
        )}
      </button>
    )
  }

  const containerStyle: React.CSSProperties = prefs.mode === 'floating'
    ? {
        position: 'fixed', left: prefs.floating.x, top: prefs.floating.y, width: prefs.floating.w, height: prefs.floating.h,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,.28)', zIndex: 10001,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }
    : {
        position: 'fixed', top: 0, right: 0, bottom: 0, width: prefs.dockedWidth, maxWidth: '92vw',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 24px rgba(0,0,0,.18)', zIndex: 10001,
        display: 'flex', flexDirection: 'column',
      }

  return (
    <div data-testid="chat-panel" style={containerStyle}>
      {prefs.mode === 'docked' && (
        <div
          onMouseDown={startDockResize} data-testid="chat-panel-resize-handle"
          style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'ew-resize' }}
        />
      )}

      <div
        onMouseDown={prefs.mode === 'floating' ? startFloatMove : undefined}
        style={{
          padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', cursor: prefs.mode === 'floating' ? 'move' : 'default', flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Compagnon IA</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Aide à la rédaction et à la création d'items</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {messages.length > 0 && (
            <button
              onClick={clearConversation} data-testid="chat-clear-btn" title="Effacer" aria-label="Effacer"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
            >
              <Svg d={SVG.eraser} size={15} />
            </button>
          )}
          <button
            onClick={() => setPrefs(p => ({ ...p, mode: p.mode === 'docked' ? 'floating' : 'docked' }))}
            title={prefs.mode === 'docked' ? 'Détacher en fenêtre flottante' : 'Ancrer à droite'}
            aria-label={prefs.mode === 'docked' ? 'Détacher' : 'Ancrer'}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
          >
            <Svg d={prefs.mode === 'docked' ? SVG.detach : SVG.dock} size={15} />
          </button>
          <button
            onClick={() => setPrefs(p => ({ ...p, collapsed: true }))} aria-label="Réduire" title="Réduire"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}
          >
            −
          </button>
          <button onClick={closePanel} aria-label="Fermer" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Demandez-moi de rédiger une User Story, un Bug, un Epic... ou de créer directement un item dans le Backlog.
          </div>
        )}
        {messages.map(m => <MessageBubble key={m.id} message={m} />)}
        {sending && (
          <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Le Compagnon IA rédige…
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          data-testid="chat-input"
          rows={1}
          placeholder="Écrire un message..."
          value={input}
          onChange={e => { setInput(e.target.value); autosizeInput(e.target) }}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1, resize: 'none', borderRadius: 8, border: '1px solid var(--border)', padding: '8px 10px',
            fontSize: 12.5, fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)',
            minHeight: 34, maxHeight: INPUT_MAX_HEIGHT, overflowY: 'auto',
          }}
        />
        <button className="hdr-btn primary" data-testid="chat-send-btn" disabled={!input.trim() || sending} onClick={handleSend}>
          Envoyer
        </button>
      </div>

      {prefs.mode === 'floating' && (
        <div
          onMouseDown={startFloatResize} data-testid="chat-panel-float-resize-handle"
          style={{ position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize' }}
        >
          <div style={{ position: 'absolute', right: 3, bottom: 3, width: 8, height: 8, borderRight: '2px solid var(--border)', borderBottom: '2px solid var(--border)' }} />
        </div>
      )}
    </div>
  )
}
