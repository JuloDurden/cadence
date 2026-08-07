import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { Client, Item, KanbanCol, Sprint } from '../../types'
import type { ClientViewDisplay, DashboardWidgetSize } from '../../data/dashboardWidgets'
import { isItemDone } from '../../utils/status'
import { FlipCard } from './FlipCard'

/** Nombre de sprints clôturés couverts par la fenêtre — fixé plutôt qu'un réglage (voir le
 *  commentaire de `ClientViewDisplay` dans dashboardWidgets.ts) : pas assez de sprints dans les
 *  données actuelles pour qu'un réglage de fenêtre serve à quelque chose. */
const WINDOW_SIZE = 6

/** `rgba()` à partir d'un hex `Client.color` (#rrggbb) — pour la teinte du tableau chaleur, dont
 *  l'intensité doit varier avec la valeur (une couleur pleine partout ne montrerait rien). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface Props {
  sprints: Sprint[]
  items: Item[]
  clients: Client[]
  kanbanCols: KanbanCol[]
  /** Mode "Personnaliser" de la page — voir FlipCard.tsx. */
  editable: boolean
  /** Clé unique du placement — voir le commentaire équivalent dans BlockersCard.tsx (suffixe les
   *  `name`/`data-testid` des inputs radio pour éviter qu'un `name` HTML partagé fasse se marcher
   *  dessus 2 instances de ce widget). */
  instanceKey: string
  display: ClientViewDisplay
  onChangeDisplay: (next: ClientViewDisplay) => void
  size: DashboardWidgetSize
}

interface ClientTooltipPayloadItem { dataKey?: string | number; name?: string; value?: number; color?: string }
function ClientTooltip({ active, payload, label, hiddenIds }: {
  active?: boolean
  payload?: ClientTooltipPayloadItem[]
  label?: string
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
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{p.value} SP</span>
        </div>
      ))}
    </div>
  )
}

