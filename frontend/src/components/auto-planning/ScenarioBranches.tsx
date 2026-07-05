import type { Scenario } from '../../types'

// ── Layout constants ──────────────────────────────────────────────────────
const LANE_H    = 52    // px between lane centres
const DOT_R     = 9     // outer circle radius
const DOT_INNER = 4     // inner circle radius
const SPRINT_W  = 72    // px per sprint column
const LABEL_W   = 130   // left label area
const PAD_TOP   = 40
const PAD_BOT   = 16
const PAD_RIGHT = 24
const STROKE    = 3

interface Props {
  scenarios: Scenario[]           // ordered list (index = lane)
  sprintCount: number             // total number of sprint columns to draw
  activeId: string                // currently selected scenario id
  compareId: string | null        // second scenario shown in compare mode
  onSelect: (id: string) => void
  onFork: (scenarioId: string, fromSprintIndex: number) => void
}

/** x-coordinate of sprint column i */
function sx(i: number) { return LABEL_W + i * SPRINT_W + SPRINT_W / 2 }

/** y-coordinate of lane l */
function ly(l: number) { return PAD_TOP + l * LANE_H }

/** Cubic Bézier path from (x1,y1) to (x2,y2).
 *  When x1 ≈ x2 (vertical fork/merge), bulges horizontally for a rounded elbow.
 *  Otherwise uses symmetric horizontal control points (S-curve). */
function bezier(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(x1 - x2) < 4) {
    // Vertical connection: elbow curving to the right
    const bulge = SPRINT_W * 0.5
    return `M ${x1} ${y1} C ${x1 + bulge} ${y1}, ${x2 + bulge} ${y2}, ${x2} ${y2}`
  }
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
}

export function ScenarioBranches({
  scenarios, sprintCount, activeId, compareId, onSelect, onFork
}: Props) {
  const totalW = LABEL_W + sprintCount * SPRINT_W + PAD_RIGHT
  const totalH = PAD_TOP + scenarios.length * LANE_H + PAD_BOT

  // Sprint header tick labels
  const ticks = Array.from({ length: sprintCount }, (_, i) => i)

  return (
    <div style={{ overflowX: 'auto', overflowY: 'visible', marginBottom: 0 }}>
      <svg
        width={totalW}
        height={totalH}
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ display: 'block', minWidth: totalW }}
      >
        {/* Sprint column tick marks at top */}
        {ticks.map(i => (
          <text key={`tick-${i}`}
            x={sx(i)} y={14}
            textAnchor="middle"
            fontSize={9}
            fill="var(--text-muted)"
            fontFamily="var(--font-sans)"
          >
            S{i + 1}
          </text>
        ))}

        {/* Vertical grid lines */}
        {ticks.map(i => (
          <line key={`grid-${i}`}
            x1={sx(i)} y1={22}
            x2={sx(i)} y2={totalH - PAD_BOT + 4}
            stroke="var(--border)"
            strokeWidth={0.5}
            strokeDasharray="3 4"
          />
        ))}

        {/* ── Per-scenario lanes ─────────────────────────────────── */}
        {scenarios.map((sc, laneIdx) => {
          const y = ly(laneIdx)
          const isActive  = sc.id === activeId
          const isCompare = sc.id === compareId
          const isCurrent = sc.type === 'current'

          // Which sprint columns this lane covers
          const startCol = sc.forkFrom?.fromSprintIndex ?? 0
          const endCol   = sc.generated && sc.slots.length > 0
            ? sc.slots.length - 1
            : sprintCount - 1

          // The main horizontal line
          const lineX1 = sx(startCol) + (startCol > 0 ? 0 : -SPRINT_W / 2 + 4)
          const lineX2 = sx(endCol)   + SPRINT_W / 2 - 8

          // Locked (inherited) portion — before fork point, drawn dashed in parent colour
          const lockedEndCol = startCol > 0 ? startCol - 1 : -1

          return (
            <g key={sc.id} onClick={() => onSelect(sc.id)} style={{ cursor: 'pointer' }}>

              {/* Label pill */}
              <foreignObject x={0} y={y - 11} width={LABEL_W - 8} height={22}>
                <div
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 8px', borderRadius: 10,
                    background: isActive ? sc.color : isCompare ? sc.color + '33' : 'transparent',
                    border: `1.5px solid ${isActive || isCompare ? sc.color : 'var(--border)'}`,
                    maxWidth: '100%', overflow: 'hidden',
                  }}>
                  <span style={{
                    fontSize: 10, fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#fff' : sc.color,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {sc.name}
                  </span>
                  {isCurrent && (
                    <span style={{ fontSize: 8, opacity: .7, color: isActive ? '#fff' : sc.color }}>DB</span>
                  )}
                </div>
              </foreignObject>

              {/* Locked (inherited) dashed section */}
              {lockedEndCol >= 0 && (
                <line
                  x1={sx(0) - SPRINT_W / 2 + 4} y1={y}
                  x2={sx(lockedEndCol) + SPRINT_W / 4} y2={y}
                  stroke={sc.color}
                  strokeWidth={STROKE}
                  strokeDasharray="5 4"
                  strokeOpacity={0.35}
                />
              )}

              {/* Main line */}
              <line
                x1={lineX1} y1={y}
                x2={lineX2} y2={y}
                stroke={sc.color}
                strokeWidth={isCurrent ? STROKE - 0.5 : STROKE}
                strokeDasharray={isCurrent ? '6 4' : undefined}
                strokeLinecap="round"
              />

              {/* Fork bezier curve from parent lane to this lane */}
              {sc.forkFrom && (() => {
                const parentIdx = scenarios.findIndex(s => s.id === sc.forkFrom!.sourceScenarioId)
                if (parentIdx < 0) return null
                const parentY    = ly(parentIdx)
                const forkEndX   = sx(sc.forkFrom.fromSprintIndex)
                // Start from the midpoint of the parent line (between previous dot and fork dot)
                const forkStartX = forkEndX - SPRINT_W / 2
                return (
                  <path
                    d={bezier(forkStartX, parentY, forkEndX, y)}
                    fill="none"
                    stroke={sc.color}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                  />
                )
              })()}

              {/* Sprint dots */}
              {ticks.map(i => {
                if (i < startCol) return null
                if (sc.generated && i >= sc.slots.length) return null
                const cx = sx(i)
                const inherited = lockedEndCol >= i  // before fork, inherited
                return (
                  <g key={`dot-${sc.id}-${i}`}>
                    {/* Outer ring */}
                    <circle cx={cx} cy={y} r={DOT_R}
                      fill="var(--surface-2, #fff)"
                      stroke={sc.color}
                      strokeWidth={inherited ? 1 : STROKE}
                      strokeOpacity={inherited ? 0.35 : 1}
                    />
                    {/* Inner fill */}
                    <circle cx={cx} cy={y} r={DOT_INNER}
                      fill={sc.color}
                      fillOpacity={inherited ? 0.2 : 1}
                    />
                    {/* Fork trigger: '+' label on hover via title */}
                    <title>Sprint {i + 1} — clic droit : forker ici</title>
                    {/* Invisible larger hit target */}
                    <circle cx={cx} cy={y} r={DOT_R + 6}
                      fill="transparent"
                      onContextMenu={e => { e.preventDefault(); onFork(sc.id, i) }}
                    />
                  </g>
                )
              })}


            </g>
          )
        })}
      </svg>
    </div>
  )
}
