import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Dérivé de VITE_API_URL (même variable que frontend/src/services/api.ts, BASE_URL) plutôt que
// dupliqué en dur à 2 endroits (CSP ci-dessous ET mise en cache de l'API par le service worker,
// voir VitePWA plus bas) - le backend peut tourner sur une autre origine que le frontend en
// production.
const apiUrl = process.env.VITE_API_URL ?? 'http://localhost:3001'
const apiOrigin = new URL(apiUrl).origin

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

// Phase 7, PWA (sous-chantier 5/5, 2026-08-23) : décision actée avec Julien avant de coder (voir
// docs/roadmap-v1.md, pré-requis de la Phase 7) - PWA "niveau simple" : app shell en cache (l'app
// se recharge même hors connexion), lecture seule hors connexion, pas d'édition offline (aucune
// file d'attente de sauvegarde différée construite ici - `saveToServer`, StateContext.tsx, échoue
// déjà silencieusement hors connexion, comportement historique inchangé par ce chantier).
// `registerType: 'autoUpdate'` : le service worker se met à jour tout seul dès qu'une nouvelle
// version est disponible, sans invite ni rechargement forcé imposé à l'utilisateur - cohérent avec
// le reste de l'app qui n'a aucun mécanisme de notification de nouvelle version. `injectRegister:
// false` : l'enregistrement se fait à la main dans main.tsx via `virtual:pwa-register` (module
// importé, donc bundlé en JS "self") plutôt que par le `<script>` injecté par défaut dans
// index.html - la CSP stricte ci-dessus n'autorise que `script-src 'self'`, sans 'unsafe-inline' ;
// un script d'enregistrement injecté inline y serait bloqué.
function pwaPlugin() {
  return VitePWA({
    registerType: 'autoUpdate',
    injectRegister: false,
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'Cadence',
      short_name: 'Cadence',
      description: 'Planification produit et agile : backlog, sprints, roadmap, équipe.',
      start_url: '/',
      display: 'standalone',
      background_color: '#f5f5f7',
      theme_color: '#4f46e5',
      icons: [
        { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Bundle principal ~2.8 Mo (avertissement de taille de chunk préexistant, hors périmètre de
      // ce chantier - voir docs/corrections futures.md), au-dessus des 2 Mio par défaut de Workbox
      // pour la mise en cache de précaching. Relevé plutôt que de découper les chunks ici.
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      // Une navigation (changement de page côté React Router) hors connexion doit retomber sur
      // l'app shell mise en cache plutôt que sur une page d'erreur du navigateur - sauf pour les
      // appels vers le backend (autre origine possible, jamais une "page" à afficher).
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: [
        {
          // Uniquement les lectures (GET) vers le backend : les écritures (POST/PUT/DELETE) ne
          // sont jamais interceptées par cette règle et partent donc toujours en réseau direct,
          // avec l'échec silencieux déjà en place hors connexion (voir commentaire au-dessus) -
          // pas de nouvelle route ajoutée ici qui laisserait croire à une sauvegarde offline.
          urlPattern: ({ url, request }) =>
            request.method === 'GET' && url.origin === apiOrigin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/ws'),
          handler: 'NetworkFirst',
          method: 'GET',
          options: {
            cacheName: 'cadence-api-cache',
            networkTimeoutSeconds: 4,
            cacheableResponse: { statuses: [0, 200] },
            expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
            // L'authentification se fait par jeton Bearer en en-tête (localStorage, pas de cookie
            // de session, voir services/api.ts), jamais par l'URL seule - sans ceci, la clé de
            // cache par défaut de Workbox (l'URL seule) pourrait servir la réponse mise en cache
            // par un compte à un autre compte connecté ensuite dans le même navigateur.
            plugins: [{
              cacheKeyWillBeUsed: async ({ request }) =>
                `${request.url}::${request.headers.get('Authorization') ?? 'anon'}`,
            }],
          },
        },
      ],
    },
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspPlugin(), pwaPlugin()],
})
