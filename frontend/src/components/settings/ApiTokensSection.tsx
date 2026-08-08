import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { useDialog } from '../../context/DialogContext'
import { fmtDateTime } from '../../utils/dates'
import type { ApiToken } from '../../types'

// Phase 5 (roadmap v1), MCP Claude (Cadence), 2026-08-08 : jetons d'accès personnels, voir
// backend/src/routes/apiTokens.ts. Section personnelle, visible à TOUS les rôles connectés (pas de
// gating comme Mode présentation) : chaque utilisateur gère uniquement ses propres jetons, le
// backend filtre déjà sur `req.user.id`, le MCP n'a besoin d'accéder qu'aux données que le rôle du
// propriétaire du jeton autorise déjà. Le jeton en clair n'est affiché qu'une seule fois, juste
// après sa création (`justCreatedToken`), jamais recalculable ensuite (voir ApiToken, sans le
// champ `token`) : même logique que la révélation d'un mot de passe généré côté serveur.
export function ApiTokensSection() {
  const { showToast } = useToast()
  const { confirm } = useDialog()
  const [tokens, setTokens] = useState<ApiToken[] | undefined>(undefined)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null)

  function load() {
    api.listApiTokens().then(({ tokens }) => setTokens(tokens)).catch(() => setTokens([]))
  }

  useEffect(() => { load() }, [])

  function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    api.createApiToken(trimmed)
      .then(({ token, apiToken }) => {
        setJustCreatedToken(token)
        setTokens(t => [apiToken, ...(t ?? [])])
        setName('')
      })
      .catch(() => showToast('Impossible de générer le jeton.', 'error'))
      .finally(() => setCreating(false))
  }

  function handleCopy(token: string) {
    navigator.clipboard?.writeText(token)
      .then(() => showToast('Jeton copié dans le presse-papiers.'))
      .catch(() => showToast('Impossible de copier le jeton.', 'error'))
  }

  async function handleRevoke(t: ApiToken) {
    const ok = await confirm(
      `Toute intégration utilisant le jeton "${t.name}" (Claude, MCP...) perdra immédiatement l'accès à Cadence.`,
      { title: 'Révoquer ce jeton ?', confirmLabel: 'Révoquer', danger: true }
    )
    if (!ok) return
    setRevokingId(t.id)
    api.revokeApiToken(t.id)
      .then(() => { setTokens(list => (list ?? []).filter(x => x.id !== t.id)); showToast('Jeton révoqué.') })
      .catch(() => showToast('Impossible de révoquer le jeton.', 'error'))
      .finally(() => setRevokingId(null))
  }

  return (
    <section data-testid="api-tokens-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Jetons API personnels (MCP)</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Permet à un outil externe (le MCP Cadence pour Claude, par exemple) d'accéder à vos données avec exactement vos propres droits, sans partager votre mot de passe. Un jeton révoqué cesse de fonctionner immédiatement.
      </p>

      {justCreatedToken && (
        <div data-testid="api-token-reveal" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
            Copiez ce jeton maintenant : il ne sera plus jamais affiché.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input className="form-input" readOnly value={justCreatedToken} style={{ flex: 1, fontSize: 11 }} onFocus={e => e.target.select()} />
            <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => handleCopy(justCreatedToken)}>Copier</button>
            <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={() => setJustCreatedToken(null)}>J'ai copié le jeton</button>
          </div>
        </div>
      )}

      {tokens === undefined ? null : tokens.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {tokens.map(t => (
            <div key={t.id} data-testid="api-token-row" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
              <strong style={{ flex: 1 }}>{t.name}</strong>
              <span style={{ color: 'var(--text-muted)' }}>Créé le {fmtDateTime(t.createdAt)}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {t.lastUsedAt ? `Dernier usage le ${fmtDateTime(t.lastUsedAt)}` : 'Jamais utilisé'}
              </span>
              <button
                className="hdr-ctx-btn" style={{ fontSize: 11 }} data-testid="api-token-revoke"
                disabled={revokingId === t.id} onClick={() => handleRevoke(t)}
              >
                {revokingId === t.id ? 'Révocation…' : 'Révoquer'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 16 }}>Aucun jeton actif pour l'instant.</p>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <input
          className="form-input" placeholder="Nom du jeton (ex. Claude Desktop)" value={name}
          data-testid="api-token-name-input" style={{ flex: 1, fontSize: 12 }}
          onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button className="hdr-ctx-btn" data-testid="api-token-create-btn" disabled={creating || !name.trim()} onClick={handleCreate}>
          {creating ? 'Génération…' : '+ Générer un jeton'}
        </button>
      </div>
    </section>
  )
}
