import { useState, useEffect } from 'react'
import type { Client, Contact } from '../../types'

const TIERS = ['Enterprise', 'Mid-Market', 'SMB', 'Startup']
const RAGS = [{ v: 'G', label: '🟢 OK' }, { v: 'A', label: '🟡 Attention' }, { v: 'R', label: '🔴 Critique' }]
const COLORS = ['#4f46e5','#f59e0b','#ef4444','#10b981','#8b5cf6','#06b6d4','#f97316','#ec4899']

function uid() { return Math.random().toString(36).slice(2, 9) }

interface Props {
  client: Client | null
  onSave: (client: Client) => void
  onClose: () => void
}

export function ClientModal({ client, onSave, onClose }: Props) {
  const [form, setForm] = useState<Partial<Client>>({
    name: '', prefix: '', tier: 'Enterprise', annualRevenue: 0, rag: 'G', color: '#4f46e5', contacts: []
  })

  useEffect(() => { if (client) setForm(client) }, [client])

  function set<K extends keyof Client>(k: K, v: Client[K]) { setForm(f => ({ ...f, [k]: v })) }

  function addContact() {
    const c: Contact = { id: uid(), name: '', role: '', email: '' }
    set('contacts', [...(form.contacts ?? []), c])
  }
  function updateContact(id: string, field: keyof Contact, val: string) {
    set('contacts', (form.contacts ?? []).map(c => c.id === id ? { ...c, [field]: val } : c))
  }
  function removeContact(id: string) {
    set('contacts', (form.contacts ?? []).filter(c => c.id !== id))
  }

  function handleSave() {
    if (!form.name?.trim()) return
    onSave({
      id: client?.id ?? uid(),
      name: form.name ?? '',
      prefix: (form.prefix ?? form.name?.slice(0, 3) ?? 'CLI').toUpperCase(),
      tier: form.tier ?? 'Enterprise',
      annualRevenue: form.annualRevenue ?? 0,
      rag: form.rag ?? 'G',
      color: form.color ?? '#4f46e5',
      contacts: form.contacts ?? [],
      notes: form.notes,
      excludeFromPlanning: form.excludeFromPlanning ?? false,
    })
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{client ? `Modifier ${client.name}` : 'Nouveau client'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label>Nom</label>
              <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Nom du client" />
            </div>
            <div className="form-group">
              <label>Préfixe clés</label>
              <input value={form.prefix ?? ''} onChange={e => set('prefix', e.target.value.toUpperCase().slice(0,5))} placeholder="AUT" maxLength={5} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Tier</label>
              <select value={form.tier ?? 'Enterprise'} onChange={e => set('tier', e.target.value)}>
                {TIERS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>CA Annuel (€)</label>
              <input type="number" value={form.annualRevenue ?? 0} onChange={e => set('annualRevenue', Number(e.target.value))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>RAG</label>
              <select value={form.rag ?? 'G'} onChange={e => set('rag', e.target.value as 'R'|'A'|'G')}>
                {RAGS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Couleur</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
                {COLORS.map(c => (
                  <div key={c} onClick={() => set('color', c)} style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '3px solid var(--text)' : '2px solid transparent', transition: 'border .15s' }} />
                ))}
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={form.excludeFromPlanning ?? false} onChange={e => set('excludeFromPlanning', e.target.checked)} />
              <span>Exclure du critère "Importance client" (Auto-planning)</span>
            </label>
          </div>
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ marginBottom: 0 }}>Contacts</label>
              <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={addContact}>+ Contact</button>
            </div>
            {(form.contacts ?? []).map(c => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
                <input value={c.name} onChange={e => updateContact(c.id, 'name', e.target.value)} placeholder="Nom" style={{ fontSize: 12 }} />
                <input value={c.role} onChange={e => updateContact(c.id, 'role', e.target.value)} placeholder="Rôle" style={{ fontSize: 12 }} />
                <input value={c.email} onChange={e => updateContact(c.id, 'email', e.target.value)} placeholder="Email" style={{ fontSize: 12 }} />
                <button className="btn-icon danger" onClick={() => removeContact(c.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave}>{client ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}
