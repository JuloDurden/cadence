import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useCadence } from '../../context/StateContext'
import { useToast } from '../../context/ToastContext'
import type { NNLItem, NNLZone, NNLItemType, NNLTool, NNLShape, NNLText, NNLStroke, NNLLayer, CadenceState } from '../../types'
import { NNLItemModal } from './NNLItemModal'
import { NNLToolbar } from './NNLToolbar'
import { NNLLayersPanel } from './NNLLayersPanel'

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
function ShapeLayer({ shapes, strokes, previewShape, previewStroke, ox, oy, zoom, W, H, selectedShapeIds, selectedPtIdx, onPtMouseDown, onAddPt, onRotateStart }: {
  shapes: NNLShape[]; strokes: NNLStroke[]
  previewShape?: NNLShape | null; previewStroke?: NNLStroke | null
  ox: number; oy: number; zoom: number; W: number; H: number
  selectedShapeIds?: string[]
  selectedPtIdx?: number | null
  onPtMouseDown?: (shapeId: string, ptIdx: number, e: React.MouseEvent) => void
  onAddPt?: (shapeId: string, insertIdx: number, wx: number, wy: number) => void
  onRotateStart?: (shapeId: string, wCx: number, wCy: number, e: React.MouseEvent) => void
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

    if (s.shapeType === 'rect') {
      const rx_ = (s.rx ?? 0) * Math.sqrt(zoom)
      return (
        <g key={key} transform={transform}>
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
        </g>
      )
    }
    if (s.shapeType === 'ellipse') {
      return (
        <g key={key} transform={transform}>
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
        <g key={key} transform={arrowTransform}>
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
    return null
  }

  function renderStroke(s: NNLStroke, key: string) {
    if (s.pts.length < 2) return null
    const pts = s.pts.map(p => w2s(p.x, p.y, ox, oy, zoom))
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`
    return (
      <path key={key} d={d}
        fill="none"
        stroke={s.color ?? '#1e293b'}
        strokeWidth={(s.width ?? 2) * Math.sqrt(zoom)}
        strokeLinecap="round" strokeLinejoin="round"
        opacity={s.opacity ?? 1} />
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
          userSelect: 'none', pointerEvents: 'auto',
          cursor: onMouseDown ? 'move' : 'default',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          padding: 2,
          outline: isSelected ? '2px dashed var(--primary)' : undefined,
          outlineOffset: isSelected ? '2px' : undefined,
          borderRadius: 2, boxSizing: 'border-box',
        }}
      >
        {text.content}
      </div>
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

// ── InlineTextEditor ─────────────────────────────────────────────────────────
function InlineTextEditor({ text, ox, oy, zoom, onChange, onCommit }: {
  text: NNLText; ox: number; oy: number; zoom: number
  onChange: (content: string) => void
  onCommit: () => void
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const p = w2s(text.x, text.y, ox, oy, zoom)
  useEffect(() => { taRef.current?.focus(); taRef.current?.select() }, [])
  return (
    <textarea
      ref={taRef}
      value={text.content}
      onChange={e => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={e => { if (e.key === 'Escape') onCommit() }}
      style={{
        position: 'absolute', left: p.x, top: p.y,
        width: text.w * zoom,
        minHeight: (text.fontSize ?? 14) * zoom * 1.8,
        fontSize: (text.fontSize ?? 14) * zoom,
        fontFamily: text.fontFamily ?? 'inherit',
        color: text.color ?? 'var(--text)',
        background: 'var(--surface)',
        border: '1.5px solid var(--primary)',
        borderRadius: 4, padding: 2, resize: 'none', outline: 'none',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        lineHeight: 1.4, zIndex: 90,
      }}
      onMouseDown={e => e.stopPropagation()}
    />
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
  { label: 'Sans-serif', value: 'inherit' },
  { label: 'Serif',      value: 'Georgia, serif' },
  { label: 'Mono',       value: '"Courier New", monospace' },
  { label: 'Cursive',    value: 'cursive' },
  { label: 'Impact',     value: 'Impact, fantasy' },
]
// Checkered background (transparency indicator)
const CHECKER_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3Crect x='0' y='4' width='4' height='4' fill='%23eee'/%3E%3Crect x='4' y='0' width='4' height='4' fill='%23eee'/%3E%3C/svg%3E")`

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
    <div onMouseDown={e => e.stopPropagation()} style={{
      position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 220,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,.22)',
      width: 158,
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
            style={{ width: '100%', height: 14, cursor: 'pointer' }}
          />
        </div>
      )}
    </div>
  )
}

const PANEL_SEP = <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

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

  // ── Drawing preview state ─────────────────────────────────────────────────
  const [previewShape,  setPreviewShape]  = useState<NNLShape | null>(null)
  const [previewStroke, setPreviewStroke] = useState<NNLStroke | null>(null)

  // ── Inline text editing ───────────────────────────────────────────────────
  const [editingText, setEditingText] = useState<NNLText | null>(null)

  // ── Item modal state ──────────────────────────────────────────────────────
  const [editItem, setEditItem] = useState<NNLItem | null>(null)

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
  const shiftRef        = useRef(false)

  // ── Auto-calques par outil (style Photoshop) ──────────────────────────────
  const toolLayerMapRef = useRef<Partial<Record<NNLTool, string>>>({})
  const pendingLayerRef = useRef<NNLLayer | null>(null)

  // Bug 3 fix : reconstruire toolLayerMapRef depuis les calques existants au montage
  // (après reload, le ref est vide et la suppression auto ne se déclenche jamais)
  useEffect(() => {
    const TOOL_NAME_MAP: Record<string, NNLTool> = {
      'Rectangle': 'rect', 'Ellipse': 'ellipse', 'Flèche': 'arrow',
      'Texte': 'text', 'Stylo': 'pen', 'Marqueur': 'marker',
    }
    ;(stateRef.current.nnlLayers ?? []).forEach(l => {
      const tool = TOOL_NAME_MAP[l.name]
      if (tool && !toolLayerMapRef.current[tool]) {
        toolLayerMapRef.current[tool] = l.id
      }
    })
  }, []) // une seule fois au montage

  // ── Drag nœud bezier ──────────────────────────────────────────────────────
  const dragPtRef = useRef<{ shapeId: string; ptIdx: number } | null>(null)

  // ── Drag formes (outil Sélection) ─────────────────────────────────────────
  const shapeDragRef = useRef<{
    ids: string[]
    starts: Array<{ x: number; y: number; x2: number; y2: number; pts?: Array<{x:number;y:number}> }>
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

  const visibleShapes  = shapes.filter(s => isVisible(s.layerId))
  const visibleTexts   = texts.filter(t => isVisible(t.layerId))
  const visibleStrokes = strokes.filter(s => isVisible(s.layerId))

  // ── Crée (ou réutilise) un calque auto pour l'outil courant ───────────────
  function getOrCreateToolLayer(tool: NNLTool): string {
    const TOOL_NAMES: Partial<Record<NNLTool, string>> = {
      rect: 'Rectangle', ellipse: 'Ellipse', arrow: 'Flèche',
      text: 'Texte', pen: 'Stylo', marker: 'Marqueur',
    }
    const name = TOOL_NAMES[tool]
    if (!name) return activeLayerRef.current

    const layers = stateRef.current.nnlLayers ?? []
    const existing = toolLayerMapRef.current[tool]
    if (existing && layers.some(l => l.id === existing)) {
      pendingLayerRef.current = null
      return existing
    }
    const id = uid()
    const maxOrder = Math.max(0, ...layers.map(l => l.order))
    const newLayer: NNLLayer = { id, name, locked: false, visible: true, order: maxOrder + 1 }
    toolLayerMapRef.current[tool] = id
    pendingLayerRef.current = newLayer
    dispatch({ type: 'SET_NNL_LAYERS', payload: [...layers, newLayer] })
    // Activer automatiquement le nouveau calque auto
    setActiveLayerId(id)
    return id
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
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      // Ne pas intercepter les raccourcis Ctrl/Cmd (Undo/Redo gérés ailleurs)
      if (e.ctrlKey || e.metaKey) return
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
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleNNLUndoRef.current() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleNNLRedoRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Delete key : nœud bezier, forme(s) ou texte sélectionné ─────────────
  const selectedShapeIdRef  = useRef(selectedShapeId);  selectedShapeIdRef.current  = selectedShapeId
  const selectedShapeIdsRef = useRef(selectedShapeIds); selectedShapeIdsRef.current = selectedShapeIds
  const selectedTextIdRef   = useRef(selectedTextId);   selectedTextIdRef.current   = selectedTextId
  const selectedPtIdxRef    = useRef(selectedPtIdx);    selectedPtIdxRef.current    = selectedPtIdx

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
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

      // Supprimer le texte sélectionné
      if (textId && shapeIds.length === 0) {
        dispatch({ type: 'DELETE_NNL_TEXT', payload: textId })
        const st = stateRef.current
        saveNNLRef.current({ ...st, nnlTexts: (st.nnlTexts ?? []).filter(t => t.id !== textId) })
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
          const isAutoLayer = Object.values(toolLayerMapRef.current).includes(layerId)
          const hasContent = [...newShapes, ...(st.nnlTexts ?? []), ...(st.nnlStrokes ?? [])].some(x => x.layerId === layerId)
          if (isAutoLayer && !hasContent) {
            newLayers = newLayers.filter(l => l.id !== layerId)
            dispatch({ type: 'SET_NNL_LAYERS', payload: newLayers })
            const toolEntry = Object.entries(toolLayerMapRef.current).find(([, id_]) => id_ === layerId)
            if (toolEntry) delete toolLayerMapRef.current[toolEntry[0] as NNLTool]
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

  // Helper pour saveNNL incluant un calque auto en attente
  function saveWithPendingLayer(st: typeof state, extras: object) {
    const pending = pendingLayerRef.current
    const layers = pending ? [...(st.nnlLayers ?? []), pending] : (st.nnlLayers ?? [])
    pendingLayerRef.current = null
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
            const updated: NNLShape = {
              ...s,
              x: start.x + dwx, y: start.y + dwy,
              x2: start.x2 + dwx, y2: start.y2 + dwy,
              ...(start.pts ? { pts: start.pts.map(pt => ({ x: pt.x + dwx, y: pt.y + dwy })) } : {}),
            }
            dispatch({ type: 'UPDATE_NNL_SHAPE', payload: updated })
          })
        }
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
          if (t) dispatch({ type: 'UPDATE_NNL_TEXT', payload: { ...t, x: dr.wx0 + dwx, y: dr.wy0 + dwy } })
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
      // Fin drag texte
      if (textDragRef.current) {
        const hasMoved = textDragRef.current.hasMoved
        textDragRef.current = null
        if (hasMoved) saveNNLRef.current(stateRef.current)
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
      // Fin resize texte
      if (textResizeRef.current) {
        textResizeRef.current = null
        saveNNLRef.current(stateRef.current)
        return
      }
      if (panRef.current) { panRef.current = null; setIsPanning(false); return }
      if (drawRef.current) {
        const el = canvasRef.current; if (!el) return
        const rect = el.getBoundingClientRect()
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top
        const p1 = s2w(drawRef.current.sx0, drawRef.current.sy0, oxRef.current, oyRef.current, zoomRef.current)
        let p2   = s2w(sx, sy, oxRef.current, oyRef.current, zoomRef.current)
        if (toolRef.current === 'rect' || toolRef.current === 'ellipse') {
          p2 = applyShiftConstrain(p1, p2)
        }
        if (Math.hypot(sx - drawRef.current.sx0, sy - drawRef.current.sy0) > 4) {
          const shapeType = toolRef.current as 'rect' | 'ellipse' | 'arrow'
          const layerId = getOrCreateToolLayer(toolRef.current)
          const shape: NNLShape = {
            id: drawRef.current.id, shapeType,
            x: p1.x, y: p1.y, x2: p2.x, y2: p2.y,
            stroke: strokeColorRef.current,
            fill:   fillColorRef.current,
            strokeWidth: widthRef.current,
            layerId,
            ...(shapeType === 'rect' && rectRadiusRef.current > 0 ? { rx: rectRadiusRef.current } : {}),
          }
          dispatch({ type: 'ADD_NNL_SHAPE', payload: shape })
          const st = stateRef.current
          saveWithPendingLayer(st, { nnlShapes: [...(st.nnlShapes ?? []), shape] })
        }
        drawRef.current = null; setPreviewShape(null); return
      }
      if (strokeRef.current) {
        const pts = strokeRef.current.pts
        if (pts.length >= 2) {
          const layerId = getOrCreateToolLayer(toolRef.current)
          const stroke: NNLStroke = {
            id: strokeRef.current.id, pts,
            color: strokeColorRef.current,
            width: widthRef.current,
            opacity: toolRef.current === 'marker' ? 0.45 : 1,
            layerId,
          }
          dispatch({ type: 'ADD_NNL_STROKE', payload: stroke })
          const st = stateRef.current
          saveWithPendingLayer(st, { nnlStrokes: [...(st.nnlStrokes ?? []), stroke] })
        }
        strokeRef.current = null; setPreviewStroke(null); return
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

      // Bug 1+2 fix: hit-test géré ici exclusivement (ShapeLayer SVG est pointerEvents:none)
      const cp = s2w(sx, sy, ox, oy, zoom)
      const THRESH = 6 / zoom

      // Hit-test formes
      const hit = visibleShapes.find(s => {
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
        if (isShift) {
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
        setSelectedPtIdx(null)

        // Démarrer un drag potentiel sur toutes les formes sélectionnées
        const shapes = stateRef.current.nnlShapes ?? []
        const ids = newIds
        const starts = ids.map(id => {
          const s = shapes.find(sh => sh.id === id)
          return s ? { x: s.x, y: s.y, x2: s.x2, y2: s.y2, pts: s.pts ? [...s.pts] : undefined } : null
        }).filter(Boolean) as typeof shapeDragRef.current['starts']
        shapeDragRef.current = { ids, starts, sx0: e.clientX, sy0: e.clientY, hasMoved: false }
        return
      }

      // Hit-test textes (visible TextBlocks)
      const hitText = visibleTexts.find(t => {
        const TTHRESH = 6 / zoom
        return cp.x >= t.x - TTHRESH && cp.x <= t.x + t.w + TTHRESH &&
               cp.y >= t.y - TTHRESH && cp.y <= t.y + (t.fontSize ?? 14) * 2 + TTHRESH
      })
      if (hitText) {
        setSelectedTextId(hitText.id)
        setSelectedShapeId(null)
        setSelectedShapeIds([])
        setSelectedPtIdx(null)
        textDragRef.current = { id: hitText.id, wx0: hitText.x, wy0: hitText.y, sx0: e.clientX, sy0: e.clientY, hasMoved: false }
        return
      }

      // Fond : désélectionner + pan
      setSelectedShapeId(null)
      setSelectedShapeIds([])
      setSelectedTextId(null)
      setSelectedPtIdx(null)
      panRef.current = { ox0: ox, oy0: oy, sx0: e.clientX, sy0: e.clientY }
      setIsPanning(true)
      return
    }

    if (t === 'text') {
      const p = s2w(sx, sy, ox, oy, zoom)
      const layerId = getOrCreateToolLayer('text')
      const newText: NNLText = {
        id: uid(), x: p.x, y: p.y, w: 200,
        content: 'Texte', fontSize: 14, color: strokeColor,
        layerId,
      }
      dispatch({ type: 'ADD_NNL_TEXT', payload: newText })
      saveWithPendingLayer(state, { nnlTexts: [...(state.nnlTexts ?? []), newText] })
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

  // ── Text block handlers ───────────────────────────────────────────────────
  function handleTextDblClick(id: string) {
    const t = (state.nnlTexts ?? []).find(x => x.id === id)
    if (t) setEditingText(t)
  }
  function handleTextChange(content: string) {
    if (!editingText) return
    setEditingText({ ...editingText, content })
  }
  function handleTextCommit() {
    if (!editingText) return
    if (!editingText.content.trim()) {
      dispatch({ type: 'DELETE_NNL_TEXT', payload: editingText.id })
      const st = stateRef.current
      saveNNL({ ...st, nnlTexts: (st.nnlTexts ?? []).filter(t => t.id !== editingText.id) })
    } else {
      dispatch({ type: 'UPDATE_NNL_TEXT', payload: editingText })
      const st = stateRef.current
      saveNNL({ ...st, nnlTexts: (st.nnlTexts ?? []).map(t => t.id === editingText.id ? editingText : t) })
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
            selectedPtIdx={selectedPtIdx}
            onPtMouseDown={handlePtMouseDown}
            onAddPt={handleAddBezierPt}
            onRotateStart={handleRotateStart}
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
          <InlineTextEditor text={editingText} ox={ox} oy={oy} zoom={zoom}
            onChange={handleTextChange} onCommit={handleTextCommit} />
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
      </div>

      <NNLItemModal
        open={isModalOpen}
        item={editItem ?? undefined}
        defaultZone="now" defaultType="feature"
        onSave={handleModalSave}
        onDelete={editItem ? handleDelete : undefined}
        onClose={handleModalClose}
      />
    </>
  )
}
