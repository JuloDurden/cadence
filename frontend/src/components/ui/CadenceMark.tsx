import { CADENCE_MARK_VIEWBOX, CADENCE_MARK_TRANSFORM, CADENCE_MARK_PATH } from '../../assets/cadenceMark'

// Extrait de LoginPage.tsx (refonte du login, 2026-08-17) : composant partagé maintenant que la
// marque Cadence est utilisée à un 3e endroit (Sidebar, retour Julien 2026-08-17 : "logo-icon, si
// aucun logo n'est chargé, soit le CadenceMark avec la couleur principale"), en plus de l'avatar
// et de la petite marque de l'écran de connexion (LoginPage.tsx). Le tracé/viewBox restent dans
// assets/cadenceMark.ts (aussi consommés bruts par le favicon dynamique, StateContext.tsx, qui
// construit sa propre data-URI hors React).
const MARK_ASPECT = 1502 / 1254

export function CadenceMark({ color, size, testId }: { color: string; size: number; testId?: string }) {
  return (
    <svg viewBox={CADENCE_MARK_VIEWBOX} width={size} height={size / MARK_ASPECT} aria-hidden="true" data-testid={testId}>
      <path d={CADENCE_MARK_PATH} fill={color} transform={CADENCE_MARK_TRANSFORM} />
    </svg>
  )
}
