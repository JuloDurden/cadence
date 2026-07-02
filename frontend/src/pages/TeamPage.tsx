import { useState } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import type { TeamMember } from '../types'

const ROLE_OPTIONS = ['Product Owner', 'Scrum Master', 'Dev Front', 'Dev Back', 'Dev Full-stack', 'Designer', 'QA', 'DevOps', 'Data Scientist', 'Autre']
const TAG_SUGGESTIONS = ['React', 'TypeScript', 'Python', 'Java', 'SQL', 'UX', 'DevOps', 'IA', 'Mobile', 'Architecture']

function uid() { return Math.random().toString(36).slice(2, 9) }

interface ModalProps { member: TeamMember | null; onSave: (m: TeamMember) => void; onClose: () => void }

function MemberModal({ member, onSave, onClose }: ModalProps) {
  const [form, setForm] = useState<TeamMember>(member ?? { id: uid(), name: '', role: 'Dev Full-stack', spPerDay: 2, tags: [] })
  const [tagInput, setTagInput] = useState('')

  function addTag(t: string) {
    const tag = t.trim()
    if (tag && !form.tags.includes(tag)) setForm(f => ({ ...f, tags: [...f.tags, tag] }))
    setTagInput('')
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-header">
          <h2 className="modal-title">{member ? 'Modifier le membre' : 'Nouveau membre'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Nom *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Prénom Nom" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Rôle</label>
            <select className="form-input form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">SP / jour</label>
            <input className="form-input" type="number" min={0.5} max={10} step={0.5} value={form.spPerDay} onChange={e => setForm(f => ({ ...f, spPerDay: +e.target.value }))} style={{ width: 100 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Compétences</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {form.tags.map(t => (
                <span key={t} className="badge" style={{ background: 'var(--primary)', color: '#fff', cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))}>{t} ×</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="Ajouter une compétence…" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) } }} />
              <button className="hdr-ctx-btn" onClick={() => addTag(tagInput)}>+</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {TAG_SUGGESTIONS.filter(t => !form.tags.includes(t)).map(t => (
                <span key={t} className="badge" style={{ cursor: 'pointer', opacity: .7 }} onClick={() => setForm(f => ({ ...f, tags: [...f.tags, t] }))}>{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={!form.name.trim()} onClick={() => { if (form.name.trim()) onSave({ ...form, name: form.name.trim() }) }}>
            {member ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]?.toUpperCase() ?? '').join('').slice(0, 2)
}

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
function memberColor(id: string) { return COLORS[id.charCodeAt(id.length - 1) % COLORS.length] }

export function TeamPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [modal, setModal] = useState<TeamMember | null | undefined>(undefined)

  function handleSave(m: TeamMember) {
    const isNew = !state.team.find(t => t.id === m.id)
    dispatch({ type: isNew ? 'ADD_MEMBER' : 'UPDATE_MEMBER', payload: m })
    const newTeam = isNew ? [...state.team, m] : state.team.map(t => t.id === m.id ? m : t)
    saveToServer({ ...state, team: newTeam })
    setModal(undefined)
  }

  function handleDelete(id: string) {
    if (!confirm('Supprimer ce membre ?')) return
    dispatch({ type: 'DELETE_MEMBER', payload: id })
    saveToServer({ ...state, team: state.team.filter(t => t.id !== id) })
  }

  const totalCap = state.team.reduce((s, m) => s + m.spPerDay, 0)

  return (
    <>
      <Header title="Équipe">
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{state.team.length} membres · {totalCap} SP/jour</span>
        <div className="hdr-sep" />
        <button className="hdr-btn primary" onClick={() => setModal(null)}>+ Nouveau membre</button>
      </Header>

      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {state.team.map(m => {
            const assignedItems = state.items.filter(i => i.assignees.includes(m.id))
            const inProgress = assignedItems.filter(i => !['done','delivered'].includes(i.status))
            const done = assignedItems.filter(i => ['done','delivered'].includes(i.status))
            const color = memberColor(m.id)
            return (
              <div key={m.id} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                    {initials(m.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.role}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-icon" onClick={() => setModal(m)} title="Modifier">✎</button>
                    <button className="btn-icon danger" onClick={() => handleDelete(m.id)} title="Supprimer">🗑</button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{m.spPerDay}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>SP/jour</div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--warning)' }}>{inProgress.length}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>En cours</div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)' }}>{done.length}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Terminées</div>
                  </div>
                </div>

                {m.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {m.tags.map(t => <span key={t} className="badge" style={{ fontSize: 10 }}>{t}</span>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {modal !== undefined && (
        <MemberModal member={modal} onSave={handleSave} onClose={() => setModal(undefined)} />
      )}
    </>
  )
}
