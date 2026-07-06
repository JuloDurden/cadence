import type { Scenario } from '../../types'

// ── Layout constants ───────────────────────────────────────────────────────
const MINI_W  = 56    // px per sprint column
const PAD_L   = 8     // horizontal padding
const DOT_R   = 6     // outer dot radius
const DOT_IN  = 3     // inner dot radius
const TICK_Y  = 11    // y of sprint tick labels
const GHOST_Y = 23    // y of parent ghost line (fork scenarios only)
const LINE_Y  = 37    // y of the scenario's own line
const TOTAL_H = 48    // total SVG height

/** x-centre of sprint column i */
function cx(i: number) { return PAD_L + i * MINI_W + MINI_W / 2 }

/** Cubic Bézier from (x1,y1) to (x2,y2) — adds horizontal bulge on near-vertical paths */
function bezier(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(x1 - x2) < 4) {
    const b = MINI_W * 0.5
    return `M ${x1} ${y1} C ${x1 + b} ${y1}, ${x2 + b} ${y2}, ${x2} ${y2}`
  }
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

interface Props {
  scenario: Scenario
  allScenarios: Scenario[]
  sprintCount: number
  /** Right-click on a dot triggers a fork at that sprint index */
  onFork?: (scenarioId: string, fromSprintIndex: number) => void
}

export function ScenarioMiniGraph({ scenario: sc, allScenarios, sprintCount, onFork }: Props) {
  const width    = PAD_L + sprintCount * MINI_W + PAD_L
  const ticks    = Array.from({ length: sprintCount }, (_, i) => i)

  const startCol  = sc.forkFrom?.fromSprintIndex ?? 0
  const endCol    = sc.generated && sc.slots.length > 0 ? sc.slots.length - 1 : sprintCount - 1
  const lockedEnd = startCol > 0 ? startCol - 1 : -1

  const lineX1    = cx(startCol) - (startCol > 0 ? 0 : MINI_W / 2 - 4)
  const lineX2    = cx(endCol) + MINI_W / 2 - 6

  const parentSc  = sc.forkFrom
    ? (allScenarios.find(s => s.id === sc.forkFrom!.sourceScenarioId) ?? null)
    : null
  const forkIdx   = sc.forkFrom?.fromSprintIndex ?? 0

  return (
    <svg
      width={width}
      height={TOTAL_H}
      viewBox={`0 0 ${width} ${TOTAL_H}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* ── Sprint tick labels ──────────────────────────────── */}
      {ticks.map(i => (
        <text key={`t${i}`}
          x={cx(i)} y={TICK_Y}
          textAnchor="middle" fontSize={8}
          fill="var(--text-muted)" fontFamily="var(--font-sans)">
          S{i + 1}
        </text>
      ))}

      {/* ── Fork: ghost parent line + curve ────────────────── */}
      {parentSc && forkIdx >= 1 && (
        <>
          {/* Ghost parent line */}
          <line
            x1={cx(0) - MINI_W / 2 + 4} y1={GHOST_Y}
            x2={cx(forkIdx) + MINI_W / 4}  y2={GHOST_Y}
            stroke={parentSc.color} strokeWidth={1.5}
            strokeOpacity={0.4}
            strokeDasharray={parentSc.type === 'current' ? '5 3' : undefined}
          />
          {/* Ghost parent dots */}
          {Array.from({ length: forkIdx + 1 }, (_, i) => (
            <g key={`gd${i}`}>
              <circle cx={cx(i)} cy={GHOST_Y} r={4}
                fill="var(--surface)"
                stroke={parentSc.color} strokeWidth={1.5} strokeOpacity={0.35} />
              <circle cx={cx(i)} cy={GHOST_Y} r={2}
                fill={parentSc.color} fillOpacity={0.2} />
            </g>
          ))}
          {/* Fork Bézier: mid-segment of parent → fork dot on child line */}
          <path
            d={bezier(cx(forkIdx) - MINI_W / 2, GHOST_Y, cx(forkIdx), LINE_Y)}
            fill="none" stroke={sc.color}
            strokeWidth={1.5} strokeLinecap="round"
          />
        </>
      )}

      {/* ── Locked (inherited) dashed section ──────────────── */}
      {lockedEnd >= 0 && (
        <line
          x1={cx(0) - MINI_W / 2 + 4} y1={LINE_Y}
          x2={cx(lockedEnd) + MINI_W / 4}  y2={LINE_Y}
          stroke={sc.color} strokeWidth={2}
          strokeDasharray="5 4" strokeOpacity={0.35}
        />
      )}

      {/* ── Main line ───────────────────────────────────────── */}
      <line
        x1={lineX1} y1={LINE_Y}
        x2={lineX2} y2={LINE_Y}
        stroke={sc.color}
        strokeWidth={sc.type === 'current' ? 1.5 : 2}
        strokeDasharray={sc.type === 'current' ? '6 4' : undefined}
        strokeLinecap="round"
      />

      {/* ── Sprint dots ─────────────────────────────────────── */}
      {ticks.map(i => {
        if (i < startCol) return null
        if (sc.generated && i >= sc.slots.length) return null
        const inherited = lockedEnd >= i
        return (
          <g key={`d${i}`}>
            <circle cx={cx(i)} cy={LINE_Y} r={DOT_R}
              fill="var(--surface)"
              stroke={sc.color}
              strokeWidth={inherited ? 1 : 2}
              strokeOpacity={inherited ? 0.35 : 1}
            />
            <circle cx={cx(i)} cy={LINE_Y} r={DOT_IN}
              fill={sc.color}
              fillOpacity={inherited ? 0.2 : 1}
            />
            {/* Invisible hit target for right-click fork */}
            {onFork && !inherited && (
              <circle cx={cx(i)} cy={LINE_Y} r={DOT_R + 6}
                fill="transparent"
                style={{ cursor: 'context-menu' }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onFork(sc.id, i) }}>
                <title>Sprint {i + 1} — clic droit : forker ici</title>
              </circle>
            )}
          </g>
        )
      })}
    </svg>
  )
}
