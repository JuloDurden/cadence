import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { useCadence } from '../../context/StateContext'
import { defaultPosteForRole, posteHasNoVelocity } from '../../utils/permissions'
import { USER_ROLES, USER_ROLE_LABELS } from '../../types'
import type { Invitation, ManagedUser, UserRole } from '../../types'

// Phase 2 (roadmap v1), sous-chantier 1 : gestion des comptes, visible uniquement pour le rôle
// Admin (gating fait par l'appelant, SettingsPage.tsx). Le backend refuse aussi ces requêtes avec
// un 403 pour tout autre rôle (voir backend/src/routes/users.ts) — cette section n'est donc pas
// le seul rempart, juste le reflet de la permission réelle côté serveur.
export function UsersSettingsSection() {
  const { showToast } = useToast()
  const { state, dispatch, saveToServer } = useCadence()
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'DEV' as UserRole })
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)

  // Phase 2.5 (roadmap v1), Onboarding — invitations Stakeholder (voir backend/src/routes/
  // invitations.ts). Pas d'infrastructure d'envoi d'email dans ce prototype : le lien est
  // construit côté client à partir du token et copié dans le presse-papiers, à partager
  // manuellement par l'Admin (Slack, message direct...).
  const [invitations, setInvitations] = useState<Invitation[] | null>(null)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  // Verrouillage Stakeholder (2026-08-01) : l'Admin choisit le Client au moment de générer le
  // lien, plutôt que de laisser la personne invitée taper un nom d'entreprise (confidentialité —
  // voir createLinkedClientContact côté backend, qui rattache le compte comme Contact de ce
  // Client une fois l'invitation acceptée).
  const [inviteClientId, setInviteClientId] = useState('')

  function load() {
    setLoadError(false)
    api.listUsers()
      .then(({ users }) => setUsers(users))
      .catch(() => setLoadError(true))
  }

  function loadInvitations() {
    api.listInvitations().then(({ invitations }) => setInvitations(invitations)).catch(() => setInvitations([]))
  }

  useEffect(() => { load(); loadInvitations() }, [])

  function inviteLink(token: string) {
    return `${window.location.origin}/login?invite=${token}`
  }

  function handleCreateInvitation() {
    if (!inviteClientId) {
      showToast('Choisissez un client pour cette invitation.', 'error')
      return
    }
    setCreatingInvite(true)
    api.createInvitation(inviteClientId)
      .then(({ invitation }) => {
        setInvitations(inv => [invitation, ...(inv ?? [])])
        return navigator.clipboard?.writeText(inviteLink(invitation.token)).catch(() => { /* presse-papiers indisponible, le lien reste affiché */ })
      })
      .then(() => { showToast('Lien d\'invitation généré et copié dans le presse-papiers.'); setInviteClientId('') })
      .catch(() => showToast('Impossible de générer l\'invitation.', 'error'))
      .finally(() => setCreatingInvite(false))
  }

  function clientName(clientId: string | null) {
    if (!clientId) return null
    return state.clients.find(c => c.id === clientId)?.name ?? 'Client supprimé'
  }

  function handleCopyInvitation(token: string) {
    navigator.clipboard?.writeText(inviteLink(token))
      .then(() => showToast('Lien copié dans le presse-papiers.'))
      .catch(() => showToast('Impossible de copier le lien.', 'error'))
  }

  function handleRevokeInvitation(id: string) {
    setRevokingId(id)
    api.revokeInvitation(id)
      .then(() => setInvitations(inv => (inv ?? []).filter(i => i.id !== id)))
      .catch(() => showToast('Impossible de révoquer cette invitation.', 'error'))
      .finally(() => setRevokingId(null))
  }

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
        // Crée automatiquement la fiche Équipe correspondante, déjà liée à ce compte
        // (linkedUserId) — évite le détour manuel "créer le compte, puis aller sur Team lier la
        // fiche" d'avant. Poste par défaut dérivé du rôle (defaultPosteForRole), SP/jour à 0
        // d'emblée si ce poste n'a pas de vélocité propre (PO/Scrum Master, posteHasNoVelocity)
        // — tout reste éditable ensuite depuis la page Équipe par le compte concerné. Décision
        // actée avec Julien le 2026-07-31.
        const poste = defaultPosteForRole(user.role)
        const member = {
          id: crypto.randomUUID(),
          name: user.name,
          role: poste,
          spPerDay: posteHasNoVelocity(poste) ? 0 : 2,
          tags: [] as string[],
          linkedUserId: user.id,
        }
        dispatch({ type: 'ADD_MEMBER', payload: member })
        saveToServer({ ...state, team: [...state.team, member] })
        setForm({ name: '', email: '', password: '', role: 'DEV' })
        showToast('Utilisateur créé (fiche Équipe ajoutée automatiquement).')
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
    <>
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
          {/* Verrouillage Stakeholder (2026-08-01) : ce formulaire crée une fiche Équipe liée
              (voir plus bas) — jamais adaptée à un Stakeholder, qui doit désormais être un
              Contact sur un Client (voir section "Inviter un Stakeholder" ci-dessous, seul
              chemin de création pour ce rôle). */}
          <select data-testid="new-user-role" className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
            {USER_ROLES.filter(r => r !== 'STAKEHOLDER').map(r => <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <button data-testid="create-user-submit" className="hdr-ctx-btn" type="submit" disabled={creating}>
            {creating ? 'Création…' : 'Créer un utilisateur'}
          </button>
        </div>
      </form>
    </section>

    <section data-testid="invitations-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Inviter un Stakeholder</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Génère un lien à usage unique à partager manuellement (pas d'envoi d'email automatique dans ce prototype).
        La personne qui l'ouvre complète son inscription avec le rôle Stakeholder déjà attribué.
      </p>

      {invitations && invitations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {invitations.map(inv => (
            <div key={inv.id} data-testid={`invitation-row-${inv.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-muted)' }}>
                {inv.usedAt
                  ? <span data-testid={`invitation-status-${inv.id}`}>Utilisée</span>
                  : <span data-testid={`invitation-status-${inv.id}`}>En attente</span>}
                {clientName(inv.clientId) && <span> · {clientName(inv.clientId)}</span>}
              </div>
              {!inv.usedAt && (
                <>
                  <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => handleCopyInvitation(inv.token)}>Copier le lien</button>
                  <button className="hdr-ctx-btn" style={{ fontSize: 11 }} data-testid={`invitation-revoke-${inv.id}`}
                    disabled={revokingId === inv.id} onClick={() => handleRevokeInvitation(inv.id)}>
                    Révoquer
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          data-testid="invite-client-select"
          className="form-input"
          style={{ width: 220 }}
          value={inviteClientId}
          onChange={e => setInviteClientId(e.target.value)}
        >
          <option value="">Choisir un client…</option>
          {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button data-testid="create-invitation" className="hdr-ctx-btn" disabled={creatingInvite || !inviteClientId} onClick={handleCreateInvitation}>
          {creatingInvite ? 'Génération…' : '+ Inviter un Stakeholder'}
        </button>
      </div>
      {state.clients.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Aucun client enregistré — créez-en un depuis la page Clients avant d'inviter un Stakeholder.
        </p>
      )}
    </section>
    </>
  )
}
