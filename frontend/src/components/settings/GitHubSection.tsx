import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { useDialog } from '../../context/DialogContext'
import { fmtDateTime } from '../../utils/dates'
import type { GitHubConfig } from '../../types'

// Extrait le message d'erreur renvoyé par le backend (`{ error: '...' }`, voir
// backend/src/routes/github.ts) depuis le texte brut de l'exception levée par `request()`
// (services/api.ts, format `API <status>: <corps>`), utile ici car les erreurs GitHub
// (dépôt introuvable, jeton invalide...) sont directement actionnables pour l'utilisateur qui
// configure la connexion, contrairement aux erreurs génériques déjà gérées ailleurs dans l'app.
function extractApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback
  try {
    const body = err.message.slice(err.message.indexOf(':') + 1).trim()
    const parsed = JSON.parse(body) as { error?: string }
    return parsed.error ?? fallback
  } catch {
    return fallback
  }
}

// Phase 5 (roadmap v1), Intégration GitHub, 2026-08-08 : dépôt unique lié au workspace (voir
// backend/src/routes/github.ts). Réservé au rôle Admin (secret d'organisation, contrairement aux
// jetons API MCP personnels de ApiTokensSection ci-dessus), décision Julien (AskUserQuestion,
// scope) : jeton personnel GitHub collé en Réglages plutôt qu'une vraie app OAuth, pour démarrer.
export function GitHubSection() {
  const { showToast } = useToast()
  const { confirm } = useDialog()
  const [config, setConfig] = useState<GitHubConfig | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  function load() {
    api.getGitHubConfig().then(({ config }) => setConfig(config)).catch(() => setConfig(null))
  }

  useEffect(() => { load() }, [])

  function startEdit() {
    setOwner(config?.owner ?? '')
    setRepo(config?.repo ?? '')
    setToken('')
    setSaveError(null)
    setEditing(true)
  }

  function handleSave() {
    const trimmedOwner = owner.trim()
    const trimmedRepo = repo.trim()
    if (!trimmedOwner || !trimmedRepo) return
    if (!config && !token.trim()) { setSaveError('Jeton requis pour une première connexion.'); return }
    setSaving(true)
    setSaveError(null)
    api.saveGitHubConfig({ owner: trimmedOwner, repo: trimmedRepo, token: token.trim() || undefined })
      .then(({ config }) => {
        setConfig(config)
        setEditing(false)
        showToast('Dépôt GitHub connecté.')
      })
      .catch(err => setSaveError(extractApiError(err, 'Connexion GitHub impossible.')))
      .finally(() => setSaving(false))
  }

  async function handleDisconnect() {
    const ok = await confirm(
      `Les items ne pourront plus afficher de commits ni de Pull Requests liés depuis "${config?.owner}/${config?.repo}".`,
      { title: 'Déconnecter ce dépôt ?', confirmLabel: 'Déconnecter', danger: true }
    )
    if (!ok) return
    setDisconnecting(true)
    api.deleteGitHubConfig()
      .then(() => { setConfig(null); showToast('Dépôt GitHub déconnecté.') })
      .catch(() => showToast('Impossible de déconnecter le dépôt.', 'error'))
      .finally(() => setDisconnecting(false))
  }

  return (
    <section data-testid="github-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Intégration GitHub</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Relie un dépôt GitHub au workspace pour retrouver, sur chaque item, les commits et Pull Requests dont le message ou le titre contient sa Clé (ex. "FAX-012"). Jeton personnel GitHub (scope "repo" en lecture suffit), collé ici plutôt qu'une vraie app OAuth pour ce prototype.
      </p>

      {config === undefined ? null : (!editing && config) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, marginBottom: 4 }} data-testid="github-config-connected">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, background: 'var(--success-light, #dcfce7)', color: 'var(--success, #16a34a)', fontWeight: 600 }}>
            ● Connecté
          </span>
          <strong>{config.owner}/{config.repo}</strong>
          <span style={{ color: 'var(--text-muted)' }}>Jeton {config.tokenPreview}</span>
          <span style={{ color: 'var(--text-muted)' }}>Mis à jour le {fmtDateTime(config.updatedAt)}</span>
          <div style={{ flex: 1 }} />
          <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={startEdit}>Modifier</button>
          <button
            className="hdr-ctx-btn" style={{ fontSize: 11 }} data-testid="github-disconnect-btn"
            disabled={disconnecting} onClick={handleDisconnect}
          >
            {disconnecting ? 'Déconnexion…' : 'Déconnecter'}
          </button>
        </div>
      ) : (!editing && !config) ? (
        <button className="hdr-ctx-btn" data-testid="github-connect-btn" onClick={startEdit}>Connecter un dépôt</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Propriétaire</label>
              <input className="form-input" placeholder="ex. juloclavel" value={owner} data-testid="github-owner-input" onChange={e => setOwner(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Dépôt</label>
              <input className="form-input" placeholder="ex. cadence" value={repo} data-testid="github-repo-input" onChange={e => setRepo(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Jeton personnel GitHub{config ? ' (laisser vide pour garder le jeton actuel)' : ''}</label>
            <input className="form-input" type="password" placeholder={config ? '••••••••' : 'ghp_...'} value={token} data-testid="github-token-input" onChange={e => setToken(e.target.value)} />
          </div>
          {saveError && <p style={{ fontSize: 11, color: 'var(--danger)' }} data-testid="github-save-error">{saveError}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="hdr-ctx-btn" data-testid="github-save-btn"
              disabled={saving || !owner.trim() || !repo.trim()} onClick={handleSave}
            >
              {saving ? 'Vérification…' : 'Tester et enregistrer'}
            </button>
            <button className="hdr-ctx-btn" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </div>
      )}
    </section>
  )
}
