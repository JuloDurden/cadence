import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { USER_ROLES, USER_ROLE_LABELS } from '../../types'
import type { ManagedUser, UserRole } from '../../types'

// Phase 2 (roadmap v1), sous-chantier 1 : gestion des comptes, visible uniquement pour le rôle
// Admin (gating fait par l'appelant, SettingsPage.tsx). Le backend refuse aussi ces requêtes avec
// un 403 pour tout autre rôle (voir backend/src/routes/users.ts) — cette section n'est donc pas
// le seul rempart, juste le reflet de la permission réelle côté serveur.
export function UsersSettingsSection() {
  const { showToast } = useToast()
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'DEV' as UserRole })
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)

  function load() {
    setLoadError(false)
    api.listUsers()
      .then(({ users }) => setUsers(users))
      .catch(() => setLoadError(true))
  }

  useEffect(() => { load() }, [])

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      showToast('Nom, email et mot de passe (8 caractères minimum) requis.', 'error')
      return
    }
    setCreating(true)
    api.createUser({ ...form, name: form.name.trim(), email: form.email.trim() })
      .then(({ user }) => {
        setUsers(u => [...(u ?? []), user])
        setForm({ name: '', email: '', password: '', role: 'DEV' })
        showToast('Utilisateur créé.')
      })
      .catch(() => showToast('Impossible de créer cet utilisateur (email déjà utilisé ?).', 'error'))
      .finally(() => setCreating(false))
  }

  function handleRoleChange(id: string, role: UserRole) {
    setSavingRoleId(id)
    api.updateUser(id, { role })
      .then(({ user }) => setUsers(u => (u ?? []).map(x => x.id === id ? user : x)))
      .catch(() => showToast('Impossible de changer ce rôle.', 'error'))
      .finally(() => setSavingRoleId(null))
  }

  return (
    <section data-testid="users-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Utilisateurs</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Comptes ayant accès à l'outil et leur rôle (PO, Scrum Master, Développeur, Stakeholder, Admin). Réservé au rôle Admin.
      </p>

      {loadError && <p style={{ fontSize: 12, color: 'var(--danger, #dc2626)', marginBottom: 12 }}>Impossible de charger la liste des utilisateurs.</p>}

      {users && users.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {users.map(u => (
            <div key={u.id} data-testid={`user-row-${u.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
              </div>
              <select data-testid={`user-role-${u.id}`} className="form-input" style={{ width: 170 }} value={u.role} disabled={savingRoleId === u.id}
                onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}>
                {USER_ROLES.map(r => <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div className="form-group">
          <label className="form-label">Nom</label>
          <input data-testid="new-user-name" className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input data-testid="new-user-email" className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Mot de passe (8 caractères min.)</label>
          <input data-testid="new-user-password" className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Rôle</label>
          <select data-testid="new-user-role" className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
            {USER_ROLES.map(r => <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button data-testid="create-user-submit" className="hdr-ctx-btn" type="submit" disabled={creating}>
            {creating ? 'Création…' : 'Créer un utilisateur'}
          </button>
        </div>
      </form>
    </section>
  )
}
