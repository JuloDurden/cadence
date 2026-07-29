import React, { useState, useRef, useEffect } from 'react'
import type { NNLTool } from '../../types'

// ── Icônes SVG ───────────────────────────────────────────────────────────────
const Svg = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    dangerouslySetInnerHTML={{ __html: d }} />
)

const ICO_SELECT      = '<path d="M5 3l14 9-7 1-3 7z"/>'
// Mode sélection — Lucide square-dashed-mouse-pointer / lasso-select
const ICO_RECT_SELECT = '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h2"/><path d="M14 3h1"/><path d="M3 9v1"/><path d="M21 9v2"/><path d="M3 14v1"/>'
const ICO_LASSO_SELECT = '<path d="M7 22a5 5 0 0 1-2-4"/><path d="M7 16.93c.96.43 1.96.74 2.99.91"/><path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2"/><path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M14.33 22h-.09a.35.35 0 0 1-.24-.32v-10a.34.34 0 0 1 .33-.34c.08 0 .15.03.21.08l7.34 6a.33.33 0 0 1-.21.59h-4.49l-2.57 3.85a.35.35 0 0 1-.28.14z"/>'
const ICO_RECT    = '<rect x="3" y="3" width="18" height="18" rx="2"/>'
const ICO_ELLIPSE = '<ellipse cx="12" cy="12" rx="10" ry="7"/>'
// Bouton "Formes" groupé (Rectangle + Ellipse, extensible plus tard) — Lucide shapes
const ICO_SHAPES  = '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>'
// Outil Cadre (sous-chantier 6, point 3, 2026-07-29) — Lucide group
const ICO_GROUP   = '<path d="M3 7V5c0-1.1.9-2 2-2h2"/><path d="M17 3h2c1.1 0 2 .9 2 2v2"/><path d="M21 17v2c0 1.1-.9 2-2 2h-2"/><path d="M7 21H5c-1.1 0-2-.9-2-2v-2"/><rect width="7" height="5" x="7" y="7" rx="1"/><rect width="7" height="5" x="10" y="12" rx="1"/>'
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
const ICO_H_BOT   = '<rect x="3" y="14" width="18" height="7" rx="1"/><rect x="6" y="3" width="12" height="8" rx="1"/>'

const TOOLS: Array<{ id: NNLTool; icon: string; label: string; key: string; group: 'select' | 'shape' | 'draw' }> = [
  { id: 'select',  icon: ICO_SELECT,  label: 'Sélection', key: 'V', group: 'select' },
  { id: 'rect',    icon: ICO_RECT,    label: 'Rectangle', key: 'R', group: 'shape'  },
  { id: 'ellipse', icon: ICO_ELLIPSE, label: 'Ellipse',   key: 'E', group: 'shape'  },
  // Bouton séparé (pas dans le groupe Formes) — décision Julien, 2026-07-29 : le Cadre a un
  // comportement différent (lié à un Epic/Initiative, ouvre une modale de liaison au relâchement).
  { id: 'frame',   icon: ICO_GROUP,   label: 'Cadre',     key: 'F', group: 'shape'  },
  { id: 'arrow',   icon: ICO_ARROW,   label: 'Flèche',    key: 'A', group: 'shape'  },
  { id: 'text',    icon: ICO_TEXT,    label: 'Texte',     key: 'T', group: 'shape'  },
  { id: 'pen',     icon: ICO_PEN,     label: 'Stylo',     key: 'P', group: 'draw'   },
  { id: 'marker',  icon: ICO_MARKER,  label: 'Marqueur',  key: 'M', group: 'draw'   },
  { id: 'eraser',  icon: ICO_ERASER,  label: 'Gomme',     key: 'G', group: 'draw'   },
]

// Exportée (sous-chantier 6, point 3.5, 2026-07-29) : réutilisée par FramePropertiesPanel
// (NNLCanvas.tsx) pour la couleur des cadres, à la demande de Julien plutôt qu'une palette
// bespoke — voir NNL_FRAME_COLORS dans NNLCanvas.tsx pour l'adaptation (sans 'none', qui n'a pas
// de sens pour le contour/étiquette d'un cadre, remplacé par un noir pur).
export const PALETTE = [
  '#1e293b', '#94a3b8', '#ef4444', '#f97316', '#fbbf24',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#40e0d0', '#ffffff', 'none',
]
const STROKE_SIZES = [1, 2, 4, 8, 16]

