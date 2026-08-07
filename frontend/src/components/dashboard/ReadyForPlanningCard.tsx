import type { CheckItem, Item } from '../../types'
import type { DashboardWidgetSize } from '../../data/dashboardWidgets'

interface Props {
  items: Item[]
  size: DashboardWidgetSize
}

/** Même règle que `dorDodStat()` (BacklogPage.tsx), dupliquée ici plutôt que partagée (convention
 *  déjà suivie dans le projet pour ces petits helpers) : `null` si aucun critère de DoR renseigné,
 *  sinon le compte coché/total. */
function dorDodStat(list?: CheckItem[]): { done: number; total: number } | null {
  if (!list || list.length === 0) return null
  return { done: list.filter(c => c.done).length, total: list.length }
}

function isReady(item: Item): boolean {
  const stat = dorDodStat(item.dor)
  return stat !== null && stat.done === stat.total
}

// Widget "Prêt pour planification" (2026-08-07, retour Julien) — 17e widget Dashboard, sans face
// cachée de réglages (aucun réglage avec un vrai sens ici, comme sprint-absences/retro-actions).
// Reprend exactement la même règle que le filtre "Prêt (DoR complète)" déjà présent sur le Backlog
// (`filterReady`, BacklogPage.tsx) : un item est prêt si sa Definition of Ready (`Item.dor`) est
// entièrement cochée. Population : items du backlog pur (`sprintId` vide), pas encore affectés à un
// sprint — pas de sens de regarder le DoR d'un item déjà planifié, il est trop tard pour ce sprint-là.
//
// S en gros chiffre (nombre d'items prêts) + "sur X items du backlog", comme Blocages actifs. M en
// liste des items prêts avec leur SP à droite (utile pour jauger la capacité du prochain sprint),
// triés par clé croissante comme "Progression par Epic".
export function ReadyForPlanningCard({ items, size }: Props) {
  const backlog = items.filter(i => !i.sprintId)
  const ready = backlog.filter(isReady).sort((a, b) => a.key.localeCompare(b.key))
  const heroSize = String(ready.length).length >= 3 ? 26 : 34

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: size === 'S' ? '10px 12px' : '14px 18px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: size === 'S' ? 4 : 8 }}>Prêt pour planification</div>
      {ready.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
          Aucun item prêt
        </div>
      ) : size === 'S' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gridTemplateRows: 'auto auto', columnGap: 4 }}>
            <span style={{ gridRow: 1, gridColumn: 1, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: heroSize, fontWeight: 800, color: '#34c759', lineHeight: .78, fontVariantNumeric: 'tabular-nums' }}>
              {ready.length}
            </span>
            <span style={{ gridRow: 1, gridColumn: 2, justifySelf: 'end', alignSelf: 'start', fontFamily: 'var(--font-hero)', fontSize: 14, fontWeight: 800, color: '#34c759', opacity: .6 }}>
              {ready.length > 1 ? 'prêts' : 'prêt'}
            </span>
            <span style={{ gridRow: 2, gridColumn: '1 / 3', justifySelf: 'end', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
              sur {backlog.length} item{backlog.length > 1 ? 's' : ''} du backlog
            </span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {ready.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--text-muted)' }}>{item.key} ·</span> {item.desc}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--border)', padding: '2px 7px', borderRadius: 10, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {item.sp} SP
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
