import { useNavigate, useLocation } from 'react-router-dom'
import { usePresentationMode } from '../../context/PresentationModeContext'
import { PresentationThumbnails } from './PresentationThumbnails'

// Phase 3 (roadmap v1), Mode présentation — barre flottante minimale affichée quand un compte
// connecté est en mode présentation (voir PresentationModeContext.tsx). Rappelle les raccourcis
// clavier (←/→ pour naviguer, Echap pour quitter) et donne un moyen explicite de quitter à la
// souris pour qui n'a pas envie de chercher le raccourci clavier.
//
// Chantier "Vignettes au survol" (2026-08-02) — `.presentation-bar-wrap` porte désormais le
// positionnement fixe (avant sur `.presentation-bar` directement) : le panneau de vignettes
// (`PresentationThumbnails`) doit s'ancrer au-dessus de la barre via `position: absolute`, ce qui
// exige un ancêtre positionné commun aux deux (voir index.css, `.presentation-thumbs-panel`).
export function PresentationBar() {
  const { active, exit, pages } = usePresentationMode()
  const navigate = useNavigate()
  const location = useLocation()
  if (!active) return null

  const currentPath = location.pathname + location.search

  return (
    <div className="presentation-bar-wrap" data-testid="presentation-bar-wrap">
      <PresentationThumbnails pages={pages} currentPath={currentPath} onSelect={page => navigate(page.path)} />
      <div
        data-testid="presentation-bar"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999,
          boxShadow: 'var(--shadow)', padding: '8px 16px', fontSize: 13,
        }}
      >
        <span style={{ color: 'var(--text-muted, #666)' }}>Mode présentation — ← → pour naviguer</span>
        <button data-testid="presentation-exit" className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={exit}>
          Quitter (Echap)
        </button>
      </div>
    </div>
  )
}