type ToolbarOrientation = 'vertical-left' | 'horizontal-bottom'
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
  // v0.90.5 : rubber-band select mode + scope
  selectMode?:         'pointer' | 'rect' | 'lasso'
  selectScope?:        'all' | 'active'
  onSelectModeChange?: (m: 'pointer' | 'rect' | 'lasso') => void
  onSelectScopeChange?:(s: 'all' | 'active') => void
}

type Picking = 'stroke' | 'fill' | null

const CHECKER = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3Crect x='0' y='4' width='4' height='4' fill='%23eee'/%3E%3Crect x='4' y='0' width='4' height='4' fill='%23eee'/%3E%3C/svg%3E")`

export function NNLToolbar({
  activeTool, strokeColor, fillColor, activeWidth, rectRadius,
  onToolChange, onStrokeColorChange, onFillColorChange, onWidthChange, onRectRadiusChange,
  canUndo = false, canRedo = false, onUndo, onRedo,
  selectMode = 'pointer', selectScope = 'all', onSelectModeChange, onSelectScopeChange,
}: NNLToolbarProps) {
  const [picking, setPicking] = useState<Picking>(null)
  const [orientation, setOrientation] = useState<ToolbarOrientation>(
    () => (localStorage.getItem(LS_ORIENT) as ToolbarOrientation | null) ?? 'vertical-left'
  )
  // Long-press flyout pour le bouton Sélection (v0.90.5)
  const [selectFlyout, setSelectFlyout] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Long-press flyout pour le bouton "Formes" groupé (Rectangle/Ellipse, sous-chantier 6 point 3
  // prep, 2026-07-29) — même mécanique que le bouton Sélection : clic court réactive la dernière
  // forme choisie, long-press ouvre le flyout de choix. `lastShapeTool` mémorise ce choix pour
  // que le clic court sache quoi réactiver quand un autre outil (ex. Sélection) est actif.
  const [shapeFlyout, setShapeFlyout] = useState(false)
  const [lastShapeTool, setLastShapeTool] = useState<'rect' | 'ellipse'>('rect')
  const shapeLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fermer les flyouts si clic en dehors
  useEffect(() => {
    if (!selectFlyout && !shapeFlyout) return
    function handleClose() { setSelectFlyout(false); setShapeFlyout(false) }
    window.addEventListener('mousedown', handleClose)
    return () => window.removeEventListener('mousedown', handleClose)
  }, [selectFlyout, shapeFlyout])

  // Garde `lastShapeTool` synchronisé si l'outil actif devient rect/ellipse par un autre biais
  // (raccourci clavier R/E par exemple), pour que le bouton groupé reste cohérent.
  useEffect(() => {
    if (activeTool === 'rect' || activeTool === 'ellipse') setLastShapeTool(activeTool)
  }, [activeTool])

  const isHoriz = orientation === 'horizontal-bottom'
  const showSizes  = (['pen', 'marker', 'rect', 'ellipse', 'arrow'] as NNLTool[]).includes(activeTool)
  const showRadius = activeTool === 'rect'

  function cycleOrientation() {
    const next: ToolbarOrientation = orientation === 'vertical-left' ? 'horizontal-bottom' : 'vertical-left'
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
  // 'ellipse' n'a pas son propre bouton : fusionné avec 'rect' dans le bouton "Formes" groupé
  // ci-dessous (voir cas spécial tool.id === 'rect').
  let lastGroup: string | null = null
  const toolButtons = TOOLS.filter(tool => tool.id !== 'ellipse').map(tool => {
    const showDiv = lastGroup !== null && lastGroup !== tool.group
    lastGroup = tool.group

    // Bouton Sélection : long-press flyout + chevron (v0.90.5)
    if (tool.id === 'select') {
      const isActive = activeTool === 'select'
      const selectPos: React.CSSProperties = isHoriz
        ? { position: 'absolute', bottom: 42, left: 0 }
        : { position: 'absolute', left: 42, top: 0 }
      // Icône dynamique selon le mode actif
      const selectIcon = selectMode === 'lasso' ? ICO_LASSO_SELECT
        : selectMode === 'rect' ? ICO_RECT_SELECT
        : ICO_SELECT

      function applySelectMode(m: 'pointer' | 'rect' | 'lasso') {
        onSelectModeChange?.(m)
        onToolChange('select')
        setSelectFlyout(false)
      }

      return (
        <React.Fragment key={tool.id}>
          {showDiv && divider}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              data-testid="nnl-tool-select"
              data-tool-active={isActive ? 'true' : undefined}
              title="Sélection (V) — maintenir pour choisir le mode"
              onMouseDown={e => {
                e.stopPropagation()
                longPressTimerRef.current = setTimeout(() => {
                  longPressTimerRef.current = null
                  setSelectFlyout(v => !v)
                }, 500)
              }}
              onMouseUp={e => {
                e.stopPropagation()
                if (longPressTimerRef.current !== null) {
                  // Clic court : activer l'outil sélection sans changer le mode
                  clearTimeout(longPressTimerRef.current)
                  longPressTimerRef.current = null
                  onToolChange('select'); setPicking(null)
                }
                // Si long-press : le flyout est déjà ouvert, ne rien faire ici
              }}
              onMouseLeave={() => {
                if (longPressTimerRef.current !== null) {
                  clearTimeout(longPressTimerRef.current)
                  longPressTimerRef.current = null
                }
              }}
              style={{
                width: 34, height: 34, border: 'none', borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-muted)',
                transition: 'background .12s, color .12s', flexShrink: 0,
                position: 'relative',
              }}>
              <Svg d={selectIcon} size={16} />
              {/* Chevron bas-droite — triangle pointant bas-droite (style Figma) */}
              <svg width="5" height="5" viewBox="0 0 5 5" style={{
                position: 'absolute', bottom: 4, right: 4,
                fill: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text-faint)',
              }}>
                <polygon points="0,5 5,5 5,0" />
              </svg>
            </button>

            {/* Flyout mode rect / lasso */}
            {selectFlyout && (
              <div onMouseDown={e => e.stopPropagation()}
                style={{
                  ...selectPos,
                  position: 'absolute', zIndex: 300,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: 6, boxShadow: '0 4px 16px rgba(0,0,0,.18)',
                  display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140,
                }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '2px 4px 4px' }}>
                  Mode sélection
                </div>
                {([
                  { m: 'pointer' as const, label: 'Sélection',    icon: ICO_SELECT        },
                  { m: 'rect'    as const, label: 'Rectangle',    icon: ICO_RECT_SELECT   },
                  { m: 'lasso'   as const, label: 'Lasso',        icon: ICO_LASSO_SELECT  },
                ]).map(({ m, label, icon }) => (
                  <button key={m}
                    onMouseUp={() => applySelectMode(m)}
                    onClick={() => applySelectMode(m)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', border: 'none', borderRadius: 7, cursor: 'pointer',
                      background: selectMode === m ? 'var(--primary-light)' : 'transparent',
                      color: selectMode === m ? 'var(--primary)' : 'var(--text)',
                      fontSize: 12, fontWeight: selectMode === m ? 600 : 400,
                    }}>
                    <Svg d={icon} size={14} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </React.Fragment>
      )
    }

    // Bouton "Formes" groupé : Rectangle + Ellipse (sous-chantier 6 point 3 prep, 2026-07-29).
    // Même mécanique que le bouton Sélection : clic court réactive la dernière forme choisie,
    // long-press ouvre un flyout de choix. Extensible : un futur type de forme n'aurait qu'à
    // rejoindre le tableau `shapeChoices` ci-dessous.
    if (tool.id === 'rect') {
      const isActive = activeTool === 'rect' || activeTool === 'ellipse'
      const shapePos: React.CSSProperties = isHoriz
        ? { position: 'absolute', bottom: 42, left: 0 }
        : { position: 'absolute', left: 42, top: 0 }
      // Icône fixe "Formes" (pas dynamique selon la forme active, contrairement au bouton
      // Sélection) — demandé par Julien, l'état actif se voit déjà au fond coloré du bouton.
      const shapeIcon = ICO_SHAPES

      function applyShapeTool(t: 'rect' | 'ellipse') {
        setLastShapeTool(t)
        onToolChange(t); setPicking(null)
        setShapeFlyout(false)
      }

      const shapeChoices: Array<{ t: 'rect' | 'ellipse'; label: string; icon: string; key: string }> = [
        { t: 'rect',    label: 'Rectangle', icon: ICO_RECT,    key: 'R' },
        { t: 'ellipse', label: 'Ellipse',   icon: ICO_ELLIPSE, key: 'E' },
      ]

      return (
        <React.Fragment key="shapes-group">
          {showDiv && divider}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              data-testid="nnl-tool-shapes"
              data-tool-active={isActive ? 'true' : undefined}
              title="Formes (R/E) — maintenir pour choisir"
              onMouseDown={e => {
                e.stopPropagation()
                shapeLongPressTimerRef.current = setTimeout(() => {
                  shapeLongPressTimerRef.current = null
                  setShapeFlyout(v => !v)
                }, 500)
              }}
              onMouseUp={e => {
                e.stopPropagation()
                if (shapeLongPressTimerRef.current !== null) {
                  clearTimeout(shapeLongPressTimerRef.current)
                  shapeLongPressTimerRef.current = null
                  applyShapeTool(lastShapeTool)
                }
              }}
              onMouseLeave={() => {
                if (shapeLongPressTimerRef.current !== null) {
                  clearTimeout(shapeLongPressTimerRef.current)
                  shapeLongPressTimerRef.current = null
                }
              }}
              style={{
                width: 34, height: 34, border: 'none', borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-muted)',
                transition: 'background .12s, color .12s', flexShrink: 0,
                position: 'relative',
              }}>
              <Svg d={shapeIcon} size={16} />
              <svg width="5" height="5" viewBox="0 0 5 5" style={{
                position: 'absolute', bottom: 4, right: 4,
                fill: isActive ? 'rgba(255,255,255,0.7)' : 'var(--text-faint)',
              }}>
                <polygon points="0,5 5,5 5,0" />
              </svg>
            </button>

            {shapeFlyout && (
              <div onMouseDown={e => e.stopPropagation()}
                style={{
                  ...shapePos,
                  position: 'absolute', zIndex: 300,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: 6, boxShadow: '0 4px 16px rgba(0,0,0,.18)',
                  display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140,
                }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '2px 4px 4px' }}>
                  Formes
                </div>
                {shapeChoices.map(({ t, label, icon, key }) => (
                  <button key={t}
                    onMouseUp={() => applyShapeTool(t)}
                    onClick={() => applyShapeTool(t)}
                    title={`${label} (${key})`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', border: 'none', borderRadius: 7, cursor: 'pointer',
                      background: activeTool === t ? 'var(--primary-light)' : 'transparent',
                      color: activeTool === t ? 'var(--primary)' : 'var(--text)',
                      fontSize: 12, fontWeight: activeTool === t ? 600 : 400,
                    }}>
                    <Svg d={icon} size={14} />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </React.Fragment>
      )
    }

    return (
      <React.Fragment key={tool.id}>
        {showDiv && divider}
        <button
          data-testid={`nnl-tool-${tool.id}`}
          data-tool-active={activeTool === tool.id ? 'true' : undefined}
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

  // ── Settings bar outil Sélection — scope seulement (v0.90.5) ────────────
  // Le mode rect/lasso est accessible via long-press uniquement
  const selectSettingsSection = activeTool === 'select' ? (
    <>
      {divider}
      <div style={{
        display: 'flex', flexDirection: isHoriz ? 'row' : 'column',
        alignItems: 'center', gap: 3, flexShrink: 0,
      }}>
        {(['all', 'active'] as const).map(s => (
          <button key={s}
            data-testid={`nnl-select-scope-${s}`}
            title={s === 'all' ? 'Tous les calques' : 'Calque actif seulement'}
            onClick={() => onSelectScopeChange?.(s)}
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: selectScope === s ? 'var(--primary-light)' : 'transparent',
              color: selectScope === s ? 'var(--primary)' : 'var(--text-muted)',
            }}>
            {/* Icônes reicon.dev — layers2 (filled, "all") / layers-alt (filled, "active") */}
            {s === 'all' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.62442 4.4489C9.50121 3.69796 10.6208 3.25 12 3.25C13.3792 3.25 14.4988 3.69796 16.3756 4.4489L19.3451 5.6367C20.2996 6.01851 21.0728 6.32776 21.6035 6.60601C21.8721 6.74683 22.1323 6.90648 22.333 7.09894C22.5392 7.29668 22.75 7.59658 22.75 8C22.75 8.40342 22.5392 8.70332 22.333 8.90106C22.1323 9.09352 21.8721 9.25317 21.6035 9.39399C21.0728 9.67223 20.2996 9.98148 19.3451 10.3633L16.3756 11.5511C14.4988 12.302 13.3792 12.75 12 12.75C10.6208 12.75 9.50121 12.302 7.62443 11.5511L4.65495 10.3633C3.70037 9.98149 2.9272 9.67223 2.39647 9.39399C2.12786 9.25317 1.86765 9.09352 1.66701 8.90106C1.46085 8.70332 1.25 8.40342 1.25 8C1.25 7.59658 1.46085 7.29668 1.66701 7.09894C1.86765 6.90648 2.12786 6.74683 2.39647 6.60601C2.92721 6.32776 3.70037 6.01851 4.65496 5.63669L7.62442 4.4489Z"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M2.77477 11.7136C2.35804 11.8804 1.98539 12.0303 1.66701 12.1589C1.46085 12.3567 1.25 12.6566 1.25 13.0602C1.25 13.4636 1.46085 13.7635 1.66701 13.9613C1.86765 14.1537 2.12786 14.3134 2.39647 14.4542C2.9272 14.7324 3.70037 15.0417 4.65496 15.4235L7.62443 16.6113C9.50121 17.3622 10.6208 17.8102 12 17.8102C13.3792 17.8102 14.4988 17.3622 16.3756 16.6113L19.3451 15.4235C20.2996 15.0417 21.0728 14.7324 21.6035 14.4542C21.8721 14.3134 22.1323 14.1537 22.333 13.9613C22.5392 13.7635 22.75 13.4636 22.75 13.0602C22.75 12.6566 22.5392 12.3567 22.333 12.1589C22.0116 12.0293 21.6353 11.8783 21.2143 11.7103C20.5626 11.9589 19.8535 12.2363 19.1007 12.531L16.1313 13.7188C14.3005 14.4518 12.9875 15 12 15C11.0125 15 9.69954 14.4518 7.86874 13.7188L4.89927 12.531C4.14878 12.2371 3.44148 11.9605 2.77477 11.7136ZM1.25 18.1204C1.25 17.7168 1.46085 17.4169 1.66701 17.2191C1.98539 17.0905 2.35804 16.9406 2.77477 16.7738C3.44148 17.0207 4.14878 17.2973 4.89927 17.5912L7.86874 18.779C9.69954 19.512 11.0125 20.0602 12 20.0602C12.9875 20.0602 14.3005 19.512 16.1313 18.779L19.1007 17.5912C19.8535 17.2965 20.5626 17.0191 21.2143 16.7705C21.6353 16.9385 22.0116 17.0895 22.333 17.2191C22.5392 17.4169 22.75 17.7168 22.75 18.1204C22.75 18.5238 22.5392 18.8237 22.333 19.0215C22.1323 19.2139 21.8721 19.3736 21.6035 19.5144C21.0728 19.7926 20.2996 20.1019 19.3451 20.4837L16.3756 21.6715C14.4988 22.4224 13.3792 22.8704 12 22.8704C10.6208 22.8704 9.50121 22.4224 7.62443 21.6715L4.65495 20.4837C3.70037 20.1019 2.9272 19.7926 2.39647 19.5144C2.12786 19.3736 1.86765 19.2139 1.66701 19.0215C1.46085 18.8237 1.25 18.5238 1.25 18.1204Z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.5131 1.59529C12.5562 1.13636 11.4428 1.13637 10.486 1.5953L2.129 5.60345C0.956017 6.16603 0.956077 7.83614 2.1291 8.39864L10.4862 12.4061C11.4429 12.8649 12.5561 12.8649 13.5129 12.4061L21.8701 8.39864C23.0431 7.83615 23.0432 6.16602 21.8702 5.60345L13.5131 1.59529Z"/>
                <path d="M3.60467 11.559C3.97815 11.3799 4.1357 10.9319 3.95657 10.5585C3.77745 10.185 3.32947 10.0274 2.95599 10.2066L2.12873 10.6033C0.955742 11.1659 0.955802 12.836 2.12883 13.3985L10.4859 17.406C11.4427 17.8647 12.5559 17.8647 13.5126 17.406L21.8698 13.3985C23.0429 12.836 23.0429 11.1659 21.8699 10.6033L21.043 10.2067C20.6695 10.0276 20.2216 10.1852 20.0424 10.5586C19.8633 10.9321 20.0209 11.3801 20.3943 11.5592L21.2213 11.9558C21.2312 11.9606 21.236 11.9645 21.238 11.9664C21.2401 11.9683 21.2416 11.9702 21.243 11.9724C21.2459 11.9773 21.2497 11.9871 21.2497 12.0009C21.2497 12.0147 21.2459 12.0245 21.2429 12.0294C21.2416 12.0316 21.2401 12.0335 21.238 12.0354C21.236 12.0373 21.2312 12.0412 21.2213 12.046L12.864 16.0534C12.3173 16.3156 11.6812 16.3156 11.1345 16.0534L2.7774 12.046C2.7675 12.0412 2.76268 12.0373 2.76068 12.0354C2.75853 12.0335 2.75703 12.0316 2.75573 12.0294C2.75279 12.0245 2.74902 12.0147 2.74902 12.0009C2.74902 11.9871 2.75279 11.9773 2.75572 11.9724C2.75703 11.9702 2.75853 11.9683 2.76067 11.9664C2.76268 11.9645 2.76749 11.9606 2.7774 11.9558L3.60467 11.559Z"/>
                <path d="M3.60467 16.559C3.97815 16.3799 4.1357 15.9319 3.95657 15.5585C3.77745 15.185 3.32947 15.0274 2.95599 15.2066L2.12873 15.6033C0.955742 16.1659 0.955802 17.836 2.12883 18.3985L10.4859 22.406C11.4427 22.8647 12.5559 22.8647 13.5126 22.406L21.8698 18.3985C23.0429 17.836 23.0429 16.1659 21.8699 15.6033L21.043 15.2067C20.6695 15.0276 20.2216 15.1852 20.0424 15.5586C19.8633 15.9321 20.0209 16.3801 20.3943 16.5592L21.2213 16.9558C21.2312 16.9606 21.236 16.9645 21.238 16.9664L21.2405 16.9689L21.243 16.9724C21.2459 16.9773 21.2497 16.9871 21.2497 17.0009C21.2497 17.0147 21.2459 17.0245 21.2429 17.0294C21.2416 17.0316 21.2401 17.0335 21.238 17.0354C21.236 17.0373 21.2312 17.0412 21.2213 17.046L12.864 21.0534C12.3173 21.3156 11.6812 21.3156 11.1345 21.0534L2.7774 17.046C2.7675 17.0412 2.76268 17.0373 2.76068 17.0354C2.75853 17.0335 2.75703 17.0316 2.75573 17.0294C2.75279 17.0245 2.74902 17.0147 2.74902 17.0009C2.74902 16.9871 2.75279 16.9773 2.75572 16.9724C2.75703 16.9702 2.75853 16.9683 2.76067 16.9664C2.76268 16.9645 2.76749 16.9606 2.7774 16.9558L3.60467 16.559Z"/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </>
  ) : null

  // ── Palette popover (positionnée DANS le conteneur relatif) ───────────────
  // Position selon orientation : droite ou haut
  const palettePos: React.CSSProperties = isHoriz
    ? { position: 'absolute', bottom: 42, left: 0 }
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
  const orientIcon  = isHoriz ? ICO_V_LEFT  : ICO_H_BOT
  const orientLabel = isHoriz ? 'Barre à gauche' : 'Barre en bas'

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
        position: 'absolute', left: 12,
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
      {selectSettingsSection}

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
