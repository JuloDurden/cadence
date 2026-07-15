import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useCadence } from '../../context/StateContext'
import { useToast } from '../../context/ToastContext'
import type { NNLItem, NNLZone, NNLItemType } from '../../types'

// ── Constantes par défaut ────────────────────────────────────────────────────
const R1_DEFAULT = 400
const R2_DEFAULT = 800
const ZOOM_MIN = 0.15
const ZOOM_MAX = 4.0

// Minimap
const MM_W = 160, MM_H = 100

// ── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 9) }

function zoneFromWorld(wx: number, wy: number, r1: number, r2: number): NNLZone {
  const d = Math.sqrt(wx * wx + wy * wy)
  return d < r1 ? 'now' : d < r2 ? 'next' : 'later'
}

function newPosForZone(zone: NNLZone, r1: number, r2: number): { x: number; y: number } {
  const a = (20 + Math.random() * 50) * (Math.PI / 180)
  const d = zone === 'now'  ? r1 * (0.3 + Math.random() * 0.4)
          : zone === 'next' ? (r1 + r2) / 2 * (0.8 + Math.random() * 0.4)
          : r2 * (1.1 + Math.random() * 0.3)
  return { x: +(Math.cos(a) * d).toFixed(0), y: +(Math.sin(a) * d).toFixed(0) }
}

// Monde → Écran (Y monde vers le HAUT, Y écran vers le BAS)
function w2s(wx: number, wy: number, ox: number, oy: number, zoom: number) {
  return { x: ox + wx * zoom, y: oy - wy * zoom }
}
function s2w(sx: number, sy: number, ox: number, oy: number, zoom: number) {
  return { x: (sx - ox) / zoom, y: (oy - sy) / zoom }
}

// ── BackgroundCircles + poignées de resize ────────────────────────────────────
interface CirclesProps {
  ox: number; oy: number; zoom: number; W: number; H: number
  r1: number; r2: number
  onResizeR1: (newR1: number) => void
  onResizeR2: (newR2: number) => void
  onResizeDone: () => void
}
function BackgroundCircles({ ox, oy, zoom, W, H, r1, r2, onResizeR1, onResizeR2, onResizeDone }: CirclesProps) {
  const svgRef      = useRef<SVGSVGElement>(null)
  const resizingRef = useRef<'r1' | 'r2' | null>(null)
  const [hovered, setHovered] = useState<'r1' | 'r2' | null>(null)

  // Refs stables pour le handler mousemove (évite stale closures)
  const oxRef        = useRef(ox);        oxRef.current        = ox
  const oyRef        = useRef(oy);        oyRef.current        = oy
  const zoomRef      = useRef(zoom);      zoomRef.current      = zoom
  const r1Ref        = useRef(r1);        r1Ref.current        = r1
  const r2Ref        = useRef(r2);        r2Ref.current        = r2
  const doneRef      = useRef(onResizeDone); doneRef.current   = onResizeDone

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizingRef.current || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const worldDist = Math.sqrt((sx - oxRef.current) ** 2 + (sy - oyRef.current) ** 2) / zoomRef.current

      if (resizingRef.current === 'r1') {
        onResizeR1(Math.max(60, Math.min(r2Ref.current - 80, worldDist)))
      } else {
        onResizeR2(Math.max(r1Ref.current + 80, worldDist))
      }
    }
    function onUp() {
      if (!resizingRef.current) return
      resizingRef.current = null
      doneRef.current()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [onResizeR1, onResizeR2])

  const HIT = 16  // largeur de la zone cliquable en px écran

  return (
    <svg ref={svgRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
      width={W} height={H} aria-hidden="true"
    >
      {/* Cercles visibles */}
      <circle cx={ox} cy={oy} r={r1 * zoom} fill="none"
        stroke={hovered === 'r1' ? 'var(--primary)' : 'var(--nnl-arc)'}
        strokeWidth={hovered === 'r1' ? 3 : 2} style={{ pointerEvents: 'none' }} />
      <circle cx={ox} cy={oy} r={r2 * zoom} fill="none"
        stroke={hovered === 'r2' ? 'var(--primary)' : 'var(--nnl-arc)'}
        strokeWidth={hovered === 'r2' ? 3 : 2} style={{ pointerEvents: 'none' }} />

      {/* Zones de capture (transparentes, larges) */}
      <circle cx={ox} cy={oy} r={r1 * zoom} fill="none"
        stroke="transparent" strokeWidth={HIT}
        style={{ cursor: 'ew-resize' }}
        onMouseEnter={() => setHovered('r1')}
        onMouseLeave={() => setHovered(null)}
        onMouseDown={e => { e.stopPropagation(); resizingRef.current = 'r1' }} />
      <circle cx={ox} cy={oy} r={r2 * zoom} fill="none"
        stroke="transparent" strokeWidth={HIT}
        style={{ cursor: 'ew-resize' }}
        onMouseEnter={() => setHovered('r2')}
        onMouseLeave={() => setHovered(null)}
        onMouseDown={e => { e.stopPropagation(); resizingRef.current = 'r2' }} />
    </svg>
  )
}

