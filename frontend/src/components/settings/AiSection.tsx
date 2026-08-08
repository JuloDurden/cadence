import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { useDialog } from '../../context/DialogContext'
import { fmtDateTime } from '../../utils/dates'
import type { AiConfig } from '../../types'

// Même helper que GitHubSection/SlackSection/JiraSection, extrait le message `{ error }` renvoyé
// par le backend (voir backend/src/routes/ai.ts) depuis le texte brut de l'exception de `request()`.
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

// Phase 6 (roadmap v1), Compagnon IA, sous-chantier 1, 2026-08-08 : configuration singleton de
// l'assistant (voir backend/src/routes/ai.ts), réservée Admin (secret d'organisation, même logique
// que GitHubSection/SlackSection/JiraSection). Décision Julien (AskUserQuestion) : API Claude
// (Anthropic). Une seule étape comme GitHubSection (clé collée directement, vérifiée par un appel
// minimal avant enregistrement), pas de sélection intermédiaire comme Slack/Jira : il n'y a rien à
// choisir dans une liste, juste une clé et un identifiant de modèle.
export function AiSection() {
  const { showToast } = useToast()
  const { confirm } = useDialog()
  const [config, setConfig] = useState<AiConfig | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [model, setModel] = useState('claude-sonnet-5')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  function load() {
    api.getAiConfig().then(({ config }) => setConfig(config)).catch(() => setConfig(null))
  }

  useEffect(() => { load() }, [])

  function startEdit() {
    setModel(config?.model || 'claude-sonnet-5')
    setApiKey('')
    setSaveError(null)
    setEditing(true)
  }

  function handleSave() {
    const trimmedModel = model.trim()
    if (!trimmedModel) return
    if (!config && !apiKey.trim()) { setSaveError('Clé API requise pour une première connexion.'); return }
    setSaving(true)
    setSaveError(null)
    api.saveAiConfig({ model: trimmedModel, apiKey: apiKey.trim() || undefined })
      .then(({ config }) => {
        setConfig(config)
        setEditing(false)
        showToast('Compagnon IA connecté.')
      })
      .catch(err => setSaveError(extractApiError(err, 'Connexion à Anthropic impossible.')))
      .finally(() => setSaving(false))
  }

  async function handleDisconnect() {
    const ok = await confirm(
      "Le panneau de chat restera visible mais ne pourra plus répondre tant qu'aucune clé n'est reconfigurée.",
      { title: 'Déconnecter le Compagnon IA ?', confirmLabel: 'Déconnecter', danger: true }
    )
    if (!ok) return
    setDisconnecting(true)
    api.deleteAiConfig()
      .then(() => { setConfig(null); showToast('Compagnon IA déconnecté.') })
      .catch(() => showToast('Impossible de déconnecter le Compagnon IA.', 'error'))
      .finally(() => setDisconnecting(false))
  }

  return (
    <section data-testid="ai-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Compagnon IA</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Connecte l'assistant conversationnel (panneau de chat, voir le bouton dédié dans l'en-tête) à l'API Claude (Anthropic). Clé API Anthropic (console.anthropic.com → API Keys). Un PO/Admin peut créer/modifier des items via le chat, un Dev un sous-ensemble opérationnel, les autres rôles peuvent uniquement se faire aider à la rédaction en texte.
      </p>

      {config === undefined ? null : (!editing && config) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, marginBottom: 4, flexWrap: 'wrap' }} data-testid="ai-config-connected">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, background: 'var(--success-light, #dcfce7)', color: 'var(--success, #16a34a)', fontWeight: 600 }}>
            ● Connecté
          </span>
          <strong>{config.model}</strong>
          <span style={{ color: 'var(--text-muted)' }}>Clé {config.tokenPreview}</span>
          <span style={{ color: 'var(--text-muted)' }}>Mis à jour le {fmtDateTime(config.updatedAt)}</span>
          <div style={{ flex: 1 }} />
          <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={startEdit}>Modifier</button>
          <button
            className="hdr-ctx-btn" style={{ fontSize: 11 }} data-testid="ai-disconnect-btn"
            disabled={disconnecting} onClick={handleDisconnect}
          >
            {disconnecting ? 'Déconnexion…' : 'Déconnecter'}
          </button>
        </div>
      ) : (!editing && !config) ? (
        <button className="hdr-ctx-btn" data-testid="ai-connect-btn" onClick={startEdit}>Connecter le Compagnon IA</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Modèle</label>
            <input className="form-input" placeholder="ex. claude-sonnet-5" value={model} data-testid="ai-model-input" onChange={e => setModel(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Clé API Anthropic{config ? ' (laisser vide pour garder la clé actuelle)' : ''}</label>
            <input className="form-input" type="password" placeholder={config ? '••••••••' : 'sk-ant-...'} value={apiKey} data-testid="ai-key-input" onChange={e => setApiKey(e.target.value)} />
          </div>
          {saveError && <p style={{ fontSize: 11, color: 'var(--danger)' }} data-testid="ai-save-error">{saveError}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="hdr-ctx-btn" data-testid="ai-save-btn"
              disabled={saving || !model.trim()} onClick={handleSave}
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
