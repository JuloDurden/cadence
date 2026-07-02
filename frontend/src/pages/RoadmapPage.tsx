import { useState } from 'react'
import { useCadence } from '../context/StateContext'
import type { RoadmapGoal } from '../types'

const COLORS = [
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#4f46e5,#4338ca)',
  'linear-gradient(135deg,#059669,#047857)',
  'linear-gradient(135deg,#7c3aed,#6d28d9)',
  'linear-gradient(135deg,#b45309,#92400e)',
  'linear-gradient(135deg,#be185d,#9d174d)',
]

function uid() { return Math.random().toString(36).slice(2) }

function sprintDateLabel(start: string, end: string): string {
  if (!start || !end) return ''
  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return `${fmt(start)} → ${fmt(end)}`
}

export function RoadmapPage() {
  const { state, dispatch } = useCadence()
  const [editGoal, setEditGoal] = useState<RoadmapGoal | null>(null)
  const [form, setForm] = useState({ icon: '', name: '', goal: '', metrics: '' })

  const roadmap = state.roadmap || []

  function openModal(g: RoadmapGoal) {
    setEditGoal(g)
    setForm({ icon: g.icon, name: g.name, goal: g.goal, metrics: g.metrics.join('\n') })
  }

  function saveGoal() {
    if (!editGoal) return
    const updated: RoadmapGoal = {
      ...editGoal,
      icon: form.icon.trim() || editGoal.icon,
      name: form.name.trim() || editGoal.name,
      goal: form.goal.trim(),
      metrics: form.metrics.split('\n').map(s => s.trim()).filter(Boolean),
    }
    dispatch({ type: 'UPDATE_ROADMAP_GOAL', payload: updated })
    const sprint = state.sprints.find(s => s.id === updated.sprintId)
    if (sprint) dispatch({ type: 'UPDATE_SPRINT', payload: { ...sprint, label: updated.name } })
    setEditGoal(null)
  }

  function addSprint() {
    const maxNum = state.sprints.length > 0 ? Math.max(...state.sprints.map(s => s.number)) : 0
    const num = maxNum + 1
    const id = 's' + uid()
    dispatch({
      type: 'ADD_SPRINT', payload: {
        id, number: num, label: `Sprint ${num}`,
        startDate: '', endDate: '', capacity: state.settings.defaultCapacity,
        closed: false,
      }
    })
    dispatch({
      type: 'ADD_ROADMAP_GOAL', payload: {
        id: 'g' + uid(), sprintId: id, icon: '🚀',
        color: COLORS[roadmap.length % COLORS.length],
        name: `Sprint ${num}`,
        goal: 'Sprint Goal à définir',
        metrics: ['Métrique 1', 'Métrique 2'],
      }
    })
  }

  return (
    <div className="page-content">
      {/* Header banner */}
      <div className="roadmap-header-box">
        <div>
          <h2>🗺️ Product Roadmap</h2>
          <p>{roadmap.length} sprint{roadmap.length !== 1 ? 's' : ''} planifiés · {state.items.filter(i => i.sprintId).length} items répartis</p>
        </div>
      </div>

      {/* Grid */}
      <div className="roadmap-grid">
        {roadmap.map((g, gi) => {
          const sprint = state.sprints.find(s => s.id === g.sprintId) ?? state.sprints[gi]
          const items = sprint ? state.items.filter(i => i.sprintId === sprint.id) : []
          const totalSP = items.reduce((acc, i) => acc + i.sp, 0)
          const capLabel = sprint && sprint.capacity > 0 ? ` / ${sprint.capacity} SP` : ''
          const dateLabel = sprint ? sprintDateLabel(sprint.startDate, sprint.endDate) : ''

          // Group items by client
          const byClient = new Map<string, typeof items>()
          items.forEach(item => {
            const list = byClient.get(item.clientId) ?? []
            byClient.set(item.clientId, [...list, item])
          })

          return (
            <div key={g.id} className="roadmap-goal">
              <div className="roadmap-goal-header" style={{ background: g.color }}>
                <div className="roadmap-goal-icon">{g.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="roadmap-goal-sprint">Sprint {gi + 1} · {totalSP}{capLabel} SP</div>
                  <div className="roadmap-goal-title">{g.name}</div>
                  {dateLabel && <div className="roadmap-goal-date">📅 {dateLabel}</div>}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); openModal(g) }}
                  style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, padding: '3px 8px', cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start' }}
                >✏️</button>
              </div>

              <div className="roadmap-section">
                <div className="roadmap-section-label">🎯 Sprint Goal</div>
                <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text)', margin: 0 }}>
                  {g.goal || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun objectif défini.</span>}
                </p>
              </div>

              {g.metrics.length > 0 && (
                <div className="roadmap-section">
                  <div className="roadmap-section-label">Métriques de succès</div>
                  {g.metrics.map((m, mi) => (
                    <div key={mi} className="roadmap-metric">{m}</div>
                  ))}
                </div>
              )}

              {byClient.size > 0 ? (
                Array.from(byClient.entries()).map(([clientId, clientItems]) => {
                  const client = state.clients.find(c => c.id === clientId)
                  const clientSP = clientItems.reduce((acc, i) => acc + i.sp, 0)
                  return (
                    <div key={clientId} className="roadmap-section">
                      <div className="roadmap-section-label">
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: client?.color ?? '#888', marginRight: 5, verticalAlign: 'middle' }} />
                        {client?.name ?? 'Client'} · <strong>{clientSP} SP</strong>
                      </div>
                      {clientItems.map(item => (
                        <div key={item.id} className="roadmap-feature">
                          <div className="roadmap-feature-dot" style={{ background: client?.color ?? '#888' }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.desc}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 9, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>{item.sp} SP</span>
                        </div>
                      ))}
                    </div>
                  )
                })
              ) : (
                <div className="roadmap-section">
                  <div className="roadmap-section-label">Fonctionnalités clés</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Aucun item dans ce sprint.</p>
                </div>
              )}
            </div>
          )
        })}

        {/* Add sprint */}
        <div className="roadmap-add-btn-wrap">
          <button
            className="roadmap-add-btn"
            onClick={addSprint}
          >
            <span style={{ fontSize: 24 }}>＋</span>
            <span>Nouveau sprint</span>
          </button>
        </div>
      </div>

      {/* Edit modal */}
      {editGoal && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setEditGoal(null) }}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">✏️ {editGoal.name}</span>
              <button className="modal-close" onClick={() => setEditGoal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '16px 20px', gap: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: '0 0 70px' }}>
                  <label className="form-label">Icône</label>
                  <input className="form-input" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} style={{ textAlign: 'center' }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Nom du sprint thème</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">🎯 Sprint Goal</label>
                <textarea className="form-input" rows={3} value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Métriques de succès{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(une par ligne)</span>
                </label>
                <textarea className="form-input" rows={4} value={form.metrics} onChange={e => setForm(f => ({ ...f, metrics: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                💡 Les fonctionnalités sont dérivées automatiquement des items assignés au sprint correspondant.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditGoal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveGoal}>💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
