import { useState, useMemo } from 'react'
import { useCadence } from '../context/StateContext'
import { Header } from '../components/layout/Header'
import { ClientModal } from '../components/clients/ClientModal'
import { fmtDateShort } from '../utils/dates'
import type { Client } from '../types'

type Tab = 'liste' | 'timeline'

const RAG_COLOR = { R: '#ff3b30', A: '#ff9500', G: '#34c759' }
const RAG_LABEL = { R: 'Critique', A: 'Attention', G: 'OK' }

function fmtCA(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K€`
  return `${n}€`
}

export function ClientsPage() {
  const { state, dispatch, saveToServer } = useCadence()
  const [tab, setTab] = useState<Tab>('liste')
  const [modal, setModal] = useState<Client | null | undefined>(undefined)

  function handleSave(client: Client) {
    const isNew = !state.clients.find(c => c.id === client.id)
    dispatch({ type: isNew ? 'ADD_CLIENT' : 'UPDATE_CLIENT', payload: client })
    saveToServer({ ...state, clients: isNew ? [...state.clients, client] : state.clients.map(c => c.id === client.id ? client : c) })
    setModal(undefined)
  }

  function handleDelete(id: string) {
    if (!confirm('Supprimer ce client ?')) return
    dispatch({ type: 'DELETE_CLIENT', payload: id })
    saveToServer({ ...state, clients: state.clients.filter(c => c.id !== id) })
  }

  // Stats par client
  const clientStats = useMemo(() => {
    return state.clients.map(client => {
      const items = state.items.filter(i => i.clientId === client.id)
      const done = items.filter(i => ['done','delivered'].includes(i.status))
      const totalSP = items.reduce((s, i) => s + i.sp, 0)
      const doneSP = done.reduce((s, i) => s + i.sp, 0)
      return { client, total: items.length, done: done.length, totalSP, doneSP, pct: items.length ? Math.round((done.length / items.length) * 100) : 0 }
    })
  }, [state.clients, state.items])

  return (
    <>
      <Header title="Clients">
        <div className="hdr-sep" />
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {(['liste', 'timeline'] as Tab[]).map(t => (
            <button key={t} className="hdr-ctx-btn" style={{ borderRadius: 0, borderLeft: t === 'timeline' ? '1px solid var(--border)' : undefined, background: tab === t ? 'var(--primary)' : undefined, color: tab === t ? '#fff' : undefined }} onClick={() => setTab(t)}>
              {t === 'liste' ? '📋 Liste' : '📅 Timeline'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="hdr-btn primary" onClick={() => setModal(null)}>+ Nouveau client</button>
      </Header>

      <div className="page-content">
        {tab === 'liste' ? (
          <table className="backlog-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Tier</th>
                <th>CA Annuel</th>
                <th>RAG</th>
                <th>Progression</th>
                <th>Contacts</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientStats.map(({ client, total, done, totalSP, doneSP, pct }) => (
                <tr key={client.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: client.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                        {client.prefix}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{client.name}</div>
                        {client.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{client.notes}</div>}
                      </div>
                    </div>
                  </td>
                  <td><span className="badge" style={{ background: 'var(--surface2)', color: 'var(--text-secondary)' }}>{client.tier}</span></td>
                  <td style={{ fontWeight: 600 }}>{fmtCA(client.annualRevenue)}</td>
                  <td>
                    <span className="badge" style={{ background: RAG_COLOR[client.rag] + '18', color: RAG_COLOR[client.rag] }}>
                      ● {RAG_LABEL[client.rag]}
                    </span>
                  </td>
                  <td style={{ minWidth: 160 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{done}/{total} US · {doneSP}/{totalSP} SP</span>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: client.color, borderRadius: 2, transition: 'width .3s' }} />
                    </div>
                  </td>
                  <td>
                    {(client.contacts ?? []).slice(0, 2).map(c => (
                      <div key={c.id} style={{ fontSize: 11, lineHeight: 1.6 }}>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}> — {c.role}</span>
                      </div>
                    ))}
                    {(client.contacts?.length ?? 0) > 2 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{(client.contacts?.length ?? 0) - 2} autres</div>}
                  </td>
                  <td>
                    <button className="btn-icon" onClick={() => setModal(client)} title="Modifier">✎</button>
                    <button className="btn-icon danger" onClick={() => handleDelete(client.id)} title="Supprimer">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <TimelineView state={state} />
        )}
      </div>

      {modal !== undefined && (
        <ClientModal client={modal} onSave={handleSave} onClose={() => setModal(undefined)} />
      )}
    </>
  )
}

function TimelineView({ state }: { state: ReturnType<typeof useCadence>['state'] }) {
  const sprintsWithItems = state.sprints.filter(sp => state.items.some(i => i.sprintId === sp.id))

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '10px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 180 }}>Client</th>
            {sprintsWithItems.map(sp => (
              <th key={sp.id} style={{ padding: '10px 12px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                Sprint {sp.number}
                <div style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                  {fmtDateShort(sp.startDate)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.clients.map(client => (
            <tr key={client.id}>
              <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: client.color }} />
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{client.name}</span>
                </div>
              </td>
              {sprintsWithItems.map(sp => {
                const items = state.items.filter(i => i.sprintId === sp.id && i.clientId === client.id)
                const done = items.filter(i => ['done','delivered'].includes(i.status)).length
                if (!items.length) return (
                  <td key={sp.id} style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '8px 12px', textAlign: 'center' }}>
                    <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
                  </td>
                )
                const pct = Math.round((done / items.length) * 100)
                return (
                  <td key={sp.id} style={{ borderLeft: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '8px 12px' }}>
                    <div style={{ background: client.color + '15', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: client.color }}>{items.length} US</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{done}/{items.length} done · {pct}%</div>
                      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: client.color, borderRadius: 2 }} />
                      </div>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
