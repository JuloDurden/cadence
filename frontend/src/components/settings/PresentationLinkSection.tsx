import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { useDialog } from '../../context/DialogContext'
import type { PresentationLink } from '../../types'

// Phase 3 (roadmap v1), Mode présentation — lien de partage public (sans authentification), voir
// backend/src/routes/presentation.ts et frontend/src/pages/PresentationPublicPage.tsx. Visible pour
// Admin + PO (gating fait par l'appelant, SettingsPage.tsx — le backend refuse aussi ces requêtes
// avec un 403 pour tout autre rôle, cette section n'est donc pas le seul rempart). Décision actée
// avec Julien (AskUserQuestion, 2026-08-01) : un seul lien actif à la fois, régénérer en invalide
// automatiquement un précédent — pas de vraie liste comme les invitations Stakeholder, puisqu'il
// n'y a qu'un seul workspace (singleton) à présenter.
export function PresentationLinkSection() {
  const { showToast } = useToast()
  const { confirm } = useDialog()
  const [link, setLink] = useState<PresentationLink | null | undefined>(undefined)
  const [generating, setGenerating] = useState(false)
  const [revoking, setRevoking] = useState(false)

  function load() {
    api.getPresentationLink().then(({ link }) => setLink(link)).catch(() => setLink(null))
  }

  useEffect(() => { load() }, [])

  function presentationUrl(token: string) {
    return `${window.location.origin}/present/${token}`
  }

  function handleGenerate() {
    setGenerating(true)
    api.createPresentationLink()
      .then(({ link }) => {
        setLink(link)
        return navigator.clipboard?.writeText(presentationUrl(link.token)).catch(() => { /* presse-papiers indisponible, le lien reste affiché */ })
      })
      .then(() => showToast('Lien de présentation généré et copié dans le presse-papiers.'))
      .catch(() => showToast('Impossible de générer le lien de présentation.', 'error'))
      .finally(() => setGenerating(false))
  }

  function handleCopy() {
    if (!link) return
    navigator.clipboard?.writeText(presentationUrl(link.token))
      .then(() => showToast('Lien copié dans le presse-papiers.'))
      .catch(() => showToast('Impossible de copier le lien.', 'error'))
  }

  async function handleRevoke() {
    if (!link) return
    // Régénérer réinvalide déjà l'ancien lien sans confirmation (voir handleGenerate) — seule la
    // révocation SANS remplacement (plus aucun lien actif ensuite) mérite une confirmation, pour
    // ne pas couper l'accès à quelqu'un en pleine présentation sans y penser à deux fois.
    const ok = await confirm(
      'Le lien actuel cessera immédiatement de fonctionner pour toute personne qui l\'aurait déjà ouvert.',
      { title: 'Révoquer le lien de présentation ?', confirmLabel: 'Révoquer', danger: true }
    )
    if (!ok) return
    setRevoking(true)
    api.revokePresentationLink()
      .then(() => { setLink(null); showToast('Lien de présentation révoqué.') })
      .catch(() => showToast('Impossible de révoquer le lien de présentation.', 'error'))
      .finally(() => setRevoking(false))
  }

  return (
    <section data-testid="presentation-link-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Mode présentation</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Génère un lien public, sans compte requis, qui ouvre directement le mode présentation (pages choisies ci-dessus — navigation au clavier ← →). Utile pour un partage ponctuel en externe ou un affichage sur un écran.
      </p>

      {link === undefined ? null : link ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }} data-testid="presentation-link-active">
          <input className="form-input" readOnly value={presentationUrl(link.token)} style={{ flex: 1, fontSize: 11 }} onFocus={e => e.target.select()} />
          <button className="hdr-ctx-btn" style={{ fontSize: 11 }} onClick={handleCopy}>Copier</button>
          <button className="hdr-ctx-btn" style={{ fontSize: 11 }} data-testid="presentation-link-revoke" disabled={revoking} onClick={handleRevoke}>
            {revoking ? 'Révocation…' : 'Révoquer'}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8 }}>Aucun lien de présentation actif pour l'instant.</p>
      )}

      <button data-testid="presentation-link-generate" className="hdr-ctx-btn" disabled={generating} onClick={handleGenerate}>
        {generating ? 'Génération…' : link ? 'Régénérer le lien' : '+ Générer un lien de présentation'}
      </button>
    </section>
  )
}