// ── ZoneLabels ── même ligne horizontale (wy=50 fixe, wx dynamique) ──────────
function ZoneLabels({ ox, oy, zoom, W, H, r1, r2 }: {
  ox: number; oy: number; zoom: number; W: number; H: number
  r1: number; r2: number
}) {
  const wy = 50  // même Y monde pour tous → même Y écran
  const labels = [
    { label: 'Now',   wx: r1 * 0.35          },
    { label: 'Next',  wx: (r1 + r2) * 0.43   },
    { label: 'Later', wx: r2 * 1.10           },
  ]
  const fs = Math.max(10, 26 * zoom)
  return (
    <>
      {labels.map(({ label, wx }) => {
        const p = w2s(wx, wy, ox, oy, zoom)
        if (p.x < -200 || p.x > W + 200 || p.y < -60 || p.y > H + 60) return null
        return (
          <div key={label} style={{
            position: 'absolute', left: p.x, top: p.y,
            transform: 'translate(-50%, -50%)',
            fontSize: fs, fontWeight: 800,
            letterSpacing: '.08em', textTransform: 'uppercase',
            color: 'var(--text-muted)', opacity: .28,
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>{label}</div>
        )
      })}
    </>
  )
}

// ── PostItModal ───────────────────────────────────────────────────────────────
interface PostItModalProps {
  open: boolean; onClose: () => void
  onCreate: (type: NNLItemType, zone: NNLZone) => void
}
function PostItModal({ open, onClose, onCreate }: PostItModalProps) {
  const [zone, setZone] = useState<NNLZone>('now')
  if (!open) return null
  const ZONES: NNLZone[] = ['now', 'next', 'later']
  const ZL: Record<NNLZone, string> = { now: 'Now', next: 'Next', later: 'Later' }
  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 380, width: '90vw' }}>
        <div className="modal-header">
          <span className="modal-title">Ajouter un Post-it</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '16px 20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="form-label" style={{ marginBottom: 7 }}>Zone</div>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
              {ZONES.map((z, i) => (
                <button key={z} onClick={() => setZone(z)} style={{
                  flex: 1, padding: '9px 0', border: 'none',
                  borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                  background: zone === z ? 'var(--primary)' : 'transparent',
                  color: zone === z ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 700, fontSize: 11,
                  textTransform: 'uppercase', letterSpacing: '.05em',
                }}>{ZL[z]}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="form-label" style={{ marginBottom: 7 }}>Type</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button data-testid="menu-add-feature"
                onClick={() => { onCreate('feature', zone); onClose() }}
                style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: 7, background: '#fbbf24', color: '#1a0f00', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                Feature</button>
              <button data-testid="menu-add-release"
                onClick={() => { onCreate('release', zone); onClose() }}
                style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: 7, background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                Release</button>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
            Double-cliquez sur un post-it pour modifier son contenu.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── PostIt ───────────────────────────────────────────────────────────────────
interface PostItProps {
  item: NNLItem
  ox: number; oy: number; zoom: number
  onDragStart: (id: string, e: React.MouseEvent) => void
  onDelete:    (id: string) => void
  onTextChange:(id: string, text: string) => void
  onTextBlur:  (id: string) => void
  onResizeEnd: (id: string, w: number, h?: number) => void
}
function PostIt({ item, ox, oy, zoom, onDragStart, onDelete, onTextChange, onTextBlur, onResizeEnd }: PostItProps) {
  const divRef    = useRef<HTMLDivElement>(null)
  const taRef     = useRef<HTMLTextAreaElement>(null)
  const resizeRef = useRef<{ x0: number; y0: number; w0: number; h0: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [localW, setLocalW]   = useState(item.w ?? 160)
  const [localH, setLocalH]   = useState<number | null>(item.h ?? null)

  useEffect(() => { setLocalW(item.w ?? 160)  }, [item.w])
  useEffect(() => { setLocalH(item.h ?? null) }, [item.h])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizeRef.current) return
      const dx = (e.clientX - resizeRef.current.x0) / zoom
      const dy = (e.clientY - resizeRef.current.y0) / zoom
      setLocalW(Math.max(120, Math.min(1000, resizeRef.current.w0 + dx)))
      setLocalH(Math.max(80,  Math.min(1000, resizeRef.current.h0 + dy)))
    }
    function onUp() {
      if (!resizeRef.current) return
      onResizeEnd(item.id, localW, localH ?? undefined)
      resizeRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [item.id, zoom, localW, localH, onResizeEnd])

  const { x: sx, y: sy } = w2s(item.x, item.y, ox, oy, zoom)

  return (
    <div ref={divRef}
      className={`nnl-postit nnl-postit-${item.type}`}
      data-testid={`nnl-postit-${item.id}`}
      style={{
        left: sx, top: sy,
        width: localW,
        ...(localH !== null ? { height: localH, overflow: 'hidden' } : {}),
        transform: `translate(-50%, -50%) scale(${zoom})`,
      }}
      onMouseDown={e => { if (!editing) onDragStart(item.id, e) }}
      onDoubleClick={e => {
        e.stopPropagation()
        setEditing(true)
        setTimeout(() => taRef.current?.focus(), 0)
      }}
    >
      <button className="nnl-postit-delete" title="Supprimer"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete(item.id) }}>×</button>

      {editing ? (
        <textarea ref={taRef} className="nnl-postit-textarea"
          value={item.text}
          onChange={e => onTextChange(item.id, e.target.value)}
          onBlur={() => { setEditing(false); onTextBlur(item.id) }}
          onMouseDown={e => e.stopPropagation()} />
      ) : (
        <div className="nnl-postit-text">
          {item.text.split('\n').map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      <div className="nnl-resize-handle"
        onMouseDown={e => {
          e.stopPropagation(); e.preventDefault()
          const storedH = divRef.current
            ? divRef.current.getBoundingClientRect().height / zoom
            : (localH ?? 90)
          resizeRef.current = { x0: e.clientX, y0: e.clientY, w0: localW, h0: localH ?? storedH }
        }} />
    </div>
  )
}

// ── Minimap ── bas-droite, au-dessus des contrôles zoom ──────────────────────
function Minimap({ items, ox, oy, zoom, W, H, r1, r2, onNavigate }: {
  items: NNLItem[]; ox: number; oy: number; zoom: number
  W: number; H: number; r1: number; r2: number
  onNavigate: (wx: number, wy: number) => void
}) {
  const mmRef  = useRef<HTMLDivElement>(null)
  const mmCx   = MM_W / 2, mmCy = MM_H / 2
  const mmWorldR = r2 * 1.65
  const mmScale  = (Math.min(MM_W, MM_H) / 2) / mmWorldR

  const wToMM = (wx: number, wy: number) => ({
    x: mmCx + wx * mmScale,
    y: mmCy - wy * mmScale,
  })

  const vtl = s2w(0, 0, ox, oy, zoom)
  const vbr = s2w(W, H, ox, oy, zoom)
  const vx0 = mmCx + vtl.x * mmScale
  const vy0 = mmCy - vtl.y * mmScale
  const vx1 = mmCx + vbr.x * mmScale
  const vy1 = mmCy - vbr.y * mmScale
  const rx  = Math.max(0, Math.min(vx0, MM_W))
  const ry  = Math.max(0, Math.min(vy0, MM_H))
  const rw  = Math.max(0, Math.min(vx1, MM_W) - rx)
  const rh  = Math.max(0, Math.min(vy1, MM_H) - ry)

  function onMinimapClick(e: React.MouseEvent) {
    if (!mmRef.current) return
    const rect = mmRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left - mmCx
    const my = -(e.clientY - rect.top - mmCy)
    onNavigate(mx / mmScale, my / mmScale)
  }

  return (
    <div ref={mmRef} className="nnl-minimap" onClick={onMinimapClick}>
      <svg width={MM_W} height={MM_H}>
        <circle cx={mmCx} cy={mmCy} r={r1 * mmScale} fill="none" stroke="var(--nnl-arc)" strokeWidth="1" />
        <circle cx={mmCx} cy={mmCy} r={r2 * mmScale} fill="none" stroke="var(--nnl-arc)" strokeWidth="1" />
        {items.map(item => {
          const p = wToMM(item.x, item.y)
          return <circle key={item.id} cx={p.x} cy={p.y} r={2.5}
            fill={item.type === 'feature' ? '#fbbf24' : '#3b82f6'} opacity={.9} />
        })}
        <rect x={rx} y={ry} width={rw} height={rh}
          fill="rgba(99,102,241,.08)" stroke="var(--primary)"
          strokeWidth="1.5" strokeOpacity=".6" rx={2} />
      </svg>
      <span className="nnl-minimap-label">Vue d'ensemble</span>
    </div>
  )
}

// ── ZoomControls ──────────────────────────────────────────────────────────────
function ZoomControls({ zoom, onZoom, onReset }: {
  zoom: number; onZoom: (z: number) => void; onReset: () => void
}) {
  const btn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-secondary)', fontSize: 18,
    width: 30, height: 30, display: 'flex', alignItems: 'center',
    justifyContent: 'center', borderRadius: 5, flexShrink: 0, padding: 0,
  }
  return (
    <div style={{
      position: 'absolute', bottom: 14, right: 14, zIndex: 60,
      display: 'flex', alignItems: 'center',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,.12)',
    }}>
      <button style={btn} onClick={() => onZoom(Math.max(ZOOM_MIN, +(zoom - 0.1).toFixed(2)))} title="Zoom arrière">−</button>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'center', fontWeight: 600, cursor: 'pointer', userSelect: 'none', padding: '0 2px' }}
        onClick={onReset} title="Vue initiale">
        {Math.round(zoom * 100)}%
      </span>
      <button style={btn} onClick={() => onZoom(Math.min(ZOOM_MAX, +(zoom + 0.1).toFixed(2)))} title="Zoom avant">+</button>
    </div>
  )
}