// Widget "Vue par client" (2026-08-07, retour Julien — `docs/roadmap-v1.md` : "Vue par client sur
// les N derniers sprints, au-delà du RAG actuel qui ne montre qu'un état instantané") — 14e widget
// avec une face cachée de réglages (FlipCard.tsx). Même famille que TeamVelocityChart.tsx (courbes
// recharts par sprint, interactions légende/surbrillance identiques), mais par CLIENT plutôt que
// par membre, avec en plus un réglage d'affichage courbes/tableau chaleur (retour Julien : "n'est-il
// pas possible de faire les 2... car les 2 me conviennent très bien" — les 2 maquettes proposées lui
// convenaient également, pas de raison de trancher).
//
// Couleur = `Client.color` (déjà utilisée dans une quinzaine de fichiers de l'app : Kanban, Gantt,
// Swimlanes, Backlog...), pas une couleur recalculée comme le `memberColor()` de
// TeamVelocityChart.tsx — un client a déjà une identité visuelle stable dans l'outil.
//
// Fenêtre fixée aux `WINDOW_SIZE` derniers sprints CLÔTURÉS (pas un réglage, voir son commentaire) ;
// métrique fixée aux SP livrés/US terminées (pas de bascule SP/nombre d'US comme team-velocity :
// suivre un pourcentage n'a pas de sens sur des sprints déjà clôturés). Un client sans aucune US
// dans la fenêtre est exclu (comme Santé clients (RAG) en scope 'sprint'), pas affiché à plat à 0.
export function ClientViewCard({ sprints, items, clients, kanbanCols, editable, instanceKey, display, onChangeDisplay, size }: Props) {
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

  const windowSprints = sprints.filter(s => s.closed).sort((a, b) => a.number - b.number).slice(-WINDOW_SIZE)
  const windowSprintIds = new Set(windowSprints.map(s => s.id))
  const activeClients = clients.filter(c => items.some(i => i.clientId === c.id && windowSprintIds.has(i.sprintId)))

  function deliveredSP(clientId: string, sprintId: string): number {
    return items
      .filter(i => i.clientId === clientId && i.sprintId === sprintId && isItemDone(i, kanbanCols))
      .reduce((sum, i) => sum + i.sp, 0)
  }

  const compact = size === 'M'
  const chartHeight = compact ? 90 : 240

  const front = (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', height: '100%', padding: '18px 20px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Vue par client</div>
      {windowSprints.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          Pas encore de sprint clôturé
        </div>
      ) : activeClients.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          Aucune activité client sur cette période
        </div>
      ) : display === 'heatmap' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <ClientHeatmap clients={activeClients} sprints={windowSprints} deliveredSP={deliveredSP} compact={compact} />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={windowSprints.map(sp => {
            const row: Record<string, string | number> = { name: `S${sp.number}` }
            for (const client of activeClients) row[client.id] = deliveredSP(client.id, sp.id)
            return row
          })} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis
              tick={compact ? false : { fontSize: 11 }}
              width={compact ? 20 : 34}
              label={compact ? undefined : { value: 'SP', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: 'var(--text-muted)' } }}
            />
            <Tooltip content={<ClientTooltip hiddenIds={hiddenIds} />} />
            {!compact && (
              <Legend
                wrapperStyle={{ fontSize: 11, cursor: 'pointer' }}
                onClick={(e: { dataKey?: string | number }) => e.dataKey != null && toggleHidden(String(e.dataKey))}
                formatter={(value: string, entry: { dataKey?: string | number }) => {
                  const id = entry.dataKey != null ? String(entry.dataKey) : ''
                  const faded = hiddenIds.has(id) || (highlightedId != null && highlightedId !== id)
                  const emphasized = highlightedId === id
                  return (
                    <span style={{ opacity: faded ? .4 : 1, textDecoration: hiddenIds.has(id) ? 'line-through' : 'none', fontWeight: emphasized ? 700 : 400 }}>
                      {value}
                    </span>
                  )
                }}
              />
            )}
            {activeClients.map(client => (
              <Line
                key={client.id}
                dataKey={client.id}
                name={client.name}
                hide={hiddenIds.has(client.id)}
                stroke={client.color}
                strokeWidth={highlightedId === client.id ? 3 : 2}
                strokeOpacity={highlightedId && highlightedId !== client.id ? .15 : 1}
                dot={{ r: 3 }}
                onClick={() => toggleHighlight(client.id)}
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
      <div className="dash-widget-title" style={{ marginBottom: 14 }}>Vue par client</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`client-view-display-${instanceKey}`}
            data-testid={`dashboard-widget-client-view-lines-${instanceKey}`}
            checked={display === 'lines'}
            onChange={() => onChangeDisplay('lines')}
          />
          Courbes
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input
            type="radio"
            name={`client-view-display-${instanceKey}`}
            data-testid={`dashboard-widget-client-view-heatmap-${instanceKey}`}
            checked={display === 'heatmap'}
            onChange={() => onChangeDisplay('heatmap')}
          />
          Tableau chaleur
        </label>
      </div>
    </div>
  )

  return <FlipCard editable={editable} front={front} back={back} />
}

function ClientHeatmap({ clients, sprints, deliveredSP, compact }: {
  clients: Client[]; sprints: Sprint[]; deliveredSP: (clientId: string, sprintId: string) => number; compact: boolean
}) {
  const values = clients.flatMap(c => sprints.map(sp => deliveredSP(c.id, sp.id)))
  const max = Math.max(1, ...values)
  const cellPad = compact ? '3px' : '4px 6px'
  const fontSize = compact ? 10 : 11

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize }}>
      <thead>
        <tr>
          <td />
          {sprints.map(sp => (
            <td key={sp.id} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: cellPad }}>S{sp.number}</td>
          ))}
        </tr>
      </thead>
      <tbody>
        {clients.map(client => (
          <tr key={client.id}>
            <td style={{ padding: `${cellPad} ${cellPad} ${cellPad} 0`, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: client.color, marginRight: 5, flexShrink: 0 }} />
              {client.name}
            </td>
            {sprints.map(sp => {
              const v = deliveredSP(client.id, sp.id)
              return (
                <td key={sp.id} style={{ textAlign: 'center', padding: cellPad, background: hexToRgba(client.color, .12 + (v / max) * .5) }}>
                  {v}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
