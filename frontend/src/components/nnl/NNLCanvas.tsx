import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useCadence } from '../../context/StateContext'
import { useToast } from '../../context/ToastContext'
import type { NNLItem, NNLZone, NNLItemType, NNLTool, NNLShape, NNLText, NNLStroke, NNLLayer, CadenceState, Item } from '../../types'
import { NNLItemModal } from './NNLItemModal'
import { ItemModal } from '../backlog/ItemModal'
import { NNLToolbar } from './NNLToolbar'
import { NNLLayersPanel } from './NNLLayersPanel'
import polygonClipping from 'polygon-clipping'

// ── Constantes ──────────────────────────────────────────────────────────────
const R1_DEFAULT = 400
const R2_DEFAULT = 800
const ZOOM_MIN   = 0.15
const ZOOM_MAX   = 4.0
const MM_W = 160, MM_H = 100

const TYPE_COLORS: Record<NNLItemType, string> = {
  feature: '#fbbf24',
  release: '#3b82f6',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 9) }

function zoneFromWorld(wx: number, wy: number, r1: number, r2: number): NNLZone {
  const d = Math.sqrt(wx * wx + wy * wy)
  return d < r1 ? 'now' : d < r2 ? 'next' : 'later'
}

function newPosForZone(zone: NNLZone, r1: number, r2: number) {
  const a = (20 + Math.random() * 50) * (Math.PI / 180)
  const d = zone === 'now'  ? r1 * (0.3 + Math.random() * 0.4)
          : zone === 'next' ? (r1 + r2) / 2 * (0.8 + Math.random() * 0.4)
          : r2 * (1.1 + Math.random() * 0.3)
  return { x: +(Math.cos(a) * d).toFixed(0), y: +(Math.sin(a) * d).toFixed(0) }
}

// Monde → Écran (Y monde ↑, Y écran ↓)
function w2s(wx: number, wy: number, ox: number, oy: number, zoom: number) {
  return { x: ox + wx * zoom, y: oy - wy * zoom }
}
function s2w(sx: number, sy: number, ox: number, oy: number, zoom: number) {
  return { x: (sx - ox) / zoom, y: (oy - sy) / zoom }
}

// Luminance relative pour choix texte clair/foncé
function luminance(hex: string): number {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return 0.5
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Spline Catmull-Rom → chemin SVG (coords écran)
function catmullRomPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

// Curseur selon l'outil actif
function toolCursor(tool: NNLTool, panning: boolean): string {
  if (panning) return 'grabbing'
  switch (tool) {
    case 'select': return 'default'
    case 'text':   return 'text'
    case 'eraser': return 'cell'
    default:       return 'crosshair'
  }
}

// Keyboard shortcuts → tool
const KEY_TO_TOOL: Record<string, NNLTool> = {
  v: 'select', r: 'rect', e: 'ellipse', a: 'arrow',
  t: 'text', p: 'pen', m: 'marker', g: 'eraser',
}

// ── Mini SVG helper ──────────────────────────────────────────────────────────
const Svg = ({ d, size = 12 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
)
const ICO_IMG   = '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'
const ICO_LINK  = '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'
const ICO_NOTE  = '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>'
const ICO_ITEM  = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'
const ICO_EDIT  = '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'

// ── BackgroundCircles ─────────────────────────────────────────────────────────
interface CirclesProps {
  ox: number; oy: number; zoom: number; W: number; H: number
  r1: number; r2: number
  onResizeR1: (v: number) => void; onResizeR2: (v: number) => void
  onResizeDone: () => void
}
function BackgroundCircles({ ox, oy, zoom, W, H, r1, r2, onResizeR1, onResizeR2, onResizeDone }: CirclesProps) {
  const svgRef      = useRef<SVGSVGElement>(null)
  const resizingRef = useRef<'r1' | 'r2' | null>(null)
  const [hovered, setHovered] = useState<'r1' | 'r2' | null>(null)
  const oxRef   = useRef(ox);   oxRef.current   = ox
  const oyRef   = useRef(oy);   oyRef.current   = oy
  const zoomRef = useRef(zoom); zoomRef.current = zoom
  const r1Ref   = useRef(r1);   r1Ref.current   = r1
  const r2Ref   = useRef(r2);   r2Ref.current   = r2
  const doneRef = useRef(onResizeDone); doneRef.current = onResizeDone

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizingRef.current || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const d = Math.sqrt((e.clientX - rect.left - oxRef.current) ** 2 + (e.clientY - rect.top - oyRef.current) ** 2) / zoomRef.current
      if (resizingRef.current === 'r1') onResizeR1(Math.max(60, Math.min(r2Ref.current - 80, d)))
      else                               onResizeR2(Math.max(r1Ref.current + 80, d))
    }
    function onUp() { if (!resizingRef.current) return; resizingRef.current = null; doneRef.current() }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [onResizeR1, onResizeR2])

  const HIT = 16
  return (
    <svg ref={svgRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} width={W} height={H} aria-hidden="true">
      <circle cx={ox} cy={oy} r={r1*zoom} fill="none" stroke={hovered==='r1' ? 'var(--primary)' : 'var(--nnl-arc)'} strokeWidth={hovered==='r1' ? 3 : 2} style={{ pointerEvents: 'none' }}/>
      <circle cx={ox} cy={oy} r={r2*zoom} fill="none" stroke={hovered==='r2' ? 'var(--primary)' : 'var(--nnl-arc)'} strokeWidth={hovered==='r2' ? 3 : 2} style={{ pointerEvents: 'none' }}/>
      <circle cx={ox} cy={oy} r={r1*zoom} fill="none" stroke="transparent" strokeWidth={HIT} style={{ cursor: 'ew-resize' }}
        onMouseEnter={() => setHovered('r1')} onMouseLeave={() => setHovered(null)}
        onMouseDown={e => { e.stopPropagation(); resizingRef.current = 'r1' }}/>
      <circle cx={ox} cy={oy} r={r2*zoom} fill="none" stroke="transparent" strokeWidth={HIT} style={{ cursor: 'ew-resize' }}
        onMouseEnter={() => setHovered('r2')} onMouseLeave={() => setHovered(null)}
        onMouseDown={e => { e.stopPropagation(); resizingRef.current = 'r2' }}/>
    </svg>
  )
}