// ── NNLCanvas ─────────────────────────────────────────────────────────────────
export function NNLCanvas({ modalOpen, onModalClose }: {
  modalOpen: boolean; onModalClose: () => void
}) {
  const { state, dispatch, saveToServer } = useCadence()
  const { showToast } = useToast()

  const canvasRef  = useRef<HTMLDivElement>(null)
  const originInit = useRef(false)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [ox, setOx]     = useState(0)
  const [oy, setOy]     = useState(0)
  const [r1, setR1]     = useState(R1_DEFAULT)
  const [r2, setR2]     = useState(R2_DEFAULT)
  const [isPanning, setIsPanning] = useState(false)

  // Refs stables pour les handlers window
  const zoomRef   = useRef(zoom);   zoomRef.current   = zoom
  const oxRef     = useRef(ox);     oxRef.current     = ox
  const oyRef     = useRef(oy);     oyRef.current     = oy
  const r1Ref     = useRef(r1);     r1Ref.current     = r1
  const r2Ref     = useRef(r2);     r2Ref.current     = r2
  const stateRef  = useRef(state);  stateRef.current  = state

  const items = state.nnlItems ?? []

  // ── ResizeObserver ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const { width: W, height: H } = entry.contentRect
      setCanvasSize({ w: W, h: H })
      if (!originInit.current) {
        originInit.current = true
        setOx(0); setOy(H)  // origine monde au coin bas-gauche
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // ── Zoom molette (vers curseur) ─────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor   = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newZoom  = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current * factor))
      const wx = (cx - oxRef.current) / zoomRef.current
      const wy = (oyRef.current - cy) / zoomRef.current
      setZoom(newZoom)
      setOx(cx - wx * newZoom)
      setOy(cy + wy * newZoom)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Pan ─────────────────────────────────────────────────────────────────────
  const panRef = useRef<{ ox0: number; oy0: number; sx0: number; sy0: number } | null>(null)

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!panRef.current) return
      setOx(panRef.current.ox0 + e.clientX - panRef.current.sx0)
      setOy(panRef.current.oy0 + e.clientY - panRef.current.sy0)
    }
    function onUp() {
      if (!panRef.current) return
      panRef.current = null; setIsPanning(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  // ── Drag post-it ────────────────────────────────────────────────────────────
  const dragRef = useRef<{ id: string; wx0: number; wy0: number; sx0: number; sy0: number } | null>(null)

  const handleDragStart = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const item = (stateRef.current.nnlItems ?? []).find(n => n.id === id)
    if (!item) return
    dragRef.current = { id, wx0: item.x, wy0: item.y, sx0: e.clientX, sy0: e.clientY }
  }, [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return
      const { id, wx0, wy0, sx0, sy0 } = dragRef.current
      const z  = zoomRef.current
      const nx = wx0 + (e.clientX - sx0) / z
      const ny = wy0 - (e.clientY - sy0) / z   // Y inversé
      const item = (stateRef.current.nnlItems ?? []).find(n => n.id === id)
      if (item) dispatch({
        type: 'UPDATE_NNL_ITEM',
        payload: { ...item, x: nx, y: ny, zone: zoneFromWorld(nx, ny, r1Ref.current, r2Ref.current) },
      })
    }
    function onUp() {
      if (!dragRef.current) return
      const id = dragRef.current.id; dragRef.current = null
      const st   = stateRef.current
      const item = (st.nnlItems ?? []).find(n => n.id === id)
      if (item) saveToServer({ ...st, nnlItems: (st.nnlItems ?? []).map(n => n.id === id ? item : n) })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [dispatch, saveToServer])

  // ── Handlers ────────────────────────────────────────────────────────────────
  function onCanvasMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('.nnl-postit')) return
    panRef.current = { ox0: ox, oy0: oy, sx0: e.clientX, sy0: e.clientY }
    setIsPanning(true)
  }

  // ── Helpers de repositionnement radial ─────────────────────────────────────
  function repositionItems(
    currentItems: NNLItem[],
    oldR1: number, oldR2: number,
    newR1: number, newR2: number,
  ): NNLItem[] {
    return currentItems.map(item => {
      const d = Math.sqrt(item.x ** 2 + item.y ** 2)
      if (d < 0.5) return item
      const angle = Math.atan2(item.y, item.x)
      const zone  = zoneFromWorld(item.x, item.y, oldR1, oldR2)
      let newD: number
      if (zone === 'now') {
        // Scale proportionnellement avec R1
        newD = oldR1 > 0 ? d * newR1 / oldR1 : d
      } else if (zone === 'next') {
        // Maintenir la fraction dans la bande [R1, R2]
        const oldBand = oldR2 - oldR1
        const frac    = oldBand > 0 ? (d - oldR1) / oldBand : 0.5
        newD = newR1 + frac * (newR2 - newR1)
      } else {
        // LATER : décaler du même delta que R2
        newD = d + (newR2 - oldR2)
      }
      newD = Math.max(1, newD)
      const nx = +(Math.cos(angle) * newD).toFixed(1)
      const ny = +(Math.sin(angle) * newD).toFixed(1)
      return { ...item, x: nx, y: ny, zone: zoneFromWorld(nx, ny, newR1, newR2) }
    })
  }

  // Resize cercles : R1 pousse R2 du même delta + repositionne les post-its
  const handleResizeR1 = useCallback((newR1: number) => {
    const oldR1  = r1Ref.current
    const oldR2  = r2Ref.current
    const newR2  = oldR2 + (newR1 - oldR1)
    const moved  = repositionItems(stateRef.current.nnlItems ?? [], oldR1, oldR2, newR1, newR2)
    setR1(newR1); setR2(newR2)
    dispatch({ type: 'SET_NNL_ITEMS', payload: moved })
  }, [dispatch])

  const handleResizeR2 = useCallback((newR2: number) => {
    const oldR1 = r1Ref.current
    const oldR2 = r2Ref.current
    const moved = repositionItems(stateRef.current.nnlItems ?? [], oldR1, oldR2, oldR1, newR2)
    setR2(newR2)
    dispatch({ type: 'SET_NNL_ITEMS', payload: moved })
  }, [dispatch])

  const handleResizeDone = useCallback(() => {
    const st = stateRef.current
    saveToServer(st)
  }, [saveToServer])

  const handleDelete = (id: string) => {
    dispatch({ type: 'DELETE_NNL_ITEM', payload: id })
    saveToServer({ ...state, nnlItems: (state.nnlItems ?? []).filter(n => n.id !== id) })
    showToast('Post-it supprimé', 'info')
  }
  const handleTextChange = (id: string, text: string) => {
    const item = items.find(n => n.id === id)
    if (item) dispatch({ type: 'UPDATE_NNL_ITEM', payload: { ...item, text } })
  }
  const handleTextBlur = (id: string) => {
    const item = (state.nnlItems ?? []).find(n => n.id === id)
    if (!item) return
    saveToServer({ ...state, nnlItems: (state.nnlItems ?? []).map(n => n.id === id ? item : n) })
    showToast('Enregistré')
  }
  const handleResizeEnd = useCallback((id: string, w: number, h?: number) => {
    const st   = stateRef.current
    const item = (st.nnlItems ?? []).find(n => n.id === id)
    if (!item) return
    const updated: NNLItem = { ...item, w, ...(h !== undefined ? { h } : {}) }
    dispatch({ type: 'UPDATE_NNL_ITEM', payload: updated })
    saveToServer({ ...st, nnlItems: (st.nnlItems ?? []).map(n => n.id === id ? updated : n) })
  }, [dispatch, saveToServer])

  const handleCreate = (type: NNLItemType, zone: NNLZone) => {
    const pos  = newPosForZone(zone, r1, r2)
    const item: NNLItem = {
      id: uid(), type, zone,
      text: type === 'release' ? 'Release X.Y' : '> Nouvelle fonctionnalité',
      x: pos.x, y: pos.y, w: 160,
    }
    dispatch({ type: 'ADD_NNL_ITEM', payload: item })
    saveToServer({ ...state, nnlItems: [...(state.nnlItems ?? []), item] })
    showToast('Post-it ajouté')
  }

  const handleNavigate = (wx: number, wy: number) => {
    setOx(canvasSize.w / 2 - wx * zoom)
    setOy(canvasSize.h / 2 + wy * zoom)
  }

  function zoomToCenter(newZoom: number) {
    const cx = canvasSize.w / 2, cy = canvasSize.h / 2
    const wx = (cx - ox) / zoom, wy = (oy - cy) / zoom
    setZoom(newZoom)
    setOx(cx - wx * newZoom)
    setOy(cy + wy * newZoom)
  }

  // Grille de points ancrée sur l'origine monde
  const gridSize = Math.max(6, 24 * zoom)
  const gridOffX = ((ox % gridSize) + gridSize) % gridSize
  const gridOffY = ((oy % gridSize) + gridSize) % gridSize

  return (
    <>
      <div ref={canvasRef} className="nnl-canvas" data-testid="nnl-canvas"
        style={{
          cursor: isPanning ? 'grabbing' : 'crosshair',
          backgroundImage: `radial-gradient(circle, var(--nnl-grid-dot) 1px, transparent 1px)`,
          backgroundSize:  `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${gridOffX}px ${gridOffY}px`,
        }}
        onMouseDown={onCanvasMouseDown}
      >
        <BackgroundCircles
          ox={ox} oy={oy} zoom={zoom} W={canvasSize.w} H={canvasSize.h}
          r1={r1} r2={r2}
          onResizeR1={handleResizeR1} onResizeR2={handleResizeR2}
          onResizeDone={handleResizeDone} />

        <ZoneLabels ox={ox} oy={oy} zoom={zoom} W={canvasSize.w} H={canvasSize.h} r1={r1} r2={r2} />

        {items.map(item => (
          <PostIt key={item.id} item={item}
            ox={ox} oy={oy} zoom={zoom}
            onDragStart={handleDragStart}
            onDelete={handleDelete}
            onTextChange={handleTextChange}
            onTextBlur={handleTextBlur}
            onResizeEnd={handleResizeEnd} />
        ))}

        {/* Minimap + Zoom : tous les deux en bas-droite */}
        {canvasSize.w > 0 && (
          <Minimap items={items} ox={ox} oy={oy} zoom={zoom}
            W={canvasSize.w} H={canvasSize.h} r1={r1} r2={r2}
            onNavigate={handleNavigate} />
        )}
        <ZoomControls zoom={zoom} onZoom={zoomToCenter}
          onReset={() => { setZoom(1); setOx(0); setOy(canvasSize.h) }} />
      </div>

      <PostItModal open={modalOpen} onClose={onModalClose} onCreate={handleCreate} />
    </>
  )
}
