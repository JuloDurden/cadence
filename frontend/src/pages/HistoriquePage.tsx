import { useState, useMemo } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import type { HistoryEventType } from '../types'

const TYPE_CFG: Record<HistoryEventType, { bg: string; color: string; label: string }> = {
  item_create:     { bg: '#d1fae5', color: '#065f46', label: 'CRÉATION' },
  item_edit:       { bg: '#dbeafe', color: '#1e40af', label: 'ÉDITION' },
  item_delete:     { bg: '#fee2e2', color: '#991b1b', label: 'SUPPRESSION' },
  item_status:     { bg: '#ede9fe', color: '#5b21b6', label: 'STATUT' },
  sprint_add:      { bg: '#d1fae5', color: '#065f46', label: 'SPRINT' },
  sprint_activate: { bg: '#fef3c7', color: '#92400e', label: 'SPRINT' },
  undo:            { bg: '#f3f4f6', color: '#374151', label: 'UNDO' },
  other:           { bg: '#f3f4f6', color: '#374151', label: 'AUTRE' },
}

function fmtTs(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function HistoriquePage() {
  const { state } = useCadence()
  const history = useMemo(() => [...(state.history ?? [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [state.history])

  const [sprintFilter, setSprintFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<HistoryEventType | 'all'>('all')
  const [authorFilter, setAuthorFilter] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const authorIds = [...new Set(history.filter(h => h.author).map(h => h.author!))]

  const filtered = history.filter(h => {
    if (authorFilter !== 'all' && h.author !== authorFilter) return false
    if (sprintFilter !== 'all') {
      if (sprintFilter === 'unassigned' && h.sprintId) return false
      if (sprintFilter !== 'unassigned' && h.sprintId !== sprintFilter) return false
    }
    if (typeFilter !== 'all' && h.type !== typeFilter) return false
    return true
  })

  // Velocity data
  const doneSt = state.kanbanCols.filter(c => c.isDone).map(c => c.id)
  const velData = state.sprints.map(sp => {
    const spItems = state.items.filter(i => i.sprintId === sp.id)
    const est = sp.velocitySnapshot ?? spItems.reduce((s, i) => s + i.sp, 0)
    const real = spItems.filter(i => doneSt.includes(i.status)).reduce((s, i) => s + i.sp, 0)
    return { sp, est, real, pct: est > 0 ? Math.round(real / est * 100) : 0 }
  })
  const maxEst = Math.max(...velData.map(v => v.est), 1)

  const kpi = {
    total: history.length,
    status: history.filter(h => h.type === 'item_status').length,
    created: history.filter(h => h.type === 'item_create').length,
    undone: history.filter(h => h.type === 'undo').length,
  }

  return (
    <>
      <Header title="Historique" />
      <div className="page-content" style={{ maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { value: kpi.total, label: 'Actions tracées', color: 'var(--primary)' },
            { value: kpi.status, label: 'Changements statut', color: 'var(--success)' },
            { value: kpi.created, label: 'Items créés', color: 'var(--warning)' },
            { value: kpi.undone, label: 'Annulations', color: 'var(--text-muted)' },
          ].map(k => (
            <div key={k.label} className="stat-card">
              <div className="stat-value" style={{ color: k.color }}>{k.value}</div>
              <div className="stat-label">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Velocity chart */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>⚡ Vélocité réelle vs estimée</div>
          {velData.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun sprint.</p>
          ) : velData.map(v => (
            <div key={v.sp.id} style={{ marginBottom: 8 }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === v.sp.id ? null : v.sp.id)}
              >
                <span style={{ fontSize: 10, width: 16, textAlign: 'center', color: 'var(--text-muted)' }}>{expanded === v.sp.id ? '▼' : '▶'}</span>
                <div style={{ width: 120, fontSize: 10, fontWeight: 700, flexShrink: 0, color: v.sp.closed ? 'var(--success)' : 'var(--primary)' }}>
                  {v.sp.closed ? '🔒 ' : '● '}{v.sp.label || `Sprint ${v.sp.number}`}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {[{ label: 'Est.', val: v.est, pct: Math.round(v.est / maxEst * 100), color: 'var(--text-muted)' },
                    { label: 'Réel', val: v.real, pct: v.est > 0 ? Math.round(Math.min(v.real, v.est) / v.est * 100) : 0, color: 'var(--success)' }]
                    .map(row => (
                      <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 34, fontSize: 9, color: row.color, textAlign: 'right', fontWeight: 700 }}>{row.label}</span>
                        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 3, height: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${row.pct}%`, background: row.color, borderRadius: 3 }} />
                        </div>
                        <span style={{ width: 40, fontSize: 9, color: row.color, fontWeight: 700 }}>{row.val} SP</span>
                      </div>
                    ))}
                </div>
                <span style={{ width: 36, textAlign: 'right', fontSize: 11, fontWeight: 800, color: v.pct >= 100 ? 'var(--success)' : v.pct > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{v.pct}%</span>
              </div>
              {expanded === v.sp.id && (
                <div style={{ marginLeft: 26, marginTop: 4, marginBottom: 8 }}>
                  {state.items.filter(i => i.sprintId === v.sp.id).map(item => {
                    const client = state.clients.find(c => c.id === item.clientId)
                    const done = doneSt.includes(item.status)
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 11, borderBottom: '1px solid var(--surface2)', opacity: done ? .5 : 1 }}>
                        {client && <div style={{ width: 6, height: 6, borderRadius: '50%', background: client.color, flexShrink: 0 }} />}
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--primary)', flexShrink: 0 }}>{item.key}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : undefined }}>{item.desc}</span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{item.sp} SP</span>
                        {done && <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 10 }}>✓</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Activity log */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>📋 Journal d'activité</div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
              {authorIds.length > 0 && (
                <select className="form-input form-select" style={{ fontSize: 11 }} value={authorFilter} onChange={e => setAuthorFilter(e.target.value)}>
                  <option value="all">Tous les auteurs</option>
                  {authorIds.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
              <select className="form-input form-select" style={{ fontSize: 11 }} value={sprintFilter} onChange={e => setSprintFilter(e.target.value)}>
                <option value="all">Tous les sprints</option>
                {state.sprints.map(sp => <option key={sp.id} value={sp.id}>{sp.label || `Sprint ${sp.number}`}</option>)}
                <option value="unassigned">Non assigné</option>
              </select>
              <select className="form-input form-select" style={{ fontSize: 11 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value as HistoryEventType | 'all')}>
                <option value="all">Tous les types</option>
                <option value="item_create">Créations</option>
                <option value="item_edit">Éditions</option>
                <option value="item_delete">Suppressions</option>
                <option value="item_status">Changements statut</option>
                <option value="sprint_activate">Activations sprint</option>
                <option value="undo">Annulations</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune entrée pour ces filtres.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filtered.map(h => {
                const cfg = TYPE_CFG[h.type] ?? TYPE_CFG.other
                // `h.author` est déjà le nom affiché de la personne connectée au moment de l'action
                // (voir useAuth()/Chantier J) — ce n'est jamais un id de `state.team`, donc pas de lookup ici.
                const sprint = state.sprints.find(s => s.id === h.sprintId)
                return (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, borderBottom: '1px solid var(--surface2)' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap', marginTop: 2 }}>{cfg.label}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {h.itemKey && <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--primary)', marginRight: 6 }}>{h.itemKey}</span>}
                      <span style={{ fontSize: 12 }}>{h.itemDesc ?? h.detail ?? ''}</span>
                      {h.from && h.to && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> : <em>{h.from}</em> → <em>{h.to}</em></span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtTs(h.timestamp)}</span>
                      {h.author && <span style={{ fontSize: 9, color: 'var(--primary)', fontWeight: 600 }}>{h.author}</span>}
                      {sprint && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{sprint.label || `Sprint ${sprint.number}`}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