// ── ZoneLabels ────────────────────────────────────────────────────────────────
function ZoneLabels({ ox, oy, zoom, W, H, r1, r2 }: { ox: number; oy: number; zoom: number; W: number; H: number; r1: number; r2: number }) {
  const wy = 50
  const labels = [
    { label: 'Now',   wx: r1 * 0.35        },
    { label: 'Next',  wx: (r1+r2) * 0.43   },
    { label: 'Later', wx: r2 * 1.10         },
  ]
  const fs = Math.max(10, 26 * zoom)
  return (
    <>
      {labels.map(({ label, wx }) => {
        const p = w2s(wx, wy, ox, oy, zoom)
        if (p.x < -200 || p.x > W+200 || p.y < -60 || p.y > H+60) return null
        return (
          <div key={label} style={{
            position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)',
            fontSize: fs, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase',
            color: 'var(--text-muted)', opacity: .28, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>{label}</div>
        )
      })}
    </>
  )
}

// ── Shape SVG renderer ────────────────────────────────────────────────────────
// BUG FIX 1+2: SVG est toujours pointerEvents:'none' (les arcs peuvent recevoir les clics
// en select mode), et les formes n'ont plus de onClick (la sélection est gérée
// entièrement par le hit-test dans onCanvasMouseDown). Les poignées bezier gardent
// pointerEvents:'auto' pour rester interactives.
function ShapeLayer({ shapes, strokes, previewShape, previewStroke, ox, oy, zoom, W, H, selectedShapeIds, selectedStrokeIds, selectedPtIdx, onPtMouseDown, onAddPt, onRotateStart, onResizeStart, onStrokeResizeStart, onStrokeRotateStart }: {
  shapes: NNLShape[]; strokes: NNLStroke[]
  previewShape?: NNLShape | null; previewStroke?: NNLStroke | null
  ox: number; oy: number; zoom: number; W: number; H: number
  selectedShapeIds?: string[]
  selectedStrokeIds?: string[]
  selectedPtIdx?: number | null
  onPtMouseDown?: (shapeId: string, ptIdx: number, e: React.MouseEvent) => void
  onAddPt?: (shapeId: string, insertIdx: number, wx: number, wy: number) => void
  onRotateStart?: (shapeId: string, wCx: number, wCy: number, e: React.MouseEvent) => void
  onResizeStart?: (shapeId: string, handle: 'nw'|'ne'|'sw'|'se'|'start'|'end', e: React.MouseEvent) => void
  onStrokeResizeStart?: (handle: 'nw'|'ne'|'sw'|'se', wBBox: {minX:number;minY:number;maxX:number;maxY:number}, e: React.MouseEvent) => void
  onStrokeRotateStart?: (wCx: number, wCy: number, e: React.MouseEvent) => void
}) {
  // Un seul element sélectionné = le dernier de la liste (pour les handles bezier + rotation)
  const primarySelectedId = selectedShapeIds && selectedShapeIds.length > 0
    ? selectedShapeIds[selectedShapeIds.length - 1] : null

  function renderShape(s: NNLShape, key: string) {
    const p1 = w2s(s.x,  s.y,  ox, oy, zoom)
    const p2 = w2s(s.x2, s.y2, ox, oy, zoom)
    const rx = Math.min(p1.x, p2.x), ry = Math.min(p1.y, p2.y)
    const rw = Math.abs(p2.x - p1.x), rh = Math.abs(p2.y - p1.y)
    const stroke  = s.stroke ?? '#1e293b'
    const fill    = s.fill   ?? 'none'
    const fillOp  = s.fillOpacity   ?? 1
    const strokeOp = s.strokeOpacity ?? 1
    const sw      = (s.strokeWidth ?? 2) * Math.sqrt(zoom)
    const rot     = s.rotation ?? 0
    const isSelected = (selectedShapeIds ?? []).includes(s.id)
    // Centre en coords écran (pour la rotation SVG et le handle)
    const sCx = (p1.x + p2.x) / 2
    const sCy = (p1.y + p2.y) / 2
    // Centre monde (pour passer au handler rotation)
    const wCx = (s.x + s.x2) / 2
    const wCy = (s.y + s.y2) / 2

    // Handle de rotation (affiché uniquement pour la forme primaire sélectionnée)
    const rotHandle = isSelected && primarySelectedId === s.id ? (
      <>
        <line x1={sCx} y1={ry - 20} x2={sCx} y2={ry}
          stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="3 2" style={{ pointerEvents: 'none' }} />
        <circle cx={sCx} cy={ry - 20} r={6}
          fill="white" stroke="var(--primary)" strokeWidth={2}
          style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
          onMouseDown={e => { e.stopPropagation(); onRotateStart?.(s.id, wCx, wCy, e) }}
          onClick={e => e.stopPropagation()} />
      </>
    ) : null

    const transform = rot !== 0 ? `rotate(${rot}, ${sCx}, ${sCy})` : undefined

    // Poignées de redimensionnement (coins) pour rect/ellipse — primaire sélectionnée uniquement
    const cornerHandles = (isSelected && primarySelectedId === s.id && (s.shapeType === 'rect' || s.shapeType === 'ellipse')) ? (
      <>
        {([
          ['nw', rx,    ry   ] as const,
          ['ne', rx+rw, ry   ] as const,
          ['sw', rx,    ry+rh] as const,
          ['se', rx+rw, ry+rh] as const,
        ]).map(([h, cx, cy]) => (
          <rect key={`handle-${h}`}
            x={cx-5} y={cy-5} width={10} height={10} rx={2}
            fill="white" stroke="var(--primary)" strokeWidth={1.5}
            style={{ cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize', pointerEvents: 'auto' }}
            onMouseDown={e => { e.stopPropagation(); onResizeStart?.(s.id, h, e) }}
            onClick={e => e.stopPropagation()} />
        ))}
      </>
    ) : null

    if (s.shapeType === 'rect') {
      const rx_ = (s.rx ?? 0) * Math.sqrt(zoom)
      return (
        <g key={key} data-shape-id={s.id} transform={transform} opacity={s.opacity ?? 1}>
          <rect x={rx} y={ry} width={rw} height={rh}
            fill={fill === 'none' ? 'none' : fill} fillOpacity={fill === 'none' ? 0 : fillOp}
            stroke={stroke === 'none' ? 'none' : stroke} strokeWidth={stroke === 'none' ? 0 : sw}
            strokeOpacity={strokeOp}
            rx={rx_} />
          {isSelected && (
            <rect x={rx-3} y={ry-3} width={rw+6} height={rh+6}
              fill="none" stroke="var(--primary)" strokeWidth={2}
              strokeDasharray="5 3" rx={rx_+2} style={{ pointerEvents: 'none' }} />
          )}
          {rotHandle}
          {cornerHandles}
        </g>
      )
    }
    if (s.shapeType === 'ellipse') {
      return (
        <g key={key} data-shape-id={s.id} transform={transform} opacity={s.opacity ?? 1}>
          <ellipse cx={sCx} cy={sCy} rx={rw/2} ry={rh/2}
            fill={fill === 'none' ? 'none' : fill} fillOpacity={fill === 'none' ? 0 : fillOp}
            stroke={stroke === 'none' ? 'none' : stroke} strokeWidth={stroke === 'none' ? 0 : sw}
            strokeOpacity={strokeOp} />
          {isSelected && (
            <ellipse cx={sCx} cy={sCy} rx={rw/2+3} ry={rh/2+3}
              fill="none" stroke="var(--primary)" strokeWidth={2}
              strokeDasharray="5 3" style={{ pointerEvents: 'none' }} />
          )}
          {rotHandle}
          {cornerHandles}
        </g>
      )
    }
    if (s.shapeType === 'arrow') {
      const allWorldPts = [{ x: s.x, y: s.y }, ...(s.pts ?? []), { x: s.x2, y: s.y2 }]
      const allPts = allWorldPts.map(pt => w2s(pt.x, pt.y, ox, oy, zoom))
      if (allPts.length < 2) return null
      const last = allPts[allPts.length - 1]
      const prev = allPts[allPts.length - 2]
      const adx = last.x - prev.x, ady = last.y - prev.y
      const alen = Math.sqrt(adx*adx + ady*ady)
      if (alen < 0.5) return null
      const ux = adx/alen, uy = ady/alen
      const as = Math.max(8, sw * 4)
      const ax1 = last.x - as*ux + as*0.4*uy, ay1 = last.y - as*uy - as*0.4*ux
      const ax2 = last.x - as*ux - as*0.4*uy, ay2 = last.y - as*uy + as*0.4*ux
      const arrowStroke = stroke === 'none' ? 'none' : stroke
      const pathD = catmullRomPath(allPts)
      // Pour la flèche, le centre du bounding box de tous les points
      const allXs = allPts.map(p => p.x), allYs = allPts.map(p => p.y)
      const arCx = (Math.min(...allXs) + Math.max(...allXs)) / 2
      const arCy = (Math.min(...allYs) + Math.max(...allYs)) / 2
      const arTop = Math.min(...allYs)
      const arrowTransform = rot !== 0 ? `rotate(${rot}, ${arCx}, ${arCy})` : undefined
      return (
        <g key={key} data-shape-id={s.id} transform={arrowTransform} opacity={s.opacity ?? 1}>
          <path d={pathD} fill="none" stroke={arrowStroke} strokeWidth={sw}
            strokeLinecap="round" strokeLinejoin="round" strokeOpacity={strokeOp} />
          <polyline points={`${ax1},${ay1} ${last.x},${last.y} ${ax2},${ay2}`}
            fill="none" stroke={arrowStroke} strokeWidth={sw} strokeLinejoin="round" strokeOpacity={strokeOp} />
          {isSelected && (
            <path d={pathD} fill="none" stroke="var(--primary)" strokeWidth={sw+4}
              opacity={0.3} style={{ pointerEvents: 'none' }} />
          )}
          {/* Poignées bezier */}
          {isSelected && primarySelectedId === s.id && (
            <>
              {/* Endpoint handles — resize (start/end) */}
              <circle cx={allPts[0].x} cy={allPts[0].y} r={7}
                fill="white" stroke="var(--primary)" strokeWidth={2}
                style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
                onMouseDown={e => { e.stopPropagation(); onResizeStart?.(s.id, 'start', e) }}
                onClick={e => e.stopPropagation()} />
              <circle cx={last.x} cy={last.y} r={7}
                fill="var(--primary)" stroke="var(--primary)" strokeWidth={2}
                style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
                onMouseDown={e => { e.stopPropagation(); onResizeStart?.(s.id, 'end', e) }}
                onClick={e => e.stopPropagation()} />
              {/* Bezier mid-point handles */}
              {(s.pts ?? []).map((pt, i) => {
                const sp = w2s(pt.x, pt.y, ox, oy, zoom)
                const active = selectedPtIdx === i
                return (
                  <circle key={`pt-${i}`} cx={sp.x} cy={sp.y}
                    r={active ? 7 : 5}
                    fill={active ? 'var(--primary)' : 'white'}
                    stroke="var(--primary)" strokeWidth={active ? 2 : 1.5}
                    style={{ cursor: 'grab', pointerEvents: 'auto' }}
                    onMouseDown={e => { e.stopPropagation(); onPtMouseDown?.(s.id, i, e) }}
                    onClick={e => e.stopPropagation()} />
                )
              })}
              {allPts.slice(0, -1).map((sp, i) => {
                const np = allPts[i + 1]
                const mx = (sp.x + np.x) / 2, my = (sp.y + np.y) / 2
                const mw = s2w(mx, my, ox, oy, zoom)
                return (
                  <circle key={`m-${i}`} cx={mx} cy={my} r={4}
                    fill="white" stroke="var(--primary)" strokeWidth={1.5} opacity={0.7}
                    style={{ cursor: 'copy', pointerEvents: 'auto' }}
                    onMouseDown={e => { e.stopPropagation(); onAddPt?.(s.id, i, mw.x, mw.y) }}
                    onClick={e => e.stopPropagation()} />
                )
              })}
              {/* Handle rotation pour flèche */}
              <>
                <line x1={arCx} y1={arTop - 20} x2={arCx} y2={arTop}
                  stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="3 2" style={{ pointerEvents: 'none' }} />
                <circle cx={arCx} cy={arTop - 20} r={6}
                  fill="white" stroke="var(--primary)" strokeWidth={2}
                  style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
                  onMouseDown={e => { e.stopPropagation(); onRotateStart?.(s.id, wCx, wCy, e) }}
                  onClick={e => e.stopPropagation()} />
              </>
            </>
          )}
        </g>
      )
    }
    // ── Polygone (résultat opération booléenne) ──────────────────────────────
    if (s.shapeType === 'polygon' && s.polyPts && s.polyPts.length > 2) {
      const spts = s.polyPts.map(p => w2s(p.x, p.y, ox, oy, zoom))
      const d = `M ${spts.map(p => `${p.x},${p.y}`).join(' L ')} Z`
      return (
        <g key={key} data-shape-id={s.id} transform={transform} opacity={s.opacity ?? 1}>
          {isSelected && <path d={d} fill="none" stroke="var(--primary)"
            strokeWidth={sw + 4} strokeOpacity={0.25} style={{ pointerEvents: 'none' }} />}
          <path d={d}
            fill={fill === 'none' ? 'none' : fill} fillOpacity={fill === 'none' ? 0 : fillOp}
            stroke={stroke === 'none' ? 'none' : stroke} strokeOpacity={stroke === 'none' ? 0 : strokeOp}
            strokeWidth={stroke === 'none' ? 0 : sw} strokeLinejoin="round" />
          {rotHandle}
        </g>
      )
    }

    return null
  }

  function renderStroke(s: NNLStroke, key: string) {
    if (s.pts.length < 2) return null
    const pts = s.pts.map(p => w2s(p.x, p.y, ox, oy, zoom))
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`
    const isSelected = (selectedStrokeIds ?? []).includes(s.id)
    return (
      <g key={key}>
        {isSelected && (
          <path d={d} fill="none"
            stroke="var(--primary)" strokeOpacity={0.35}
            strokeWidth={((s.width ?? 2) * Math.sqrt(zoom)) + 8}
            strokeLinecap="round" strokeLinejoin="round" />
        )}
        <path d={d}
          fill="none"
          stroke={s.color ?? '#1e293b'}
          strokeWidth={(s.width ?? 2) * Math.sqrt(zoom)}
          strokeLinecap="round" strokeLinejoin="round"
          opacity={s.opacity ?? 1} />
      </g>
    )
  }

  // Bounding-box + poignées pour les tracés sélectionnés
  function renderStrokeBBox() {
    const selIds = selectedStrokeIds ?? []
    if (selIds.length === 0) return null
    const selStrokes = strokes.filter(s => selIds.includes(s.id))
    if (selStrokes.length === 0) return null
    const allPts = selStrokes.flatMap(s => s.pts)
    if (allPts.length === 0) return null
    const minX = Math.min(...allPts.map(p => p.x)), maxX = Math.max(...allPts.map(p => p.x))
    const minY = Math.min(...allPts.map(p => p.y)), maxY = Math.max(...allPts.map(p => p.y))
    const wBBox = { minX, minY, maxX, maxY }
    const TL = w2s(minX, maxY, ox, oy, zoom), BR = w2s(maxX, minY, ox, oy, zoom)
    const rx = TL.x, ry = TL.y, rw = BR.x - TL.x, rh = BR.y - TL.y
    const cx = (TL.x + BR.x) / 2, cy = (TL.y + BR.y) / 2
    // Coin de rotation (au-dessus du centre, 24px)
    const rotSy = ry - 24
    const corners: Array<['nw'|'ne'|'sw'|'se', number, number]> = [
      ['nw', rx, ry], ['ne', rx+rw, ry], ['sw', rx, ry+rh], ['se', rx+rw, ry+rh],
    ]
    return (
      <g pointerEvents="auto">
        {/* Contour bounding box */}
        <rect x={rx} y={ry} width={rw} height={rh}
          fill="none" stroke="var(--primary)" strokeWidth={1} strokeDasharray="4 2" />
        {/* Tige de rotation */}
        <line x1={cx} y1={ry} x2={cx} y2={rotSy} stroke="var(--primary)" strokeWidth={1} />
        {/* Poignée de rotation */}
        <circle cx={cx} cy={rotSy} r={5} fill="white" stroke="var(--primary)" strokeWidth={1.5}
          style={{ cursor: 'crosshair' }}
          onMouseDown={e => { e.stopPropagation(); onStrokeRotateStart?.(
            (minX + maxX) / 2, (minY + maxY) / 2, e) }} />
        {/* Poignées de resize */}
        {corners.map(([h, hx, hy]) => (
          <rect key={h} x={hx-5} y={hy-5} width={10} height={10} rx={2}
            fill="white" stroke="var(--primary)" strokeWidth={1.5}
            style={{ cursor: h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize' }}
            onMouseDown={e => { e.stopPropagation(); onStrokeResizeStart?.(h, wBBox, e) }} />
        ))}
      </g>
    )
  }

  // SVG toujours pointerEvents:'none' → les clics traversent jusqu'aux arcs (BackgroundCircles)
  // Les formes n'ont plus de onClick → pas de double-fire avec onCanvasMouseDown
  // Seules les poignées bezier ont pointerEvents:'auto' (enfants peuvent override le parent SVG)
  return (
    <svg style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
      width={W} height={H}>
      {strokes.map(s => renderStroke(s, s.id))}
      {previewStroke && renderStroke(previewStroke, 'preview-stroke')}
      {shapes.map(s => renderShape(s, s.id))}
      {previewShape && renderShape(previewShape, 'preview-shape')}
      {renderStrokeBBox()}
    </svg>
  )
}

// ── TextBlock ─────────────────────────────────────────────────────────────────
function TextBlock({ text, ox, oy, zoom, onDoubleClick, onMouseDown, onResizeStart, onRotateStart, isSelected }: {
  text: NNLText; ox: number; oy: number; zoom: number
  onDoubleClick: (id: string) => void
  onMouseDown?: (id: string, e: React.MouseEvent) => void
  onResizeStart?: (id: string, e: React.MouseEvent) => void
  onRotateStart?: (id: string, e: React.MouseEvent) => void
  isSelected?: boolean
}) {
  const p = w2s(text.x, text.y, ox, oy, zoom)
  const fs = (text.fontSize ?? 14) * zoom
  const rot = text.rotation ?? 0
  const color = text.color ?? 'var(--text)'
  const colorOp = text.colorOpacity ?? 1
  const displayColor = text.color && text.color.startsWith('#')
    ? hexToRgba(text.color, colorOp) : color

  return (
    <div style={{
      position: 'absolute', left: p.x, top: p.y,
      transform: rot !== 0 ? `rotate(${rot}deg)` : undefined,
      transformOrigin: 'center center',
    }}>
      <div
        onDoubleClick={e => { e.stopPropagation(); onDoubleClick(text.id) }}
        onMouseDown={onMouseDown ? e => { e.stopPropagation(); onMouseDown(text.id, e) } : undefined}
        style={{
          width: text.w * zoom,
          fontSize: fs, lineHeight: 1.4,
          fontFamily: text.fontFamily ?? 'inherit',
          color: displayColor,
          fontWeight: text.bold ? 700 : undefined,
          fontStyle: text.italic ? 'italic' : undefined,
          textDecoration: text.underline ? 'underline' : undefined,
          textAlign: text.textAlign ?? 'left',
          userSelect: 'none', pointerEvents: 'auto',
          cursor: onMouseDown ? 'move' : 'default',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          padding: 2,
          outline: isSelected ? '2px dashed var(--primary)' : undefined,
          outlineOffset: isSelected ? '2px' : undefined,
          borderRadius: 2, boxSizing: 'border-box',
        }}
        dangerouslySetInnerHTML={{ __html: text.content }}
      />
      {/* Handle de resize (largeur) */}
      {isSelected && onResizeStart && (
        <div
          onMouseDown={e => { e.stopPropagation(); onResizeStart(text.id, e) }}
          style={{
            position: 'absolute', top: 0, right: -5, bottom: 0, width: 10,
            cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <div style={{ width: 3, height: 20, borderRadius: 2, background: 'var(--primary)', opacity: 0.7 }} />
        </div>
      )}
      {/* Handle de rotation (texte) */}
      {isSelected && onRotateStart && (
        <>
          <div style={{
            position: 'absolute', top: -16, left: '50%',
            width: 1, height: 14, background: 'var(--primary)',
            transform: 'translateX(-50%)', pointerEvents: 'none',
          }} />
          <div
            onMouseDown={e => { e.stopPropagation(); onRotateStart(text.id, e) }}
            style={{
              position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
              width: 12, height: 12, borderRadius: '50%',
              background: 'white', border: '2px solid var(--primary)',
              cursor: 'crosshair', boxSizing: 'border-box',
            }}
          />
        </>
      )}
    </div>
  )
}

// ── InlineTextEditor (contenteditable + mini-toolbar) ───────────────────────
function InlineTextEditor({ text, ox, oy, zoom, onCommit }: {
  text: NNLText; ox: number; oy: number; zoom: number
  onCommit: (html: string) => void
}) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const edRef         = useRef<HTMLDivElement>(null)
  const savedRange    = useRef<Range | null>(null)
  const committedRef  = useRef(false)
  // Évite le commit quand l'utilisateur clique sur la toolbar (flag courte durée)
  const inToolbarRef  = useRef(false)
  const p             = w2s(text.x, text.y, ox, oy, zoom)
  const [color, setColor]           = useState(text.color ?? '#1e293b')
  const [colorOpacity, setColorOpacity] = useState(1)
  const [colorOpen, setColorOpen]   = useState(false)
  const [activeFmts, setActiveFmts] = useState({ bold: false, italic: false, underline: false })

  useEffect(() => {
    const el = edRef.current; if (!el) return
    el.innerHTML = text.content
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range)
  }, []) // eslint-disable-line

  // Met à jour l'état G/I/S selon la sélection courante
  function updateActiveFmts() {
    setActiveFmts({
      bold:      document.queryCommandState('bold'),
      italic:    document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    })
  }
  useEffect(() => {
    function onSelChange() {
      const active = document.activeElement
      if (active !== edRef.current && !edRef.current?.contains(active)) return
      updateActiveFmts()
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, []) // eslint-disable-line

  function commit() {
    if (committedRef.current) return
    committedRef.current = true
    onCommit(edRef.current?.innerHTML ?? text.content)
  }

  // Sauvegarde la sélection courante
  function saveSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange()
  }

  // Restaure la sélection dans l'éditeur avant d'appliquer un style
  function restoreAndExec(cmd: string, value?: string) {
    const el = edRef.current; if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (savedRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, value)
    savedRange.current = null
  }

  // Marque une interaction toolbar pour bloquer le commit au blur
  function markToolbar() {
    inToolbarRef.current = true
    setTimeout(() => { inToolbarRef.current = false }, 200)
  }

  // Applique foreColor sans effacer savedRange (pour pouvoir ajuster l'opacité ensuite)
  function applyForeColor(c: string, op: number) {
    const el = edRef.current; if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (savedRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current.cloneRange())
    }
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('foreColor', false, hexToRgba(c, op))
  }

  const TB_BTN: React.CSSProperties = {
    border: 'none', borderRadius: 4, cursor: 'pointer', padding: '2px 5px',
    background: 'transparent', color: 'var(--text)', fontSize: 11,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div ref={containerRef} style={{ position: 'absolute', left: p.x, top: p.y, zIndex: 90 }}
      onMouseDown={e => e.stopPropagation()}>

      {/* ── Mini-toolbar ─────────────────────────────────────────────────── */}
      <div
        onMouseDown={() => { saveSelection(); markToolbar() }}
        style={{
          position: 'absolute', top: -38, left: 0,
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '3px 6px', boxShadow: '0 2px 8px rgba(0,0,0,.14)',
          whiteSpace: 'nowrap',
        }}>
        {/* Police — selection-aware via savedRange */}
        <select
          onChange={e => restoreAndExec('fontName', e.target.value)}
          defaultValue=""
          style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 4,
            padding: '1px 3px', background: 'var(--surface-2)', color: 'var(--text)',
            cursor: 'pointer', outline: 'none', maxWidth: 120 }}>
          <option value="" disabled>Police…</option>
          {PROP_FONTS.filter(f => f.value !== 'inherit').map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        <div style={{ width:1, height:16, background:'var(--border)', margin:'0 2px' }} />

        {/* G / I / S — preventDefault évite la perte de focus/sélection */}
        {(['bold', 'italic', 'underline'] as const).map(fmt => {
          const active = activeFmts[fmt]
          const labels = { bold: 'G', italic: 'I', underline: 'S' }
          const titles = { bold: 'Gras (Ctrl+B)', italic: 'Italique (Ctrl+I)', underline: 'Souligné (Ctrl+U)' }
          const cmds   = { bold: 'bold', italic: 'italic', underline: 'underline' }
          return (
            <button key={fmt} title={titles[fmt]}
              style={{ ...TB_BTN,
                background: active ? 'var(--primary-light)' : 'transparent',
                color:      active ? 'var(--primary)'       : 'var(--text)',
                border:     active ? '1px solid var(--primary-light)' : '1px solid transparent',
              }}
              onMouseDown={e => {
                e.preventDefault()
                saveSelection()        // capture la sélection avant tout
                restoreAndExec(cmds[fmt])
                setTimeout(updateActiveFmts, 0)
              }}>
              {fmt === 'bold'      && <strong>G</strong>}
              {fmt === 'italic'    && <em>I</em>}
              {fmt === 'underline' && <u>S</u>}
            </button>
          )
        })}

        <div style={{ width:1, height:16, background:'var(--border)', margin:'0 2px' }} />

        {/* Couleur de la sélection — ColorOpacityPopover */}
        <div style={{ position: 'relative' }}>
          <div
            title="Couleur du texte sélectionné"
            onMouseDown={e => {
              e.preventDefault()
              saveSelection()
              markToolbar()
              setColorOpen(p => !p)
            }}>
            <PSwatch color={color} opacity={colorOpacity} size={20} selected={colorOpen} />
          </div>
          {colorOpen && (
            <ColorOpacityPopover
              current={color} opacity={colorOpacity}
              onPick={c => { setColor(c); applyForeColor(c, colorOpacity); setColorOpen(false) }}
              onOpacity={op => { setColorOpacity(op); applyForeColor(color, op) }}
              onSave={() => {}}
              onClose={() => setColorOpen(false)}
            />
          )}
        </div>
      </div>

      {/* ── Contenteditable ───────────────────────────────────────────────── */}
      <div
        ref={edRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={() => {
          if (!inToolbarRef.current) commit()
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); commit() }
        }}
        onPaste={e => {
          e.preventDefault()
          const plain = e.clipboardData.getData('text/plain')
          const safe = plain
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>')
          document.execCommand('insertHTML', false, safe)
        }}
        style={{
          width: text.w * zoom,
          minHeight: (text.fontSize ?? 14) * zoom * 1.8,
          fontSize: (text.fontSize ?? 14) * zoom,
          fontFamily: text.fontFamily ?? 'inherit',
          color: text.color ?? 'var(--text)',
          fontWeight: text.bold ? 700 : undefined,
          fontStyle: text.italic ? 'italic' : undefined,
          textDecoration: text.underline ? 'underline' : undefined,
          textAlign: text.textAlign ?? 'left',
          background: 'var(--surface)',
          border: '1.5px solid var(--primary)',
          borderRadius: 4, padding: 4, outline: 'none',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          lineHeight: 1.4, boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ── PostIt ───────────────────────────────────────────────────────────────────
interface PostItProps {
  item: NNLItem; ox: number; oy: number; zoom: number
  onDragStart: (id: string, e: React.MouseEvent) => void
  onDelete:    (id: string) => void
  onEdit:      (id: string) => void
  onResizeEnd: (id: string, w: number, h?: number, wx?: number, wy?: number) => void
}
function PostIt({ item, ox, oy, zoom, onDragStart, onDelete, onEdit, onResizeEnd }: PostItProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const oxRef   = useRef(ox);   oxRef.current   = ox
  const oyRef   = useRef(oy);   oyRef.current   = oy
  const zoomRef = useRef(zoom); zoomRef.current = zoom

  const [localW, setLocalW] = useState(item.w ?? 160)
  const [localH, setLocalH] = useState<number | null>(item.h ?? null)
  const [rLeft, setRLeft] = useState<number | null>(null)
  const [rTop,  setRTop]  = useState<number | null>(null)
  const rLeftRef = useRef<number | null>(null)
  const rTopRef  = useRef<number | null>(null)
  rLeftRef.current = rLeft
  rTopRef.current  = rTop

  useEffect(() => { setLocalW(item.w ?? 160)  }, [item.w])
  useEffect(() => { setLocalH(item.h ?? null) }, [item.h])

  const resizeRef = useRef<{
    x0: number; y0: number; w0: number; h0: number
    tlx: number; tly: number
  } | null>(null)

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizeRef.current) return
      const { w0, h0, tlx, tly } = resizeRef.current
      const z = zoomRef.current
      const newW = Math.max(120, Math.min(1000, w0 + (e.clientX - resizeRef.current.x0) / z))
      const newH = Math.max(80,  Math.min(1000, h0 + (e.clientY - resizeRef.current.y0) / z))
      setLocalW(newW)
      setLocalH(newH)
      const newLeft = tlx + newW * z / 2
      const newTop  = tly + newH * z / 2
      setRLeft(newLeft); rLeftRef.current = newLeft
      setRTop(newTop);   rTopRef.current  = newTop
    }
    function onUp() {
      if (!resizeRef.current) return
      const { tlx, tly, h0 } = resizeRef.current
      const z    = zoomRef.current
      const finalH = localH ?? h0
      const finalCx = tlx + localW  * z / 2
      const finalCy = tly + finalH  * z / 2
      const { x: wx, y: wy } = s2w(finalCx, finalCy, oxRef.current, oyRef.current, z)
      setRLeft(null); rLeftRef.current = null
      setRTop(null);  rTopRef.current  = null
      onResizeEnd(item.id, localW, finalH, wx, wy)
      resizeRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [item.id, localW, localH, onResizeEnd])

  const { x: sx, y: sy } = w2s(item.x, item.y, ox, oy, zoom)
  const posLeft = rLeft !== null ? rLeft : sx
  const posTop  = rTop  !== null ? rTop  : sy

  const accentColor = item.color ?? TYPE_COLORS[item.type]
  const lum = luminance(accentColor)
  const textColor = lum < 0.45 ? '#ffffff' : '#1a1a1a'
  const mutedColor = lum < 0.45 ? 'rgba(255,255,255,.65)' : 'rgba(0,0,0,.45)'

  const hasImage  = !!item.image
  const hasLink   = !!item.link?.url
  const noteCount = item.notes?.length ?? 0
  const hasLinked = !!item.linkedItemId
  const showFooter = hasImage || hasLink || noteCount > 0 || hasLinked

  return (
    <div ref={divRef}
      className={`nnl-postit nnl-postit-${item.type}`}
      data-testid={`nnl-postit-${item.id}`}
      style={{
        left: posLeft, top: posTop,
        width: localW,
        ...(localH !== null ? { height: localH, overflow: 'hidden' } : {}),
        transform: `translate(-50%, -50%) scale(${zoom})`,
        padding: 0, display: 'flex', flexDirection: 'column',
        background: accentColor,
        color: textColor,
      }}
      onMouseDown={e => onDragStart(item.id, e)}
      onDoubleClick={e => { e.stopPropagation(); onEdit(item.id) }}
    >
      <button className="nnl-postit-delete" title="Supprimer"
        style={{ color: textColor }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete(item.id) }}>×</button>

      <button className="nnl-postit-edit" title="Modifier (double-clic)"
        style={{ color: textColor }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onEdit(item.id) }}>
        <Svg d={ICO_EDIT} size={10} />
      </button>

      <div className="nnl-postit-text" style={{ padding: '10px 24px 6px 10px', flex: 1, fontWeight: 600, fontSize: 12, lineHeight: 1.4, color: textColor }}>
        {item.text || <span style={{ opacity: .5, fontStyle: 'italic' }}>Sans titre</span>}
      </div>

      {item.body && (
        <div style={{ padding: '0 10px 6px', fontSize: 10, color: mutedColor, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {item.body}
        </div>
      )}

      {item.image && !item.body && (
        <div style={{ padding: '0 10px 6px' }}>
          <img src={item.image} alt="" style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 4, opacity: .9 }} />
        </div>
      )}

      {showFooter && (
        <div style={{ display: 'flex', gap: 6, padding: '4px 10px 6px', borderTop: `1px solid rgba(${lum < 0.45 ? '255,255,255' : '0,0,0'},.12)`, color: mutedColor, alignItems: 'center' }}>
          {hasImage   && <span title="Image"       style={{ opacity: .7 }}><Svg d={ICO_IMG}  size={11} /></span>}
          {hasLink    && <span title={item.link?.url} style={{ opacity: .7 }}><Svg d={ICO_LINK} size={11} /></span>}
          {noteCount > 0 && <span title={`${noteCount} note${noteCount > 1 ? 's' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 2, opacity: .7, fontSize: 9 }}><Svg d={ICO_NOTE} size={11} />{noteCount}</span>}
          {hasLinked  && <span title="Item lié" style={{ opacity: .7 }}><Svg d={ICO_ITEM} size={11} /></span>}
        </div>
      )}

      <div className="nnl-resize-handle"
        style={{ borderColor: mutedColor }}
        onMouseDown={e => {
          e.stopPropagation(); e.preventDefault()
          const storedH = divRef.current ? divRef.current.getBoundingClientRect().height / zoom : (localH ?? 90)
          const curH = localH ?? storedH
          const tlx = posLeft - localW * zoom / 2
          const tly = posTop  - curH   * zoom / 2
          resizeRef.current = { x0: e.clientX, y0: e.clientY, w0: localW, h0: curH, tlx, tly }
        }} />
    </div>
  )
}

