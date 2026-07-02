import { useState, useEffect } from 'react'
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
  return `${fmt(start)} -> ${fmt(end)}`
}

export function RoadmapPage() {
  const { state, dispatch } = useCadence()
  const [editGoal, setEditGoal] = useState<RoadmapGoal | null>(null)
  const [form, setForm] = useState({ icon: '', name: '', goal: '', metrics: '' })

  const roadmapMap = new Map((state.roadmap || []).map(g => [g.sprintId, g]))

  // Auto-create roadmap goals for sprints that don't have one yet
  useEffect(() => {
    const map = new Map((state.roadmap || []).map(g => [g.sprintId, g]))
    state.sprints.forEach((sprint, idx) => {
      if (!map.has(sprint.id)) {
        dispatch({
          type: 'ADD_ROADMAP_GOAL',
          payload: {
            id: 'g' + sprint.id,
            sprintId: sprint.id,
            icon: '🚀',
            color: COLORS[idx % COLORS.length],
            name: sprint.label || `Sprint ${sprint.number}`,
            goal: sprint.goal || 'Sprint Goal a definir',
            metrics: [],
          },
        })
      }
    })
  }, [state.sprints.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Display in sprint order — every sprint gets a card
  const cards = state.sprints.map((sprint, idx) => {
    const goal = roadmapMap.get(sprint.id)
    return {
      sprint,
      goal: goal ?? {
        id: 'tmp-' + sprint.id,
        sprintId: sprint.id,
        icon: '🚀',
        color: COLORS[idx % COLORS.length],
        name: sprint.label || `Sprint ${sprint.number}`,
        goal: sprint.goal || '',
        metrics: [],
      } as RoadmapGoal,
    }
  })

  const totalAssigned = state.items.filter(i => i.sprintId).length

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
        color: COLORS[(state.roadmap || []).length % COLORS.length],
        name: `Sprint ${num}`,
        goal: 'Sprint Goal a definir',
        metrics: [],
      }
    })
  }

  return (
    <div className="page-content">
      <div className="roadmap-header-box">
        <div>
          <h2>Product Roadmap</h2>
          <p>{cards.length} sprint{cards.length !== 1 ? 's' : ''} planifies  {totalAssigned} items repartis</p>
        </div>
      </div>

      <div className="roadmap-grid">
        {cards.map(({ sprint, goal }) => {
          const items = state.items.filter(i => i.sprintId === sprint.id)
          const totalSP = items.reduce((acc, i) => acc + i.sp, 0)
          const capLabel = sprint.capacity > 0 ? ` / ${sprint.capacity} SP` : ''
          const dateLabel = sprintDateLabel(sprint.startDate, sprint.endDate)

          // Group items by client
          const byClient = new Map<string, typeof items>()
          items.forEach(item => {
            const list = byClient.get(item.clientId) ?? []
            byClient.set(item.clientId, [...list, item])
          })

          const isTmp = goal.id.startsWith('tmp-')

          return (
            <div key={sprint.id} className="roadmap-goal">
              <div className="roadmap-goal-header" style={{ background: goal.color }}>
                <div className="roadmap-goal-icon">{goal.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="roadmap-goal-sprint">Sprint {sprint.number}  {totalSP}{capLabel} SP</div>
                  <div className="roadmap-goal-title">{goal.name}</div>
                  {dateLabel && <div className="roadmap-goal-date">{dateLabel}</div>}
                </div>
                {!isTmp && (
                  <button
                    onClick={e => { e.stopPropagation(); openModal(goal) }}
                    style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, padding: '3px 8px', cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start' }}
                  >edit</button>
                )}
              </div>

              <div className="roadmap-section">
                <div className="roadmap-section-label">Sprint Goal</div>
                <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--text)', margin: 0 }}>
                  {goal.goal || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun objectif defini.</span>}
                </p>
              </div>

              {goal.metrics.length > 0 && (
                <div className="roadmap-section">
                  <div className="roadmap-section-label">Metriques de succes</div>
                  {goal.metrics.map((m, mi) => (
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
                        {client?.name ?? 'Client'}  <strong>{clientSP} SP</strong>
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
                  <div className="roadmap-section-label">Fonctionnalites cles</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Aucun item dans ce sprint.</p>
                </div>
              )}
            </div>
          )
        })}

        <div className="roadmap-add-btn-wrap">
          <button className="roadmap-add-btn" onClick={addSprint}>
            <span style={{ fontSize: 24 }}>+</span>
            <span>Nouveau sprint</span>
          </button>
        </div>
      </div>

      {editGoal && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setEditGoal(null) }}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">Modifier l objectif</span>
              <button className="modal-close" onClick={() => setEditGoal(null)}>X</button>
            </div>
            <div className="modal-body" style={{ padding: '16px 20px', gap: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: '0 0 70px' }}>
                  <label className="form-label">Icone</label>
                  <input className="form-input" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} style={{ textAlign: 'center' }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Nom du sprint theme</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Sprint Goal</label>
                <textarea className="form-input" rows={3} value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Metriques de succes{' '}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(une par ligne)</span>
                </label>
                <textarea className="form-input" rows={4} value={form.metrics} onChange={e => setForm(f => ({ ...f, metrics: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                Les fonctionnalites sont derivees automatiquement des items assignes au sprint correspondant.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditGoal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveGoal}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
