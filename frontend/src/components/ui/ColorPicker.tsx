import { useState, useRef, useEffect } from 'react'

export interface ColorSwatchDef { color: string; label?: string }

// Palette par défaut reprise de celle du canevas NNL (frontend/src/components/nnl/NNLToolbar.tsx,
// const PALETTE) — sans l'option "none" (remplissage transparent), qui n'a pas de sens pour une
// couleur d'usage général. Un appelant peut fournir sa propre palette (prop `palette`) plus
// pertinente pour son contexte — voir `utils/kanbanStages.ts::STATUS_COLOR_PALETTE`, utilisée par
// les colonnes Kanban de Réglages plutôt que cette palette générique (2026-07-27).
const DEFAULT_PALETTE: ColorSwatchDef[] = [
  { color: '#1e293b' }, { color: '#94a3b8' }, { color: '#ef4444' }, { color: '#f97316' }, { color: '#fbbf24' },
  { color: '#22c55e' }, { color: '#3b82f6' }, { color: '#8b5cf6' }, { color: '#ec4899' }, { color: '#40e0d0' },
  { color: '#ffffff' }, { color: '#000000' },
]

function Swatch({ color, size = 22, selected = false }: { color: string; size?: number; selected?: boolean }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 4,
      background: color,
      border: selected ? '2px solid var(--primary)' : '1px solid var(--border)',
      boxSizing: 'border-box', flexShrink: 0,
    }} />
  )
}

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  size?: number
  /** Palette proposée dans le popover — par défaut la palette générique de dessin (voir
   *  DEFAULT_PALETTE ci-dessus). Passer une palette dédiée au contexte d'usage si plus pertinente
   *  (ex. couleurs de statuts pour les colonnes Kanban). */
  palette?: ColorSwatchDef[]
}

// Color picker riche (palette prédéfinie cliquable + <input type="color"> natif en repli
// pour une couleur libre + code hex affiché), sur le modèle de celui du canevas NNL
// (docs/corrections futures.md, Réglages : "remplacer le sélecteur de couleur natif"). Généraliste
// pour être réutilisable ailleurs qu'aux colonnes Kanban si besoin — la palette proposée est
// personnalisable via la prop `palette`.
export function ColorPicker({ value, onChange, size = 28, palette = DEFAULT_PALETTE }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        data-testid="color-picker-trigger"
        onClick={() => setOpen(o => !o)}
        title="Choisir une couleur"
        style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', borderRadius: size / 4 }}
      >
        <Swatch color={value} size={size} />
      </button>

      {open && (
        <div
          data-testid="color-picker-popover"
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: size + 6, left: 0, zIndex: 200,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,.18)', minWidth: 160,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 22px)', gap: 4 }}>
            {palette.map(({ color: c, label }) => (
              <div key={c} data-testid="color-picker-swatch" title={label ? `${label} (${c})` : c} style={{ cursor: 'pointer' }} onClick={() => { onChange(c); setOpen(false) }}>
                <Swatch color={c} size={22} selected={c.toLowerCase() === value.toLowerCase()} />
              </div>
            ))}
          </div>
          {/* Sélecteur couleur libre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <div style={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
              <Swatch color={value} size={22} />
              <input
                type="color"
                value={value}
                onChange={e => { onChange(e.target.value); setOpen(false) }}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
              />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{value}</span>
          </div>
        </div>
      )}
    </div>
  )
}