// ── Minimap ──────────────────────────────────────────────────────────────────
function Minimap({ items, ox, oy, zoom, W, H, r1, r2, onNavigate }: {
  items: NNLItem[]; ox: number; oy: number; zoom: number
  W: number; H: number; r1: number; r2: number
  onNavigate: (wx: number, wy: number) => void
}) {
  const mmRef = useRef<HTMLDivElement>(null)
  const mmCx = MM_W/2, mmCy = MM_H/2
  const mmScale = (Math.min(MM_W, MM_H)/2) / (r2*1.65)
  const wToMM = (wx: number, wy: number) => ({ x: mmCx + wx*mmScale, y: mmCy - wy*mmScale })
  const vtl = s2w(0, 0, ox, oy, zoom), vbr = s2w(W, H, ox, oy, zoom)
  const vx0 = mmCx + vtl.x*mmScale, vy0 = mmCy - vtl.y*mmScale
  const vx1 = mmCx + vbr.x*mmScale, vy1 = mmCy - vbr.y*mmScale
  const rx = Math.max(0, Math.min(vx0, MM_W)), ry = Math.max(0, Math.min(vy0, MM_H))
  const rw = Math.max(0, Math.min(vx1, MM_W) - rx), rh = Math.max(0, Math.min(vy1, MM_H) - ry)
  return (
    <div ref={mmRef} className="nnl-minimap"
      onClick={e => {
        if (!mmRef.current) return
        const rect = mmRef.current.getBoundingClientRect()
        onNavigate((e.clientX-rect.left-mmCx)/mmScale, -(e.clientY-rect.top-mmCy)/mmScale)
      }}>
      <svg width={MM_W} height={MM_H}>
        <circle cx={mmCx} cy={mmCy} r={r1*mmScale} fill="none" stroke="var(--nnl-arc)" strokeWidth="1"/>
        <circle cx={mmCx} cy={mmCy} r={r2*mmScale} fill="none" stroke="var(--nnl-arc)" strokeWidth="1"/>
        {items.map(item => {
          const p = wToMM(item.x, item.y)
          return <circle key={item.id} cx={p.x} cy={p.y} r={2.5} fill={item.color ?? TYPE_COLORS[item.type]} opacity={.9}/>
        })}
        <rect x={rx} y={ry} width={rw} height={rh} fill="rgba(99,102,241,.08)" stroke="var(--primary)" strokeWidth="1.5" strokeOpacity=".6" rx={2}/>
      </svg>
      <span className="nnl-minimap-label">Vue d'ensemble</span>
    </div>
  )
}

// ── ZoomControls ──────────────────────────────────────────────────────────────
function ZoomControls({ zoom, onZoom, onReset }: { zoom: number; onZoom: (z: number) => void; onReset: () => void }) {
  const btn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
    fontSize: 18, width: 30, height: 30, display: 'flex', alignItems: 'center',
    justifyContent: 'center', borderRadius: 5, flexShrink: 0, padding: 0,
  }
  return (
    <div style={{
      position: 'absolute', bottom: 14, right: 14, zIndex: 60,
      display: 'flex', alignItems: 'center',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.12)',
    }}>
      <button style={btn} onClick={() => onZoom(Math.max(ZOOM_MIN, +(zoom-0.1).toFixed(2)))} title="Zoom arrière">−</button>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'center', fontWeight: 600, cursor: 'pointer', userSelect: 'none', padding: '0 2px' }}
        onClick={onReset} title="Vue initiale">{Math.round(zoom*100)}%</span>
      <button style={btn} onClick={() => onZoom(Math.min(ZOOM_MAX, +(zoom+0.1).toFixed(2)))} title="Zoom avant">+</button>
    </div>
  )
}

// ── Shared color/palette utilities ───────────────────────────────────────────
const PROP_PALETTE = ['#1e293b','#94a3b8','#ef4444','#f97316','#fbbf24','#22c55e','#3b82f6','#8b5cf6','#ec4899','#40e0d0','#ffffff','none']
const PROP_SW = [1, 2, 4, 8, 16]
const PROP_FONTS = [
  { label: 'Système',           value: 'inherit' },
  { label: 'Inter',             value: '"Inter", sans-serif' },
  { label: 'Lato',              value: '"Lato", sans-serif' },
  { label: 'Montserrat',        value: '"Montserrat", sans-serif' },
  { label: 'Raleway',           value: '"Raleway", sans-serif' },
  { label: 'Oswald',            value: '"Oswald", sans-serif' },
  { label: 'Playfair Display',  value: '"Playfair Display", serif' },
  { label: 'Merriweather',      value: '"Merriweather", serif' },
  { label: 'Roboto Mono',       value: '"Roboto Mono", monospace' },
]
// Checkered background (transparency indicator)
const CHECKER_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3Crect x='0' y='4' width='4' height='4' fill='%23eee'/%3E%3Crect x='4' y='0' width='4' height='4' fill='%23eee'/%3E%3C/svg%3E")`

// ── Boolean ops icons ─────────────────────────────────────────────────────────
const ICO_BOOL_UNITE     = '<path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-3a1 1 0 0 0-1-1z"/>'
const ICO_BOOL_SUBTRACT  = '<path d="M10 22a2 2 0 0 1-2-2"/><path d="M16 22h-2"/><path d="M16 4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1v-5a2 2 0 0 1 2-2h5a1 1 0 0 0 1-1z"/><path d="M20 8a2 2 0 0 1 2 2"/><path d="M22 14v2"/><path d="M22 20a2 2 0 0 1-2 2"/>'
const ICO_BOOL_INTERSECT = '<path d="M10 22a2 2 0 0 1-2-2"/><path d="M14 2a2 2 0 0 1 2 2"/><path d="M16 22h-2"/><path d="M2 10V8"/><path d="M2 4a2 2 0 0 1 2-2"/><path d="M20 8a2 2 0 0 1 2 2"/><path d="M22 14v2"/><path d="M22 20a2 2 0 0 1-2 2"/><path d="M4 16a2 2 0 0 1-2-2"/><path d="M8 10a2 2 0 0 1 2-2h5a1 1 0 0 1 1 1v5a2 2 0 0 1-2 2H9a1 1 0 0 1-1-1z"/><path d="M8 2h2"/>'
const ICO_BOOL_DIVIDE    = '<path d="M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h0"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2"/>'
// XOR : pas d'icône Lucide → on dessine deux carrés qui se chevauchent
const ICO_BOOL_XOR       = '<rect x="3" y="3" width="10" height="10" rx="1"/><rect x="11" y="11" width="10" height="10" rx="1"/>'

// ── Boolean ops geometry ──────────────────────────────────────────────────────
type Pt2 = [number, number]
type Ring = Pt2[]
type Poly = Ring[]

function shapeToPolygon(s: NNLShape): Poly {
  // Polygone existant
  if (s.shapeType === 'polygon' && s.polyPts && s.polyPts.length > 2) {
    const ring: Ring = s.polyPts.map(p => [p.x, p.y] as Pt2)
    if (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1])
      ring.push(ring[0])
    return [ring]
  }
  const minX = Math.min(s.x, s.x2), maxX = Math.max(s.x, s.x2)
  const minY = Math.min(s.y, s.y2), maxY = Math.max(s.y, s.y2)
  if (s.shapeType === 'ellipse') {
    // Approximation ellipse → polygone 64 pts
    const cx = (minX+maxX)/2, cy = (minY+maxY)/2
    const rx = (maxX-minX)/2, ry = (maxY-minY)/2
    const ring: Ring = []
    const N = 64
    for (let i = 0; i <= N; i++) {
      const t = (2 * Math.PI * i) / N
      ring.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)])
    }
    return [ring]
  }
  // Rect
  const ring: Ring = [
    [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]
  ]
  return [ring]
}

function multiPolyToNNLShape(result: polygonClipping.MultiPolygon, proto: NNLShape): NNLShape | null {
  if (!result || result.length === 0) return null
  const ring = result[0][0]
  if (!ring || ring.length < 3) return null
  const pts = ring.map(([x, y]) => ({ x, y }))
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  return {
    ...proto,
    id: `shape-${Date.now()}-${Math.random().toString(36).slice(2,6)}-bool`,
    shapeType: 'polygon' as const,
    x:  Math.min(...xs), y:  Math.max(...ys),
    x2: Math.max(...xs), y2: Math.min(...ys),
    polyPts: pts,
    pts: undefined,
    rotation: 0,
  }
}

// Crée une NNLShape par polygone dans le résultat (XOR / divide → plusieurs pièces)
function multiPolyToNNLShapes(result: polygonClipping.MultiPolygon, proto: NNLShape): NNLShape[] {
  if (!result || result.length === 0) return []
  return result.flatMap((poly, i) => {
    const ring = poly[0]
    if (!ring || ring.length < 3) return []
    const pts = ring.map(([x, y]) => ({ x, y }))
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
    const shape: NNLShape = {
      ...proto,
      id: `shape-${Date.now()}-${i}-${Math.random().toString(36).slice(2,6)}-bool`,
      shapeType: 'polygon' as const,
      x:  Math.min(...xs), y:  Math.max(...ys),
      x2: Math.max(...xs), y2: Math.min(...ys),
      polyPts: pts,
      pts: undefined,
      rotation: 0,
    }
    return [shape]
  })
}

function hexToRgba(hex: string, op: number): string {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return hex
  const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16)
  return `rgba(${r},${g},${b},${op})`
}

function PSwatch({ color, opacity = 1, size = 22, selected = false }: { color: string; opacity?: number; size?: number; selected?: boolean }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 4, flexShrink: 0, boxSizing: 'border-box', cursor: 'pointer',
      backgroundImage: CHECKER_BG,
      border: selected ? '2px solid var(--primary)' : '1px solid var(--border)',
      position: 'relative', overflow: 'hidden',
    }}>
      {color !== 'none' && <div style={{ position: 'absolute', inset: 0, background: hexToRgba(color, opacity) }} />}
      {color === 'none' && (
        <svg viewBox="0 0 18 18" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
          <line x1="2" y1="16" x2="16" y2="2" stroke="#ef4444" strokeWidth="2.5" />
        </svg>
      )}
    </div>
  )
}

function ColorOpacityPopover({ current, opacity, onPick, onOpacity, onSave, onClose }: {
  current: string; opacity: number
  onPick: (c: string) => void; onOpacity: (op: number) => void
  onSave: () => void; onClose: () => void
}) {
  return (
    <div onMouseDown={e => { e.stopPropagation(); e.preventDefault() }} style={{
      position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 220,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,.22)',
      width: 170,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 22px)', gap: 4 }}>
        {PROP_PALETTE.map(c => (
          <div key={c} style={{ cursor: 'pointer' }} onClick={() => { onPick(c); onSave(); onClose() }}>
            <PSwatch color={c} size={22} selected={c === current} />
          </div>
        ))}
      </div>
      {current !== 'none' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
            <span>Opacité</span><span>{Math.round(opacity * 100)}%</span>
          </div>
          <input type="range" min={0} max={100} value={Math.round(opacity * 100)}
            onChange={e => onOpacity(parseInt(e.target.value) / 100)}
            onMouseUp={onSave}
            onMouseDown={e => e.stopPropagation()}
            style={{ width: '100%', height: 14, cursor: 'pointer' }}
          />
        </div>
      )}
    </div>
  )
}

const PANEL_SEP = <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

// ── StrokePropertiesPanel ─────────────────────────────────────────────────────
function StrokePropertiesPanel({ strokes, onUpdate, onSave, onDelete }: {
  strokes: NNLStroke[]
  onUpdate: (id: string, updates: Partial<NNLStroke>) => void
  onSave: () => void
  onDelete: () => void
}) {
  const first = strokes[0]
  const color = first?.color ?? '#1e293b'
  const width = first?.width ?? 2
  const PALETTE = ['#1e293b','#94a3b8','#ef4444','#f97316','#fbbf24','#22c55e','#3b82f6','#8b5cf6','#ec4899','#40e0d0','#ffffff']
  const SIZES = [1, 2, 4, 8, 16]
  return (
    <div onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        zIndex: 80, display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '5px 10px',
        boxShadow: '0 2px 12px rgba(0,0,0,.12)',
      }}>
      {/* Couleur */}
      <div style={{ display: 'flex', gap: 3 }}>
        {PALETTE.map(c => (
          <div key={c} onClick={() => { strokes.forEach(s => onUpdate(s.id, { color: c })); onSave() }}
            style={{
              width: 16, height: 16, borderRadius: 4, background: c, cursor: 'pointer',
              border: color === c ? '2px solid var(--primary)' : '1px solid var(--border)',
              boxSizing: 'border-box',
            }} />
        ))}
        <div style={{ position: 'relative', width: 16, height: 16 }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: color, border: '1px solid var(--border)' }} />
          <input type="color" value={color === 'none' ? '#000000' : color}
            onChange={e => { strokes.forEach(s => onUpdate(s.id, { color: e.target.value })); onSave() }}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
        </div>
      </div>
      {PANEL_SEP}
      {/* Épaisseur */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {SIZES.map(w => (
          <button key={w} title={`Épaisseur ${w}px`}
            onClick={() => { strokes.forEach(s => onUpdate(s.id, { width: w })); onSave() }}
            style={{
              width: 28, height: 24, border: 'none', borderRadius: 5, cursor: 'pointer',
              background: width === w ? 'var(--primary-light)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            <div style={{ width: 18, height: Math.min(w, 6), borderRadius: w / 2,
              background: width === w ? 'var(--primary)' : 'var(--text-muted)' }} />
          </button>
        ))}
      </div>
      {PANEL_SEP}
      {/* Supprimer */}
      <button title="Supprimer (Suppr)" onClick={onDelete}
        style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer',
          background: 'transparent', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>×</button>
    </div>
  )
}

// ── BooleanOpsToolbar ─────────────────────────────────────────────────────────
function BooleanOpsToolbar({ onOp }: { onOp: (op: 'unite'|'subtract'|'intersect'|'xor'|'divide') => void }) {
  const ops: Array<{ id: 'unite'|'subtract'|'intersect'|'xor'|'divide'; label: string; d: string }> = [
    { id: 'unite',     label: 'Ajouter (union)',       d: ICO_BOOL_UNITE     },
    { id: 'subtract',  label: 'Soustraire',            d: ICO_BOOL_SUBTRACT  },
    { id: 'intersect', label: 'Intersection',          d: ICO_BOOL_INTERSECT },
    { id: 'xor',       label: 'OU exclusif (XOR)',     d: ICO_BOOL_XOR       },
    { id: 'divide',    label: 'Diviser',               d: ICO_BOOL_DIVIDE    },
  ]
  return (
    <div onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 75, display: 'flex', alignItems: 'center', gap: 4,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '5px 8px',
        boxShadow: '0 2px 12px rgba(0,0,0,.12)',
      }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4 }}>Opérations :</span>
      {ops.map(op => (
        <button key={op.id} title={op.label} onClick={() => onOp(op.id)}
          style={{
            width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--surface-2)', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text)',
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: op.d }} />
        </button>
      ))}
    </div>
  )
}

