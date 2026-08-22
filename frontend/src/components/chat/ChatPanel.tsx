import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { useChat } from '../../context/ChatContext'
import { CHAT_COMMANDS } from '../../data/chatCommands'
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
    case 'sprint_plan_applied': {
      const parts = [`${tc.newSprints.length} sprint(s) créé(s)`, `${tc.changedItems.length} item(s) réaffecté(s)`]
      if (tc.newItems.length > 0) parts.push(`${tc.newItems.length} item(s) fictif(s) créé(s)`)
      if (tc.roadmapGoals.length > 0) parts.push(`${tc.roadmapGoals.length} thème(s)/Sprint Goal(s) renseigné(s)`)
      return `Plan de sprints appliqué : ${parts.join(', ')}`
    }
    case 'roadmap_goal_created': return `Thème/Sprint Goal renseignés : ${tc.goal.name}`
    case 'roadmap_goal_updated': return `Thème/Sprint Goal mis à jour : ${tc.goal.name}`
    // sprint_plan_simulated ne passe jamais par ici en pratique (voir PendingPlanButton plus bas,
    // rendu à part - un vrai bouton, pas ce résumé texte) : seulement pour satisfaire l'exhaustivité
    // du switch, au cas où ce kind atteindrait ce chemin par erreur un jour.
    case 'sprint_plan_simulated': return 'Plan simulé, en attente de confirmation'
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
  circleHelp: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
}

// Sous-chantier 3 (detection d'anomalies), 2026-08-10 : commandes slash (data/chatCommands.ts) -
// popover d'aide (liste complete, a la demande) + infobulle rotative (decouverte passive), les 2
// choisis par Julien plutot qu'une seule des deux pistes proposees.
function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onClose])
}

function CommandsHelpPopover({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)
  return (
    <div
      ref={ref} data-testid="chat-commands-help"
      style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 300, maxHeight: 360, overflowY: 'auto',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.2)', zIndex: 10002, padding: '10px 0',
      }}
    >
      <div style={{ padding: '0 12px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Commandes rapides
      </div>
      {CHAT_COMMANDS.map(c => (
        <div key={c.cmd} style={{ padding: '5px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, Menlo, monospace' }}>{c.cmd}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{c.description}</span>
        </div>
      ))}
    </div>
  )
}

// Rendu markdown des bulles assistant (2026-08-10, 8e retour Julien) : les réponses du Compagnon
// IA contiennent souvent du markdown (tableaux, gras, listes...) que Claude produit naturellement,
// affiché jusqu'ici en texte brut. react-markdown + remark-gfm (tableaux, GFM) plutôt qu'un parseur
// maison : le format n'est pas trivial (tableaux notamment), autant réutiliser une bibliothèque
// éprouvée comme déjà fait ailleurs pour des besoins non triviaux (exceljs, react-grid-layout).
// Seules les bulles ASSISTANT sont rendues en markdown - une bulle utilisateur reste le texte brut
// tel que tapé (voir la ligne `isUser ? ... : <ReactMarkdown>` plus bas), pour ne jamais réinterpréter
// la saisie de Julien à son insu. `components` casse les styles par défaut du navigateur (marges de
// <table>/<h1>...) pour rester cohérent avec la bulle (fond coloré, texte compact) plutôt que des
// couleurs figées qui ne s'adapteraient pas au fond variable (utilisateur/assistant/erreur).
const MARKDOWN_COMPONENTS: Components = {
  p:  ({ children }) => <p style={{ margin: '0 0 6px 0' }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: '0 0 6px 0', paddingLeft: 18 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: '0 0 6px 0', paddingLeft: 18 }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
  h1: ({ children }) => <div style={{ fontWeight: 700, fontSize: 14, margin: '2px 0 6px' }}>{children}</div>,
  h2: ({ children }) => <div style={{ fontWeight: 700, fontSize: 13.5, margin: '2px 0 6px' }}>{children}</div>,
  h3: ({ children }) => <div style={{ fontWeight: 700, fontSize: 13, margin: '2px 0 6px' }}>{children}</div>,
  h4: ({ children }) => <div style={{ fontWeight: 700, fontSize: 12.5, margin: '2px 0 6px' }}>{children}</div>,
  blockquote: ({ children }) => (
    <blockquote style={{ margin: '0 0 6px 0', paddingLeft: 8, borderLeft: '2px solid currentColor', opacity: 0.85 }}>{children}</blockquote>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{children}</a>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid currentColor', opacity: 0.25, margin: '8px 0' }} />,
  // `className` porte "language-xxx" pour un bloc de code balisé (```js ... ```) - dans ce cas le
  // fond/padding vient déjà de `pre` ci-dessous, la pastille ne s'applique qu'au code EN LIGNE
  // (`` `update_item` ``), sans quoi un bloc de code afficherait une pastille dans une pastille.
  code: ({ className, children }) => {
    if (/language-/.test(className ?? '')) {
      return <code className={className} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5 }}>{children}</code>
    }
    return (
      <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, background: 'rgba(0,0,0,.12)', borderRadius: 4, padding: '1px 4px' }}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre style={{ margin: '0 0 6px 0', padding: '8px 10px', borderRadius: 6, background: 'rgba(0,0,0,.12)', overflowX: 'auto' }}>{children}</pre>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '0 0 6px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11.5 }}>{children}</table>
    </div>
  ),
  th: ({ children }) => <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid rgba(127,127,127,.4)', fontWeight: 700 }}>{children}</th>,
  td: ({ children }) => <td style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>{children}</td>,
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

