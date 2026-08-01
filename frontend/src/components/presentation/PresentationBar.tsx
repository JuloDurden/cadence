import { usePresentationMode } from '../../context/PresentationModeContext'

// Phase 3 (roadmap v1), Mode présentation — barre flottante minimale affichée quand un compte
// connecté est en mode présentation (voir PresentationModeContext.tsx). Rappelle les raccourcis
// clavier (←/→ pour naviguer, Echap pour quitter) et donne un moyen explicite de quitter à la
// souris pour qui n'a pas envie de chercher le raccourci clavier.
export function PresentationBar() {
  const { active, exit } = usePresentationMode()
  if (!active) return null

  return (
    <div
      data-testid="presentation-bar"
      style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10001, display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999,
        boxShadow: 'var(--shadow)', padding: '8px 16px', fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--text-muted, #666)' }}>Mode présentation — ← → pour naviguer</span>
      <button data-testid="presentation-exit" className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={exit}>
        Quitter (Echap)
      </button>
    </div>
  )
}
