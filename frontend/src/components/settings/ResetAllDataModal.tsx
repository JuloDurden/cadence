import { useState } from 'react'

interface Counts {
  items: number
  hierarchyNodes: number
  sprints: number
  team: number
  clients: number
}

interface Props {
  open: boolean
  counts: Counts
  onCancel: () => void
  onConfirm: () => void
}

const KEYWORD = 'SUPPRIMER'

/**
 * Confirmation renforcée pour la réinitialisation totale des données (2026-08-07, retour Julien :
 * "un bouton pour supprimer tout sauf les comptes utilisateurs"). `DialogContext.confirm()` ne
 * propose qu'un Oui/Non (voir sa JSDoc) : insuffisant vu la portée de cette action, qui vide tout
 * le contenu produit du workspace en un seul clic. Décidé avec Julien (AskUserQuestion,
 * 2026-08-07) : confirmation renforcée par saisie obligatoire du mot-clé "SUPPRIMER", bouton
 * désactivé tant que le texte ne correspond pas exactement. Pas de réutilisation de
 * `DialogContext` : Entrée/Échap y ferment/valident globalement (voir sa JSDoc), incompatible avec
 * une saisie qui doit être vérifiée avant validation.
 *
 * Portée exacte de la suppression (décidée avec Julien) : uniquement les données métier (items,
 * Epics/Initiatives, sprints, équipe, clients, absences, Dailies, Rétrospectives, Sprint Review,
 * Now/Next/Later). Les comptes utilisateurs (table `User`, non stockée dans ce blob JSON) et les
 * réglages personnalisés (`settings`, `kanbanCols`, `customTags`, `removedBaseTags`) ne sont pas
 * touchés — voir `resetAllData()` dans SettingsPage.tsx pour le détail exact des champs vidés.
 */
export function ResetAllDataModal({ open, counts, onCancel, onConfirm }: Props) {
  const [text, setText] = useState('')
  if (!open) return null
  const canConfirm = text === KEYWORD

  function close() {
    setText('')
    onCancel()
  }

  function confirm() {
    if (!canConfirm) return
    setText('')
    onConfirm()
  }

  return (
    <div className="modal-overlay open" data-testid="reset-all-modal" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ width: 460, maxWidth: '95vw' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ color: 'var(--danger)' }}>Réinitialiser toutes les données ?</h2>
          <button className="modal-close" onClick={close}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
            Supprime définitivement {counts.items} item(s), {counts.hierarchyNodes} Epic(s)/Initiative(s),{' '}
            {counts.sprints} sprint(s), {counts.team} membre(s) d'équipe et {counts.clients} client(s), ainsi que
            l'historique, les absences, les Dailies, les Rétrospectives, les Sprint Review et le contenu
            Now/Next/Later. Les comptes utilisateurs et les réglages (tags, couleurs Kanban, thème, mode
            présentation) ne sont pas affectés. Cette action est irréversible.
          </p>
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Tapez {KEYWORD} pour confirmer</label>
            <input
              className="form-input"
              data-testid="reset-all-keyword-input"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={KEYWORD}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={close}>Annuler</button>
          <button
            className="btn btn-danger"
            data-testid="reset-all-confirm-btn"
            disabled={!canConfirm}
            style={{ opacity: canConfirm ? 1 : .5, cursor: canConfirm ? 'pointer' : 'not-allowed' }}
            onClick={confirm}
          >
            Réinitialiser
          </button>
        </div>
      </div>
    </div>
  )
}
