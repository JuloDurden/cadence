import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { useDialog } from '../../context/DialogContext'
import { useCadence } from '../../context/StateContext'
import { fmtDateTime } from '../../utils/dates'
import { applyJiraImport } from '../../utils/jiraImport'
import type { JiraConfig, JiraProject } from '../../types'

// Même helper que GitHubSection/SlackSection, extrait le message `{ error }` renvoyé par le
// backend (voir backend/src/routes/jira.ts) depuis le texte brut de l'exception de `request()`.
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

// Phase 5 (roadmap v1), Intégration Jira, 2026-08-08 : projet Jira unique lié au workspace (voir
// backend/src/routes/jira.ts). Réservée Admin (secret d'organisation, même logique que
// GitHubSection/SlackSection). Décisions actées avec Julien (AskUserQuestion) : connexion API
// directe (jeton API Jira Cloud + email) plutôt qu'un export CSV, import répétable par clé Jira
// (voir utils/jiraImport.ts) plutôt qu'un import à sens unique.
//
// 2 étapes comme SlackSection (jeton → sélection dans une liste chargée depuis Jira), pas 1 seule
// comme GitHubSection : contrairement à owner/repo (saisis librement), la clé de projet Jira est
// choisie dans une liste pour éviter une erreur de frappe qui pointerait vers le mauvais projet.
export function JiraSection() {
  const { showToast } = useToast()
  const { confirm } = useDialog()
  const { state, dispatch, saveToServer } = useCadence()
  const [config, setConfig] = useState<JiraConfig | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)

  const [siteUrl, setSiteUrl] = useState('')
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [projects, setProjects] = useState<JiraProject[] | null>(null)
  const [projectKey, setProjectKey] = useState('')
  const [cadenceClientId, setCadenceClientId] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [importing, setImporting] = useState(false)

  function load() {
    api.getJiraConfig().then(({ config }) => setConfig(config)).catch(() => setConfig(null))
  }

  useEffect(() => { load() }, [])

  function startEdit() {
    setSiteUrl(config?.siteUrl ?? '')
    setEmail(config?.email ?? '')
    setApiToken('')
    setProjects(null)
    setProjectKey(config?.projectKey ?? '')
    setCadenceClientId(config?.cadenceClientId ?? '')
    setVerifyError(null)
    setSaveError(null)
    setEditing(true)
  }

  function handleVerify() {
    const trimmedSite = siteUrl.trim()
    const trimmedEmail = email.trim()
    const trimmedToken = apiToken.trim()
    if (!trimmedSite || !trimmedEmail || !trimmedToken) return
    setVerifying(true)
    setVerifyError(null)
    api.getJiraProjects({ siteUrl: trimmedSite, email: trimmedEmail, apiToken: trimmedToken })
      .then(({ projects }) => setProjects(projects))
      .catch(err => setVerifyError(extractApiError(err, 'Connexion Jira impossible.')))
      .finally(() => setVerifying(false))
  }

  function handleSave() {
    if (!config && !apiToken.trim()) { setSaveError('Jeton API requis pour une première connexion.'); return }
    if (!projectKey) { setSaveError('Choisissez un projet Jira.'); return }
    if (!cadenceClientId) { setSaveError('Choisissez un Client Cadence : les items importés doivent lui être rattachés.'); return }
    const project = projects?.find(p => p.key === projectKey)
    setSaving(true)
    setSaveError(null)
    api.saveJiraConfig({
      siteUrl: siteUrl.trim(), email: email.trim(), apiToken: apiToken.trim() || undefined,
      projectKey, projectName: project?.name ?? config?.projectName ?? projectKey,
      cadenceClientId,
    })
      .then(({ config }) => { setConfig(config); setEditing(false); showToast('Projet Jira connecté.') })
      .catch(err => setSaveError(extractApiError(err, 'Connexion Jira impossible.')))
      .finally(() => setSaving(false))
  }

  async function handleDisconnect() {
    const ok = await confirm(
      `Le Backlog conservera les éléments déjà importés depuis "${config?.projectKey}", mais un réimport ne sera plus possible sans reconnecter le projet.`,
      { title: 'Déconnecter ce projet Jira ?', confirmLabel: 'Déconnecter', danger: true }
    )
    if (!ok) return
    setDisconnecting(true)
    api.deleteJiraConfig()
      .then(() => { setConfig(null); showToast('Projet Jira déconnecté.') })
      .catch(() => showToast('Impossible de déconnecter le projet.', 'error'))
      .finally(() => setDisconnecting(false))
  }

  function handleImport() {
    setImporting(true)
    api.importFromJira()
      .then(({ issues, cadenceClientId }) => {
        const result = applyJiraImport(state, issues, cadenceClientId)
        // Bug remonté par Julien (2026-08-08) : les items importés n'apparaissaient qu'après un
        // rechargement de page. `saveToServer` persiste côté serveur mais ne touche jamais l'état
        // local (voir StateContext.tsx), même principe que `importJSON`/`confirmExcelImport`
        // (SettingsPage.tsx), qui dispatchent SET_STATE avant `saveToServer`, oublié ici la
        // première fois.
        dispatch({ type: 'SET_STATE', payload: result.newState })
        saveToServer(result.newState)
        showToast(`Import Jira : ${result.itemsAdded} item(s) ajouté(s), ${result.itemsUpdated} mis à jour, ${result.epicsAdded} Epic(s) ajouté(s), ${result.epicsUpdated} mis à jour.`)
      })
      .catch(err => showToast(extractApiError(err, 'Import Jira impossible.'), 'error'))
      .finally(() => setImporting(false))
  }

  const canPickProject = projects !== null && projects.length > 0
  const selectedClient = state.clients.find(c => c.id === config?.cadenceClientId)

  return (
    <section data-testid="jira-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Intégration Jira</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Relie un projet Jira Cloud pour importer ses Epics et issues dans le Backlog. Jeton API Jira Cloud (compte Atlassian → Paramètres du profil → Sécurité → Jetons d'API), associé à l'email du compte. Un réimport met à jour les éléments déjà importés plutôt que de les dupliquer (rapprochement par clé Jira).
      </p>

      {config === undefined ? null : (!editing && config) ? (
        <div data-testid="jira-config-connected">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, background: 'var(--success-light, #dcfce7)', color: 'var(--success, #16a34a)', fontWeight: 600 }}>
              ● Connecté
            </span>
            <strong>{config.projectName} ({config.projectKey})</strong>
            <span style={{ color: 'var(--text-muted)' }}>{config.email}</span>
            <span style={{ color: 'var(--text-muted)' }}>Jeton {config.tokenPreview}</span>
            <span style={{ color: 'var(--text-muted)' }}>Mis à jour le {fmtDateTime(config.updatedAt)}</span>
            {selectedClient && <span style={{ color: 'var(--text-muted)' }}>Client : {selectedClient.name}</span>}
            <div style={{ flex: 1 }} />
            <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={startEdit}>Modifier</button>
            <button className="hdr-ctx-btn" style={{ fontSize: 11 }} data-testid="jira-disconnect-btn" disabled={disconnecting} onClick={handleDisconnect}>
              {disconnecting ? 'Déconnexion…' : 'Déconnecter'}
            </button>
          </div>
          <button className="hdr-ctx-btn" data-testid="jira-import-btn" disabled={importing} onClick={handleImport}>
            {importing ? 'Import en cours…' : 'Importer depuis Jira'}
          </button>
        </div>
      ) : (!editing && !config) ? (
        <button className="hdr-ctx-btn" data-testid="jira-connect-btn" onClick={startEdit}>Connecter un projet Jira</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Site Jira</label>
              <input className="form-input" placeholder="ex. monentreprise.atlassian.net" value={siteUrl} data-testid="jira-site-input" onChange={e => setSiteUrl(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Email</label>
              <input className="form-input" placeholder="prenom.nom@entreprise.com" value={email} data-testid="jira-email-input" onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Jeton API{config ? ' (laisser vide pour garder le jeton actuel)' : ''}</label>
              <input className="form-input" type="password" placeholder={config ? '••••••••' : 'ATATT3...'} value={apiToken} data-testid="jira-token-input" onChange={e => setApiToken(e.target.value)} />
            </div>
            <button className="hdr-ctx-btn" data-testid="jira-verify-btn" disabled={verifying || !siteUrl.trim() || !email.trim() || !apiToken.trim()} onClick={handleVerify}>
              {verifying ? 'Vérification…' : 'Vérifier la connexion'}
            </button>
          </div>
          {verifyError && <p style={{ fontSize: 11, color: 'var(--danger)' }} data-testid="jira-verify-error">{verifyError}</p>}

          {canPickProject ? (
            <>
              <div className="form-group">
                <label className="form-label">Projet Jira</label>
                <select className="form-input" data-testid="jira-project-select" value={projectKey} onChange={e => setProjectKey(e.target.value)}>
                  <option value="">Choisir un projet...</option>
                  {(projects ?? []).map(p => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Client Cadence associé (obligatoire)</label>
                <select className="form-input" data-testid="jira-client-select" value={cadenceClientId} onChange={e => setCadenceClientId(e.target.value)} disabled={state.clients.length === 0}>
                  <option value="">Choisir un client...</option>
                  {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {state.clients.length === 0 && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    Créez d'abord un Client (Réglages → Clients) : les items importés doivent lui être rattachés.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Vérifiez la connexion pour choisir le projet.
            </p>
          )}

          {saveError && <p style={{ fontSize: 11, color: 'var(--danger)' }} data-testid="jira-save-error">{saveError}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="hdr-ctx-btn" data-testid="jira-save-btn" disabled={saving || !canPickProject || !projectKey || !cadenceClientId} onClick={handleSave}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button className="hdr-ctx-btn" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </div>
      )}
    </section>
  )
}
