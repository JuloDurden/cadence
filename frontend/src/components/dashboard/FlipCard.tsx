import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface Props {
  /** Mode "Personnaliser" de la page (voir DashboardPage.tsx) — le bouton Réglages n'apparaît que
   *  dans ce mode, comme le reste des contrôles d'édition d'un widget (drag/taille/suppression,
   *  voir DashboardWidgetGrid.tsx). Si `editable` repasse à `false` pendant que la face cachée est
   *  affichée (sortie du mode édition), on revient automatiquement à la face visible. */
  editable: boolean
  front: ReactNode
  back: ReactNode
}

/* ── Tiny inline SVG helper (même convention que Header.tsx) ──────────── */
function Svg({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  )
}
const ICO_SETTINGS = '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
const ICO_ARROW_LEFT = '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'

// Face cachée générique d'un widget Dashboard (2026-08-04) — construit générique dès le départ
// (props front/back), pas juste pour SprintProgressCard ; VelocityChart.tsx (2026-08-06) en est le
// 2e cas concret, l'API front/back n'a pas eu besoin de changer.
// Déclencheur : bouton "Réglages" en haut à droite du widget, visible seulement en mode
// "Personnaliser" — pas dans la barre d'édition générique de DashboardWidgetGrid.tsx
// (drag/taille/suppression), qui reste volontairement agnostique du contenu de chaque widget.
// Note technique : `backface-visibility: hidden` seul ne suffit pas — la face "derrière" reste dans
// le flux (bounding box non nulle), donc cliquable et considérée "visible" par les tests Playwright
// même quand elle ne devrait pas l'être. `visibility`/`pointer-events`/`aria-hidden` explicites sur
// la face inactive, en plus de la rotation 3D (qui ne fait que l'animation visuelle).
export function FlipCard({ editable, front, back }: Props) {
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    if (!editable) setFlipped(false)
  }, [editable])

  return (
    <div className="dash-flip">
      <div className={`dash-flip-inner${flipped ? ' dash-flip-flipped' : ''}`}>
        <div className="dash-flip-face dash-flip-front" style={{ visibility: flipped ? 'hidden' : 'visible', pointerEvents: flipped ? 'none' : 'auto' }} aria-hidden={flipped}>
          {front}
          {editable && (
            <button
              type="button"
              className="dash-flip-corner-btn"
              title="Réglages du widget"
              data-testid="dashboard-widget-flip-settings"
              onClick={() => setFlipped(true)}
            >
              <Svg d={ICO_SETTINGS} />
            </button>
          )}
        </div>
        <div className="dash-flip-face dash-flip-back" style={{ visibility: flipped ? 'visible' : 'hidden', pointerEvents: flipped ? 'auto' : 'none' }} aria-hidden={!flipped}>
          {back}
          <button
            type="button"
            className="dash-flip-corner-btn"
            title="Retour"
            data-testid="dashboard-widget-flip-back"
            onClick={() => setFlipped(false)}
          >
            <Svg d={ICO_ARROW_LEFT} />
          </button>
        </div>
      </div>
    </div>
  )
}
