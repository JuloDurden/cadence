import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { useDialog } from '../../context/DialogContext'
import { fmtDateTime } from '../../utils/dates'
import type { SlackChannel, SlackChannelConfig, SlackConfig } from '../../types'

type NotifKey = 'sprintClose' | 'blocked' | 'daily'

const NOTIF_ROWS: { key: NotifKey; label: string; help: string }[] = [
  { key: 'sprintClose', label: 'Clôture de sprint', help: 'Message envoyé quand un sprint est clôturé (items terminés, SP livrés).' },
  { key: 'blocked', label: 'Alertes bloquants', help: 'Message quand un item passe au statut Bloqué, ou quand un sprint est activé avec des items dont une dépendance n\'est pas terminée.' },
  { key: 'daily', label: 'Résumé Daily', help: 'Envoyé manuellement depuis un bouton sur la page Daily, jamais automatiquement à chaque saisie.' },
]

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

function emptyRow(): SlackChannelConfig { return { channelId: null, channelName: null, enabled: false } }

// Phase 5 (roadmap v1), Intégration Slack, 2026-08-08 : workspace Slack unique lié à Cadence (voir
// backend/src/routes/slack.ts). Réservée Admin (secret d'organisation, même logique que
// GitHubSection). Jeton Bot d'une vraie Slack App (décision Julien, AskUserQuestion, plutôt qu'un
// webhook entrant limité à un seul canal fixe) : 3 notifications indépendantes, chacune avec son
// propre canal et interrupteur.
export function SlackSection() {
  const { showToast } = useToast()
  const { confirm } = useDialog()
  const [config, setConfig] = useState<SlackConfig | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [botToken, setBotToken] = useState('')
  const [team, setTeam] = useState<string | null>(null)
  const [channels, setChannels] = useState<SlackChannel[] | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<NotifKey, SlackChannelConfig>>({ sprintClose: emptyRow(), blocked: emptyRow(), daily: emptyRow() })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  function load() {
    api.getSlackConfig().then(({ config }) => setConfig(config)).catch(() => setConfig(null))
  }

  useEffect(() => { load() }, [])

  function startEdit() {
    setBotToken('')
    setVerifyError(null)
    setSaveError(null)
    if (config) {
      setTeam(config.teamName)
      setRows({ sprintClose: config.sprintClose, blocked: config.blocked, daily: config.daily })
      setChannels(null)
      api.getSlackChannels().then(({ channels }) => setChannels(channels)).catch(err => setVerifyError(extractApiError(err, 'Impossible de charger les canaux.')))
    } else {
      setTeam(null)
      setRows({ sprintClose: emptyRow(), blocked: emptyRow(), daily: emptyRow() })
      setChannels(null)
    }
    setEditing(true)
  }

  function handleVerify() {
    const token = botToken.trim()
    if (!token) return
    setVerifying(true)
    setVerifyError(null)
    api.verifySlackToken(token)
      .then(({ team, channels }) => { setTeam(team); setChannels(channels) })
      .catch(err => setVerifyError(extractApiError(err, 'Connexion Slack impossible.')))
      .finally(() => setVerifying(false))
  }

  function updateRow(key: NotifKey, patch: Partial<SlackChannelConfig>) {
    setRows(r => ({ ...r, [key]: { ...r[key], ...patch } }))
  }

  function handleSave() {
    if (!config && !botToken.trim()) { setSaveError('Jeton Bot requis pour une première connexion.'); return }
    setSaving(true)
    setSaveError(null)
    const toInput = (row: SlackChannelConfig) => ({ channelId: row.channelId ?? '', channelName: row.channelName ?? '', enabled: row.enabled })
    api.saveSlackConfig({
      botToken: botToken.trim() || undefined,
      sprintClose: toInput(rows.sprintClose),
      blocked: toInput(rows.blocked),
      daily: toInput(rows.daily),
    })
      .then(({ config }) => { setConfig(config); setEditing(false); showToast('Workspace Slack connecté.') })
      .catch(err => setSaveError(extractApiError(err, 'Connexion Slack impossible.')))
      .finally(() => setSaving(false))
  }

  async function handleDisconnect() {
    const ok = await confirm(
      `Les notifications Slack configurées (${[config?.sprintClose, config?.blocked, config?.daily].filter(r => r?.enabled).length} active(s)) cesseront d'être envoyées.`,
      { title: 'Déconnecter Slack ?', confirmLabel: 'Déconnecter', danger: true }
    )
    if (!ok) return
    setDisconnecting(true)
    api.deleteSlackConfig()
      .then(() => { setConfig(null); showToast('Workspace Slack déconnecté.') })
      .catch(() => showToast('Impossible de déconnecter Slack.', 'error'))
      .finally(() => setDisconnecting(false))
  }

  const canPickChannels = channels !== null && channels.length > 0

  return (
    <section data-testid="slack-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Intégration Slack</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Relie un workspace Slack pour poster des notifications automatiques (clôture de sprint, alertes bloquants) et un résumé Daily manuel. Jeton Bot d'une Slack App (scope <code>chat:write</code> pour poster, <code>channels:read</code>/<code>groups:read</code> pour lister les canaux), collé ici.
      </p>

      {config === undefined ? null : (!editing && config) ? (
        <div data-testid="slack-config-connected">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, marginBottom: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, background: 'var(--success-light, #dcfce7)', color: 'var(--success, #16a34a)', fontWeight: 600 }}>
              ● Connecté
            </span>
            <strong>{config.teamName}</strong>
            <span style={{ color: 'var(--text-muted)' }}>Jeton {config.tokenPreview}</span>
            <span style={{ color: 'var(--text-muted)' }}>Mis à jour le {fmtDateTime(config.updatedAt)}</span>
            <div style={{ flex: 1 }} />
            <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={startEdit}>Modifier</button>
            <button className="hdr-ctx-btn" style={{ fontSize: 11 }} data-testid="slack-disconnect-btn" disabled={disconnecting} onClick={handleDisconnect}>
              {disconnecting ? 'Déconnexion…' : 'Déconnecter'}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {NOTIF_ROWS.map(({ key, label }) => {
              const row = config[key]
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 99, background: row.enabled ? 'var(--success, #16a34a)' : 'var(--border-strong)', flexShrink: 0 }} />
                  <span style={{ minWidth: 140 }}>{label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {row.enabled ? (row.channelName ? `#${row.channelName}` : 'Aucun canal choisi') : 'Désactivé'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (!editing && !config) ? (
        <button className="hdr-ctx-btn" data-testid="slack-connect-btn" onClick={startEdit}>Connecter Slack</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Jeton Bot Slack{config ? ' (laisser vide pour garder le jeton actuel)' : ''}</label>
              <input className="form-input" type="password" placeholder={config ? '••••••••' : 'xoxb-...'} value={botToken} data-testid="slack-token-input" onChange={e => setBotToken(e.target.value)} />
            </div>
            <button className="hdr-ctx-btn" data-testid="slack-verify-btn" disabled={verifying || !botToken.trim()} onClick={handleVerify}>
              {verifying ? 'Vérification…' : 'Vérifier le jeton'}
            </button>
          </div>
          {verifyError && <p style={{ fontSize: 11, color: 'var(--danger)' }} data-testid="slack-verify-error">{verifyError}</p>}
          {team && <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Connecté au workspace <strong>{team}</strong>.</p>}

          {canPickChannels ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {NOTIF_ROWS.map(({ key, label, help }) => (
                <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 4 }}>
                    <input type="checkbox" data-testid={`slack-row-${key}-enabled`} checked={rows[key].enabled}
                      onChange={e => updateRow(key, { enabled: e.target.checked })} />
                    {label}
                  </label>
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 8px 22px' }}>{help}</p>
                  <select className="form-input" style={{ marginLeft: 22, width: 'calc(100% - 22px)', fontSize: 12 }}
                    data-testid={`slack-row-${key}-channel`} disabled={!rows[key].enabled}
                    value={rows[key].channelId ?? ''}
                    onChange={e => {
                      const channel = channels?.find(c => c.id === e.target.value)
                      updateRow(key, { channelId: channel?.id ?? null, channelName: channel?.name ?? null })
                    }}>
                    <option value="">Choisir un canal...</option>
                    {(channels ?? []).map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Vérifiez le jeton pour choisir les canaux.
            </p>
          )}

          {saveError && <p style={{ fontSize: 11, color: 'var(--danger)' }} data-testid="slack-save-error">{saveError}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="hdr-ctx-btn" data-testid="slack-save-btn" disabled={saving || !canPickChannels} onClick={handleSave}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button className="hdr-ctx-btn" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </div>
      )}
    </section>
  )
}
