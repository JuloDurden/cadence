import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Phase 7, sécurité (2026-08-23) : CSP stricte injectée uniquement dans le build de production
// (`vite build`), jamais en dev (`vite dev`) - le serveur de dev de Vite s'appuie sur des scripts
// injectés et sur `eval` pour le Hot Module Replacement, qu'une CSP stricte casserait aussitôt.
// En balise <meta> plutôt qu'en en-tête HTTP : le backend Fastify (routes/*.ts) ne sert jamais les
// fichiers statiques du frontend (aucun @fastify/static trouvé dans index.ts, uniquement l'API
// JSON + WebSocket) - un en-tête posé côté Fastify n'aurait donc aucun effet sur la page réellement
// chargée par le navigateur. La balise <meta> voyage avec le build statique quel que soit l'hébergeur
// final, au prix de ne pas pouvoir fixer `frame-ancestors`/`report-uri` (ignorés par les navigateurs
// hors en-tête HTTP - sans gravité ici, aucun besoin d'iframe ni de reporting CSP pour l'instant).
function cspPlugin(): Plugin {
  // Dérivé de VITE_API_URL (même variable que frontend/src/services/api.ts, BASE_URL) plutôt que
  // dupliqué en dur : le backend peut tourner sur une autre origine que le frontend en production.
  const apiUrl = process.env.VITE_API_URL ?? 'http://localhost:3001'
  const wsUrl = apiUrl.replace(/^http/, 'ws')
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // 'unsafe-inline' uniquement sur style-src : l'app utilise massivement `style={{...}}` en
    // React (attributs style inline dans le DOM final), qu'aucune CSP sans nonce/hash ne peut
    // couvrir autrement - script-src, lui, reste strict, sans 'unsafe-inline' ni 'unsafe-eval'.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${apiUrl} ${wsUrl}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  return {
    name: 'cadence-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspPlugin()],
})
