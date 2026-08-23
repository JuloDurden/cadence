import { useState, useEffect, useRef } from 'react'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useModalFocus } from '../../hooks/useModalFocus'

// Recadrage d'image (déplacement + zoom), extrait de TeamPage.tsx (2026-08-19) pour être
// réutilisé par le logo d'équipe (AppearanceSection.tsx, retour Julien : "ce serait bien de
// pouvoir recadrer l'image du logo, déplacement + zoom comme les photos de profil de l'équipe").
// `shape` distingue les deux usages : 'circle' (photos de profil, historique, clip circulaire
// baké dans l'image exportée) vs 'square' (logo d'équipe, pas de clip baké, chaque contexte
// d'affichage applique son propre `border-radius` en CSS, voir AppearanceSection.tsx/Sidebar.tsx,
// qui n'ont pas toujours le même arrondi).
interface ImageCropModalProps {
  src: string
  shape?: 'circle' | 'square'
  title?: string
  onConfirm: (cropped: string) => void
  onCancel: () => void
}

export function ImageCropModal({ src, shape = 'circle', title = 'Recadrer la photo', onConfirm, onCancel }: ImageCropModalProps) {
  useEscapeToClose(onCancel)
  const modalRef = useModalFocus<HTMLDivElement>()
  const SIZE = 220
  const [pos, setPos]   = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, px: 0, py: 0 })
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const img = new window.Image()
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = src
  }, [src])

  const coverScale = naturalSize
    ? Math.max(SIZE / naturalSize.w, SIZE / naturalSize.h)
    : 1
  const displayW = naturalSize ? naturalSize.w * coverScale * scale : SIZE
  const displayH = naturalSize ? naturalSize.h * coverScale * scale : SIZE

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setDragging(true)
    setDragStart({ mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y })
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    setPos({ x: dragStart.px + e.clientX - dragStart.mx, y: dragStart.py + e.clientY - dragStart.my })
  }
  function onMouseUp() { setDragging(false) }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setScale(s => Math.max(0.5, Math.min(6, s + (e.deltaY < 0 ? 0.08 : -0.08))))
  }
  // Équivalent clavier au glisser-déposer/molette souris (recadrage jusque-là non
  // utilisable au clavier, retour Julien du 2026-08-24 : flèches pour déplacer, +/- pour zoomer.
  const MOVE_STEP = 10
  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowUp':    e.preventDefault(); setPos(p => ({ ...p, y: p.y - MOVE_STEP })); break
      case 'ArrowDown':  e.preventDefault(); setPos(p => ({ ...p, y: p.y + MOVE_STEP })); break
      case 'ArrowLeft':  e.preventDefault(); setPos(p => ({ ...p, x: p.x - MOVE_STEP })); break
      case 'ArrowRight': e.preventDefault(); setPos(p => ({ ...p, x: p.x + MOVE_STEP })); break
      case '+':
      case '=':
        e.preventDefault(); setScale(s => Math.min(6, s + 0.08)); break
      case '-':
      case '_':
        e.preventDefault(); setScale(s => Math.max(0.5, s - 0.08)); break
      default: break
    }
  }

  function confirm() {
    if (!naturalSize) { onConfirm(src); return }
    const OUT = 400  // max 500px demandé, 400 pour le cercle d'avatar, repris tel quel pour le logo
    const canvas = document.createElement('canvas')
    canvas.width = OUT; canvas.height = OUT
    const ctx = canvas.getContext('2d')!
    if (shape === 'circle') {
      ctx.beginPath()
      ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2)
      ctx.clip()
    }
    // 'square' : pas de clip baké dans l'image exportée, chaque contexte d'affichage arrondit à
    // sa façon (voir commentaire en tête de fichier).
    const img = new window.Image()
    img.onload = () => {
      try {
        const r = OUT / SIZE
        const w = naturalSize.w * coverScale * scale * r
        const h = naturalSize.h * coverScale * scale * r
        const x = (OUT - w) / 2 + pos.x * r
        const y = (OUT - h) / 2 + pos.y * r
        ctx.drawImage(img, x, y, w, h)
        onConfirm(canvas.toDataURL('image/webp', 0.80))
      } catch {
        // CORS sur URL externe, retourner la src telle quelle
        onConfirm(src)
      }
    }
    img.crossOrigin = 'anonymous'
    img.src = src
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" ref={modalRef} tabIndex={-1} style={{ width: 340 }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body" style={{ alignItems: 'center', gap: 14 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
            Glisser pour repositionner · Molette pour zoomer · Flèches et +/- au clavier
          </p>
          <div
            role="application"
            tabIndex={0}
            aria-label="Zone de recadrage. Flèches pour déplacer l'image, plus et moins pour zoomer."
            style={{
              width: SIZE, height: SIZE, borderRadius: shape === 'circle' ? '50%' : 16, overflow: 'hidden',
              cursor: dragging ? 'grabbing' : 'grab', border: '3px solid var(--primary)',
              userSelect: 'none', position: 'relative', flexShrink: 0, background: '#000',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
          >
            <img
              ref={imgRef}
              src={src}
              draggable={false}
              alt="crop"
              style={{
                position: 'absolute',
                width: displayW, height: displayH,
                left: '50%', top: '50%',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                pointerEvents: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: SIZE }}>
            <span style={{ fontSize: 14 }}>−</span>
            <input type="range" min={50} max={600} value={Math.round(scale * 100)}
              onChange={e => setScale(+e.target.value / 100)} style={{ flex: 1 }} />
            <span style={{ fontSize: 14 }}>+</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>Annuler</button>
          <button className="btn-primary" onClick={confirm}>Confirmer</button>
        </div>
      </div>
    </div>
  )
}