// Addendum 12 (2026-08-22, 12e retour Julien, docs/corrections.md) : bouton "Appliquer ce plan",
// intégré à la bulle du plan (option A retenue par Julien sur maquette) plutôt qu'à côté, dans la
// rangée d'icônes copier/modifier - impossible à manquer ni à confondre avec une simple action
// secondaire. Remplace définitivement la confirmation textuelle ("oui"/"applique"), jamais fiabilisée
// malgré 11 tentatives successives (voir l'historique complet du chantier) : le clic envoie
// directement `call.planInput`/`call.roadmapGoals` - déjà figés au moment de la simulation, jamais
// reconstruits ici - à une route dédiée, sans repasser par le modèle. Une fois l'application réussie,
// ChatContext.tsx remplace cette entrée `sprint_plan_simulated` par un `sprint_plan_applied` dans le
// même message (voir applyPendingPlan) : ce composant se démonte alors de lui-même au prochain rendu,
// remplacé par le chip vert habituel - pas de state "succès" à gérer ici.
// `superseded` (2026-08-22, Addendum 13, docs/corrections.md) : garde-fou ajouté après un bug réel -
// une demande de modification du thème seul (composition inchangée) faisait répondre le modèle en
// texte libre ("confirmes-tu ?") au lieu de rappeler simulate_sprint_plan, laissant le SEUL bouton
// actionnable pointer vers les anciens thèmes. Le prompt système a été corrigé pour ne plus jamais
// laisser ce cas sans nouveau bouton (voir buildSystemPrompt, routes/ai.ts) - mais un plan simulé plus
// récent peut légitimement apparaître dans la conversation pour d'autres raisons (nouvelle exploration,
// nouvel essai de critère). Par sécurité structurelle plutôt que de dépendre uniquement du prompt,
// un bouton "Appliquer ce plan" dont un message PLUS RÉCENT contient déjà un plan simulé ou appliqué
// devient inerte : mieux vaut forcer l'utilisateur vers la proposition la plus à jour que risquer une
// application silencieuse d'un plan périmé (thèmes ou composition obsolètes).
function PendingPlanButton({ messageId, call, superseded }: { messageId: string; call: Extract<AiToolCall, { kind: 'sprint_plan_simulated' }>; superseded: boolean }) {
  const { applyPendingPlan } = useChat()
  const [status, setStatus] = useState<'idle' | 'applying' | 'error'>('idle')

  if (superseded) {
    return (
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <div
          data-testid="chat-apply-plan-btn-superseded"
          style={{
            width: '100%', border: '1px dashed var(--border)', background: 'none', color: 'var(--text-muted)',
            borderRadius: 7, fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
            padding: '9px 10px', textAlign: 'center', lineHeight: 1.4,
          }}
        >
          Proposition remplacée par une plus récente ci-dessous - utilise plutôt son bouton.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <button
        data-testid="chat-apply-plan-btn"
        disabled={status === 'applying'}
        style={{
          width: '100%', border: 'none', background: 'var(--primary)', color: '#fff',
          borderRadius: 7, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          padding: '9px 0', cursor: status === 'applying' ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          opacity: status === 'applying' ? 0.7 : 1,
        }}
        onClick={() => {
          if (status === 'applying') return
          setStatus('applying')
          applyPendingPlan(messageId, call).catch(() => setStatus('error'))
        }}
      >
        <Svg d={SVG.check} />
        {status === 'applying' ? 'Application en cours…' : 'Appliquer ce plan'}
      </button>
      <div style={{ fontSize: 11, marginTop: 6, textAlign: 'center', color: status === 'error' ? 'var(--danger, #dc2626)' : 'var(--text-muted)' }}>
        {status === 'error' ? "Échec de l'application, réessaie." : 'Ou décris ce que tu veux changer'}
      </div>
    </div>
  )
}

// Édition d'un message utilisateur (2026-08-09, 5e retour Julien) : repasse en mode saisie, la
// validation tronque la conversation à ce message et la renvoie via editMessage (ChatContext.tsx) -
// même principe qu'"éditer et regénérer" dans les chats classiques.
function MessageBubble({ message, hasNewerPlan }: { message: ChatMessage; hasNewerPlan: boolean }) {
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
          padding: '8px 12px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
          background: isUser ? 'var(--primary)' : (message.error ? 'var(--danger-light, #fee2e2)' : 'var(--surface2)'),
          color: isUser ? '#fff' : (message.error ? 'var(--danger, #dc2626)' : 'var(--text)'),
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{message.content}</ReactMarkdown>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {message.toolCalls.map((tc, i) => tc.kind === 'sprint_plan_simulated' ? (
              <PendingPlanButton key={i} messageId={message.id} call={tc} superseded={hasNewerPlan} />
            ) : (
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
  const [helpOpen, setHelpOpen] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)
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

  // Infobulle rotative (2026-08-10, sous-chantier 3) : decouverte passive des commandes, en plus du
  // popover d'aide a la demande (voir CommandsHelpPopover). D'abord un minuteur fixe (9s), juge trop
  // frequent - "j'ai peur que le roulement fasse saturer" - et remplace (retour Julien apres test
  // reel) par un changement d'astuce a chaque ouverture/fermeture ou reduction/agrandissement du
  // panneau, jamais pendant qu'il reste ouvert sans y toucher.
  //
  // Bug reel trouve apres coup (pas juste un test flaky) : ChatPanel est toujours monte (App.tsx),
  // meme quand `open` vaut false - ses hooks tournent donc des le chargement de l'appli, avant tout
  // clic sur le bouton Compagnon IA. Un simple `useEffect(() => setTipIndex(...), [open, collapsed])`
  // se declenche donc une premiere fois AU MONTAGE (avec `open` encore a false), pas seulement a la
  // vraie ouverture - et en StrictMode (mode dev), React rejoue ce montage une deuxieme fois, donc
  // l'astuce avait deja avance de 2 avant meme le premier clic. Le vrai passage a `open: true`
  // avancait alors une 3e fois, avec un delai variable selon la machine - d'ou l'astuce parfois
  // surprise "encore en train de changer" juste apres l'ouverture (observe en test reel par Julien,
  // jamais reproduit en environnement isole car mon script de repro lisait toujours trop tard pour
  // capter l'etat transitoire). Fix : comparer a la valeur precedente reellement vue (refs), pas a un
  // simple booleen "premier passage" - insensible au nombre de fois ou StrictMode rejoue l'effet au
  // montage, puisque `open`/`collapsed` n'ont, eux, pas change entre ces rejeux.
  const prevOpenRef = useRef(open)
  const prevCollapsedRef = useRef(prefs.collapsed)
  useEffect(() => {
    if (prevOpenRef.current !== open || prevCollapsedRef.current !== prefs.collapsed) {
      setTipIndex(i => (i + 1) % CHAT_COMMANDS.length)
    }
    prevOpenRef.current = open
    prevCollapsedRef.current = prefs.collapsed
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
          <div style={{ position: 'relative', display: 'flex' }}>
            <button
              onClick={() => setHelpOpen(o => !o)} data-testid="chat-help-btn" title="Commandes rapides" aria-label="Aide"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
            >
              <Svg d={SVG.circleHelp} size={15} />
            </button>
            {helpOpen && <CommandsHelpPopover onClose={() => setHelpOpen(false)} />}
          </div>
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
        {messages.map((m, idx) => (
          <MessageBubble
            key={m.id}
            message={m}
            // Un plan simulé (bouton) est périmé dès qu'un message PLUS RÉCENT contient déjà un
            // autre plan simulé ou appliqué - voir le commentaire de PendingPlanButton plus haut.
            hasNewerPlan={messages.slice(idx + 1).some(m2 =>
              m2.toolCalls?.some(tc => tc.kind === 'sprint_plan_simulated' || tc.kind === 'sprint_plan_applied'))}
          />
        ))}
        {sending && (
          <div data-testid="chat-typing-indicator" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Le Compagnon IA rédige
            <span className="chat-typing"><span /><span /><span /></span>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          type="button" onClick={() => setInput(CHAT_COMMANDS[tipIndex].cmd)} data-testid="chat-tip"
          title="Cliquer pour utiliser cette commande"
          style={{
            display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px 14px 0', fontSize: 11, color: 'var(--text-muted)',
          }}
        >
          Astuce : <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700 }}>{CHAT_COMMANDS[tipIndex].cmd}</span> - {CHAT_COMMANDS[tipIndex].description}
        </button>
        <div style={{ padding: '8px 14px 12px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            data-testid="chat-input"
            rows={1}
            placeholder="Écrire un message... (ou une commande, ex. /audit)"
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
