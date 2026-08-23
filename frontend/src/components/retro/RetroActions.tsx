import { useState } from 'react'
import type { RetroAction, TeamMember } from '../../types'

interface Props {
  actions: RetroAction[]
  team: TeamMember[]
  onAdd: (action: RetroAction) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

function uid() { return Math.random().toString(36).slice(2, 9) }

export function RetroActions({ actions, team, onAdd, onToggle, onDelete }: Props) {
  const [text, setText] = useState('')
  const [ownerId, setOwnerId] = useState(team[0]?.id ?? '')
  const [dueDate, setDueDate] = useState('')

  function handleAdd() {
    if (!text.trim()) return
    onAdd({ id: uid(), text: text.trim(), ownerId, dueDate: dueDate || undefined, done: false })
    setText('')
    setDueDate('')
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden', marginTop: 20 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(79,70,229,.05)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>' }} />
        Plan d'actions
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map(action => {
          const owner = team.find(m => m.id === action.ownerId)
          return (
            <div key={action.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: action.done ? '#34c75908' : 'var(--surface2)', borderRadius: 6, border: `1px solid ${action.done ? '#34c75930' : 'var(--border)'}` }}>
              <input type="checkbox" checked={action.done} onChange={() => onToggle(action.id)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
              <span style={{ flex: 1, fontSize: 12, textDecoration: action.done ? 'line-through' : 'none', color: action.done ? 'var(--text-muted)' : 'var(--text)' }}>{action.text}</span>
              {owner && <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{owner.name.split(' ')[0]}</span>}
              {action.dueDate && <span style={{ fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{new Date(action.dueDate).toLocaleDateString('fr-FR')}</span>}
              <button className="btn-icon danger" style={{ padding: '2px 4px', fontSize: 11 }} onClick={() => onDelete(action.id)} aria-label="Supprimer cette action">✕</button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="Nouvelle action..." style={{ flex: 2, fontSize: 12 }} />
          <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="hdr-select" style={{ flex: 1 }}>
            {team.map(m => <option key={m.id} value={m.id}>{m.name.split(' ')[0]}</option>)}
          </select>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ flex: 1, fontSize: 12 }} />
          <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12, whiteSpace: 'nowrap' }} onClick={handleAdd}>+ Action</button>
        </div>
      </div>
    </div>
  )
}
