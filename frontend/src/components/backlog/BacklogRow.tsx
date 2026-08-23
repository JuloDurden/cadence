import React, { memo } from 'react'
import type { Item, ItemType, BugSeverity, Client, TeamMember, Sprint, KanbanCol, HierarchyNode } from '../../types'
import { EXTRA_STAGES } from '../../utils/kanbanStages'
import { fmtDate } from '../../utils/dates'

// Phase 7, perf (2026-08-24) : constantes d'affichage déplacées depuis BacklogPage.tsx lors de
// l'extraction de la ligne du tableau en composant dédié mémoïsé (voir docs/corrections.md,
// "Chantier Phase 7 - Performance"). PRIO_LABEL/TYPE_LABEL réexportées car encore utilisées
// ailleurs sur la page (actions en masse, groupement "Type") ; les autres sont exclusives à la
// ligne, donc privées à ce fichier.
export const PRIO_LABEL: Record<string, string> = { critical: 'P1', high: 'P2', medium: 'P3', low: 'P4' }
const PRIO_COLOR: Record<string, string> = { critical: '#FF2929', high: '#FF981C', medium: '#165FCC', low: '#9CC9F4' }
const PRIO_TEXT:  Record<string, string> = { critical: '#fff', high: '#fff', medium: '#fff', low: '#0d1a33' }
export const TYPE_LABEL: Record<ItemType, string> = { story: 'US', bug: 'Bug', task: 'Tâche', spike: 'Spike' }
const TYPE_BG: Record<ItemType, string> = { story: '#165FCC18', bug: '#FF292918', task: '#6b728018', spike: '#0891b218' }
const TYPE_FG: Record<ItemType, string> = { story: '#165FCC',   bug: '#FF2929',   task: '#6b7280',   spike: '#0891b2'   }
const SEV_LABEL: Record<BugSeverity, string> = { critical: 'Crit.', major: 'Maj.', minor: 'Min.' }
const SEV_COLOR: Record<BugSeverity, string> = { critical: '#FF2929', major: '#FF981C', minor: '#165FCC' }

// Réexportée : encore utilisée par le filtre "DoR/DoD prêt" de BacklogPage.tsx (hors de toute ligne).
export function dorDodStat(items: { done: boolean }[] | undefined): { done: number; total: number } | null {
  if (!items || items.length === 0) return null
  return { done: items.filter(c => c.done).length, total: items.length }
}

