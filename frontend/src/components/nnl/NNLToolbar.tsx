import React, { useState } from 'react'
import type { NNLTool } from '../../types'

// ── Icônes SVG ───────────────────────────────────────────────────────────────
const Svg = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
)

const ICO_SELECT  = '<path d="M5 3l14 9-7 1-3 7z"/>'
const ICO_RECT    = '<rect x="3" y="3" width="18" height="18" rx="2"/>'
const ICO_ELLIPSE = '<ellipse cx="12" cy="12" rx="10" ry="7"/>'
const ICO_ARROW   = '<line x1="5" y1="19" x2="19" y2="5"/><polyline points="12 5 19 5 19 12"/>'
const ICO_TEXT    = '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>'
const ICO_PEN     = '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'
const ICO_MARKER  = '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'
const ICO_ERASER  = '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>'
// Coins droits (état = carré) / Coins arrondis (état = arrondi)
const ICO_CORNER  = '<path d="M3 3h7"/><path d="M3 3v7"/><path d="M3 21h18v-18"/>'
const ICO_ROUND   = '<path d="M3 12a9 9 0 0 1 9-9h6a3 3 0 0 1 3 3v6a9 9 0 0 1-9 9H6a3 3 0 0 1-3-3z"/>'
// Undo / Redo
const ICO_UNDO    = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'
const ICO_REDO    = '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5a5.5 5.5 0 0 0 5.5 5.5H13"/>'
// Orientation
const ICO_V_LEFT  = '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="13" y="6" width="8" height="12" rx="1"/>'
const ICO_V_RIGHT = '<rect x="14" y="3" width="7" height="18" rx="1"/><rect x="3" y="6" width="8" height="12" rx="1"/>'
const ICO_H_BOT   = '<rect x="3" y="14" width="18" height="7" rx="1"/><rect x="6" y="3" width="12" height="8" rx="1"/>'

const TOOLS: Array<{ id: NNLTool; icon: string; label: string; key: string; group: 'select' | 'shape' | 'draw' }> = [
  { id: 'select',  icon: ICO_SELECT,  label: 'Sélection', key: 'V', group: 'select' },
  { id: 'rect',    icon: ICO_RECT,    label: 'Rectangle', key: 'R', group: 'shape'  },
  { id: 'ellipse', icon: ICO_ELLIPSE, label: 'Ellipse',   key: 'E', group: 'shape'  },
  { id: 'arrow',   icon: ICO_ARROW,   label: 'Flèche',    key: 'A', group: 'shape'  },
  { id: 'text',    icon: ICO_TEXT,    label: 'Texte',     key: 'T', group: 'shape'  },
  { id: 'pen',     icon: ICO_PEN,     label: 'Stylo',     key: 'P', group: 'draw'   },
  { id: 'marker',  icon: ICO_MARKER,  label: 'Marqueur',  key: 'M', group: 'draw'   },
  { id: 'eraser',  icon: ICO_ERASER,  label: 'Gomme',     key: 'G', group: 'draw'   },
]

const PALETTE = [
  '#1e293b', '#94a3b8', '#ef4444', '#f97316', '#fbbf24',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#40e0d0', '#ffffff', 'none',
]
const STROKE_SIZES = [1, 2, 4, 8, 16]

type ToolbarOrientation = 'vertical-left' | 'vertical-right' | 'horizontal-bottom'
const LS_ORIENT = 'nnl-toolbar-orientation'

interface NNLToolbarProps {
  activeTool:          NNLTool
  strokeColor:         string
  fillColor:           string
  activeWidth:         number
  rectRadius:          number
  onToolChange:        (t: NNLTool) => void
  onStrokeColorChange: (c: string)  => void
  onFillColorChange:   (c: string)  => void
  onWidthChange:       (w: number)  => void
  onRectRadiusChange:  (r: number)  => void
  // Bug 5 : Undo/Redo NNL spécifique à la page
  canUndo?: boolean
  canRedo?: boolean
  onUndo?:  () => void
  onRedo?:  () => void
}

type Picking = 'stroke' | 'fill' | null

const CHECKER = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3Crect x='0' y='4' width='4' height='4' fill='%23eee'/%3E%3Crect x='4' y='0' width='4' height='4' fill='%23eee'/%3E%3C/svg%3E")`

