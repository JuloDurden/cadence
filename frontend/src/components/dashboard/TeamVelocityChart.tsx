import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { Sprint, Item, TeamMember, KanbanCol } from '../../types'
import type { DashboardWidgetSize, TeamVelocityMetric } from '../../data/dashboardWidgets'
import { isItemDone } from '../../utils/status'
import { FlipCard } from './FlipCard'

// Même palette/dérivation que TeamPage.tsx (`memberColor`) — dupliquée ici plutôt que partagée,
// convention déjà suivie dans le projet pour ces petits helpers locaux (voir `uid()` répété dans
// une quinzaine de fichiers). Une couleur stable par membre, cohérente entre ce widget et la page
// Équipe, sans avoir à faire dépendre dashboard/ de pages/TeamPage.tsx.
const MEMBER_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
function memberColor(id: string) { return MEMBER_COLORS[id.charCodeAt(id.length - 1) % MEMBER_COLORS.length] }

// Infobulle custom (2026-08-06, retour Julien : "l'infobulle... n'est pas exploitable" — l'ancien
// `formatter` renvoyait un nom vide, donc une pile de lignes "5 SP" sans savoir de qui) — 1 ligne
// par membre VISIBLE (les courbes masquées via la légende, `hiddenIds`, sont exclues plutôt que
// d'afficher une valeur pour une courbe qu'on a explicitement cachée), triée par valeur
// décroissante, pastille de couleur + nom + valeur. `maxHeight`/`overflowY` en filet de sécurité
// pour une équipe à beaucoup de monde plutôt qu'une infobulle qui déborde de l'écran.
interface VelocityTooltipPayloadItem { dataKey?: string | number; name?: string; value?: number; color?: string }
function VelocityTooltip({ active, payload, label, metricLabel, hiddenIds }: {
  active?: boolean
  payload?: VelocityTooltipPayloadItem[]
  label?: string
  metricLabel: string
  hiddenIds: Set<string>
}) {
  if (!active || !payload || payload.length === 0) return null
  const visible = payload
    .filter(p => p.dataKey != null && !hiddenIds.has(String(p.dataKey)))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  if (visible.length === 0) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '8px 10px', boxShadow: '0 4px 16px rgba(0,0,0,.12)', fontSize: 11,
      maxHeight: 160, overflowY: 'auto', minWidth: 120,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>{label}</div>
      {visible.map(p => (
        <div key={String(p.dataKey)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ flex: 1, color: 'var(--text)', whiteSpace: 'nowrap' }}>{p.name}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{p.value} {metricLabel}</span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  sprints: Sprint[]
  team: TeamMember[]
  items: Item[]
  kanbanCols: KanbanCol[]
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget). */
  instanceKey: string
  metric: TeamVelocityMetric
  onChangeMetric: (next: TeamVelocityMetric) => void
  /** Taille actuelle de la tuile — même convention que VelocityChart.tsx (compact en M, détaillé en
   *  L/XL). */
  size: DashboardWidgetSize
}

// Widget "Vélocité par membre" (2026-08-06, retour Julien, capture d'un graphique multi-courbes
// "Sprint Velocity by Team Member" fournie en référence de style) — 9e widget Dashboard, même
// famille que VelocityChart.tsx (courbes recharts par sprint) mais une courbe PAR MEMBRE plutôt
// qu'une courbe agrégée pour toute l'équipe.
//
// Calcul volontairement simple, pas via `getSprintSP()`/hierarchyScore.ts (2026-08-06) : ce
// dernier existe pour compter des Epics/Initiatives assignés à un sprint mais sans US propre — un
// Epic n'a pas d'assigné individuel (`HierarchyNode` n'a pas de champ `assignees`, seul `Item` en a
// un), donc rien à ventiler par membre à ce niveau. Uniquement les US réellement assignées et
// terminées, mêmes filtres que `assignedItems` dans TeamPage.tsx (`i.assignees.includes(m.id)`) —
// une US à plusieurs assignés compte intégralement pour chacun, pas de partage des SP entre
// coéquipiers.
//
// Interactions de lecture, état local non persisté (voir le commentaire de `TeamVelocityMetric`
// dans dashboardWidgets.ts) :
//  - clic sur un nom dans la légende : masque/affiche sa courbe (`hiddenIds`) ;
//  - clic sur une courbe : la met en avant, estompe les autres (`highlightedId`), un 2e clic sur la
//    même courbe revient à l'affichage normal.
export function TeamVelocityChart({ sprints, team, items, kanbanCols, editable, instanceKey, metric, onChangeMetric, size }: Props) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  function toggleHidden(id: string) {
    setHiddenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleHighlight(id: string) {
    setHighlightedId(prev => prev === id ? null : id)
  }

  const data = sprints.map(sp => {
    const row: Record<string, string | number> = { name: `S${sp.number}` }
    for (const member of team) {
      const memberItems = items.filter(i =>
        i.sprintId === sp.id && i.assignees.includes(member.id) && isItemDone(i, kanbanCols),
      )
      row[member.id] = metric === 'count' ? memberItems.length : memberItems.reduce((sum, i) => sum + i.sp, 0)
    }
    return row
  })

  const compact = size === 'M'
  const chartHeight = compact ? 90 : 270
  const metricLabel = metric === 'count' ? 'US' : 'SP'

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box' }}>
      <div className="dash-widget-title" style={{ marginBottom: 18 }}>Vélocité par membre</div>
      {team.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: chartHeight, color: 'var(--text-muted)', fontSize: 13 }}>
          Aucun membre dans l'équipe
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis
              tick={compact ? false : { fontSize: 11 }}
              width={compact ? 20 : 34}
              label={{ value: metricLabel, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: 'var(--text-muted)' } }}
            />
            <Tooltip content={<VelocityTooltip metricLabel={metricLabel} hiddenIds={hiddenIds} />} />
            {!compact && (
              <Legend
                wrapperStyle={{ fontSize: 11, cursor: 'pointer' }}
                onClick={(e: { dataKey?: string | number }) => e.dataKey != null && toggleHidden(String(e.dataKey))}
                formatter={(value: string, entry: { dataKey?: string | number }) => {
                  const id = entry.dataKey != null ? String(entry.dataKey) : ''
                  const faded = hiddenIds.has(id) || (highlightedId != null && highlightedId !== id)
                  const emphasized = highlightedId === id
                  return (
                    <span style={{
                      opacity: faded ? .4 : 1,
                      textDecoration: hiddenIds.has(id) ? 'line-through' : 'none',
                      fontWeight: emphasized ? 700 : 400,
                    }}>
                      {value}
                    </span>
                  )
                }}
              />
            )}
            {team.map(member => (
              <Line
                key={member.id}
                dataKey={member.id}
                name={member.name}
                hide={hiddenIds.has(member.id)}
                stroke={memberColor(member.id)}
                strokeWidth={highlightedId === member.id ? 3 : 2}
                strokeOpacity={highlightedId && highlightedId !== member.id ? .15 : 1}
                dot={{ r: 3 }}
                onClick={() => toggleHighlight(member.id)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )

  const back = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 18 }}>Vélocité par membre</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`team-velocity-metric-${instanceKey}`}
            data-testid={`dashboard-widget-team-velocity-sp-${instanceKey}`}
            checked={metric === 'sp'}
            onChange={() => onChangeMetric('sp')}
          />
          SP terminés
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`team-velocity-metric-${instanceKey}`}
            data-testid={`dashboard-widget-team-velocity-count-${instanceKey}`}
            checked={metric === 'count'}
            onChange={() => onChangeMetric('count')}
          />
          Nombre d'US terminées
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}
