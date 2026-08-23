import { useOnlineStatus } from '../../hooks/useOnlineStatus'

// Phase 7, PWA (sous-chantier 5/5, 2026-08-23) : PWA "niveau simple" - l'app shell reste utilisable
// hors connexion (mise en cache, voir vite.config.ts) mais aucune modification n'est réellement
// sauvegardée hors ligne (`saveToServer`, StateContext.tsx, échoue déjà silencieusement, comportement
// historique inchangé ici). Ce bandeau rend cette limite visible plutôt que silencieuse : il ne
// bloque aucune saisie (hors périmètre "niveau simple"), il informe seulement.
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div className="offline-banner" role="status" data-testid="offline-banner">
      Hors connexion : les données affichées peuvent être obsolètes et vos modifications ne seront pas enregistrées.
    </div>
  )
}
