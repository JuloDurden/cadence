import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './styles/hierCards.css'
import App from './App.tsx'

// Phase 7, PWA (sous-chantier 5/5, 2026-08-23) : enregistrement du service worker via le module
// virtuel de vite-plugin-pwa (voir vite.config.ts, `injectRegister: false`) plutôt que le script
// injecté par défaut - bundlé en JS "self", compatible avec la CSP stricte (script-src 'self',
// sans 'unsafe-inline'). Restreint à la production (même principe que `cspPlugin`, `apply:
// 'build'`, vite.config.ts) : `devOptions` n'est pas activé, un service worker enregistré en dev
// interfèrerait avec le Hot Module Replacement de Vite.
if (import.meta.env.PROD) registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
