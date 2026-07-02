import { useState } from 'react'
import type { RetroItem, TeamMember } from '../../types'

interface Props {
  colKey: string
  label: string
  color: string
  items: RetroItem[]
  team: TeamMember[]
  currentUserId: string
  onAdd: (text: string) => void
  onVote: (itemId: string) => void
  onDelete: (itemId: string) => void
}

export function RetroColumnCard({ colKey, label, color, items, team, currentUserId, onAdd, onVote, onDelete }: Props) {
  const [input, setInput] = useState('')

  function handleAdd() {
    const t = input.trim()
    if (!t) return
    onAdd(t)
    setInput('')
  }

  const sorted = [...items].sort((a, b) => b.votes.length - a.votes.length)

  return (
    <div style={{ flex: '1 1 0', minWidth: 220, background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: color + '12', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color }}>{label}</span>
        <span style={{ fontSize: 11, background: color + '20', color, padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>{items.length}</span>
      </div>
      <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
        {sorted.map(item => {
          const voted = item.votes.includes(currentUserId)
          const author = team.find(m => m.id === item.authorId)
          return (
            <div key={item.id} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 6 }}>{item.text}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{author?.name.split(' ')[0] ?? '?'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => onVote(item.id)}
                    style={{ background: voted ? color + '20' : 'transparent', border: `1px solid ${voted ? color : 'var(--border)'}`, borderRadius: 4, padding: '1px 6px', cursor: 'pointer', fontSize: 11, color: voted ? color : 'var(--text-muted)', fontWeight: voted ? 700 : 400, display: 'flex', alignItems: 'center', gap: 3 }}
                  >
                    👍 {item.votes.length}
                  </button>
                  <button className="btn-icon danger" style={{ padding: '2px 4px', fontSize: 11 }} onClick={() => onDelete(item.id)}>✕</button>
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
