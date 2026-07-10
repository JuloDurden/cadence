import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { Sprint, Item } from '../../types'

interface Props { sprint: Sprint; items: Item[] }

export function BurndownChart({ sprint, items }: Props) {
  const sprintItems = items.filter(i => i.sprintId === sprint.id)
  const totalSP = sprintItems.reduce((s, i) => s + i.sp, 0)
  const doneSP = sprintItems.filter(i => ['done', 'delivered'].includes(i.status)).reduce((s, i) => s + i.sp, 0)

  const start = new Date(sprint.startDate)
  const end = new Date(sprint.endDate)
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  const today = new Date()
  const daysPassed = Math.min(totalDays, Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000)))

  // Ligne idéale : de totalSP à 0 sur totalDays jours
  // Ligne réelle : on simule une progression jusqu'à aujourd'hui
  const data = Array.from({ length: totalDays }, (_, i) => {
    const ideal = Math.round(totalSP - (totalSP / (totalDays - 1)) * i)
    let actual: number | undefined
    if (i <= daysPassed) {
      // Simulation : prorata avec les items done actuels
      const progress = daysPassed > 0 ? doneSP * (i / daysPassed) : 0
      actual = Math.round(Math.max(0, totalSP - progress))
    }
    return { day: `J${i + 1}`, ideal, actual }
  })

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '18px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🔥 Burndown — Sprint {sprint.number}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
        {doneSP}/{totalSP} SP terminés · {totalSP - doneSP} SP restants
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={1} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={((v: unknown, n: string) => [v + ' SP', n === 'ideal' ? 'Idéal' : 'Réel']) as never} />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="ideal" stroke="var(--border)" strokeDasharray="4 4" dot={false} name="ideal" strokeWidth={2} />
          <Line type="monotone" dataKey="actual" stroke="var(--primary)" dot={false} name="actual" strokeWidth={2} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
