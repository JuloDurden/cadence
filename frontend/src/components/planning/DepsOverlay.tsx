import { useEffect, useRef, useState } from 'react'
import type { Item } from '../../types'

interface Arrow {
  fromX: number; fromY: number
  toX:   number; toY:   number
  key:   string
  late:  boolean  // true si le bloquant est dans un sprint ultérieur = dépendance inversée
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
  items: Item[]
}

export function DepsOverlay({ containerRef, items }: Props) {
  const [arrows, setArrows] = useState<Arrow[]>([])
  const frameRef = useRef<number | null>(null)

  function compute() {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const scrollLeft = container.scrollLeft
    const scrollTop  = container.scrollTop

    const newArrows: Arrow[] = []

    for (const item of items) {
      if (!item.deps?.length || !item.sprintId) continue
      const toEl = container.querySelector(`[data-item-id="${item.id}"]`) as HTMLElement | null
      if (!toEl) continue
      const toR = toEl.getBoundingClientRect()
      const toX = toR.left - rect.left + scrollLeft
      const toY = toR.top  - rect.top  + scrollTop + toR.height / 2

      for (const depId of item.deps) {
        const depItem = items.find(i => i.id === depId)
        if (!depItem || !depItem.sprintId) continue
        // Seules les dépendances cross-sprint sont tracées
        if (depItem.sprintId === item.sprintId) continue

        const fromEl = container.querySelector(`[data-item-id="${depId}"]`) as HTMLElement | null
        if (!fromEl) continue
        const fromR = fromEl.getBoundingClientRect()
        const fromX = fromR.left - rect.left + scrollLeft + fromR.width
        const fromY = fromR.top  - rect.top  + scrollTop  + fromR.height / 2

        // "late" = le bloquant est dans un sprint ultérieur (ordre inversé)
        const fromSprint = depItem.sprintId
        const toSprint   = item.sprintId
        const sprintNums = {} as Record<string, number>
        // On ne connaît pas les numeros ici, mais on peut comparer les IDs par position dans DOM
        const late = fromX > toX  // visuellement à droite = ordre inversé

        newArrows.push({
          fromX, fromY, toX, toY,
          key: `${depId}->${item.id}`,
          late,
        })
      }
    }

    setArrows(newArrows)
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scheduleCompute = () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(compute)
    }

    scheduleCompute()
    container.addEventListener('scroll', scheduleCompute)
    window.addEventListener('resize', scheduleCompute)

    const observer = new MutationObserver(scheduleCompute)
    observer.observe(container, { childList: true, subtree: true, attributes: true })

    return () => {
      container.removeEventListener('scroll', scheduleCompute)
      window.removeEventListener('resize', scheduleCompute)
      observer.disconnect()
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [items, containerRef])

  if (arrows.length === 0) return null

  // Calculer les dimensions du SVG
  const maxX = Math.max(...arrows.flatMap(a => [a.fromX, a.toX])) + 80
  const maxY = Math.max(...arrows.flatMap(a => [a.fromY, a.toY])) + 40

  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, width: maxX, height: maxY, pointerEvents: 'none', zIndex: 10 }}
      aria-hidden="true"
    >
      <defs>
        {/*
          markerUnits="userSpaceOnUse" → dimensions en px, indépendantes de strokeWidth.
          polygon : base à x=0, pointe à x=10.
          refX="0" → la BASE (x=0) du marker se pose sur l'extrémité du corps de la flèche.
          Le corps s'arrête à toX-10 → la pointe tombe exactement sur le bord de la carte (toX).
        */}
        <marker id="deps-arrow-ok"   markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="8" refX="0" refY="4" orient="auto">
          <polygon points="0 0, 10 4, 0 8" fill="#6366f1" />
        </marker>
        <marker id="deps-arrow-late" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="8" refX="0" refY="4" orient="auto">
          <polygon points="0 0, 10 4, 0 8" fill="#dc2626" />
        </marker>
      </defs>

      {arrows.map(a => {
        const color    = a.late ? '#dc2626' : '#6366f1'
        const markerId = a.late ? 'deps-arrow-late' : 'deps-arrow-ok'
        // Corps s'arrête à toX-10 (base de la tête) ; la pointe du marker tombe sur toX
        const toXAdj = a.toX - 10
        const dx = Math.abs(toXAdj - a.fromX) * 0.5
        const d = `M ${a.fromX} ${a.fromY} C ${a.fromX + dx} ${a.fromY}, ${toXAdj - dx} ${a.toY}, ${toXAdj} ${a.toY}`

        return (
          <path
            key={a.key}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeDasharray={a.late ? '5 3' : undefined}
            opacity="0.75"
            markerEnd={`url(#${markerId})`}
          />
        )
      })}
    </svg>
  )
}
