import { useState } from 'react'
import type { RetroItem, TeamMember } from '../../types'

interface Props {
  colKey: string
  label: string
  color: string
  icon: string           // SVG path(s) for the column header icon
  items: RetroItem[]
  team: TeamMember[]
  currentUserId: string
  onAdd: (text: string) => void
  onVote: (itemId: string) => void
  onDislike: (itemId: string) => void
  onDelete: (itemId: string) => void
  // Phase 2 (roadmap v1), sous-chantier 3 : réglage de session (RetroSession.anonymousVotes,
  // activé par le Scrum Master) — masque le style "vous avez déjà voté" sur J'aime/Je n'aime pas
  // pour tout le monde. Le vote continue de fonctionner normalement (le compteur change), seul
  // l'indicateur visuel de son propre vote disparaît.
  anonymousVotes?: boolean
  // Correctif 2026-08-20 (retour Julien) : le bouton de suppression d'un item n'était soumis à
  // aucun contrôle, n'importe quel compte pouvait supprimer l'item de n'importe qui. Décidé item
  // par item plutôt qu'un simple booléen de colonne, car la réponse dépend de l'auteur de CHAQUE
  // item (voir utils/permissions.ts, canDeleteRetroItem) : PO/Admin peuvent tout supprimer, un Dev
  // ne peut supprimer que ses propres items.
  canDelete: (item: RetroItem) => boolean
}

function Ico({ d, size = 13, color = 'currentColor' }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  )
}

const THUMB_UP = '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>'
const THUMB_DOWN = '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/>'
const CLOSE = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'

export function RetroColumnCard({ label, color, icon, items, team, currentUserId, onAdd, onVote, onDislike, onDelete, anonymousVotes = false, canDelete }: Props) {
  const [input, setInput] = useState('')

  function handleAdd() {
    const t = input.trim()
    if (!t) return
    onAdd(t)
    setInput('')
  }

  const sorted = [...items].sort((a, b) => (b.votes.length - (b.dislikes?.length ?? 0)) - (a.votes.length - (a.dislikes?.length ?? 0)))

  return (
    <div style={{ flex: '1 1 0', minWidth: 220, background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: color + '12', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ico d={icon} size={14} color={color} />
          {label}
        </span>
        <span style={{ fontSize: 11, background: color + '20', color, padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>{items.length}</span>
      </div>
      <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
        {sorted.map(item => {
          const liked = !anonymousVotes && item.votes.includes(currentUserId)
          const disliked = !anonymousVotes && (item.dislikes ?? []).includes(currentUserId)
          // `authorName` est capturé à la création (compte réellement connecté, voir Chantier J) —
          // repli sur l'ancien lookup `state.team` pour des post-its créés avant ce correctif.
          const authorLabel = item.authorName ?? team.find(m => m.id === item.authorId)?.name
          return (
            <div key={item.id} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 6 }}>{item.text}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{authorLabel?.split(' ')[0] ?? '?'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    data-testid={`retro-vote-${item.id}`}
                    data-liked={liked}
                    title="J'aime"
                    onClick={() => onVote(item.id)}
                    style={{ background: liked ? color + '20' : 'transparent', border: `1px solid ${liked ? color : 'var(--border)'}`, borderRadius: 4, padding: '2px 6px', cursor: 'pointer', color: liked ? color : 'var(--text-muted)', fontWeight: liked ? 700 : 400, display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}
                  >
                    <Ico d={THUMB_UP} size={11} color={liked ? color : 'var(--text-muted)'} />
                    {item.votes.length}
                  </button>
                  <button
                    title="Je n'aime pas"
                    onClick={() => onDislike(item.id)}
                    style={{ background: disliked ? 'rgba(255,59,48,.12)' : 'transparent', border: `1px solid ${disliked ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 4, padding: '2px 6px', cursor: 'pointer', color: disliked ? 'var(--danger)' : 'var(--text-muted)', fontWeight: disliked ? 700 : 400, display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}
                  >
                    <Ico d={THUMB_DOWN} size={11} color={disliked ? 'var(--danger)' : 'var(--text-muted)'} />
                    {(item.dislikes ?? []).length}
                  </button>
                  {canDelete(item) && (
                    <button className="btn-icon danger" style={{ padding: '2px 4px' }} onClick={() => onDelete(item.id)} aria-label="Supprimer cet item">
                      <Ico d={CLOSE} size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Ajouter..."
          style={{ flex: 1, fontSize: 12 }}
        />
        <button className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={handleAdd}>+</button>
      </div>
    </div>
  )
}
