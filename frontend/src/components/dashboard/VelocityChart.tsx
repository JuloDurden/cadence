import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { Sprint, Item, KanbanCol } from '../../types'
import { isItemDone } from '../../utils/status'

interface Props { sprints: Sprint[]; items: Item[]; kanbanCols: KanbanCol[] }

export function VelocityChart({ sprints, items, kanbanCols }: Props) {
  const data = sprints.map(sp => {
    const spItems = items.filter(i => i.sprintId === sp.id)
    const done = spItems.filter(i => isItemDone(i, kanbanCols)).reduce((s, i) => s + i.sp, 0)
    const planned = spItems.reduce((s, i) => s + i.sp, 0)
    const velocity = sp.closed ? (sp.velocitySnapshot ?? done) : done
    return { name: `S${sp.number}`, velocity, planned, closed: sp.closed }
  })

  const avg = data.filter(d => d.closed && d.velocity > 0).reduce((s, d, _, a) => s + d.velocity / a.length, 0)

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '18px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>📈 Vélocité par sprint</div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={((v: unknown, n: string): [string, string] => [String(v) + ' SP', n === 'velocity' ? 'Vélocité' : 'Planifié']) as never} />
          {avg > 0 && <ReferenceLine y={avg} stroke="#ff9500" strokeDasharray="4 4" label={{ value: `Moy. ${Math.round(avg)}`, fontSize: 10, fill: '#ff9500', position: 'right' }} />}
          <Bar dataKey="planned" fill="var(--border)" radius={[3, 3, 0, 0]} name="planned" />
          <Bar dataKey="velocity" fill="var(--primary)" radius={[3, 3, 0, 0]} name="velocity" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
