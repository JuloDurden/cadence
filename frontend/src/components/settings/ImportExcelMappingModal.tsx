import { useState } from 'react'
import type { RawSheet, SheetTarget } from '../../utils/excelBacklog'
import { ITEM_FIELDS, EPIC_FIELDS, SHEET_TARGET_LABEL, guessFieldMapping } from '../../utils/excelBacklog'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useModalFocus } from '../../hooks/useModalFocus'

export interface SheetMapping { target: SheetTarget; mapping: (string | null)[] }

interface Props {
  sheets: RawSheet[]
  onCancel: () => void
  onConfirm: (result: SheetMapping[]) => void
}

const TARGETS: SheetTarget[] = ['items', 'epics', 'ignore']

function fieldsFor(target: SheetTarget) {
  if (target === 'items') return ITEM_FIELDS
  if (target === 'epics') return EPIC_FIELDS
  return []
}

/**
 * Correspondance en-têtes du fichier → champs Cadence, à l'import Excel (2026-08-07, retour Julien :
 * "une fenêtre pourrait proposer l'en-tête que l'on souhaite rattacher à la colonne"), remplace
 * une correspondance silencieuse insensible accents/casse par une confirmation explicite, colonne
 * par colonne. Chaque feuille du fichier a d'abord une CIBLE (Items du Backlog / Epics &
 * Initiatives / Ignorer, devinée depuis le nom de la feuille) qui détermine la liste de champs
 * proposée pour ses colonnes ; chaque colonne a ensuite un champ (ou "Ignorer cette colonne"),
 * suggéré par correspondance de libellé mais jamais appliqué sans ce passage par la modal, voir
 * `guessFieldMapping`/`applyMapping` dans `utils/excelBacklog.ts`.
 */
export function ImportExcelMappingModal({ sheets, onCancel, onConfirm }: Props) {
  useEscapeToClose(onCancel)
  const modalRef = useModalFocus<HTMLDivElement>()
  const [targets, setTargets] = useState<SheetTarget[]>(() => sheets.map(s => s.suggestedTarget))
  const [mappings, setMappings] = useState<(string | null)[][]>(
    () => sheets.map(s => guessFieldMapping(s.headers, fieldsFor(s.suggestedTarget)))
  )

  function setTarget(sheetIdx: number, target: SheetTarget) {
    setTargets(t => t.map((x, i) => i === sheetIdx ? target : x))
    setMappings(m => m.map((row, i) => i === sheetIdx ? guessFieldMapping(sheets[i].headers, fieldsFor(target)) : row))
  }

  function setColumnMapping(sheetIdx: number, colIdx: number, fieldKey: string | null) {
    setMappings(m => m.map((row, i) => i === sheetIdx ? row.map((v, j) => j === colIdx ? fieldKey : v) : row))
  }

  function confirm() {
    onConfirm(sheets.map((_, i) => ({ target: targets[i], mapping: mappings[i] })))
  }

  return (
    <div className="modal-overlay open" data-testid="import-excel-mapping-modal" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" ref={modalRef} tabIndex={-1} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2 className="modal-title">Faire correspondre les colonnes</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Pour chaque feuille du fichier, choisissez ce qu'elle représente puis à quel champ Cadence correspond chaque colonne. Les correspondances déjà proposées sont des suggestions, à ajuster si besoin.
          </p>
          {sheets.map((sheet, si) => (
            <div key={sheet.name} data-testid={`import-excel-sheet-${si}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, minWidth: 0 }}>
                <strong style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sheet.name}>{sheet.name}</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>({sheet.rows.length} ligne{sheet.rows.length > 1 ? 's' : ''})</span>
                <select
                  data-testid={`import-excel-sheet-target-${si}`}
                  value={targets[si]}
                  onChange={e => setTarget(si, e.target.value as SheetTarget)}
                  className="form-input form-select"
                  style={{ marginLeft: 'auto', width: 200, flexShrink: 0, fontSize: 12 }}
                >
                  {TARGETS.map(t => <option key={t} value={t}>{SHEET_TARGET_LABEL[t]}</option>)}
                </select>
              </div>

              {targets[si] !== 'ignore' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  {sheet.headers.map((h, ci) => (
                    <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 12, width: '45%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h}>
                        {h || `(colonne ${ci + 1})`}
                      </span>
                      <select
                        data-testid={`import-excel-col-${si}-${ci}`}
                        value={mappings[si][ci] ?? ''}
                        onChange={e => setColumnMapping(si, ci, e.target.value || null)}
                        className="form-input form-select"
                        style={{ flex: 1, minWidth: 0, fontSize: 12 }}
                      >
                        <option value="">Ignorer cette colonne</option>
                        {fieldsFor(targets[si]).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Annuler</button>
          <button className="btn btn-primary" data-testid="import-excel-confirm-btn" onClick={confirm}>Importer</button>
        </div>
      </div>
    </div>
  )
}
