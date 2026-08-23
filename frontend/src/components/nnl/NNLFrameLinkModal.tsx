import { useState } from 'react'
import type { CadenceState, HierarchyNode, HierarchyLevel } from '../../types'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useModalFocus } from '../../hooks/useModalFocus'

interface Props {
  open: boolean
  state: CadenceState
  onLink: (node: HierarchyNode) => void
  onCreateNew: (level: HierarchyLevel, onCreated: (node: HierarchyNode) => void) => void
  onCancel: () => void
}

const LEVEL_LABEL: Record<HierarchyLevel, string> = { epic: 'Epic', initiative: 'Initiative' }

/**
 * Modale de liaison ouverte juste après le tracé d'un cadre au canevas NNL (sous-chantier 6,
 * point 3, 2026-07-29) : le cadre lui-même (bornes x/y/x2/y2) est déjà tracé et en attente
 * (`pendingFrameBounds` dans NNLCanvas.tsx) — il ne devient un vrai `NNLFrame` qu'une fois un
 * Epic ou une Initiative choisi ici, existant ou nouvellement créé (réutilise `HierarchyNodeModal`
 * du Backlog, voir `onCreateNew`). Annuler ici abandonne le tracé sans créer de cadre.
 */
export function NNLFrameLinkModal({ open, state, onLink, onCreateNew, onCancel }: Props) {
  useEscapeToClose(onCancel, open)
  const modalRef = useModalFocus<HTMLDivElement>(open)
  const [level,  setLevel]  = useState<HierarchyLevel>('epic')
  const [search, setSearch] = useState('')

  if (!open) return null

  const nodes = (state.hierarchyNodes ?? [])
    .filter(n => n.level === level)
    .filter(n => !search.trim()
      || n.key.toLowerCase().includes(search.toLowerCase())
      || n.desc.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="modal-overlay open" data-testid="nnl-frame-link-modal"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" ref={modalRef} tabIndex={-1} style={{ width: 460, maxWidth: '95vw' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Lier ce cadre</h2>
          <button className="btn-icon" onClick={onCancel} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden', marginBottom: 12 }}>
            {(['epic', 'initiative'] as HierarchyLevel[]).map((l, i) => (
              <button key={l}
                data-testid={`nnl-frame-level-${l}`}
                onClick={() => setLevel(l)}
                style={{
                  flex: 1, padding: '8px 0', border: 'none',
                  borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                  background: level === l ? 'var(--primary)' : 'transparent',
                  color: level === l ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 700, fontSize: 12, textTransform: 'uppercase',
                }}>{LEVEL_LABEL[l]}</button>
            ))}
          </div>

          <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 12 }}
            data-testid="nnl-frame-create-new"
            onClick={() => onCreateNew(level, onLink)}>
            + Créer un {level === 'epic' ? 'nouvel Epic' : 'e nouvelle Initiative'}
          </button>

          <div className="form-group">
            <label>Rechercher {level === 'epic' ? 'un Epic' : 'une Initiative'} existant{level === 'epic' ? '' : 'e'}</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Clé ou description…" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
            {nodes.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                Aucun{level === 'epic' ? '' : 'e'} {LEVEL_LABEL[level]} {search ? 'trouvé' : 'existant'}{level === 'epic' ? '' : 'e'}
              </div>
            )}
            {nodes.map(n => (
              <button key={n.id}
                data-testid={`nnl-frame-pick-${n.id}`}
                onClick={() => onLink(n)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  border: '1px solid var(--border)', borderRadius: 7, background: 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>{n.key}</span>
                <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        </div>
      </div>
    </div>
  )
}
