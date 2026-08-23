import { useState } from 'react'
import type { CadenceState, HierarchyNode, HierarchyLevel, Deadline } from '../../types'
import { statusOptionsForItemModal } from '../../utils/kanbanStages'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useModalFocus } from '../../hooks/useModalFocus'

function uid() { return Math.random().toString(36).slice(2, 10) }

interface Props {
  node: HierarchyNode | null
  level: HierarchyLevel
  state: CadenceState
  onSave: (node: HierarchyNode, keyCounters?: Record<string, number>) => void
  onClose: () => void
}

const LEVEL_LABEL: Record<HierarchyLevel, string> = { epic: 'Epic', initiative: 'Initiative' }
// "Nouvel Epic" (masculin) / "Nouvelle Initiative" (féminin) — accord de genre, sous-chantier 4.
const NEW_LABEL: Record<HierarchyLevel, string> = { epic: 'Nouvel Epic', initiative: 'Nouvelle Initiative' }

/**
 * Modal minimale de création/édition d'un HierarchyNode (Epic pour l'instant, Initiative plus
 * tard — voir docs/roadmap-v1.md, Phase 1). Volontairement réduite par rapport à ItemModal : pas
 * de rôle/besoin/bénéfice, critères, DoR/DoD (jamais lus pour un Epic avant ce refactor, cf.
 * audit du 2026-07-28). Décision utilisateur (AskUserQuestion, 2026-07-28) : petite modal dédiée
 * plutôt que de laisser Epic sans UI de création/édition pendant la transition.
 */
export function HierarchyNodeModal({ node, level, state, onSave, onClose }: Props) {
  useEscapeToClose(onClose)
  const modalRef = useModalFocus<HTMLDivElement>()
  const [desc,     setDesc]     = useState(node?.desc ?? '')
  const [clientId, setClientId] = useState(node?.clientId ?? '')
  const [sprintId, setSprintId] = useState(node?.sprintId ?? '')
  const [sp,       setSp]       = useState(node?.sp ?? 0)
  const [status,   setStatus]   = useState(node?.status ?? 'backlog')
  const [deadline, setDeadline] = useState<Deadline>(node?.deadline ?? { date: '', type: 'none' })
  // Initiative parente d'un Epic (sous-chantier 4, 2026-07-29) — sans objet pour une
  // Initiative elle-même (pas de niveau au-dessus pour l'instant).
  const [parentId, setParentId] = useState(node?.parentId ?? '')
  const initiatives = state.hierarchyNodes.filter(n => n.level === 'initiative')

  const statusOptions = statusOptionsForItemModal(state.kanbanCols)

  function handleSave() {
    if (!desc.trim()) return
    const client = state.clients.find(c => c.id === clientId) ?? state.clients[0]
    const prefix = client?.prefix ?? 'ITEM'
    // Même pool de numérotation que les Items (state.itemKeyCounters) : un Epic et ses US du même
    // client ne doivent jamais se retrouver avec la même clé — voir ItemModal.tsx handleSave()
    // pour le même principe, appliqué ici aux deux sources (items ET hierarchyNodes).
    let keyCounters: Record<string, number> | undefined
    let finalKey = node?.key
    if (!finalKey) {
      const usedNums = [
        ...state.items.filter(i => i.key?.startsWith(`${prefix}-`)).map(i => parseInt(i.key.slice(prefix.length + 1), 10)),
        ...state.hierarchyNodes.filter(n => n.key?.startsWith(`${prefix}-`)).map(n => parseInt(n.key.slice(prefix.length + 1), 10)),
      ].filter(n => !isNaN(n))
      const liveMax = usedNums.length > 0 ? Math.max(...usedNums) : 0
      const persisted = state.itemKeyCounters?.[prefix] ?? 0
      const nextNum = Math.max(liveMax, persisted) + 1
      finalKey = `${prefix}-${String(nextNum).padStart(3, '0')}`
      keyCounters = { ...(state.itemKeyCounters ?? {}), [prefix]: nextNum }
    }
    const finalNode: HierarchyNode = {
      id:       node?.id ?? uid(),
      key:      finalKey,
      level,
      parentId: level === 'epic' ? (parentId || null) : null,
      desc,
      clientId: clientId || undefined,
      sprintId: sprintId || null,
      sp:       +sp || undefined,
      status,
      deadline: (deadline.date && deadline.type !== 'none') ? deadline : undefined,
      notes:    node?.notes,
      createdAt: node?.createdAt ?? new Date().toISOString(),
    }
    onSave(finalNode, keyCounters)
  }

  return (
    <div className="modal-overlay" data-testid="hierarchy-node-modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" ref={modalRef} tabIndex={-1}>
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>
            {node ? `Modifier ${node.key}` : NEW_LABEL[level]}
          </h2>
          <button className="btn-icon" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body">
          {node && <div style={{ marginBottom: 14 }}><span className="item-key" style={{ fontSize: 12 }}>{node.key}</span></div>}
          <div className="form-group">
            <label>Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder={`Description de l'${LEVEL_LABEL[level].toLowerCase()}...`} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Client</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}>
                <option value="">Sélectionner...</option>
                {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Story Points (0 = calculé depuis les US)</label>
              <input type="number" min={0} max={999} value={sp} onChange={e => setSp(+e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            {level === 'epic' ? (
              <div className="form-group">
                <label>Initiative parente</label>
                <select value={parentId} onChange={e => setParentId(e.target.value)}>
                  <option value="">Aucune</option>
                  {initiatives.map(i => <option key={i.id} value={i.id}>{i.key} – {i.desc}</option>)}
                </select>
              </div>
            ) : (
              // Une Initiative couvre plusieurs sprints par nature — contrairement à un Epic,
              // qui peut être "affiché sous" un sprint sur la Roadmap, l'assigner à un sprint
              // unique n'aurait pas de sens (sous-chantier 4, 2026-07-29).
              <div className="form-group" />
            )}
            <div className="form-group">
              <label>Statut</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                {statusOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {level === 'epic' && (
            <div className="form-row">
              <div className="form-group">
                <label>Sprint assigné</label>
                <select value={sprintId} onChange={e => setSprintId(e.target.value)}>
                  <option value="">Non assigné</option>
                  {state.sprints.map(s => <option key={s.id} value={s.id}>Sprint {s.number}{s.goal ? ` – ${s.goal}` : ''}</option>)}
                </select>
              </div>
              <div className="form-group" />
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label>Date de livraison</label>
              <input type="date" value={deadline.date} onChange={e => setDeadline(d => ({ ...d, date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={deadline.type} onChange={e => setDeadline(d => ({ ...d, type: e.target.value as Deadline['type'] }))}>
                <option value="none">Aucune</option>
                <option value="imposed">Imposée</option>
                <option value="negotiable">Négociable</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave}>{node ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}
