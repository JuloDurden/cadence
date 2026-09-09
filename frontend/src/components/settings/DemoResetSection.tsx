import { useState } from 'react'
import { api } from '../../services/api'
import { useToast } from '../../context/ToastContext'
import { useDialog } from '../../context/DialogContext'

// Démo publique v1, sous-chantier 3/5 (2026-09-09, décision Julien : "reset automatique à la fin
// de la session + un bouton dans les réglages pour le compte démo"). Section dédiée, sur le même
// principe que les autres sections de Réglages (ApiTokensSection, AiSection...) - montée
// uniquement pour `isDemo` (voir SettingsPage.tsx), jamais visible sur l'instance réelle de
// Julien. Le reset automatique de fin de session (2h, voir backend/src/lib/demoReset.ts) couvre
// déjà le cas "personne n'y pense" - ce bouton sert au recruteur qui veut repartir de zéro tout de
// suite, sans attendre.
export function DemoResetSection() {
  const { showToast } = useToast()
  const { confirm } = useDialog()
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    const ok = await confirm(
      'Toutes les modifications faites depuis le début de cette démo (items, sprints, équipe, clients...) seront perdues et remplacées par le jeu de données de départ.',
      { title: 'Réinitialiser la démo ?', confirmLabel: 'Réinitialiser', danger: true }
    )
    if (!ok) return
    setResetting(true)
    api.resetDemo()
      .then(() => {
        showToast('Démo réinitialisée.')
        // Recharge complète plutôt qu'un dispatch local : le mot de passe démo a aussi pu être
        // remis à sa valeur d'origine côté serveur (voir resetDemoWorkspace), et la page a besoin
        // de repartir sur un état serveur propre de toute façon (StateContext.tsx, chargement
        // initial), même principe qu'un changement de compte.
        window.location.reload()
      })
      .catch(() => { showToast('Impossible de réinitialiser la démo.', 'error'); setResetting(false) })
  }

  return (
    <section data-testid="demo-reset-section" style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 20, marginBottom: 16, border: '1px solid var(--danger)' }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: 'var(--danger)' }}>Compte de démonstration</h3>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
        Ce compte est partagé entre tous les visiteurs de la démo et se réinitialise automatiquement au bout de quelques heures d'inactivité. Utilisez ce bouton pour repartir immédiatement du jeu de données de départ.
      </p>
      <button data-testid="btn-reset-demo" className="hdr-ctx-btn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', fontWeight: 700 }}
        disabled={resetting} onClick={handleReset}>
        {resetting ? 'Réinitialisation…' : 'Réinitialiser la démo'}
      </button>
    </section>
  )
}
