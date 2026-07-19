import type { Client, Item, KanbanCol } from '../../types'
import { isItemDone } from '../../utils/status'

const RAG_LABEL = { R: 'Critique', A: 'Attention', G: 'OK' }
const RAG_COLOR = { R: '#ff3b30', A: '#ff9500', G: '#34c759' }

interface Props { clients: Client[]; items: Item[]; kanbanCols: KanbanCol[] }

export function ClientRAG({ clients, items, kanbanCols }: Props) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '18px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>🚦 RAG Clients</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {clients.map(client => {
          const clientItems = items.filter(i => i.clientId === client.id)
          const done = clientItems.filter(i => isItemDone(i, kanbanCols)).length
          const total = clientItems.length
          const pct = total > 0 ? Math.round((done / total) * 100) : 0
          const color = RAG_COLOR[client.rag]
          return (
            <div key={client.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{client.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{done}/{total} US · {pct}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
                </div>
                <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 2 }}>{RAG_LABEL[client.rag]}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
