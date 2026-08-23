import { useState } from 'react'
import type { CadenceState } from '../../types'

interface Props { state: CadenceState }

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function isoToDate(s: string) { return new Date(s + 'T00:00:00') }
function startOfWeek(d: Date) { const day = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day) }

export function CalendarView({ state }: Props) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  // Grille du mois
  const firstDay = new Date(year, month, 1)
  const firstMon = startOfWeek(firstDay)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(new Date(firstMon.getFullYear(), firstMon.getMonth(), firstMon.getDate() + i))

  function sprintForDay(d: Date) {
    const ts = d.getTime()
    return state.sprints.filter(sp => {
      const start = isoToDate(sp.startDate).getTime()
      const end = isoToDate(sp.endDate).getTime()
      return ts >= start && ts <= end
    })
  }

  function isToday(d: Date) {
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <button className="btn-icon" onClick={prevMonth} aria-label="Mois précédent">◀</button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{MONTHS[month]} {year}</span>
        <button className="btn-icon" onClick={nextMonth} aria-label="Mois suivant">▶</button>
      </div>
      {/* Jours de la semaine */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        {DAYS.map(d => <div key={d} style={{ padding: '6px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{d}</div>)}
      </div>
      {/* Cellules */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month
          const sprints = sprintForDay(d)
          const isEnd = sprints.some(sp => isoToDate(sp.endDate).toDateString() === d.toDateString())
          const isStart = sprints.some(sp => isoToDate(sp.startDate).toDateString() === d.toDateString())
          const sp = sprints[0]

          return (
            <div key={i} style={{
              minHeight: 72,
              padding: '6px 8px',
              borderRight: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              background: sp ? sp.closed ? 'rgba(52,199,89,.05)' : 'rgba(79,70,229,.04)' : 'var(--surface)',
              opacity: inMonth ? 1 : 0.35,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: isToday(d) ? 700 : 400,
                background: isToday(d) ? 'var(--primary)' : 'transparent',
                color: isToday(d) ? '#fff' : 'var(--text)',
                marginBottom: 4,
              }}>
                {d.getDate()}
              </div>
              {isStart && sp && (
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-light)', borderRadius: 4, padding: '2px 5px', marginBottom: 2 }}>
                  ▶ Sprint {sp.number}
                </div>
              )}
              {isEnd && sp && (
                <div style={{ fontSize: 10, fontWeight: 600, color: sp.closed ? '#248a3d' : '#e88500', background: sp.closed ? '#34c75920' : '#ff950020', borderRadius: 4, padding: '2px 5px' }}>
                  ■ Fin Sprint {sp.number}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {/* Légende */}
      <div style={{ padding: '10px 20px', display: 'flex', gap: 16, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {state.sprints.map(sp => (
          <span key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: sp.closed ? '#34c759' : 'var(--primary)', display: 'inline-block' }} />
            Sprint {sp.number}{sp.closed ? ' ✓' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
