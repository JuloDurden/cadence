import { useTimer } from '../../context/TimerContext'

const DURATIONS = [5, 10, 15, 20, 30]

export function DailyTimer() {
  const { duration, seconds, running, done, setDuration, toggle, reset } = useTimer()

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const pct = (seconds / (duration * 60)) * 100
  const color = done ? 'var(--danger)' : seconds < 60 ? '#ff9500' : 'var(--primary)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select className="hdr-select" value={duration} onChange={e => setDuration(Number(e.target.value))} disabled={running}>
        {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
      </select>
      <div style={{ position: 'relative', width: 32, height: 32 }}>
        <svg width="32" height="32" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="16" cy="16" r="13" fill="none" stroke="var(--border)" strokeWidth="3" />
          <circle cx="16" cy="16" r="13" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 13}`}
            strokeDashoffset={`${2 * Math.PI * 13 * (1 - pct / 100)}`}
            style={{ transition: 'stroke-dashoffset .5s, stroke .3s' }}
          />
        </svg>
      </div>
      <span style={{ fontWeight: 700, fontSize: 14, color, minWidth: 42, fontVariantNumeric: 'tabular-nums' }}>
        {mm}:{ss}
      </span>
      <button className="hdr-btn" onClick={toggle} style={done ? { background: 'var(--danger)', color: '#fff' } : {}}>
        {done ? '↺ Reset' : running ? '⏸' : '▶'}
      </button>
      {running && <button className="hdr-btn" onClick={reset}>↺</button>}
    </div>
  )
}
