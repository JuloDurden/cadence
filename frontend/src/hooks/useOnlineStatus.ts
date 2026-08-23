import { useEffect, useState } from 'react'

// Phase 7, PWA (sous-chantier 5/5, 2026-08-23) : décision actée avec Julien - PWA "niveau simple",
// lecture seule hors connexion, pas d'édition offline (voir vite.config.ts, commentaire du plugin
// PWA). `saveToServer` (StateContext.tsx) échoue déjà silencieusement hors connexion - un compte
// qui modifie quelque chose sans réseau voit son changement s'appliquer localement (optimiste) sans
// jamais être écrit en base, sans le moindre signal. Ce hook ne change pas ce comportement (hors
// périmètre : construire une vraie file d'attente de sauvegarde différée serait un chantier à part
// entière), il se contente de rendre l'état hors connexion visible pour l'utilisateur plutôt que
// silencieux (voir OfflineBanner.tsx).
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    function goOnline() { setOnline(true) }
    function goOffline() { setOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