export function NNLToolbar({
  activeTool, strokeColor, fillColor, activeWidth, rectRadius,
  onToolChange, onStrokeColorChange, onFillColorChange, onWidthChange, onRectRadiusChange,
  canUndo = false, canRedo = false, onUndo, onRedo,
}: NNLToolbarProps) {
  const [picking, setPicking] = useState<Picking>(null)
  const [orientation, setOrientation] = useState<ToolbarOrientation>(
    () => (localStorage.getItem(LS_ORIENT) as ToolbarOrientation | null) ?? 'vertical-left'
  )

  const isHoriz = orientation === 'horizontal-bottom'
  const isRight = orientation === 'vertical-right'
  const showSizes  = (['pen', 'marker', 'rect', 'ellipse', 'arrow'] as NNLTool[]).includes(activeTool)
  const showRadius = activeTool === 'rect'

  function cycleOrientation() {
    const next: ToolbarOrientation =
      orientation === 'vertical-left'  ? 'vertical-right' :
      orientation === 'vertical-right' ? 'horizontal-bottom' : 'vertical-left'
    setOrientation(next)
    localStorage.setItem(LS_ORIENT, next)
  }

  // ── Mini color chip ───────────────────────────────────────────────────────
  function Swatch({ color, size = 18, selected = false }: { color: string; size?: number; selected?: boolean }) {
    return (
      <div style={{
        width: size, height: size, borderRadius: size / 4,
        background: color === 'none' ? '#fff' : color,
        border: selected ? '2px solid var(--primary)' : '1px solid var(--border)',
        position: 'relative', overflow: 'hidden', flexShrink: 0, boxSizing: 'border-box',
      }}>
        {color === 'none' && (
          <svg viewBox="0 0 18 18" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
            <line x1="2" y1="16" x2="16" y2="2" stroke="#ef4444" strokeWidth="2" />
          </svg>
        )}
      </div>
    )
  }

  // ── Divider adapté à l'orientation ───────────────────────────────────────
  const divider = isHoriz
    ? <div style={{ width: 1, height: 34, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
    : <div style={{ height: 1, background: 'var(--border)', margin: '4px 0', flexShrink: 0 }} />

  // ── Boutons outils ───────────────────────────────────────────────────────
  let lastGroup: string | null = null
  const toolButtons = TOOLS.map(tool => {
    const showDiv = lastGroup !== null && lastGroup !== tool.group
    lastGroup = tool.group
    return (
      <React.Fragment key={tool.id}>
        {showDiv && divider}
        <button
          data-testid={`nnl-tool-${tool.id}`}
          title={`${tool.label} (${tool.key})`}
          onClick={() => { onToolChange(tool.id); setPicking(null) }}
          style={{
            width: 34, height: 34, border: 'none', borderRadius: 8, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: activeTool === tool.id ? 'var(--primary)' : 'transparent',
            color: activeTool === tool.id ? '#fff' : 'var(--text-muted)',
            transition: 'background .12s, color .12s', flexShrink: 0,
          }}>
          <Svg d={tool.icon} size={16} />
        </button>
      </React.Fragment>
    )
  })

  // ── Palette popover (positionnée DANS le conteneur relatif) ───────────────
  // Position selon orientation : droite / gauche / haut
  const palettePos: React.CSSProperties = isHoriz
    ? { position: 'absolute', bottom: 42, left: 0 }
    : isRight
    ? { position: 'absolute', right: 42, top: -8 }
    : { position: 'absolute', left: 42, top: -8 }

  const palettePanel = picking !== null ? (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        ...palettePos,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 8, zIndex: 200,
        boxShadow: '0 4px 16px rgba(0,0,0,.18)',
        minWidth: 160,
      }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
        {picking === 'stroke' ? 'Contour' : 'Remplissage'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 22px)', gap: 4 }}>
        {PALETTE.map(c => (
          <div key={c} style={{ cursor: 'pointer' }}
            onClick={() => {
              picking === 'stroke' ? onStrokeColorChange(c) : onFillColorChange(c)
              setPicking(null)
            }}>
            <Swatch color={c} size={22} selected={c === (picking === 'stroke' ? strokeColor : fillColor)} />
          </div>
        ))}
      </div>
      {/* Sélecteur couleur libre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
        <div style={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
          <Swatch color={picking === 'stroke' ? strokeColor : fillColor} size={22} />
          <input type="color"
            value={(picking === 'stroke' ? strokeColor : fillColor) === 'none' ? '#000000'
              : (picking === 'stroke' ? strokeColor : fillColor)}
            onChange={e => {
              picking === 'stroke' ? onStrokeColorChange(e.target.value) : onFillColorChange(e.target.value)
              setPicking(null)
            }}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
        </div>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
          {(picking === 'stroke' ? strokeColor : fillColor) === 'none' ? 'aucun'
            : (picking === 'stroke' ? strokeColor : fillColor)}
        </span>
      </div>
    </div>
  ) : null

  // ── Section épaisseur ────────────────────────────────────────────────────
  const sizesSection = showSizes ? (
    <>
      {divider}
      <div style={{
        display: 'flex', flexDirection: isHoriz ? 'row' : 'column',
        alignItems: 'center', gap: 2,
      }}>
        {STROKE_SIZES.map(w => (
          <button key={w}
            data-testid={`nnl-width-${w}`}
            title={`Épaisseur ${w}px`}
            onClick={() => onWidthChange(w)}
            style={{
              width: isHoriz ? 22 : 34, height: isHoriz ? 34 : 22,
              border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
              background: activeWidth === w ? 'var(--primary-light)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            <div style={{
              width:  isHoriz ? Math.min(w, 6) : 20,
              height: isHoriz ? 14 : Math.min(w, 6),
              borderRadius: w / 2,
              background: activeWidth === w ? 'var(--primary)' : 'var(--text-muted)',
            }} />
          </button>
        ))}
      </div>
    </>
  ) : null

  // ── Section rayon (rect) ─────────────────────────────────────────────────
  const radiusSection = showRadius ? (
    <>
      {divider}
      {/* Bouton toggle : l'icône montre l'état CIBLE (ce qui arrivera au clic) */}
      <button
        title={rectRadius === 0 ? 'Passer aux coins arrondis' : 'Passer aux coins droits'}
        onClick={() => onRectRadiusChange(rectRadius === 0 ? 8 : 0)}
        style={{
          width: 34, height: 28, border: 'none', borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: rectRadius > 0 ? 'var(--primary-light)' : 'transparent',
          color: rectRadius > 0 ? 'var(--primary)' : 'var(--text-muted)',
          flexShrink: 0,
        }}>
        {/* Quand coins droits actifs → icône ROUND (ce qu'on obtiendra) */}
        {/* Quand coins arrondis actifs → icône CORNER (ce qu'on obtiendra) */}
        <Svg d={rectRadius === 0 ? ICO_ROUND : ICO_CORNER} size={14} />
      </button>
      {/* Slider rayon (visible seulement quand arrondis actifs) */}
      {rectRadius > 0 && (
        <div style={{
          display: 'flex', flexDirection: isHoriz ? 'row' : 'column',
          alignItems: 'center', gap: 2, flexShrink: 0,
          ...(isHoriz ? { padding: '0 2px' } : { padding: '2px 0' }),
        }}>
          <input type="range" min={1} max={50} value={rectRadius}
            onChange={e => onRectRadiusChange(parseInt(e.target.value))}
            onMouseDown={e => e.stopPropagation()}
            style={{
              cursor: 'pointer', padding: 0, margin: 0,
              ...(isHoriz
                ? { width: 60, height: 18 }
                : { writingMode: 'vertical-lr' as any, direction: 'rtl', height: 60, width: 18 }),
            }} />
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 16, textAlign: 'center' }}>
            {rectRadius}
          </span>
        </div>
      )}
    </>
  ) : null

  // ── Toggle orientation ────────────────────────────────────────────────────
  const orientIcon = orientation === 'vertical-left' ? ICO_V_LEFT
    : orientation === 'vertical-right' ? ICO_V_RIGHT : ICO_H_BOT
  const orientLabel = orientation === 'vertical-left'  ? 'Barre à droite'
    : orientation === 'vertical-right' ? 'Barre en bas' : 'Barre à gauche'

  const orientSection = (
    <>
      {divider}
      <button title={orientLabel} onClick={cycleOrientation}
        style={{
          width: 34, height: 28, border: 'none', borderRadius: 8, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', color: 'var(--text-muted)', flexShrink: 0,
        }}>
        <Svg d={orientIcon} size={14} />
      </button>
    </>
  )

  // ── Conteneur ─────────────────────────────────────────────────────────────
  const containerStyle: React.CSSProperties = isHoriz
    ? {
        position: 'absolute', bottom: 60, left: '50%',
        transform: 'translateX(-50%)', zIndex: 60,
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '5px 8px',
        boxShadow: '0 4px 16px rgba(0,0,0,.14)',
      }
    : {
        position: 'absolute',
        ...(isRight ? { right: 12 } : { left: 12 }),
        top: '50%', transform: 'translateY(-50%)', zIndex: 60,
        display: 'flex', flexDirection: 'column', gap: 2,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '8px 5px',
        boxShadow: '0 4px 16px rgba(0,0,0,.14)',
      }

  return (
    <div className="nnl-toolbar" data-testid="nnl-toolbar"
      style={containerStyle}
      // CRITIQUE : empêche le canvas de recevoir les clics sur la toolbar
      onMouseDown={e => e.stopPropagation()}
    >
      {toolButtons}

      {divider}

      {/* Zone swatches — position:relative pour ancrer la palette */}
      <div style={{ position: 'relative', width: 36, height: 38, flexShrink: 0 }}>
        {/* Carré arrière = Contour (juste la bordure, intérieur neutre) */}
        <div data-testid="nnl-color-btn" title="Couleur de contour"
          onClick={() => setPicking(p => p === 'stroke' ? null : 'stroke')}
          style={{
            position: 'absolute', bottom: 0, right: 0, width: 22, height: 22,
            background: 'var(--surface-2)',
            border: `4px solid ${strokeColor === 'none' ? 'var(--border)' : strokeColor}`,
            boxShadow: `0 0 0 ${picking === 'stroke' ? 2 : 1}px ${picking === 'stroke' ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 4, cursor: 'pointer', boxSizing: 'border-box', overflow: 'hidden',
          }}>
          {strokeColor === 'none' && (
            <svg viewBox="0 0 18 18" width={14} height={14} style={{ position: 'absolute', inset: 2 }}>
              <line x1="2" y1="16" x2="16" y2="2" stroke="#ef4444" strokeWidth="2" />
            </svg>
          )}
        </div>
        {/* Carré avant = Remplissage (plein, couleur visible) */}
        <div title="Couleur de remplissage"
          onClick={() => setPicking(p => p === 'fill' ? null : 'fill')}
          style={{
            position: 'absolute', top: 0, left: 0, width: 22, height: 22,
            backgroundImage: fillColor === 'none' ? CHECKER : undefined,
            background: fillColor !== 'none' ? fillColor : undefined,
            border: `2px solid ${picking === 'fill' ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 4, cursor: 'pointer', boxSizing: 'border-box', overflow: 'hidden',
          }}>
          {fillColor === 'none' && (
            <svg viewBox="0 0 18 18" width={18} height={18} style={{ position: 'absolute', inset: 0 }}>
              <line x1="2" y1="16" x2="16" y2="2" stroke="#ef4444" strokeWidth="2" />
            </svg>
          )}
        </div>
        {/* ✅ Palette DANS le conteneur relatif — positionnement garanti */}
        {palettePanel}
      </div>

      {sizesSection}
      {radiusSection}

      {/* Undo / Redo NNL — avant le bouton d'orientation */}
      {divider}
      <button title={canUndo ? 'Annuler (Ctrl+Z)' : 'Rien à annuler'}
        disabled={!canUndo} onClick={onUndo}
        style={{
          width: 34, height: 28, border: 'none', borderRadius: 8, cursor: canUndo ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          color: canUndo ? 'var(--text-muted)' : 'var(--text-faint)',
          opacity: canUndo ? 1 : 0.4, flexShrink: 0,
        }}>
        <Svg d={ICO_UNDO} size={14} />
      </button>
      <button title={canRedo ? 'Rétablir (Ctrl+Y)' : 'Rien à rétablir'}
        disabled={!canRedo} onClick={onRedo}
        style={{
          width: 34, height: 28, border: 'none', borderRadius: 8, cursor: canRedo ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          color: canRedo ? 'var(--text-muted)' : 'var(--text-faint)',
          opacity: canRedo ? 1 : 0.4, flexShrink: 0,
        }}>
        <Svg d={ICO_REDO} size={14} />
      </button>

      {orientSection}
    </div>
  )
}
