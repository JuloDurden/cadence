import { useState, useEffect } from 'react'
import type { Item, CadenceState } from '../../types'

const PRIORITIES = [
  { value: 'critical', label: 'Critique' },
  { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low', label: 'Faible' },
]

function uid() { return Math.random().toString(36).slice(2, 10) }

interface Props {
  item: Item | null
  state: CadenceState
  onSave: (item: Item) => void
  onClose: () => void
}

export function ItemModal({ item, state, onSave, onClose }: Props) {
  const isNew = !item
  const defaultStatus = state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id ?? 'todo'

  const [form, setForm] = useState<Partial<Item>>({
    desc: '', sp: 3, priority: 'medium', status: defaultStatus,
    clientId: state.clients[0]?.id ?? '', sprintId: null,
    assignees: [], tags: [], role: '', need: '', benefit: '',
  })
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    if (item) setForm(item)
  }, [item])

  function set<K extends keyof Item>(key: K, val: Item[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !form.tags?.includes(t)) set('tags', [...(form.tags ?? []), t])
    setTagInput('')
  }

  function removeTag(t: string) { set('tags', (form.tags ?? []).filter(x => x !== t)) }

  function handleSubmit() {
    if (!form.desc?.trim()) return
    const client = state.clients.find(c => c.id === form.clientId)
    const existingKeys = state.items.map(i => i.key)
    let key = item?.key
    if (!key && client) {
      const nums = existingKeys.filter(k => k.startsWith(client.prefix + '-')).map(k => parseInt(k.split('-')[1])).filter(n => !isNaN(n))
      const next = nums.length ? Math.max(...nums) + 1 : 1
      key = `${client.prefix}-${next}`
    }
    const saved: Item = {
      id: item?.id ?? uid(),
      key: key ?? 'NEW-1',
      desc: form.desc ?? '',
      sp: form.sp ?? 3,
      priority: form.priority ?? 'medium',
      status: form.status ?? defaultStatus,
      clientId: form.clientId ?? '',
      sprintId: form.sprintId ?? null,
      assignees: form.assignees ?? [],
      tags: form.tags ?? [],
      role: form.role, need: form.need, benefit: form.benefit,
      createdAt: item?.createdAt ?? new Date().toISOString(),
    }
    onSave(saved)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{isNew ? 'Nouvelle User Story' : `Modifier ${item?.key}`}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Description</label>
            <textarea value={form.desc ?? ''} onChange={e => set('desc', e.target.value)} placeholder="En tant que... je veux... afin de..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Client</label>
              <select value={form.clientId ?? ''} onChange={e => set('clientId', e.target.value)}>
                {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Sprint</label>
              <select value={form.sprintId ?? ''} onChange={e => set('sprintId', e.target.value || null)}>
                <option value="">Non assigné</option>
                {state.sprints.filter(s => !s.closed).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Story Points</label>
              <input type="number" min={0} max={100} value={form.sp ?? 3} onChange={e => set('sp', parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label>Priorité</label>
              <select value={form.priority ?? 'medium'} onChange={e => set('priority', e.target.value as Item['priority'])}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Statut</label>
              <select value={form.status ?? defaultStatus} onChange={e => set('status', e.target.value)}>
                {state.kanbanCols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Assigné(s)</label>
              <select multiple value={form.assignees ?? []} onChange={e => set('assignees', Array.from(e.target.selectedOptions, o => o.value))} style={{ height: 72 }}>
                {state.team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Tags</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {(form.tags ?? []).map(t => (
                <span key={t} className="tag" style={{ cursor: 'pointer' }} onClick={() => removeTag(t)}>{t} ✕</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="Ajouter un tag (Entrée)" />
              <button className="btn btn-secondary" type="button" onClick={addTag}>+</button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSubmit}>{isNew ? 'Créer' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