/** Pastille DoR ou DoD : coche verte si 100%, "X/N" sinon. */
function DorDodBadge({ stat, label }: { stat: { done: number; total: number } | null; label: string }) {
  if (!stat) return <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>-</span>
  if (stat.done === stat.total) {
    return (
      <span title={`${label} : ${stat.done}/${stat.total} critères validés`}
        style={{ color: 'var(--success, #22c55e)', display: 'inline-flex', alignItems: 'center' }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      </span>
    )
  }
  const pct = stat.done / stat.total
  const color = pct === 0 ? 'var(--text-faint)' : pct >= 0.6 ? '#f59e0b' : 'var(--danger)'
  return (
    <span title={`${label} : ${stat.done}/${stat.total} critères validés`}
      style={{ fontSize: 10, fontWeight: 600, color, fontFamily: 'monospace' }}>
      {stat.done}/{stat.total}
    </span>
  )
}

function Svg({ d, size = 13 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
}
const SVG_EDIT   = '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>'
const SVG_DEL    = '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>'
const SVG_CHEV_R = '<path d="m9 18 6-6-6-6"/>'
const SVG_CHEV_D = '<path d="m6 9 6 6 6-6"/>'

interface BacklogRowProps {
  item: Item
  // Phase 7, perf (2026-08-24) : tranches d'état stables (clients/team/sprints/kanbanCols/
  // hierarchyNodes/itemsById) plutôt que `state: CadenceState` entier - même raison que
  // KanbanCard.tsx/PlanningCard.tsx (docs/corrections.md, "Chantier Phase 7 Performance").
  // `itemsById` (Map construite une fois par `useMemo` côté BacklogPage.tsx) remplace l'ancien
  // `getDepItems` qui parcourait `state.items` en entier à chaque ligne.
  clients: Client[]
  team: TeamMember[]
  sprints: Sprint[]
  kanbanCols: KanbanCol[]
  hierarchyNodes: HierarchyNode[]
  itemsById: Map<string, Item>
  // Valeurs déjà dérivées par BacklogPage.tsx (primitives, comparables par valeur) plutôt que les
  // structures brutes (`selectedIds`/`expandedIds`/`depChain`) : une ligne dont le statut de
  // sélection/dépli/profondeur de dépendance n'a pas changé ne re-rend pas, même si le Set/Map
  // source a changé de référence ailleurs sur la page (une autre ligne cochée, un autre survol...).
  depDepth: number | undefined
  selected: boolean
  isExpanded: boolean
  canManage: boolean
  canOperate: boolean
  onToggleSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  onEdit: (item: Item) => void
  onDelete: (id: string) => void
  onHover: (id: string | null) => void
}

function BacklogRowImpl({
  item, clients, team, sprints, kanbanCols, hierarchyNodes, itemsById, depDepth,
  selected, isExpanded, canManage, canOperate,
  onToggleSelect, onToggleExpand, onEdit, onDelete, onHover,
}: BacklogRowProps) {
  const client   = clients.find(c => c.id === item.clientId)
  const sprint   = item.sprintId ? sprints.find(s => s.id === item.sprintId) : null
  const status   = kanbanCols.find(c => c.id === item.status) ?? EXTRA_STAGES.find(s => s.id === item.status)
  const iType    = (item.type ?? 'story') as ItemType
  const depItems = (item.deps ?? []).map(id => itemsById.get(id)).filter(Boolean) as Item[]
  const dl       = item.deadline
  const criteria = item.criteria ?? []
  const hasUS = !!(item.role || item.need || item.benefit)

  const hasDeps = (item.deps ?? []).length > 0
  const DEP_COLOR = 'var(--primary)'

  return (
    <React.Fragment>
      <tr
        onDoubleClick={() => onEdit(item)}
        onMouseEnter={() => onHover(hasDeps ? item.id : null)}
        onMouseLeave={() => onHover(null)}
        className={depDepth ? `dep-hl dep-hl-${depDepth}` : ''}
        style={{ cursor: 'default' }}>
        {/* Sélection (Phase 5, roadmap v1, 2026-08-08), réservée PO/Admin, même périmètre que
            les autres actions sur `canManage` de cette table. */}
        {canManage && (
          <td style={{ textAlign: 'center' }}>
            <input type="checkbox" data-testid={`item-select-${item.id}`} checked={selected}
              onChange={() => onToggleSelect(item.id)} onClick={e => e.stopPropagation()} />
          </td>
        )}
        {/* Expand */}
        <td style={{ textAlign: 'center', padding: '0 4px' }}>
          {(criteria.length > 0 || hasUS) && (
            <button className="btn-icon" style={{ opacity: .55 }}
              onClick={e => { e.stopPropagation(); onToggleExpand(item.id) }}
              title={isExpanded ? 'Masquer' : `US${criteria.length > 0 ? ' + CA' : ''}`}>
              <Svg d={isExpanded ? SVG_CHEV_D : SVG_CHEV_R} size={12} />
            </button>
          )}
        </td>

        {/* Prio */}
        <td style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: PRIO_COLOR[item.priority], color: PRIO_TEXT[item.priority], whiteSpace: 'nowrap' }}>
            {PRIO_LABEL[item.priority]}
          </span>
        </td>

        {/* Clé */}
        <td style={{ textAlign: 'center' }}>
          <span className="item-key">{item.key}</span>
        </td>

        {/* Type */}
        <td style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: TYPE_BG[iType], color: TYPE_FG[iType], whiteSpace: 'nowrap' }}>
              {TYPE_LABEL[iType]}
            </span>
            {iType === 'bug' && item.severity && (
              <span title={SEV_LABEL[item.severity]} style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[item.severity], display: 'inline-block', flexShrink: 0 }} />
            )}
          </span>
        </td>

        {/* Sprint */}
        <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
          {sprint ? `S${sprint.number}` : '-'}
        </td>

        {/* Client */}
        <td style={{ textAlign: 'center' }}>
          {client && <span style={{ fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap' }}>{client.name}</span>}
        </td>

        {/* Statut */}
        <td style={{ textAlign: 'center' }}>
          {status && <span className="badge" style={{ background: status.color + '20', color: status.color }}>{status.label}</span>}
        </td>

        {/* Description */}
        <td style={{ maxWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ minWidth: 0 }}>
              {item.epicId && (() => {
                const ep = hierarchyNodes.find(x => x.id === item.epicId)
                const epColor = ep ? (clients.find(c => c.id === ep.clientId)?.color ?? 'var(--primary)') : 'var(--primary)'
                return ep ? <span title={ep.desc} style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: epColor + '18', color: epColor, marginBottom: 2, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.key}</span> : null
              })()}
              <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, lineHeight: 1.4 }}>
                {item.desc}
              </div>
              {dl?.type !== 'none' && dl?.date && (
                <span className={`deadline-badge deadline-${dl.type}`} style={{ marginTop: 3, display: 'inline-flex' }}>
                  {fmtDate(dl.date)}
                </span>
              )}
            </div>
          </div>
        </td>

        {/* Tags */}
        <td style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
            {item.tags.map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        </td>

        {/* Assignés */}
        <td style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {item.assignees.map(id => {
              const m = team.find(mem => mem.id === id)
              return m ? <span key={id} className="avatar" title={m.name}>{m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span> : null
            })}
          </div>
        </td>

        {/* SP */}
        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: 12 }}>
          {item.sp}
        </td>

        {/* Dépendances */}
        <td style={{ whiteSpace: 'nowrap' }}>
          {depItems.length === 0 && !depDepth && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>-</span>}
          {depItems.slice(0, 2).map(d => (
            <span key={d.id} style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', borderRadius: 4, padding: '1px 5px', marginRight: 3 }}>{d.key}</span>
          ))}
          {depItems.length > 2 && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 3 }}>{depItems.length} dép.</span>}
          {depDepth !== undefined && (
            <span className="dep-level-badge" style={{ background: DEP_COLOR }}>Niv.{depDepth}</span>
          )}
        </td>

        {/* DoR */}
        <td style={{ textAlign: 'center' }} data-testid="dor-cell">
          <DorDodBadge stat={dorDodStat(item.dor)} label="DoR" />
        </td>

        {/* DoD */}
        <td style={{ textAlign: 'center' }} data-testid="dod-cell">
          <DorDodBadge stat={dorDodStat(item.dod)} label="DoD" />
        </td>

        {/* Actions - Modifier : PO/Admin (accès complet) ou Dev (sous-ensemble opérationnel).
            Supprimer : PO/Admin uniquement (voir utils/permissions.ts). */}
        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
          {(canManage || canOperate) && (
            <button className="btn-icon" onClick={() => onEdit(item)} title="Modifier"><Svg d={SVG_EDIT} /></button>
          )}
          {canManage && (
            <button className="btn-icon danger" onClick={() => onDelete(item.id)} title="Supprimer"><Svg d={SVG_DEL} /></button>
          )}
        </td>
      </tr>

      {/* US + CA expand */}
      {isExpanded && (hasUS || criteria.length > 0) && (
        <tr className="ca-expand-row">
          <td colSpan={canManage ? 16 : 15} className="ca-expand-cell">
            <div className="ca-expand-inner">
              {hasUS && (
                <div className="ca-us-block">
                  <div className="ca-label-top">User Story</div>
                  {item.role && <div className="ca-us-row"><span className="ca-us-prefix">En tant que</span><span>{item.role}</span></div>}
                  {item.need && <div className="ca-us-row"><span className="ca-us-prefix">je souhaite</span><span>{item.need}</span></div>}
                  {item.benefit && <div className="ca-us-row"><span className="ca-us-prefix">afin de</span><span>{item.benefit}</span></div>}
                </div>
              )}
              {criteria.length > 0 && (
                <div className="ca-bdd-block">
                  <div className="ca-label-top">
                    {item.type === 'bug' ? 'Critères de résolution' : "Critères d'acceptation"}
                  </div>
                  {criteria.map((c, ci) => (
                    <div key={c.id} className="ca-bdd-row">
                      <span className="ca-bdd-num">#{ci + 1}</span>
                      <span className="ca-bdd-field given"><span className="ca-badge given">Étant donné que</span> {c.given}</span>
                      <span className="ca-bdd-sep">→</span>
                      <span className="ca-bdd-field when"><span className="ca-badge when">Quand</span> {c.when}</span>
                      <span className="ca-bdd-sep">→</span>
                      <span className="ca-bdd-field then"><span className="ca-badge then">Alors</span> {c.then}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  )
}

// Phase 7, perf (2026-08-24) : memo() + props narrowed (voir BacklogRowProps ci-dessus). Les
// appelants (BacklogPage.tsx) doivent passer des callbacks stables (useCallback) et des valeurs
// dérivées primitives (pas les Set/Map bruts) pour que ce memo() serve à quelque chose - voir
// KanbanCard.tsx pour la justification complète.
export const BacklogRow = memo(BacklogRowImpl)