// ── ShapePropertiesPanel ──────────────────────────────────────────────────────
function ShapePropertiesPanel({ shape, onUpdate, onSave, onDelete }: {
  shape: NNLShape
  onUpdate: (updates: Partial<NNLShape>) => void
  onSave:   () => void
  onDelete: () => void
}) {
  const [picking, setPicking] = useState<'fill' | 'stroke' | null>(null)
  const fill      = shape.fill        ?? 'none'
  const fillOp    = shape.fillOpacity   ?? 1
  const stroke    = shape.stroke      ?? '#1e293b'
  const strokeOp  = shape.strokeOpacity ?? 1
  const sw        = shape.strokeWidth ?? 2
  const rot       = shape.rotation    ?? 0

  return (
    <div onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        zIndex: 61, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '6px 10px', boxShadow: '0 2px 12px rgba(0,0,0,.14)',
        display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
      }}>

      {/* ── Dual-square color selector (style Photoshop) ── */}
      <div style={{ position: 'relative', width: 42, height: 38, flexShrink: 0 }}>
        {/* Carré arrière = Contour (juste la bordure, intérieur transparent) */}
        <div title="Couleur de contour"
          onClick={() => setPicking(p => p === 'stroke' ? null : 'stroke')}
          style={{
            position: 'absolute', bottom: 0, right: 0, width: 26, height: 26,
            background: 'var(--surface-2)',
            border: `4px solid ${stroke === 'none' ? 'var(--border)' : hexToRgba(stroke, strokeOp)}`,
            boxShadow: `0 0 0 ${picking === 'stroke' ? 2 : 1}px ${picking === 'stroke' ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 4, cursor: 'pointer', boxSizing: 'border-box', overflow: 'hidden',
          }}>
          {stroke === 'none' && <svg viewBox="0 0 22 22" width={22} height={22} style={{ position: 'absolute', inset: 0 }}><line x1="3" y1="19" x2="19" y2="3" stroke="#ef4444" strokeWidth="2.5"/></svg>}
        </div>
        {/* Carré avant = Fond (plein, couleur visible) */}
        <div title="Couleur de remplissage"
          onClick={() => setPicking(p => p === 'fill' ? null : 'fill')}
          style={{
            position: 'absolute', top: 0, left: 0, width: 26, height: 26,
            backgroundImage: fill === 'none' ? CHECKER_BG : undefined,
            background: fill !== 'none' ? hexToRgba(fill, fillOp) : undefined,
            border: `2px solid ${picking === 'fill' ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 4, cursor: 'pointer', boxSizing: 'border-box', overflow: 'hidden',
          }}>
          {fill === 'none' && <svg viewBox="0 0 22 22" width={22} height={22} style={{ position: 'absolute', inset: 0 }}><line x1="3" y1="19" x2="19" y2="3" stroke="#ef4444" strokeWidth="2.5"/></svg>}
        </div>

        {picking === 'fill' && (
          <ColorOpacityPopover current={fill} opacity={fillOp}
            onPick={c => onUpdate({ fill: c })} onOpacity={op => onUpdate({ fillOpacity: op })}
            onSave={onSave} onClose={() => setPicking(null)} />
        )}
        {picking === 'stroke' && (
          <ColorOpacityPopover current={stroke} opacity={strokeOp}
            onPick={c => onUpdate({ stroke: c })} onOpacity={op => onUpdate({ strokeOpacity: op })}
            onSave={onSave} onClose={() => setPicking(null)} />
        )}
      </div>

      {PANEL_SEP}

      {/* ── Épaisseur ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {PROP_SW.map(w => (
          <button key={w} title={`${w}px`}
            onClick={() => { onUpdate({ strokeWidth: w }); onSave() }}
            style={{
              width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0,
              background: sw === w ? 'var(--primary-light)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <div style={{ width: 12, height: Math.min(w, 4), borderRadius: w/2, background: sw === w ? 'var(--primary)' : 'var(--text-muted)' }} />
          </button>
        ))}
      </div>

      {/* ── Rayon des coins (rect uniquement) ── */}
      {shape.shapeType === 'rect' && (
        <>
          {PANEL_SEP}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Rayon</span>
            <input type="range" min={0} max={50} value={shape.rx ?? 0}
              onChange={e => onUpdate({ rx: parseInt(e.target.value) })}
              onMouseUp={onSave} onMouseDown={e => e.stopPropagation()}
              style={{ width: 60, height: 18, cursor: 'pointer' }} />
            <input type="number" min={0} max={50} value={shape.rx ?? 0}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => onUpdate({ rx: Math.min(50, Math.max(0, parseInt(e.target.value) || 0)) })}
              onBlur={onSave} onKeyDown={e => { if (e.key === 'Enter') onSave() }}
              style={{ width: 38, fontSize: 10, fontFamily: 'monospace', padding: '1px 4px',
                border: '1px solid var(--border)', borderRadius: 4,
                background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', textAlign: 'center' }} />
          </div>
        </>
      )}

      {PANEL_SEP}

      {/* ── Rotation ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          style={{ opacity: .55, flexShrink: 0 }}>
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
        </svg>
        <input type="number" min={-360} max={360} value={Math.round(rot)}
          onMouseDown={e => e.stopPropagation()}
          onChange={e => onUpdate({ rotation: parseInt(e.target.value) || 0 })}
          onBlur={onSave} onKeyDown={e => { if (e.key === 'Enter') onSave() }}
          style={{ width: 46, fontSize: 10, fontFamily: 'monospace', padding: '1px 4px',
            border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', textAlign: 'center' }} />
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>°</span>
      </div>

      {PANEL_SEP}

      {/* ── Opacité globale ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {Math.round((shape.opacity ?? 1) * 100)}%
        </span>
        <input type="range" min={0} max={100} value={Math.round((shape.opacity ?? 1) * 100)}
          onChange={e => onUpdate({ opacity: parseInt(e.target.value) / 100 })}
          onMouseUp={onSave} onMouseDown={e => e.stopPropagation()}
          style={{ width: 60, height: 14, cursor: 'pointer' }} />
      </div>

      {PANEL_SEP}

      <button title="Supprimer (Suppr)" onClick={onDelete}
        style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer',
          background: 'transparent', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>×</button>
    </div>
  )
}

// ── TextPropertiesPanel ───────────────────────────────────────────────────────
function TextPropertiesPanel({ text, onUpdate, onSave, onDelete }: {
  text: NNLText
  onUpdate: (updates: Partial<NNLText>) => void
  onSave:   () => void
  onDelete: () => void
}) {
  const [pickingColor, setPickingColor] = useState(false)
  const color   = text.color        ?? '#1e293b'
  const colorOp = text.colorOpacity ?? 1
  const rot     = text.rotation     ?? 0
  const fs      = text.fontSize     ?? 14

  return (
    <div onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        zIndex: 61, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '6px 10px', boxShadow: '0 2px 12px rgba(0,0,0,.14)',
        display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
      }}>

      {/* ── Couleur + opacité ── */}
      <div style={{ position: 'relative' }}>
        <div title="Couleur du texte" onClick={() => setPickingColor(p => !p)}>
          <PSwatch color={color} opacity={colorOp} size={24} selected={pickingColor} />
        </div>
        {pickingColor && (
          <ColorOpacityPopover current={color} opacity={colorOp}
            onPick={c => onUpdate({ color: c })} onOpacity={op => onUpdate({ colorOpacity: op })}
            onSave={onSave} onClose={() => setPickingColor(false)} />
        )}
      </div>

      {PANEL_SEP}

      {/* ── Police ── */}
      <select value={text.fontFamily ?? 'inherit'}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => { onUpdate({ fontFamily: e.target.value }); onSave() }}
        style={{ fontSize: 10, border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px',
          background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', outline: 'none',
          fontFamily: text.fontFamily ?? 'inherit' }}>
        {PROP_FONTS.map(f => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
        ))}
      </select>

      {/* ── Taille ── */}
      <input type="number" min={6} max={200} value={fs}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => onUpdate({ fontSize: parseInt(e.target.value) || 14 })}
        onBlur={onSave} onKeyDown={e => { if (e.key === 'Enter') onSave() }}
        style={{ width: 44, fontSize: 10, fontFamily: 'monospace', padding: '1px 4px',
          border: '1px solid var(--border)', borderRadius: 4,
          background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', textAlign: 'center' }} />

      {PANEL_SEP}

      {/* ── Gras / Italique / Souligné ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {(['bold', 'italic', 'underline'] as const).map(prop => {
          const labels = { bold: 'G', italic: 'I', underline: 'S' }
          const styles: React.CSSProperties = {
            bold:      { fontWeight: 700 },
            italic:    { fontStyle: 'italic' },
            underline: { textDecoration: 'underline' },
          }[prop]
          const active = !!text[prop]
          return (
            <button key={prop}
              title={prop === 'bold' ? 'Gras' : prop === 'italic' ? 'Italique' : 'Souligné'}
              onClick={() => { onUpdate({ [prop]: !active }); onSave() }}
              style={{
                width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
                border: active ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                background: active ? 'var(--primary-light)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, ...styles,
              }}>{labels[prop]}</button>
          )
        })}
      </div>

      {PANEL_SEP}

      {/* ── Alignement texte ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {([
          { v: 'left'    as const, title: 'Aligner à gauche',  d: '<line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/>' },
          { v: 'center'  as const, title: 'Centrer',           d: '<line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="12" x2="7" y2="12"/><line x1="19" y1="18" x2="5" y2="18"/>' },
          { v: 'right'   as const, title: 'Aligner à droite',  d: '<line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="9" y2="12"/><line x1="21" y1="18" x2="7" y2="18"/>' },
          { v: 'justify' as const, title: 'Justifier',         d: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>' },
        ]).map(({ v, title, d }) => {
          const active = (text.textAlign ?? 'left') === v
          return (
            <button key={v} title={title}
              onClick={() => { onUpdate({ textAlign: v }); onSave() }}
              style={{
                width: 22, height: 22, borderRadius: 4, cursor: 'pointer',
                border: active ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                background: active ? 'var(--primary-light)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: d }} />
            </button>
          )
        })}
      </div>

      {PANEL_SEP}

      {/* ── Rotation ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          style={{ opacity: .55, flexShrink: 0 }}>
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
        </svg>
        <input type="number" min={-360} max={360} value={Math.round(rot)}
          onMouseDown={e => e.stopPropagation()}
          onChange={e => onUpdate({ rotation: parseInt(e.target.value) || 0 })}
          onBlur={onSave} onKeyDown={e => { if (e.key === 'Enter') onSave() }}
          style={{ width: 46, fontSize: 10, fontFamily: 'monospace', padding: '1px 4px',
            border: '1px solid var(--border)', borderRadius: 4,
            background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', textAlign: 'center' }} />
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>°</span>
      </div>

      {PANEL_SEP}

      <button title="Supprimer (Suppr)" onClick={onDelete}
        style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer',
          background: 'transparent', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>×</button>
    </div>
  )
}

// ── Type snapshot NNL ─────────────────────────────────────────────────────────
type NNLSnapshot = {
  nnlItems: NNLItem[]
  nnlShapes: NNLShape[]
  nnlTexts: NNLText[]
  nnlStrokes: NNLStroke[]
  nnlLayers: NNLLayer[]
}

// ── NNLCanvas ─────────────────────────────────────────────────────────────────
export function NNLCanvas({ modalOpen, onModalClose }: { modalOpen: boolean; onModalClose: () => void }) {
  const { state, dispatch, saveToServer } = useCadence()
  const { showToast } = useToast()

  // ── Canvas state ─────────────────────────────────────────────────────────
  const canvasRef  = useRef<HTMLDivElement>(null)
  const originInit = useRef(false)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [ox, setOx]     = useState(0)
  const [oy, setOy]     = useState(0)
  const [r1, setR1]     = useState(R1_DEFAULT)
  const [r2, setR2]     = useState(R2_DEFAULT)
  const [isPanning, setIsPanning] = useState(false)

  // ── Tool state ────────────────────────────────────────────────────────────
  const [tool,          setTool]          = useState<NNLTool>('select')
  const [strokeColor,   setStrokeColor]   = useState('#1e293b')
  const [fillColor,     setFillColor]     = useState('none')
  const [drawWidth,     setDrawWidth]     = useState(2)
  const [rectRadius,    setRectRadius]    = useState(0)
  const [activeLayerId, setActiveLayerId] = useState(
    () => (state.nnlLayers ?? [])[0]?.id ?? 'layer-default'
  )
  const [selectedShapeId,  setSelectedShapeId]  = useState<string | null>(null)
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([])
  const [selectedTextId,   setSelectedTextId]   = useState<string | null>(null)
  const [selectedPtIdx,    setSelectedPtIdx]    = useState<number | null>(null)
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([])

  // ── Select tool sub-state (v0.90.5) ───────────────────────────────────────
  const [selectMode,  setSelectMode]  = useState<'pointer' | 'rect' | 'lasso'>('pointer')
  const [selectScope, setSelectScope] = useState<'all' | 'active'>('all')
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [rubberRect,  setRubberRect]  = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [lassoPts,    setLassoPts]    = useState<Array<{ x: number; y: number }> | null>(null)

  // ── Drawing preview state ─────────────────────────────────────────────────
  const [previewShape,  setPreviewShape]  = useState<NNLShape | null>(null)
  const [previewStroke, setPreviewStroke] = useState<NNLStroke | null>(null)

  // ── Inline text editing ───────────────────────────────────────────────────
  const [editingText, setEditingText] = useState<NNLText | null>(null)

  // ── Item modal state ──────────────────────────────────────────────────────
  const [editItem, setEditItem] = useState<NNLItem | null>(null)

  // ── Création d'un item Backlog lié depuis un post-it (Chantier M) ──────────
  // Non-null = la ItemModal Backlog est ouverte ; contient le callback à appeler
  // avec l'id du nouvel item pour le lier au post-it NNL en cours d'édition.
  const [linkingCallback, setLinkingCallback] = useState<((itemId: string) => void) | null>(null)

  // ── NNL Undo/Redo ─────────────────────────────────────────────────────────
  const [nnlCanUndo, setNNLCanUndo] = useState(false)
  const [nnlCanRedo, setNNLCanRedo] = useState(false)
  const nnlHistoryRef = useRef<NNLSnapshot[]>([])
  const nnlFutureRef  = useRef<NNLSnapshot[]>([])

  // ── Stable refs for window handlers ──────────────────────────────────────
  const zoomRef         = useRef(zoom);         zoomRef.current         = zoom
  const oxRef           = useRef(ox);           oxRef.current           = ox
  const oyRef           = useRef(oy);           oyRef.current           = oy
  const r1Ref           = useRef(r1);           r1Ref.current           = r1
  const r2Ref           = useRef(r2);           r2Ref.current           = r2
  const stateRef        = useRef(state);        stateRef.current        = state
  const toolRef         = useRef(tool);         toolRef.current         = tool
  const strokeColorRef  = useRef(strokeColor);  strokeColorRef.current  = strokeColor
  const fillColorRef    = useRef(fillColor);    fillColorRef.current    = fillColor
  const widthRef        = useRef(drawWidth);    widthRef.current        = drawWidth
  const rectRadiusRef   = useRef(rectRadius);   rectRadiusRef.current   = rectRadius
  const activeLayerRef  = useRef(activeLayerId);activeLayerRef.current  = activeLayerId
  const selectModeRef   = useRef(selectMode);  selectModeRef.current   = selectMode
  const selectScopeRef  = useRef(selectScope); selectScopeRef.current  = selectScope
  const snapEnabledRef  = useRef(snapEnabled); snapEnabledRef.current  = snapEnabled
  const shiftRef        = useRef(false)

  // ── Rubber-band / lasso select ref (v0.90.5) ─────────────────────────────
  const rubberRef = useRef<{
    sx0: number; sy0: number; sx1: number; sy1: number
    pts?: Array<{ x: number; y: number }>  // lasso screen coords
  } | null>(null)

  // ── Clipboard interne (v0.90.5) ───────────────────────────────────────────
  const clipboardRef = useRef<{ shapes: NNLShape[]; texts: NNLText[] } | null>(null)

  // toolLayerMapRef supprimé (v0.91) : chaque forme a maintenant son propre calque

  // ── Drag nœud bezier ──────────────────────────────────────────────────────
  const dragPtRef = useRef<{ shapeId: string; ptIdx: number } | null>(null)

  // ── Drag formes (outil Sélection) ─────────────────────────────────────────
  const shapeDragRef = useRef<{
    ids: string[]
    starts: Array<{ x: number; y: number; x2: number; y2: number; pts?: Array<{x:number;y:number}>; polyPts?: Array<{x:number;y:number}> }>
    sx0: number; sy0: number; hasMoved: boolean
  } | null>(null)

  // ── Drag tracé libre (outil Sélection) ───────────────────────────────────
  const strokeDragRef = useRef<{
    ids: string[]
    startPts: Array<Array<{x: number; y: number}>>
    sx0: number; sy0: number; hasMoved: boolean
  } | null>(null)

  // ── Drag texte (outil Sélection) ──────────────────────────────────────────
  const textDragRef = useRef<{
    id: string; wx0: number; wy0: number; sx0: number; sy0: number; hasMoved: boolean
  } | null>(null)

  // ── Rotation forme ────────────────────────────────────────────────────────
  const rotDragRef = useRef<{
    shapeId: string; wCx: number; wCy: number
    startAngle: number; startRotation: number
  } | null>(null)

  // ── Resize bloc texte ─────────────────────────────────────────────────────
  const textResizeRef = useRef<{
    id: string; startW: number; sx0: number
  } | null>(null)

  // ── Resize forme (rect/ellipse corners, arrow endpoints) ──────────────────
  const shapeResizeRef = useRef<{
    shapeId: string
    handle: 'nw'|'ne'|'sw'|'se'|'start'|'end'
    fixedWx: number; fixedWy: number  // coin opposé (non utilisé pour start/end)
  } | null>(null)

  // ── Resize tracé libre ────────────────────────────────────────────────────
  const strokeResizeRef = useRef<{
    handle: 'nw'|'ne'|'sw'|'se'
    wBBox: { minX: number; minY: number; maxX: number; maxY: number }
    origPts: Array<Array<{x: number; y: number}>>   // copies des pts initiaux
    ids: string[]
    sx0: number; sy0: number
  } | null>(null)

  // ── Rotation tracé libre ──────────────────────────────────────────────────
  const strokeRotateDragRef = useRef<{
    wCx: number; wCy: number; startAngle: number
    origPts: Array<Array<{x: number; y: number}>>; ids: string[]
  } | null>(null)

  // ── Rotation texte ────────────────────────────────────────────────────────
  const textRotDragRef = useRef<{
    textId: string; wCx: number; wCy: number
    startAngle: number; startRotation: number
  } | null>(null)

  const items   = state.nnlItems   ?? []
  const shapes  = state.nnlShapes  ?? []
  const texts   = state.nnlTexts   ?? []
  const strokes = state.nnlStrokes ?? []

  // ── Layer visibility filter (propagation groupe → enfants) ──────────────
  const layersDefined = (state.nnlLayers ?? []).length > 0
  const allLayersMap = new Map((state.nnlLayers ?? []).map(l => [l.id, l]))
  const visibleIds = new Set(
    (state.nnlLayers ?? []).filter(l => l.visible !== false).map(l => l.id)
  )
  const isVisible = (layerId?: string) => {
    if (!layersDefined || !layerId) return true
    if (!visibleIds.has(layerId)) return false
    // Bug 6 : si le groupe parent est masqué → masquer l'enfant
    const layer = allLayersMap.get(layerId)
    if (layer?.parentId) {
      const parent = allLayersMap.get(layer.parentId)
      if (parent && parent.visible === false) return false
    }
    return true
  }

  // Ordre de rendu : order croissant → le calque le plus haut (order max) est rendu en dernier = au-dessus
  const layerOrderMap = new Map((state.nnlLayers ?? []).map(l => [l.id, l.order]))
  const byLayerOrder = (layerId?: string) => layerOrderMap.get(layerId ?? '') ?? 0

  const visibleShapes  = shapes.filter(s => isVisible(s.layerId))
    .sort((a, b) => byLayerOrder(a.layerId) - byLayerOrder(b.layerId))
  const visibleTexts   = texts.filter(t => isVisible(t.layerId))
    .sort((a, b) => byLayerOrder(a.layerId) - byLayerOrder(b.layerId))
  const visibleStrokes = strokes.filter(s => isVisible(s.layerId))
    .sort((a, b) => byLayerOrder(a.layerId) - byLayerOrder(b.layerId))

  // ── Grille magnétique (v0.90.5) ───────────────────────────────────────────
  const SNAP_GRID = 20
  function snapW(v: number): number {
    return snapEnabledRef.current ? Math.round(v / SNAP_GRID) * SNAP_GRID : v
  }

  // ── Crée un nouveau calque auto pour chaque forme dessinée (v0.91) ─────────
  // Nommage auto-incrémenté : "Rectangle", "Rectangle 1", "Rectangle 2"…
  // Retourne {layerId, newLayer} — l'appelant est responsable du dispatch et du save.
  function createNewShapeLayer(tool: NNLTool): { layerId: string; newLayer: NNLLayer | null } {
    const TOOL_NAMES: Partial<Record<NNLTool, string>> = {
      rect: 'Rectangle', ellipse: 'Ellipse', arrow: 'Flèche',
      text: 'Texte', pen: 'Stylo', marker: 'Marqueur',
    }
    const baseName = TOOL_NAMES[tool]
    if (!baseName) return { layerId: activeLayerRef.current, newLayer: null }

    const layers = stateRef.current.nnlLayers ?? []
    const nameRe = new RegExp(`^${baseName}( \\d+)?$`)
    const count = layers.filter(l => nameRe.test(l.name)).length
    const name = count === 0 ? baseName : `${baseName} ${count}`
    const layerId = uid()
    const maxOrder = Math.max(0, ...layers.map(l => l.order))
    const newLayer: NNLLayer = {
      id: layerId, name, locked: false, visible: true, order: maxOrder + 1,
      autoCreated: true, shapeType: tool,
    }
    return { layerId, newLayer }
  }

  // ── ResizeObserver ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const { width: W, height: H } = entry.contentRect
      setCanvasSize({ w: W, h: H })
      if (!originInit.current) { originInit.current = true; setOx(0); setOy(H) }
    })
    obs.observe(el); return () => obs.disconnect()
  }, [])

  // ── Keyboard shortcuts (outils) ───────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') return
      // Ne pas intercepter les raccourcis Ctrl/Cmd (Undo/Redo gérés ailleurs)
      if (e.ctrlKey || e.metaKey) return
      // Shift+G : toggle grille magnétique (v0.90.5)
      if (e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setSnapEnabled(prev => !prev)
        return
      }
      const t = KEY_TO_TOOL[e.key.toLowerCase()]
      if (t) { setTool(t); setSelectedShapeId(null); setSelectedShapeIds([]); setSelectedTextId(null) }
      if (e.key === 'Escape') { setPreviewShape(null); setPreviewStroke(null); setEditingText(null); setSelectedShapeId(null); setSelectedShapeIds([]); setSelectedTextId(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── NNL Undo/Redo — snapshot helpers ─────────────────────────────────────
  const captureSnapshot = useCallback((): NNLSnapshot => {
    const st = stateRef.current
    return {
      nnlItems:   st.nnlItems   ?? [],
      nnlShapes:  st.nnlShapes  ?? [],
      nnlTexts:   st.nnlTexts   ?? [],
      nnlStrokes: st.nnlStrokes ?? [],
      nnlLayers:  st.nnlLayers  ?? [],
    }
  }, [])

  // saveNNL : capture l'état courant en snapshot AVANT de sauvegarder le nouvel état
  const saveNNL = useCallback((stateToSave: CadenceState) => {
    const snap = captureSnapshot()
    nnlHistoryRef.current = [...nnlHistoryRef.current.slice(-49), snap]
    nnlFutureRef.current  = []
    setNNLCanUndo(true)
    setNNLCanRedo(false)
    saveToServer(stateToSave)
  }, [saveToServer, captureSnapshot])

  // Ref pour accès stable dans useEffects avec dep=[]
  const saveNNLRef = useRef(saveNNL)
  saveNNLRef.current = saveNNL

  const handleNNLUndo = useCallback(() => {
    if (nnlHistoryRef.current.length === 0) return
    const snap = nnlHistoryRef.current[nnlHistoryRef.current.length - 1]
    nnlFutureRef.current  = [...nnlFutureRef.current, captureSnapshot()]
    nnlHistoryRef.current = nnlHistoryRef.current.slice(0, -1)
    setNNLCanUndo(nnlHistoryRef.current.length > 0)
    setNNLCanRedo(true)
    const newState = { ...stateRef.current, ...snap }
    dispatch({ type: 'SET_STATE', payload: newState })
    saveToServer(newState)
  }, [captureSnapshot, dispatch, saveToServer])

  const handleNNLRedo = useCallback(() => {
    if (nnlFutureRef.current.length === 0) return
    const snap = nnlFutureRef.current[nnlFutureRef.current.length - 1]
    nnlHistoryRef.current = [...nnlHistoryRef.current, captureSnapshot()]
    nnlFutureRef.current  = nnlFutureRef.current.slice(0, -1)
    setNNLCanUndo(true)
    setNNLCanRedo(nnlFutureRef.current.length > 0)
    const newState = { ...stateRef.current, ...snap }
    dispatch({ type: 'SET_STATE', payload: newState })
    saveToServer(newState)
  }, [captureSnapshot, dispatch, saveToServer])

  // ── Ctrl+Z / Ctrl+Y — Undo/Redo NNL ─────────────────────────────────────
  const handleNNLUndoRef = useRef(handleNNLUndo)
  handleNNLUndoRef.current = handleNNLUndo
  const handleNNLRedoRef = useRef(handleNNLRedo)
  handleNNLRedoRef.current = handleNNLRedo

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleNNLUndoRef.current() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleNNLRedoRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Copier / Coller / Dupliquer / Grouper (v0.90.5) ─────────────────────
  const selectedShapeIdRef   = useRef(selectedShapeId);   selectedShapeIdRef.current   = selectedShapeId
  const selectedShapeIdsRef  = useRef(selectedShapeIds);  selectedShapeIdsRef.current  = selectedShapeIds
  const selectedTextIdRef    = useRef(selectedTextId);    selectedTextIdRef.current    = selectedTextId
  const selectedPtIdxRef     = useRef(selectedPtIdx);     selectedPtIdxRef.current     = selectedPtIdx
  const selectedStrokeIdsRef = useRef(selectedStrokeIds); selectedStrokeIdsRef.current = selectedStrokeIds

  function handlePaste(cb: { shapes: NNLShape[]; texts: NNLText[] }, offset: number) {
    const st = stateRef.current
    const newShapes = cb.shapes.map(s => ({
      ...s, id: uid(),
      x: s.x + offset, y: s.y + offset,
      x2: s.x2 + offset, y2: s.y2 + offset,
      ...(s.pts ? { pts: s.pts.map(p => ({ x: p.x + offset, y: p.y + offset })) } : {}),
    }))
    const newTexts = cb.texts.map(t => ({
      ...t, id: uid(), x: t.x + offset, y: t.y + offset,
    }))
    newShapes.forEach(s => dispatch({ type: 'ADD_NNL_SHAPE', payload: s }))
    newTexts.forEach(t => dispatch({ type: 'ADD_NNL_TEXT', payload: t }))
    if (newShapes.length > 0) {
      setSelectedShapeIds(newShapes.map(s => s.id))
      setSelectedShapeId(newShapes[0].id)
      setSelectedTextId(null)
    } else if (newTexts.length > 0) {
      setSelectedTextId(newTexts[0].id)
      setSelectedShapeIds([])
      setSelectedShapeId(null)
    }
    saveNNLRef.current({
      ...st,
      nnlShapes: [...(st.nnlShapes ?? []), ...newShapes],
      nnlTexts:  [...(st.nnlTexts  ?? []), ...newTexts],
    })
  }

  function handleGroup() {
    const shapeIds = selectedShapeIdsRef.current
    if (shapeIds.length < 2) return
    const groupId = uid()
    const st = stateRef.current
    const newShapes = (st.nnlShapes ?? []).map(s =>
      shapeIds.includes(s.id) ? { ...s, shapeGroupId: groupId } : s
    )
    dispatch({ type: 'SET_STATE', payload: { ...st, nnlShapes: newShapes } })
    saveNNLRef.current({ ...st, nnlShapes: newShapes })
  }

  function handleUngroup() {
    const shapeIds = selectedShapeIdsRef.current
    if (shapeIds.length === 0) return
    const st = stateRef.current
    const groupIds = new Set(
      (st.nnlShapes ?? []).filter(s => shapeIds.includes(s.id)).map(s => s.shapeGroupId).filter(Boolean)
    )
    if (groupIds.size === 0) return
    const newShapes = (st.nnlShapes ?? []).map(s =>
      s.shapeGroupId && groupIds.has(s.shapeGroupId) ? { ...s, shapeGroupId: undefined } : s
    )
    dispatch({ type: 'SET_STATE', payload: { ...st, nnlShapes: newShapes } })
    saveNNLRef.current({ ...st, nnlShapes: newShapes })
  }

  const handlePasteRef  = useRef(handlePaste);  handlePasteRef.current  = handlePaste
  const handleGroupRef  = useRef(handleGroup);  handleGroupRef.current  = handleGroup
  const handleUngroupRef = useRef(handleUngroup); handleUngroupRef.current = handleUngroup

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') return
      if (!e.ctrlKey && !e.metaKey) return
      const shapeIds = selectedShapeIdsRef.current
      const textId   = selectedTextIdRef.current
      if (e.key === 'c') {
        e.preventDefault()
        const shapes = (stateRef.current.nnlShapes ?? []).filter(s => shapeIds.includes(s.id))
        const texts  = textId ? (stateRef.current.nnlTexts  ?? []).filter(t => t.id === textId) : []
        if (shapes.length > 0 || texts.length > 0) clipboardRef.current = { shapes, texts }
      }
      if (e.key === 'v') {
        e.preventDefault()
        if (clipboardRef.current) handlePasteRef.current(clipboardRef.current, 20)
      }
      if (e.key === 'd') {
        e.preventDefault()
        const shapes = (stateRef.current.nnlShapes ?? []).filter(s => shapeIds.includes(s.id))
        const texts  = textId ? (stateRef.current.nnlTexts  ?? []).filter(t => t.id === textId) : []
        if (shapes.length > 0 || texts.length > 0) handlePasteRef.current({ shapes, texts }, 20)
      }
      if (e.key === 'g' && !e.shiftKey) { e.preventDefault(); handleGroupRef.current() }
      if (e.key === 'g' &&  e.shiftKey) { e.preventDefault(); handleUngroupRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  // ── Delete key : nœud bezier, forme(s), texte ou tracé sélectionné ────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') return
      if (e.key !== 'Delete' && e.key !== 'Backspace') return

      const shapeId  = selectedShapeIdRef.current
      const shapeIds = selectedShapeIdsRef.current
      const textId   = selectedTextIdRef.current
      const ptIdx    = selectedPtIdxRef.current

      // Supprimer un nœud bezier sélectionné (priorité)
      if (shapeId && ptIdx !== null) {
        const shape = (stateRef.current.nnlShapes ?? []).find(s => s.id === shapeId)
        if (shape?.pts && shape.pts.length > 0) {
          const newPts = shape.pts.filter((_, i) => i !== ptIdx)
          const updated = { ...shape, pts: newPts }
          dispatch({ type: 'UPDATE_NNL_SHAPE', payload: updated })
          saveNNLRef.current({ ...stateRef.current, nnlShapes: (stateRef.current.nnlShapes ?? []).map(s => s.id === shapeId ? updated : s) })
          setSelectedPtIdx(null)
          return
        }
      }

      // Supprimer le(s) tracé(s) libre(s) sélectionné(s) + calques vides
      const strokeIds = selectedStrokeIdsRef.current ?? []
      if (strokeIds.length > 0 && shapeIds.length === 0) {
        const st = stateRef.current
        let newStrokes = st.nnlStrokes ?? []
        let newLayers  = st.nnlLayers  ?? []
        for (const sid of strokeIds) {
          const del = newStrokes.find(s => s.id === sid)
          const layerId = del?.layerId
          dispatch({ type: 'DELETE_NNL_STROKE', payload: sid })
          newStrokes = newStrokes.filter(s => s.id !== sid)
          if (layerId) {
            const layer = newLayers.find(l => l.id === layerId)
            const hasContent = [...(st.nnlShapes ?? []), ...(st.nnlTexts ?? []), ...newStrokes].some(x => x.layerId === layerId)
            if (layer?.autoCreated && !hasContent) {
              newLayers = newLayers.filter(l => l.id !== layerId)
              dispatch({ type: 'SET_NNL_LAYERS', payload: newLayers })
              if (activeLayerRef.current === layerId) {
                const fallback = newLayers.find(l => !l.isGroup)
                if (fallback) setActiveLayerId(fallback.id)
              }
            }
          }
        }
        saveNNLRef.current({ ...st, nnlStrokes: newStrokes, nnlLayers: newLayers })
        setSelectedStrokeIds([])
        return
      }

      // Supprimer le texte sélectionné + calque vide
      if (textId && shapeIds.length === 0) {
        const st = stateRef.current
        const del = (st.nnlTexts ?? []).find(t => t.id === textId)
        const layerId = del?.layerId
        dispatch({ type: 'DELETE_NNL_TEXT', payload: textId })
        let newLayers = st.nnlLayers ?? []
        if (layerId) {
          const layer = newLayers.find(l => l.id === layerId)
          const newTexts = (st.nnlTexts ?? []).filter(t => t.id !== textId)
          const hasContent = [...(st.nnlShapes ?? []), ...newTexts, ...(st.nnlStrokes ?? [])].some(x => x.layerId === layerId)
          if (layer?.autoCreated && !hasContent) {
            newLayers = newLayers.filter(l => l.id !== layerId)
            dispatch({ type: 'SET_NNL_LAYERS', payload: newLayers })
            if (activeLayerRef.current === layerId) {
              const fallback = newLayers.find(l => !l.isGroup)
              if (fallback) setActiveLayerId(fallback.id)
            }
          }
        }
        saveNNLRef.current({ ...st, nnlTexts: (st.nnlTexts ?? []).filter(t => t.id !== textId), nnlLayers: newLayers })
        setSelectedTextId(null)
        return
      }

      // Supprimer la/les forme(s) sélectionnée(s) + auto-suppression des calques vides
      if (shapeIds.length === 0) return
      const st = stateRef.current
      let newShapes = st.nnlShapes ?? []
      let newLayers = st.nnlLayers ?? []

      for (const id of shapeIds) {
        const deletedShape = newShapes.find(s => s.id === id)
        const layerId = deletedShape?.layerId
        dispatch({ type: 'DELETE_NNL_SHAPE', payload: id })
        newShapes = newShapes.filter(s => s.id !== id)
        if (layerId) {
          // v0.91 : supprimer le calque auto-créé s'il est vide
          const layer = newLayers.find(l => l.id === layerId)
          const isAutoLayer = layer?.autoCreated === true
          const hasContent = [...newShapes, ...(st.nnlTexts ?? []), ...(st.nnlStrokes ?? [])].some(x => x.layerId === layerId)
          if (isAutoLayer && !hasContent) {
            newLayers = newLayers.filter(l => l.id !== layerId)
            dispatch({ type: 'SET_NNL_LAYERS', payload: newLayers })
            if (activeLayerRef.current === layerId) {
              const fallback = newLayers.find(l => !l.isGroup)
              if (fallback) setActiveLayerId(fallback.id)
            }
          }
        }
      }

      saveNNLRef.current({ ...st, nnlShapes: newShapes, nnlLayers: newLayers })
      setSelectedShapeId(null)
      setSelectedShapeIds([])
      setSelectedPtIdx(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  // ── Shift tracking ────────────────────────────────────────────────────────
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = true }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftRef.current = false }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  // ── Zoom molette ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top
      const factor  = e.deltaY < 0 ? 1.12 : 1/1.12
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * factor))
      const wx = (cx - oxRef.current) / zoomRef.current
      const wy = (oyRef.current - cy) / zoomRef.current
      setZoom(newZoom); setOx(cx - wx*newZoom); setOy(cy + wy*newZoom)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Pan / Draw / Stroke / Eraser ──────────────────────────────────────────
  const panRef    = useRef<{ ox0: number; oy0: number; sx0: number; sy0: number } | null>(null)
  const drawRef   = useRef<{ id: string; sx0: number; sy0: number } | null>(null)
  const strokeRef = useRef<{ id: string; pts: Array<{x:number;y:number}> } | null>(null)
  const eraserRef = useRef(false)

  // Sauvegarde incluant optionnellement un nouveau calque auto-créé (v0.91)
  function saveNNLWithNewLayer(newLayer: NNLLayer | null, extras: object) {
    const st = stateRef.current
    const layers = newLayer ? [...(st.nnlLayers ?? []), newLayer] : (st.nnlLayers ?? [])
    saveNNLRef.current({ ...st, ...extras, nnlLayers: layers })
  }

  // Helper: apply Shift-constrain to world coords (square/circle)
  function applyShiftConstrain(p1: {x:number;y:number}, p2: {x:number;y:number}): {x:number;y:number} {
    if (!shiftRef.current) return p2
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    const dim = Math.max(Math.abs(dx), Math.abs(dy))
    return { x: p1.x + dim * Math.sign(dx || 1), y: p1.y + dim * Math.sign(dy || 1) }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      // Drag nœud bezier
      if (dragPtRef.current) {
        const el = canvasRef.current; if (!el) return
        const rect = el.getBoundingClientRect()
        const p = s2w(e.clientX - rect.left, e.clientY - rect.top, oxRef.current, oyRef.current, zoomRef.current)
        const { shapeId, ptIdx } = dragPtRef.current
        const shape = (stateRef.current.nnlShapes ?? []).find(s => s.id === shapeId)
        if (shape?.pts) {
          const newPts = [...shape.pts]; newPts[ptIdx] = p
          dispatch({ type: 'UPDATE_NNL_SHAPE', payload: { ...shape, pts: newPts } })
        }
        return
      }

      // Drag formes (outil Sélection)
      if (shapeDragRef.current) {
        const dr = shapeDragRef.current
        const z = zoomRef.current
        const dwx = (e.clientX - dr.sx0) / z
        const dwy = -(e.clientY - dr.sy0) / z
        if (!dr.hasMoved && (Math.abs(e.clientX - dr.sx0) > 2 || Math.abs(e.clientY - dr.sy0) > 2)) {
          dr.hasMoved = true
        }
        if (dr.hasMoved) {
          const shapes = stateRef.current.nnlShapes ?? []
          dr.ids.forEach((id, idx) => {
            const start = dr.starts[idx]
            if (!start) return
            const s = shapes.find(sh => sh.id === id)
            if (!s) return
            // Snap uniquement sur l'origine — préserve les dimensions
            const snX = snapW(start.x + dwx), snY = snapW(start.y + dwy)
            const aDwx = snX - start.x, aDwy = snY - start.y
            const updated: NNLShape = {
              ...s,
              x: snX, y: snY,
              x2: start.x2 + aDwx, y2: start.y2 + aDwy,
              ...(start.pts     ? { pts:     start.pts.map(pt     => ({ x: pt.x     + aDwx, y: pt.y     + aDwy })) } : {}),
              ...(start.polyPts ? { polyPts: start.polyPts.map(pt => ({ x: pt.x + aDwx, y: pt.y + aDwy })) } : {}),
            }
            dispatch({ type: 'UPDATE_NNL_SHAPE', payload: updated })
          })
        }
        return
      }

      // Drag tracé libre (outil Sélection)
      if (strokeDragRef.current) {
        const dr = strokeDragRef.current
        const z = zoomRef.current
        const dwx = (e.clientX - dr.sx0) / z
        const dwy = -(e.clientY - dr.sy0) / z
        if (!dr.hasMoved && (Math.abs(e.clientX - dr.sx0) > 2 || Math.abs(e.clientY - dr.sy0) > 2)) {
          dr.hasMoved = true
        }
        if (dr.hasMoved) {
          const allStrokes = stateRef.current.nnlStrokes ?? []
          dr.ids.forEach((id, idx) => {
            const stroke = allStrokes.find(s => s.id === id)
            if (!stroke) return
            const origPts = dr.startPts[idx]
            const newPts = origPts.map(p => ({ x: p.x + dwx, y: p.y + dwy }))
            dispatch({ type: 'UPDATE_NNL_STROKE', payload: { ...stroke, pts: newPts } })
          })
        }
        return
      }

      // Resize tracé libre
      if (strokeResizeRef.current) {
        const dr = strokeResizeRef.current
        const el = canvasRef.current; if (!el) return
        const rect = el.getBoundingClientRect()
        const curr = s2w(e.clientX - rect.left, e.clientY - rect.top, oxRef.current, oyRef.current, zoomRef.current)
        const { handle, wBBox, origPts, ids } = dr
        const fixedX = (handle === 'nw' || handle === 'sw') ? wBBox.maxX : wBBox.minX
        const fixedY = (handle === 'nw' || handle === 'ne') ? wBBox.minY : wBBox.maxY
        const nMinX = Math.min(curr.x, fixedX), nMaxX = Math.max(curr.x, fixedX)
        const nMinY = Math.min(curr.y, fixedY), nMaxY = Math.max(curr.y, fixedY)
        const ow = wBBox.maxX - wBBox.minX, oh = wBBox.maxY - wBBox.minY
        if (ow === 0 || oh === 0) return
        const nw2 = nMaxX - nMinX, nh2 = nMaxY - nMinY
        const allStrokes = stateRef.current.nnlStrokes ?? []
        ids.forEach((id, idx) => {
          const stroke = allStrokes.find(s => s.id === id)
          if (!stroke) return
          const newPts = origPts[idx].map(p => ({
            x: nMinX + ((p.x - wBBox.minX) / ow) * nw2,
            y: nMinY + ((p.y - wBBox.minY) / oh) * nh2,
          }))
          dispatch({ type: 'UPDATE_NNL_STROKE', payload: { ...stroke, pts: newPts } })
        })
        return
      }

      // Rotation tracé libre
      if (strokeRotateDragRef.current) {
        const dr = strokeRotateDragRef.current
        const sp = w2s(dr.wCx, dr.wCy, oxRef.current, oyRef.current, zoomRef.current)
        const currentAngle = Math.atan2(e.clientY - sp.y, e.clientX - sp.x)
        const delta = currentAngle - dr.startAngle
        // Screen CW = world -delta (Y inverted)
        const cos = Math.cos(-delta), sin = Math.sin(-delta)
        const allStrokes = stateRef.current.nnlStrokes ?? []
        dr.ids.forEach((id, idx) => {
          const stroke = allStrokes.find(s => s.id === id)
          if (!stroke) return
          const newPts = dr.origPts[idx].map(p => {
            const dx = p.x - dr.wCx, dy = p.y - dr.wCy
            return { x: dr.wCx + dx*cos - dy*sin, y: dr.wCy + dx*sin + dy*cos }
          })
          dispatch({ type: 'UPDATE_NNL_STROKE', payload: { ...stroke, pts: newPts } })
        })
        return
      }

      // Drag texte (outil Sélection)
      if (textDragRef.current) {
        const dr = textDragRef.current
        const z = zoomRef.current
        const dwx = (e.clientX - dr.sx0) / z
        const dwy = -(e.clientY - dr.sy0) / z
        if (!dr.hasMoved && (Math.abs(e.clientX - dr.sx0) > 2 || Math.abs(e.clientY - dr.sy0) > 2)) {
          dr.hasMoved = true
        }
        if (dr.hasMoved) {
          const texts = stateRef.current.nnlTexts ?? []
          const t = texts.find(tx => tx.id === dr.id)
          if (t) dispatch({ type: 'UPDATE_NNL_TEXT', payload: { ...t, x: snapW(dr.wx0 + dwx), y: snapW(dr.wy0 + dwy) } })  // texte : snap direct (pas de x2)
        }
        return
      }

      // Rotation forme
      if (rotDragRef.current) {
        const dr = rotDragRef.current
        const sp = w2s(dr.wCx, dr.wCy, oxRef.current, oyRef.current, zoomRef.current)
        const currentAngle = Math.atan2(e.clientY - sp.y, e.clientX - sp.x)
        const newRot = dr.startRotation + (currentAngle - dr.startAngle) * (180 / Math.PI)
        const shape = (stateRef.current.nnlShapes ?? []).find(s => s.id === dr.shapeId)
        if (shape) dispatch({ type: 'UPDATE_NNL_SHAPE', payload: { ...shape, rotation: newRot } })
        return
      }

      // Rotation texte
      if (textRotDragRef.current) {
        const dr = textRotDragRef.current
        const sp = w2s(dr.wCx, dr.wCy, oxRef.current, oyRef.current, zoomRef.current)
        const currentAngle = Math.atan2(e.clientY - sp.y, e.clientX - sp.x)
        const newRot = dr.startRotation + (currentAngle - dr.startAngle) * (180 / Math.PI)
        const t = (stateRef.current.nnlTexts ?? []).find(tx => tx.id === dr.textId)
        if (t) dispatch({ type: 'UPDATE_NNL_TEXT', payload: { ...t, rotation: newRot } })
        return
      }

      // Resize bloc texte
      if (textResizeRef.current) {
        const dr = textResizeRef.current
        const z = zoomRef.current
        const newW = Math.max(40 / z, dr.startW + (e.clientX - dr.sx0) / z)
        const texts = stateRef.current.nnlTexts ?? []
        const t = texts.find(tx => tx.id === dr.id)
        if (t) dispatch({ type: 'UPDATE_NNL_TEXT', payload: { ...t, w: newW } })
        return
      }

      // Resize forme (v0.91)
      if (shapeResizeRef.current) {
        const { shapeId, handle, fixedWx, fixedWy } = shapeResizeRef.current
        const el = canvasRef.current; if (!el) return
        const rect = el.getBoundingClientRect()
        const newW = s2w(e.clientX - rect.left, e.clientY - rect.top, oxRef.current, oyRef.current, zoomRef.current)
        const shapes = stateRef.current.nnlShapes ?? []
        const shape = shapes.find(s => s.id === shapeId)
        if (!shape) return
        if (handle === 'start') {
          dispatch({ type: 'UPDATE_NNL_SHAPE', payload: { ...shape, x: snapW(newW.x), y: snapW(newW.y) } })
        } else if (handle === 'end') {
          dispatch({ type: 'UPDATE_NNL_SHAPE', payload: { ...shape, x2: snapW(newW.x), y2: snapW(newW.y) } })
        } else {
          // Corner resize : le coin glissé suit la souris, le coin fixe ne bouge pas
          const nx = snapW(newW.x), ny = snapW(newW.y)
          dispatch({ type: 'UPDATE_NNL_SHAPE', payload: {
            ...shape,
            x:  Math.min(nx, fixedWx), x2: Math.max(nx, fixedWx),
            y:  Math.max(ny, fixedWy), y2: Math.min(ny, fixedWy),
          }})
        }
        return
      }

      if (panRef.current) {
        setOx(panRef.current.ox0 + e.clientX - panRef.current.sx0)
        setOy(panRef.current.oy0 + e.clientY - panRef.current.sy0)
        return
      }
      // Shape preview
      if (drawRef.current) {
        const el = canvasRef.current; if (!el) return
        const rect = el.getBoundingClientRect()
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top
        const p1 = s2w(drawRef.current.sx0, drawRef.current.sy0, oxRef.current, oyRef.current, zoomRef.current)
        let p2   = s2w(sx, sy, oxRef.current, oyRef.current, zoomRef.current)
        if (toolRef.current === 'rect' || toolRef.current === 'ellipse') {
          p2 = applyShiftConstrain(p1, p2)
        }
        setPreviewShape(prev => prev ? {
          ...prev, x: p1.x, y: p1.y, x2: p2.x, y2: p2.y,
          stroke: strokeColorRef.current, strokeWidth: widthRef.current,
          fill: fillColorRef.current,
        } : null)
        return
      }
      // Stroke preview
      if (strokeRef.current) {
        const el = canvasRef.current; if (!el) return
        const rect = el.getBoundingClientRect()
        const p = s2w(e.clientX - rect.left, e.clientY - rect.top, oxRef.current, oyRef.current, zoomRef.current)
        strokeRef.current.pts.push(p)
        setPreviewStroke(prev => prev ? { ...prev, pts: [...strokeRef.current!.pts] } : null)
        return
      }
      // Eraser
      if (eraserRef.current) {
        const el = canvasRef.current; if (!el) return
        const rect = el.getBoundingClientRect()
        const p = s2w(e.clientX - rect.left, e.clientY - rect.top, oxRef.current, oyRef.current, zoomRef.current)
        const RADIUS = 16 / zoomRef.current
        const st = stateRef.current
        ;(st.nnlStrokes ?? []).filter(s =>
          s.pts.some(pt => Math.hypot(pt.x - p.x, pt.y - p.y) < RADIUS)
        ).forEach(s => dispatch({ type: 'DELETE_NNL_STROKE', payload: s.id }))
        ;(st.nnlShapes ?? []).filter(s => {
          const minX = Math.min(s.x, s.x2) - RADIUS, maxX = Math.max(s.x, s.x2) + RADIUS
          const minY = Math.min(s.y, s.y2) - RADIUS, maxY = Math.max(s.y, s.y2) + RADIUS
          return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
        }).forEach(s => dispatch({ type: 'DELETE_NNL_SHAPE', payload: s.id }))
        ;(st.nnlTexts ?? []).filter(t =>
          Math.hypot(p.x - t.x, p.y - t.y) < t.w / 2 + RADIUS
        ).forEach(t => dispatch({ type: 'DELETE_NNL_TEXT', payload: t.id }))
        return
      }
      // Rubber-band / lasso update (v0.90.5)
      if (rubberRef.current) {
        rubberRef.current.sx1 = e.clientX
        rubberRef.current.sy1 = e.clientY
        const el = canvasRef.current; if (!el) return
        const relRect = el.getBoundingClientRect()
        const x0 = rubberRef.current.sx0 - relRect.left
        const y0 = rubberRef.current.sy0 - relRect.top
        const x1 = e.clientX - relRect.left
        const y1 = e.clientY - relRect.top
        if (selectModeRef.current === 'lasso') {
          // Lasso : accumuler les points écran
          if (!rubberRef.current.pts) rubberRef.current.pts = [{ x: x0, y: y0 }]
          rubberRef.current.pts.push({ x: x1, y: y1 })
          setLassoPts([...rubberRef.current.pts])
        } else {
          // Rect : bounding-box classique
          if (Math.hypot(x1 - x0, y1 - y0) > 4) {
            setRubberRect({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) })
          }
        }
      }
    }
    function onUp(e: MouseEvent) {
      // Fin drag nœud bezier
      if (dragPtRef.current) {
        dragPtRef.current = null
        saveNNLRef.current(stateRef.current)
        return
      }
      // Fin drag formes
      if (shapeDragRef.current) {
        const hasMoved = shapeDragRef.current.hasMoved
        shapeDragRef.current = null
        if (hasMoved) saveNNLRef.current(stateRef.current)
        return
      }
      // Fin drag tracé libre
      if (strokeDragRef.current) {
        const hasMoved = strokeDragRef.current.hasMoved
        strokeDragRef.current = null
        if (hasMoved) saveNNLRef.current(stateRef.current)
        return
      }
      // Fin drag texte
      if (textDragRef.current) {
        const hasMoved = textDragRef.current.hasMoved
        textDragRef.current = null
        if (hasMoved) saveNNLRef.current(stateRef.current)
        return
      }
      // Fin resize tracé libre
      if (strokeResizeRef.current) {
        strokeResizeRef.current = null
        saveNNLRef.current(stateRef.current)
        return
      }
      // Fin rotation tracé libre
      if (strokeRotateDragRef.current) {
        strokeRotateDragRef.current = null
        saveNNLRef.current(stateRef.current)
        return
      }
      // Fin rotation forme
      if (rotDragRef.current) {
        rotDragRef.current = null
        saveNNLRef.current(stateRef.current)
        return
      }
      // Fin rotation texte
      if (textRotDragRef.current) {
        textRotDragRef.current = null
        saveNNLRef.current(stateRef.current)
        return
      }
      // Fin resize forme (v0.91)
      if (shapeResizeRef.current) {
        shapeResizeRef.current = null
        saveNNLRef.current(stateRef.current)
        return
      }
      // Fin resize texte
      if (textResizeRef.current) {
        textResizeRef.current = null
        saveNNLRef.current(stateRef.current)
        return
      }
      if (panRef.current) { panRef.current = null; setIsPanning(false); return }
      // Finaliser rubber-band / lasso (v0.90.5)
      if (rubberRef.current) {
        const el = canvasRef.current
        if (!el) { rubberRef.current = null; setRubberRect(null); setLassoPts(null); return }
        const relRect = el.getBoundingClientRect()
        const x0 = rubberRef.current.sx0 - relRect.left
        const y0 = rubberRef.current.sy0 - relRect.top
        const x1 = e.clientX - relRect.left
        const y1 = e.clientY - relRect.top
        const isLasso = selectModeRef.current === 'lasso'
        const lassoPtsSnap = isLasso ? (rubberRef.current.pts ?? []) : null
        rubberRef.current = null; setRubberRect(null); setLassoPts(null)

        if (Math.hypot(x1 - x0, y1 - y0) > 4) {
          const scope = selectScopeRef.current, activeLayer = activeLayerRef.current
          const st = stateRef.current
          let hitShapes: typeof st.nnlShapes
          let hitTexts: typeof st.nnlTexts

          if (isLasso && lassoPtsSnap && lassoPtsSnap.length >= 3) {
            // Lasso : point-in-polygon sur les centres (coords canvas-relative)
            // w2s() retourne déjà des coords canvas-relatives — NE PAS soustraire relRect
            function pointInPolygon(px: number, py: number, poly: Array<{ x: number; y: number }>): boolean {
              let inside = false
              for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y
                const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
                if (intersect) inside = !inside
              }
              return inside
            }
            hitShapes = (st.nnlShapes ?? []).filter(s => {
              if (scope === 'active' && s.layerId !== activeLayer) return false
              const sc = w2s((s.x + s.x2) / 2, (s.y + s.y2) / 2, oxRef.current, oyRef.current, zoomRef.current)
              return pointInPolygon(sc.x, sc.y, lassoPtsSnap)
            })
            hitTexts = (st.nnlTexts ?? []).filter(t => {
              if (scope === 'active' && t.layerId !== activeLayer) return false
              const sc = w2s(t.x, t.y, oxRef.current, oyRef.current, zoomRef.current)
              return pointInPolygon(sc.x, sc.y, lassoPtsSnap)
            })
            const hitStrokes = (st.nnlStrokes ?? []).filter(stroke => {
              if (scope === 'active' && stroke.layerId !== activeLayer) return false
              if (stroke.pts.length === 0) return false
              const mid = stroke.pts[Math.floor(stroke.pts.length / 2)]
              const sc = w2s(mid.x, mid.y, oxRef.current, oyRef.current, zoomRef.current)
              return pointInPolygon(sc.x, sc.y, lassoPtsSnap)
            })
            setSelectedStrokeIds(hitStrokes.map(s => s.id))
          } else {
            // Rect : bounding-box classique
            const p1 = s2w(Math.min(x0, x1), Math.min(y0, y1), oxRef.current, oyRef.current, zoomRef.current)
            const p2 = s2w(Math.max(x0, x1), Math.max(y0, y1), oxRef.current, oyRef.current, zoomRef.current)
            const wxMin = Math.min(p1.x, p2.x), wxMax = Math.max(p1.x, p2.x)
            const wyMin = Math.min(p1.y, p2.y), wyMax = Math.max(p1.y, p2.y)
            hitShapes = (st.nnlShapes ?? []).filter(s => {
              if (scope === 'active' && s.layerId !== activeLayer) return false
              const mx = (s.x + s.x2) / 2, my = (s.y + s.y2) / 2
              return mx >= wxMin && mx <= wxMax && my >= wyMin && my <= wyMax
            })
            hitTexts = (st.nnlTexts ?? []).filter(t => {
              if (scope === 'active' && t.layerId !== activeLayer) return false
              return t.x >= wxMin && t.x <= wxMax && t.y >= wyMin && t.y <= wyMax
            })
            const hitStrokes = (st.nnlStrokes ?? []).filter(stroke => {
              if (scope === 'active' && stroke.layerId !== activeLayer) return false
              if (stroke.pts.length === 0) return false
              const mid = stroke.pts[Math.floor(stroke.pts.length / 2)]
              return mid.x >= wxMin && mid.x <= wxMax && mid.y >= wyMin && mid.y <= wyMax
            })
            setSelectedStrokeIds(hitStrokes.map(s => s.id))
          }

          if (hitShapes.length > 0 || hitTexts.length > 0) {
            setSelectedShapeIds(hitShapes.map(s => s.id))
            setSelectedShapeId(hitShapes[0]?.id ?? null)
            setSelectedTextId(hitTexts[0]?.id ?? null)
          }
        }
        return
      }
      if (drawRef.current) {
        const el = canvasRef.current; if (!el) return
        const rect = el.getBoundingClientRect()
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top
        // Capturer et effacer IMMÉDIATEMENT pour éviter le tracé fantôme
        const startSx = drawRef.current.sx0, startSy = drawRef.current.sy0
        const drawId  = drawRef.current.id
        drawRef.current = null; setPreviewShape(null)
        let p1 = s2w(startSx, startSy, oxRef.current, oyRef.current, zoomRef.current)
        let p2  = s2w(sx, sy, oxRef.current, oyRef.current, zoomRef.current)
        if (toolRef.current === 'rect' || toolRef.current === 'ellipse') {
          p2 = applyShiftConstrain(p1, p2)
        }
        p1 = { x: snapW(p1.x), y: snapW(p1.y) }
        p2 = { x: snapW(p2.x), y: snapW(p2.y) }
        if (Math.hypot(sx - startSx, sy - startSy) > 4) {
          const shapeType = toolRef.current as 'rect' | 'ellipse' | 'arrow'
          const { layerId, newLayer } = createNewShapeLayer(toolRef.current)
          const shape: NNLShape = {
            id: drawId, shapeType,
            x: p1.x, y: p1.y, x2: p2.x, y2: p2.y,
            stroke: strokeColorRef.current,
            fill:   fillColorRef.current,
            strokeWidth: widthRef.current,
            layerId,
            ...(shapeType === 'rect' && rectRadiusRef.current > 0 ? { rx: rectRadiusRef.current } : {}),
          }
          const st = stateRef.current
          if (newLayer) { dispatch({ type: 'SET_NNL_LAYERS', payload: [...(st.nnlLayers ?? []), newLayer] }); setActiveLayerId(layerId) }
          dispatch({ type: 'ADD_NNL_SHAPE', payload: shape })
          saveNNLWithNewLayer(newLayer, { nnlShapes: [...(st.nnlShapes ?? []), shape] })
        }
        return
      }
      if (strokeRef.current) {
        const pts = strokeRef.current.pts
        const strokeId = strokeRef.current.id
        // Effacer IMMÉDIATEMENT
        strokeRef.current = null; setPreviewStroke(null)
        if (pts.length >= 2) {
          const { layerId, newLayer } = createNewShapeLayer(toolRef.current)
          const stroke: NNLStroke = {
            id: strokeId, pts,
            color: strokeColorRef.current,
            width: widthRef.current,
            opacity: toolRef.current === 'marker' ? 0.45 : 1,
            layerId,
          }
          const st = stateRef.current
          if (newLayer) { dispatch({ type: 'SET_NNL_LAYERS', payload: [...(st.nnlLayers ?? []), newLayer] }); setActiveLayerId(layerId) }
          dispatch({ type: 'ADD_NNL_STROKE', payload: stroke })
          saveNNLWithNewLayer(newLayer, { nnlStrokes: [...(st.nnlStrokes ?? []), stroke] })
        }
        return
      }
      if (eraserRef.current) {
        eraserRef.current = false
        saveNNLRef.current(stateRef.current)
        return
      }
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dispatch])

  // ── Drag post-it ──────────────────────────────────────────────────────────
  const dragRef = useRef<{ id: string; wx0: number; wy0: number; sx0: number; sy0: number } | null>(null)
  const handleDragStart = useCallback((id: string, e: React.MouseEvent) => {
    if (toolRef.current !== 'select') return
    e.preventDefault(); e.stopPropagation()
    const item = (stateRef.current.nnlItems ?? []).find(n => n.id === id)
    if (!item) return
    dragRef.current = { id, wx0: item.x, wy0: item.y, sx0: e.clientX, sy0: e.clientY }
  }, [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return
      const { id, wx0, wy0, sx0, sy0 } = dragRef.current
      const z = zoomRef.current
      const nx = wx0 + (e.clientX - sx0) / z
      const ny = wy0 - (e.clientY - sy0) / z
      const item = (stateRef.current.nnlItems ?? []).find(n => n.id === id)
      if (item) dispatch({ type: 'UPDATE_NNL_ITEM', payload: { ...item, x: nx, y: ny, zone: zoneFromWorld(nx, ny, r1Ref.current, r2Ref.current) } })
    }
    function onUp() {
      if (!dragRef.current) return
      const id = dragRef.current.id; dragRef.current = null
      const st = stateRef.current
      const item = (st.nnlItems ?? []).find(n => n.id === id)
      if (item) saveNNLRef.current({ ...st, nnlItems: (st.nnlItems ?? []).map(n => n.id === id ? item : n) })
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dispatch])

  // ── Canvas mousedown ──────────────────────────────────────────────────────
  function onCanvasMouseDown(e: React.MouseEvent) {
    const el = canvasRef.current; if (!el) return

    // Bug 4 : clic milieu → pan (quel que soit l'outil actif)
    if (e.button === 1) {
      e.preventDefault()
      panRef.current = { ox0: ox, oy0: oy, sx0: e.clientX, sy0: e.clientY }
      setIsPanning(true)
      return
    }
    // Seulement clic gauche pour le reste
    if (e.button !== 0) return

    const rect = el.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const t = tool

    if (t === 'select') {
      if ((e.target as HTMLElement).closest('.nnl-postit')) return

      // Mode rect / lasso : démarre directement le rubber-band sans hit-test
      if (selectModeRef.current === 'rect' || selectModeRef.current === 'lasso') {
        setSelectedShapeId(null); setSelectedShapeIds([])
        setSelectedTextId(null); setSelectedStrokeIds([])
        rubberRef.current = { sx0: e.clientX, sy0: e.clientY, sx1: e.clientX, sy1: e.clientY }
        return
      }

      // Mode pointer : hit-test géré ici exclusivement (ShapeLayer SVG est pointerEvents:none)
      const cp = s2w(sx, sy, ox, oy, zoom)
      const THRESH = 6 / zoom

      // Filtre de portée (calque actif uniquement si scope === 'active')
      const scopeShapes  = selectScopeRef.current === 'active'
        ? visibleShapes.filter(s => s.layerId === activeLayerRef.current)
        : visibleShapes
      const scopeTexts   = selectScopeRef.current === 'active'
        ? visibleTexts.filter(t => t.layerId === activeLayerRef.current)
        : visibleTexts
      const scopeStrokes = selectScopeRef.current === 'active'
        ? visibleStrokes.filter(s => s.layerId === activeLayerRef.current)
        : visibleStrokes

      // Hit-test formes
      const hit = scopeShapes.find(s => {
        if (s.shapeType === 'arrow') {
          // Pour les flèches, test de proximité sur le chemin
          const allPts = [{ x: s.x, y: s.y }, ...(s.pts ?? []), { x: s.x2, y: s.y2 }]
          for (let i = 0; i < allPts.length - 1; i++) {
            const a = allPts[i], b = allPts[i+1]
            const dx = b.x - a.x, dy = b.y - a.y
            const len2 = dx*dx + dy*dy
            if (len2 === 0) continue
            const t = Math.max(0, Math.min(1, ((cp.x - a.x)*dx + (cp.y - a.y)*dy) / len2))
            const px = a.x + t*dx, py = a.y + t*dy
            if (Math.hypot(cp.x - px, cp.y - py) < THRESH * 2) return true
          }
          return false
        }
        const minX = Math.min(s.x, s.x2) - THRESH, maxX = Math.max(s.x, s.x2) + THRESH
        const minY = Math.min(s.y, s.y2) - THRESH, maxY = Math.max(s.y, s.y2) + THRESH
        return cp.x >= minX && cp.x <= maxX && cp.y >= minY && cp.y <= maxY
      })

      if (hit) {
        const isShift = e.shiftKey
        let newIds: string[]

        // v0.90.5 : clic sur une forme groupée → sélectionner tout le groupe
        if (hit.shapeGroupId && !isShift) {
          const groupShapes = visibleShapes.filter(s => s.shapeGroupId === hit.shapeGroupId)
          newIds = groupShapes.map(s => s.id)
        } else if (isShift) {
          // Shift+clic : toggle dans la sélection multiple
          if (selectedShapeIds.includes(hit.id)) {
            newIds = selectedShapeIds.filter(id => id !== hit.id)
          } else {
            newIds = [...selectedShapeIds, hit.id]
          }
        } else {
          // Clic simple : si la forme est déjà dans la sélection multiple, garder la sélection pour drag
          newIds = selectedShapeIds.includes(hit.id) ? selectedShapeIds : [hit.id]
        }
        setSelectedShapeId(hit.id)
        setSelectedShapeIds(newIds)
        setSelectedTextId(null)
        setSelectedStrokeIds([])
        setSelectedPtIdx(null)

        // Démarrer un drag potentiel sur toutes les formes sélectionnées
        const allShapes = stateRef.current.nnlShapes ?? []
        const starts = newIds.map(id => {
          const s = allShapes.find(sh => sh.id === id)
          return s ? { x: s.x, y: s.y, x2: s.x2, y2: s.y2, pts: s.pts ? [...s.pts] : undefined, polyPts: s.polyPts ? [...s.polyPts] : undefined } : null
        }).filter(Boolean) as NonNullable<typeof shapeDragRef.current>['starts']
        shapeDragRef.current = { ids: newIds, starts, sx0: e.clientX, sy0: e.clientY, hasMoved: false }
        return
      }

      // Hit-test textes (visible TextBlocks)
      const hitText = scopeTexts.find(t => {
        const TTHRESH = 6 / zoom
        return cp.x >= t.x - TTHRESH && cp.x <= t.x + t.w + TTHRESH &&
               cp.y >= t.y - TTHRESH && cp.y <= t.y + (t.fontSize ?? 14) * 2 + TTHRESH
      })
      if (hitText) {
        setSelectedTextId(hitText.id)
        setSelectedShapeId(null)
        setSelectedShapeIds([])
        setSelectedStrokeIds([])
        setSelectedPtIdx(null)
        textDragRef.current = { id: hitText.id, wx0: hitText.x, wy0: hitText.y, sx0: e.clientX, sy0: e.clientY, hasMoved: false }
        return
      }

      // Hit-test tracés libres (stylo / marqueur)
      const hitStroke = scopeStrokes.find(stroke => {
        for (let i = 0; i < stroke.pts.length - 1; i++) {
          const a = stroke.pts[i], b = stroke.pts[i+1]
          const dx = b.x - a.x, dy = b.y - a.y
          const len2 = dx*dx + dy*dy
          if (len2 === 0) continue
          const t2 = Math.max(0, Math.min(1, ((cp.x - a.x)*dx + (cp.y - a.y)*dy) / len2))
          const px = a.x + t2*dx, py = a.y + t2*dy
          if (Math.hypot(cp.x - px, cp.y - py) < THRESH * 2) return true
        }
        return false
      })
      if (hitStroke) {
        const isShift = e.shiftKey
        let newIds: string[]
        if (isShift) {
          newIds = selectedStrokeIdsRef.current.includes(hitStroke.id)
            ? selectedStrokeIdsRef.current.filter(id => id !== hitStroke.id)
            : [...selectedStrokeIdsRef.current, hitStroke.id]
        } else {
          newIds = selectedStrokeIdsRef.current.includes(hitStroke.id)
            ? selectedStrokeIdsRef.current
            : [hitStroke.id]
        }
        setSelectedStrokeIds(newIds)
        setSelectedShapeId(null)
        setSelectedShapeIds([])
        setSelectedTextId(null)
        setSelectedPtIdx(null)
        // Démarrer un drag potentiel sur tous les tracés sélectionnés
        const allStrokes = stateRef.current.nnlStrokes ?? []
        const startPts = newIds.map(id => {
          const st = allStrokes.find(s => s.id === id)
          return st ? st.pts.map(p => ({ ...p })) : []
        })
        strokeDragRef.current = { ids: newIds, startPts, sx0: e.clientX, sy0: e.clientY, hasMoved: false }
        return
      }

      // Fond : désélectionner + démarrer rubber-band (v0.90.5)
      setSelectedShapeId(null)
      setSelectedShapeIds([])
      setSelectedTextId(null)
      setSelectedStrokeIds([])
      setSelectedPtIdx(null)
      rubberRef.current = { sx0: e.clientX, sy0: e.clientY, sx1: e.clientX, sy1: e.clientY }
      return
    }

    if (t === 'text') {
      const p = s2w(sx, sy, ox, oy, zoom)
      const { layerId, newLayer } = createNewShapeLayer('text')
      const newText: NNLText = {
        id: uid(), x: snapW(p.x), y: snapW(p.y), w: 200,
        content: 'Texte', fontSize: 14, color: strokeColor,
        layerId,
      }
      const st = stateRef.current
      if (newLayer) { dispatch({ type: 'SET_NNL_LAYERS', payload: [...(st.nnlLayers ?? []), newLayer] }); setActiveLayerId(layerId) }
      dispatch({ type: 'ADD_NNL_TEXT', payload: newText })
      saveNNLWithNewLayer(newLayer, { nnlTexts: [...(st.nnlTexts ?? []), newText] })
      setEditingText(newText)
      setTool('select')
      return
    }

    if (t === 'rect' || t === 'ellipse' || t === 'arrow') {
      const id = uid()
      const p = s2w(sx, sy, ox, oy, zoom)
      drawRef.current = { id, sx0: sx, sy0: sy }
      setPreviewShape({
        id, shapeType: t as 'rect' | 'ellipse' | 'arrow',
        x: p.x, y: p.y, x2: p.x, y2: p.y,
        stroke: strokeColor, fill: fillColor, strokeWidth: drawWidth,
        ...(t === 'rect' && rectRadius > 0 ? { rx: rectRadius } : {}),
      })
      return
    }

    if (t === 'pen' || t === 'marker') {
      const p = s2w(sx, sy, ox, oy, zoom)
      const id = uid()
      strokeRef.current = { id, pts: [p] }
      setPreviewStroke({ id, pts: [p], color: strokeColor, width: drawWidth, opacity: t === 'marker' ? 0.45 : 1 })
      return
    }

    if (t === 'eraser') {
      eraserRef.current = true
      return
    }
  }

  // ── Bezier arrow callbacks ────────────────────────────────────────────────
  function handlePtMouseDown(shapeId: string, ptIdx: number, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedPtIdx(ptIdx)
    dragPtRef.current = { shapeId, ptIdx }
  }

  function handleAddBezierPt(shapeId: string, insertIdx: number, wx: number, wy: number) {
    const shape = (stateRef.current.nnlShapes ?? []).find(s => s.id === shapeId)
    if (!shape) return
    const newPts = [...(shape.pts ?? [])]
    newPts.splice(insertIdx, 0, { x: wx, y: wy })
    const updated = { ...shape, pts: newPts }
    dispatch({ type: 'UPDATE_NNL_SHAPE', payload: updated })
    saveNNL({ ...stateRef.current, nnlShapes: (stateRef.current.nnlShapes ?? []).map(s => s.id === shapeId ? updated : s) })
  }

  // ── Shape properties callbacks ────────────────────────────────────────────
  const selectedShape = selectedShapeId ? (state.nnlShapes ?? []).find(s => s.id === selectedShapeId) ?? null : null

  function handleShapeUpdate(updates: Partial<NNLShape>) {
    if (!selectedShape) return
    dispatch({ type: 'UPDATE_NNL_SHAPE', payload: { ...selectedShape, ...updates } })
  }

  function handleShapeSave() {
    saveNNL(stateRef.current)
  }

  function handleShapeDelete() {
    if (!selectedShapeId) return
    dispatch({ type: 'DELETE_NNL_SHAPE', payload: selectedShapeId })
    const st = stateRef.current
    saveNNL({ ...st, nnlShapes: (st.nnlShapes ?? []).filter(s => s.id !== selectedShapeId) })
    setSelectedShapeId(null)
    setSelectedShapeIds(ids => ids.filter(id => id !== selectedShapeId))
    setSelectedPtIdx(null)
  }

  // ── Text properties callbacks ─────────────────────────────────────────────
  const selectedText = selectedTextId ? (state.nnlTexts ?? []).find(t => t.id === selectedTextId) ?? null : null

  function handleTextUpdate(updates: Partial<NNLText>) {
    if (!selectedText) return
    dispatch({ type: 'UPDATE_NNL_TEXT', payload: { ...selectedText, ...updates } })
  }

  function handleTextSave() {
    saveNNL(stateRef.current)
  }

  function handleTextDelete() {
    if (!selectedTextId) return
    dispatch({ type: 'DELETE_NNL_TEXT', payload: selectedTextId })
    const st = stateRef.current
    saveNNL({ ...st, nnlTexts: (st.nnlTexts ?? []).filter(t => t.id !== selectedTextId) })
    setSelectedTextId(null)
  }

  // ── Boolean operations ────────────────────────────────────────────────────
  function handleBooleanOp(op: 'unite'|'subtract'|'intersect'|'xor'|'divide') {
    const ids = selectedShapeIds
    if (ids.length < 2) return
    const allShapes = stateRef.current.nnlShapes ?? []
    const shapes = ids.map(id => allShapes.find(s => s.id === id)).filter(Boolean) as NNLShape[]
    if (shapes.length < 2) return

    const polys = shapes.map(shapeToPolygon)
    const proto = { ...shapes[0] }

    let newShapes: NNLShape[] = []
    try {
      if (op === 'unite') {
        const r = polygonClipping.union(polys[0], ...polys.slice(1))
        const s = multiPolyToNNLShape(r, proto); if (s) newShapes = [s]

      } else if (op === 'subtract') {
        const r = polygonClipping.difference(polys[0], ...polys.slice(1))
        const s = multiPolyToNNLShape(r, proto); if (s) newShapes = [s]

      } else if (op === 'intersect') {
        const r = polygonClipping.intersection(polys[0], ...polys.slice(1))
        const s = multiPolyToNNLShape(r, proto); if (s) newShapes = [s]

      } else if (op === 'xor') {
        // XOR → peut produire plusieurs polygones disjoints, on les crée tous
        const r = polygonClipping.xor(polys[0], ...polys.slice(1))
        newShapes = multiPolyToNNLShapes(r, proto)

      } else if (op === 'divide') {
        // Divide (style Affinity) : pour 2 formes → A-B + A∩B + B-A
        // Pour N formes → XOR + intersection comme approximation
        if (polys.length === 2) {
          const diff1 = polygonClipping.difference(polys[0], polys[1])
          const inter = polygonClipping.intersection(polys[0], polys[1])
          const diff2 = polygonClipping.difference(polys[1], polys[0])
          // Couleurs distinctes pour les pièces
          const protoB = { ...shapes[1] }
          const s1 = multiPolyToNNLShapes(diff1, proto)
          const s2 = multiPolyToNNLShapes(inter, proto)  // pièce centrale = couleur de A
          const s3 = multiPolyToNNLShapes(diff2, protoB)
          newShapes = [...s1, ...s2, ...s3]
        } else {
          const r = polygonClipping.xor(polys[0], ...polys.slice(1))
          newShapes = multiPolyToNNLShapes(r, proto)
        }
      }
    } catch { newShapes = [] }

    if (newShapes.length === 0) return  // ex. intersection vide

    // Supprimer les formes sources et ajouter les résultats
    ids.forEach(id => dispatch({ type: 'DELETE_NNL_SHAPE', payload: id }))
    newShapes.forEach(s => dispatch({ type: 'ADD_NNL_SHAPE', payload: s }))
    const st = stateRef.current
    const filtered = (st.nnlShapes ?? []).filter(s => !ids.includes(s.id))
    saveNNL({ ...st, nnlShapes: [...filtered, ...newShapes] })
    setSelectedShapeId(newShapes[0].id)
    setSelectedShapeIds(newShapes.map(s => s.id))
  }

  // ── Stroke properties callbacks ───────────────────────────────────────────
  const selectedStrokes = (state.nnlStrokes ?? []).filter(s => selectedStrokeIds.includes(s.id))

  function handleStrokeUpdate(id: string, updates: Partial<NNLStroke>) {
    const stroke = (stateRef.current.nnlStrokes ?? []).find(s => s.id === id)
    if (!stroke) return
    dispatch({ type: 'UPDATE_NNL_STROKE', payload: { ...stroke, ...updates } })
  }

  function handleStrokeSave() {
    saveNNL(stateRef.current)
  }

  function handleStrokeDelete() {
    const ids = selectedStrokeIdsRef.current ?? []
    if (ids.length === 0) return
    const st = stateRef.current
    let newStrokes = st.nnlStrokes ?? []
    let newLayers  = st.nnlLayers  ?? []
    for (const sid of ids) {
      const del = newStrokes.find(s => s.id === sid)
      const layerId = del?.layerId
      dispatch({ type: 'DELETE_NNL_STROKE', payload: sid })
      newStrokes = newStrokes.filter(s => s.id !== sid)
      if (layerId) {
        const layer = newLayers.find(l => l.id === layerId)
        const hasContent = [...(st.nnlShapes ?? []), ...(st.nnlTexts ?? []), ...newStrokes].some(x => x.layerId === layerId)
        if (layer?.autoCreated && !hasContent) {
          newLayers = newLayers.filter(l => l.id !== layerId)
          dispatch({ type: 'SET_NNL_LAYERS', payload: newLayers })
          if (activeLayerRef.current === layerId) {
            const fallback = newLayers.find(l => !l.isGroup)
            if (fallback) setActiveLayerId(fallback.id)
          }
        }
      }
    }
    saveNNL({ ...st, nnlStrokes: newStrokes, nnlLayers: newLayers })
    setSelectedStrokeIds([])
  }

  // ── Rotation forme ────────────────────────────────────────────────────────
  function handleRotateStart(shapeId: string, wCx: number, wCy: number, e: React.MouseEvent) {
    e.stopPropagation()
    const shape = (stateRef.current.nnlShapes ?? []).find(s => s.id === shapeId)
    if (!shape) return
    const sp = w2s(wCx, wCy, oxRef.current, oyRef.current, zoomRef.current)
    rotDragRef.current = {
      shapeId, wCx, wCy,
      startAngle: Math.atan2(e.clientY - sp.y, e.clientX - sp.x),
      startRotation: shape.rotation ?? 0,
    }
  }

  // ── Rotation texte ────────────────────────────────────────────────────────
  function handleTextRotateStart(textId: string, e: React.MouseEvent) {
    e.stopPropagation()
    const t = (stateRef.current.nnlTexts ?? []).find(tx => tx.id === textId)
    if (!t) return
    const wCx = t.x + t.w / 2
    const wCy = t.y
    const sp = w2s(wCx, wCy, oxRef.current, oyRef.current, zoomRef.current)
    textRotDragRef.current = {
      textId, wCx, wCy,
      startAngle: Math.atan2(e.clientY - sp.y, e.clientX - sp.x),
      startRotation: t.rotation ?? 0,
    }
  }

  // ── Resize forme (coins rect/ellipse, endpoints arrow) ───────────────────
  function handleShapeResizeStart(shapeId: string, handle: 'nw'|'ne'|'sw'|'se'|'start'|'end', e: React.MouseEvent) {
    e.stopPropagation()
    const shape = (stateRef.current.nnlShapes ?? []).find(s => s.id === shapeId)
    if (!shape) return
    saveNNLRef.current(stateRef.current)
    // Pour start/end (arrow) : pas de coin fixe nécessaire
    if (handle === 'start' || handle === 'end') {
      shapeResizeRef.current = { shapeId, handle, fixedWx: 0, fixedWy: 0 }
      return
    }
    // Coins rect/ellipse : stocker le coin opposé (world coords)
    const minX = Math.min(shape.x, shape.x2), maxX = Math.max(shape.x, shape.x2)
    const minY = Math.min(shape.y, shape.y2), maxY = Math.max(shape.y, shape.y2)
    // nw (screen top-left) = world (minX, maxY) → fixed = (maxX, minY)
    // ne (screen top-right) = world (maxX, maxY) → fixed = (minX, minY)
    // sw (screen bot-left)  = world (minX, minY) → fixed = (maxX, maxY)
    // se (screen bot-right) = world (maxX, minY) → fixed = (minX, maxY)
    const fx = handle === 'nw' || handle === 'sw' ? maxX : minX
    const fy = handle === 'nw' || handle === 'ne' ? minY : maxY
    shapeResizeRef.current = { shapeId, handle, fixedWx: fx, fixedWy: fy }
  }

  // ── Resize tracé libre ────────────────────────────────────────────────────
  function handleStrokeResizeStart(handle: 'nw'|'ne'|'sw'|'se', wBBox: { minX: number; minY: number; maxX: number; maxY: number }, e: React.MouseEvent) {
    e.stopPropagation()
    const ids = selectedStrokeIdsRef.current ?? []
    if (ids.length === 0) return
    const allStrokes = stateRef.current.nnlStrokes ?? []
    const origPts = ids.map(id => {
      const s = allStrokes.find(st => st.id === id)
      return s ? s.pts.map(p => ({ ...p })) : []
    })
    strokeResizeRef.current = { handle, wBBox, origPts, ids, sx0: e.clientX, sy0: e.clientY }
  }

  // ── Rotation tracé libre ──────────────────────────────────────────────────
  function handleStrokeRotateStart(wCx: number, wCy: number, e: React.MouseEvent) {
    e.stopPropagation()
    const ids = selectedStrokeIdsRef.current ?? []
    if (ids.length === 0) return
    const allStrokes = stateRef.current.nnlStrokes ?? []
    const origPts = ids.map(id => {
      const s = allStrokes.find(st => st.id === id)
      return s ? s.pts.map(p => ({ ...p })) : []
    })
    const sp = w2s(wCx, wCy, oxRef.current, oyRef.current, zoomRef.current)
    strokeRotateDragRef.current = {
      wCx, wCy,
      startAngle: Math.atan2(e.clientY - sp.y, e.clientX - sp.x),
      origPts, ids,
    }
  }

  // ── Resize bloc texte ─────────────────────────────────────────────────────
  function handleTextResizeStart(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const t = (stateRef.current.nnlTexts ?? []).find(tx => tx.id === id)
    if (!t) return
    textResizeRef.current = { id, startW: t.w, sx0: e.clientX }
  }

  // ── Resize circles ────────────────────────────────────────────────────────
  function repositionItems(currentItems: NNLItem[], oldR1: number, oldR2: number, newR1: number, newR2: number): NNLItem[] {
    return currentItems.map(item => {
      const d = Math.sqrt(item.x**2 + item.y**2); if (d < 0.5) return item
      const angle = Math.atan2(item.y, item.x)
      const zone  = zoneFromWorld(item.x, item.y, oldR1, oldR2)
      let newD: number
      if (zone === 'now') { newD = oldR1 > 0 ? d * newR1/oldR1 : d }
      else if (zone === 'next') { const f = (oldR2-oldR1) > 0 ? (d-oldR1)/(oldR2-oldR1) : 0.5; newD = newR1 + f*(newR2-newR1) }
      else { newD = d + (newR2-oldR2) }
      newD = Math.max(1, newD)
      const nx = +(Math.cos(angle)*newD).toFixed(1), ny = +(Math.sin(angle)*newD).toFixed(1)
      return { ...item, x: nx, y: ny, zone: zoneFromWorld(nx, ny, newR1, newR2) }
    })
  }

  const handleResizeR1 = useCallback((newR1: number) => {
    const oldR1 = r1Ref.current, oldR2 = r2Ref.current, newR2 = oldR2 + (newR1-oldR1)
    const moved = repositionItems(stateRef.current.nnlItems ?? [], oldR1, oldR2, newR1, newR2)
    setR1(newR1); setR2(newR2)
    dispatch({ type: 'SET_NNL_ITEMS', payload: moved })
  }, [dispatch])

  const handleResizeR2 = useCallback((newR2: number) => {
    const oldR1 = r1Ref.current, oldR2 = r2Ref.current
    const moved = repositionItems(stateRef.current.nnlItems ?? [], oldR1, oldR2, oldR1, newR2)
    setR2(newR2)
    dispatch({ type: 'SET_NNL_ITEMS', payload: moved })
  }, [dispatch])

  const handleResizeDone = useCallback(() => saveNNLRef.current(stateRef.current), [])

  // ── Item handlers ─────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_NNL_ITEM', payload: id })
    saveNNL({ ...state, nnlItems: (state.nnlItems ?? []).filter(n => n.id !== id) })
    showToast('Post-it supprimé', 'info')
  }

  const handleResizeEnd = useCallback((id: string, w: number, h?: number, wx?: number, wy?: number) => {
    const st = stateRef.current
    const item = (st.nnlItems ?? []).find(n => n.id === id); if (!item) return
    const updated: NNLItem = {
      ...item, w,
      ...(h  !== undefined ? { h } : {}),
      ...(wx !== undefined && wy !== undefined ? { x: wx, y: wy } : {}),
    }
    dispatch({ type: 'UPDATE_NNL_ITEM', payload: updated })
    saveNNLRef.current({ ...st, nnlItems: (st.nnlItems ?? []).map(n => n.id === id ? updated : n) })
  }, [dispatch])

  const handleOpenEdit = (id: string) => {
    const item = (state.nnlItems ?? []).find(n => n.id === id)
    if (item) setEditItem(item)
  }

  function handleModalClose() { setEditItem(null); onModalClose() }

  function handleModalSave(saved: NNLItem) {
    const isCreate = !editItem && modalOpen
    if (isCreate) {
      const pos = newPosForZone(saved.zone, r1Ref.current, r2Ref.current)
      const newItem: NNLItem = { ...saved, id: saved.id || uid(), x: pos.x, y: pos.y }
      dispatch({ type: 'ADD_NNL_ITEM', payload: newItem })
      saveNNL({ ...stateRef.current, nnlItems: [...(stateRef.current.nnlItems ?? []), newItem] })
      showToast('Post-it créé')
    } else {
      dispatch({ type: 'UPDATE_NNL_ITEM', payload: saved })
      saveNNL({ ...stateRef.current, nnlItems: (stateRef.current.nnlItems ?? []).map(n => n.id === saved.id ? saved : n) })
      showToast('Enregistré')
    }
    handleModalClose()
  }

  // Ouvre la ItemModal Backlog ; onLinked sera appelé avec l'id du nouvel item
  // pour le lier au post-it NNL (passé par NNLItemModal via onCreateLinkedItem).
  function handleCreateLinkedItem(onLinked: (itemId: string) => void) {
    setLinkingCallback(() => onLinked)
  }

  function handleLinkedItemSave(item: Item, keyCounters?: Record<string, number>) {
    dispatch({ type: 'ADD_ITEM', payload: item, keyCounters })
    saveToServer({
      ...state,
      items: [...state.items, item],
      ...(keyCounters ? { itemKeyCounters: keyCounters } : {}),
    })
    linkingCallback?.(item.id)
    setLinkingCallback(null)
  }

  // ── Text block handlers ───────────────────────────────────────────────────
  function handleTextDblClick(id: string) {
    const t = (state.nnlTexts ?? []).find(x => x.id === id)
    if (t) setEditingText(t)
  }
  // onCommit reçoit le HTML final directement depuis le DOM → pas de stale closure
  function handleTextCommit(finalHtml: string) {
    if (!editingText) return
    const tmp = document.createElement('div')
    tmp.innerHTML = finalHtml
    const plainText = tmp.textContent ?? tmp.innerText ?? ''
    if (!plainText.trim()) {
      dispatch({ type: 'DELETE_NNL_TEXT', payload: editingText.id })
      const st = stateRef.current
      saveNNL({ ...st, nnlTexts: (st.nnlTexts ?? []).filter(t => t.id !== editingText.id) })
    } else {
      const updated = { ...editingText, content: finalHtml }
      dispatch({ type: 'UPDATE_NNL_TEXT', payload: updated })
      const st = stateRef.current
      saveNNL({ ...st, nnlTexts: (st.nnlTexts ?? []).map(t => t.id === editingText.id ? updated : t) })
    }
    setEditingText(null)
  }

  // ── Navigate / Zoom ───────────────────────────────────────────────────────
  const handleNavigate = (wx: number, wy: number) => {
    setOx(canvasSize.w/2 - wx*zoom); setOy(canvasSize.h/2 + wy*zoom)
  }
  function zoomToCenter(newZoom: number) {
    const cx = canvasSize.w/2, cy = canvasSize.h/2
    const wx = (cx-ox)/zoom, wy = (oy-cy)/zoom
    setZoom(newZoom); setOx(cx - wx*newZoom); setOy(cy + wy*newZoom)
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  const gridSize = Math.max(6, 24 * zoom)
  const gridOffX = ((ox % gridSize) + gridSize) % gridSize
  const gridOffY = ((oy % gridSize) + gridSize) % gridSize

  const isModalOpen = modalOpen || editItem !== null
  const W = canvasSize.w, H = canvasSize.h

  return (
    <>
      <div ref={canvasRef} className="nnl-canvas" data-testid="nnl-canvas"
        style={{
          cursor: toolCursor(tool, isPanning),
          backgroundImage: `radial-gradient(circle, var(--nnl-grid-dot) 1px, transparent 1px)`,
          backgroundSize:  `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${gridOffX}px ${gridOffY}px`,
        }}
        onMouseDown={onCanvasMouseDown}
      >
        <BackgroundCircles ox={ox} oy={oy} zoom={zoom} W={W} H={H} r1={r1} r2={r2}
          onResizeR1={handleResizeR1} onResizeR2={handleResizeR2} onResizeDone={handleResizeDone} />

        <ZoneLabels ox={ox} oy={oy} zoom={zoom} W={W} H={H} r1={r1} r2={r2} />

        {/* Opérations booléennes (multi-sélection de formes) */}
        {selectedShapeIds.length >= 2 && (
          <BooleanOpsToolbar onOp={handleBooleanOp} />
        )}

        {/* Panneau propriétés des tracés libres sélectionnés */}
        {selectedStrokes.length > 0 && (
          <StrokePropertiesPanel
            strokes={selectedStrokes}
            onUpdate={handleStrokeUpdate}
            onSave={handleStrokeSave}
            onDelete={handleStrokeDelete}
          />
        )}

        {/* Panneau propriétés de la forme sélectionnée */}
        {selectedShape && (
          <ShapePropertiesPanel
            shape={selectedShape}
            onUpdate={handleShapeUpdate}
            onSave={handleShapeSave}
            onDelete={handleShapeDelete}
          />
        )}

        {/* Panneau propriétés du texte sélectionné */}
        {selectedText && !editingText && (
          <TextPropertiesPanel
            text={selectedText}
            onUpdate={handleTextUpdate}
            onSave={handleTextSave}
            onDelete={handleTextDelete}
          />
        )}

        {/* Shapes + Strokes SVG layer (pointerEvents:none — clics gérés par onCanvasMouseDown) */}
        {W > 0 && (
          <ShapeLayer
            shapes={visibleShapes} strokes={visibleStrokes}
            previewShape={previewShape} previewStroke={previewStroke}
            ox={ox} oy={oy} zoom={zoom} W={W} H={H}
            selectedShapeIds={selectedShapeIds}
            selectedStrokeIds={selectedStrokeIds}
            selectedPtIdx={selectedPtIdx}
            onPtMouseDown={handlePtMouseDown}
            onAddPt={handleAddBezierPt}
            onRotateStart={handleRotateStart}
            onResizeStart={handleShapeResizeStart}
            onStrokeResizeStart={handleStrokeResizeStart}
            onStrokeRotateStart={handleStrokeRotateStart}
          />
        )}

        {/* Text blocks */}
        {visibleTexts.map(t => (
          editingText?.id === t.id ? null :
          <TextBlock key={t.id} text={t} ox={ox} oy={oy} zoom={zoom}
            onDoubleClick={handleTextDblClick}
            onMouseDown={tool === 'select' ? (id, e) => {
              if (e.button !== 0) return
              setSelectedTextId(id)
              setSelectedShapeId(null)
              setSelectedShapeIds([])
              setSelectedPtIdx(null)
              const tx = (stateRef.current.nnlTexts ?? []).find(tx_ => tx_.id === id)
              if (tx) textDragRef.current = { id, wx0: tx.x, wy0: tx.y, sx0: e.clientX, sy0: e.clientY, hasMoved: false }
            } : undefined}
            onResizeStart={tool === 'select' ? handleTextResizeStart : undefined}
            onRotateStart={tool === 'select' ? handleTextRotateStart : undefined}
            isSelected={selectedTextId === t.id}
          />
        ))}

        {/* Inline text editor */}
        {editingText && (
          <InlineTextEditor key={editingText.id} text={editingText} ox={ox} oy={oy} zoom={zoom}
            onCommit={handleTextCommit} />
        )}

        {/* Post-its */}
        {items.map(item => (
          <PostIt key={item.id} item={item}
            ox={ox} oy={oy} zoom={zoom}
            onDragStart={handleDragStart}
            onDelete={handleDelete}
            onEdit={handleOpenEdit}
            onResizeEnd={handleResizeEnd} />
        ))}

        {/* Rubber-band overlay — rect mode (v0.90.5) */}
        {rubberRect && (
          <div className="nnl-rubber-band" style={{
            position: 'absolute', pointerEvents: 'none',
            left: rubberRect.x, top: rubberRect.y,
            width: rubberRect.w, height: rubberRect.h,
            border: '1.5px dashed var(--accent, #6366f1)',
            background: 'rgba(99,102,241,0.06)',
            borderRadius: 2,
          }} />
        )}

        {/* Lasso overlay — freehand path (v0.90.5) */}
        {lassoPts && lassoPts.length >= 2 && (() => {
          const d = lassoPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
          return (
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              <path d={d}
                fill="rgba(99,102,241,0.06)"
                stroke="var(--accent, #6366f1)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          )
        })()}

        {/* Toolbar */}
        <NNLToolbar
          activeTool={tool}
          strokeColor={strokeColor}   fillColor={fillColor}
          activeWidth={drawWidth}     rectRadius={rectRadius}
          onToolChange={t => { setTool(t); setSelectedShapeId(null) }}
          onStrokeColorChange={setStrokeColor}
          onFillColorChange={setFillColor}
          onWidthChange={setDrawWidth}
          onRectRadiusChange={setRectRadius}
          canUndo={nnlCanUndo}
          canRedo={nnlCanRedo}
          onUndo={handleNNLUndo}
          onRedo={handleNNLRedo}
          selectMode={selectMode}
          selectScope={selectScope}
          onSelectModeChange={setSelectMode}
          onSelectScopeChange={setSelectScope}
        />

        {/* Layers panel */}
        <NNLLayersPanel activeLayerId={activeLayerId} onActiveLayerChange={setActiveLayerId} onSave={saveNNL} />

        {/* Minimap + Zoom */}
        {W > 0 && (
          <Minimap items={items} ox={ox} oy={oy} zoom={zoom} W={W} H={H} r1={r1} r2={r2}
            onNavigate={handleNavigate} />
        )}
        <ZoomControls zoom={zoom} onZoom={zoomToCenter}
          onReset={() => { setZoom(1); setOx(0); setOy(canvasSize.h) }} />

        {/* Grille magnétique toggle (v0.90.5) */}
        <button
          data-testid="nnl-snap-toggle"
          title={snapEnabled ? 'Grille magnétique active — Shift+G pour désactiver' : 'Grille magnétique — Shift+G'}
          onClick={() => setSnapEnabled(v => !v)}
          className={`nnl-snap-toggle${snapEnabled ? ' active' : ''}`}
          onMouseDown={e => e.stopPropagation()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 15 4 4"/>
            <path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z"/>
            <path d="m5 8 4 4"/>
          </svg>
        </button>
      </div>

      <NNLItemModal
        open={isModalOpen}
        item={editItem ?? undefined}
        defaultZone="now" defaultType="feature"
        onSave={handleModalSave}
        onDelete={editItem ? handleDelete : undefined}
        onClose={handleModalClose}
        onCreateLinkedItem={handleCreateLinkedItem}
      />

      {linkingCallback && (
        <ItemModal
          item={null}
          state={state}
          onSave={handleLinkedItemSave}
          onClose={() => setLinkingCallback(null)}
        />
      )}
    </>
  )
}
