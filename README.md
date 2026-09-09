# Cadence

[![Tests CI](https://github.com/JuloDurden/cadence/actions/workflows/ci.yml/badge.svg)](https://github.com/JuloDurden/cadence/actions/workflows/ci.yml)

Outil de planification de releases et de gestion produit pour équipes Agile (Backlog, Sprint Planning, Roadmap, Kanban, cérémonies Scrum). Application web installable (PWA), utilisable hors connexion en lecture seule, avec synchronisation en temps réel entre utilisateurs connectés simultanément.

## Stack technique

- **Frontend** : React 19 + TypeScript + Vite, React Router. PWA (`vite-plugin-pwa`/Workbox) : manifeste, service worker, app shell mise en cache.
- **Backend** : Fastify + TypeScript, Prisma/PostgreSQL, WebSocket (synchronisation temps réel + Daily Standup collaboratif).
- **Serveur MCP** (`mcp/`) : expose le Backlog, les sprints, l'équipe et les clients à Claude en lecture seule, avec les mêmes droits que le jeton utilisé.
- **Tests** : Playwright (E2E) + un runner de tests logiques zéro dépendance (`tests/run-tests.js`).

## Lancer en développement

Prérequis : Node 18+, une base PostgreSQL disponible (voir `backend/.env.example`).

```bash
# Backend
cd backend
cp .env.example .env      # ajuster DATABASE_URL/JWT_SECRET si besoin
npm install
npm run db:migrate        # applique les migrations Prisma
npm run db:seed           # crée le compte admin@cadence.local / cadence2026
npm run dev                # http://localhost:3001
```

```bash
# Frontend (autre terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Le frontend consomme l'API du backend (`VITE_API_URL`, `http://localhost:3001` par défaut). Le CORS du backend (`FRONTEND_URL` dans `backend/.env`) doit pointer vers l'origine réellement utilisée.

## Build de production

```bash
cd frontend && npm run build   # génère frontend/dist (app shell + manifeste + service worker)
cd backend  && npm run build   # génère backend/dist
cd backend  && npm start       # sert l'API compilée
```

`frontend/dist` est un bundle statique à héberger séparément (CDN, hébergeur statique...) ; le backend ne sert jamais les fichiers du frontend directement.

## Fonctionnalités

- **Backlog** : items hiérarchisés (Initiative > Epic > Item), scoring WSJF/RICE, DoR/DoD, notes avec pièces jointes et @mentions, tags, virtualisation des grandes listes, import/export Excel/CSV/Jira/GitHub.
- **Planification** : Release Planning (swimlanes, dépendances cross-sprint, capacité par sprint), Sprint Planning (vue Gantt par membre), Auto-planning avec mode What-if (scénarios comparés côte à côte), Roadmap.
- **Now/Next/Later** : tableau blanc collaboratif façon Miro (post-its, formes, dessin libre, calques).
- **Kanban** : board configurable, drag-and-drop, regroupement par Epic.
- **Cérémonies Scrum** : Daily Standup collaboratif en temps réel, Rétrospective (Start/Stop/Continue, Mad/Sad/Glad, 4Ls), Sprint Review.
- **Dashboard** : widgets personnalisables (burndown, vélocité, CFD, RAG client...).
- **Équipe & clients** : rôles/permissions, gestion des membres et absences, portefeuille client.
- **Compagnon IA** : assistant conversationnel avec actions sur le workspace (plans de sprint, etc.).
- **Intégrations** : GitHub, Slack, Jira, import Excel.
- **Mode présentation** : lecture seule partageable par lien public.
- **Changelog** : historique publié depuis l'app (réservé Admin), recherche, heatmap d'activité.
- **Sécurité** : CSP stricte en production, sanitisation des entrées, contrôle de concurrence optimiste sur les sauvegardes.
- **Accessibilité** : navigation clavier complète des fenêtres modales (Échap, piège de focus, restauration), noms accessibles sur les contrôles.

## Tests

```bash
# Depuis la racine du projet
npm install
npm run test:logic       # tests logiques (zéro navigateur)
npm run test:e2e         # tests E2E Playwright (headless)
npm run test:e2e:headed  # tests E2E avec le navigateur visible
npm test                 # tout lancer
```

Les tests E2E lancent automatiquement le serveur de développement du frontend (`playwright.config.js`) ; le backend n'a pas besoin de tourner (appels API mockés).

## Structure du projet

```
frontend/    Application React (Vite) - src/pages, src/components, src/context, src/hooks
backend/     API Fastify + Prisma - src/routes, prisma/schema.prisma
mcp/         Serveur MCP (lecture seule) pour l'intégration avec Claude
tests/       Suites Playwright (*.spec.js) + runner de tests logiques (run-tests.js)
docs/        Documentation interne du projet (état des pages, corrections, roadmap)
scripts/     Scripts ponctuels (migrations de données, génération de jeux de test...)
```

## CI/CD

GitHub Actions exécute les tests à chaque `push` et `pull_request` sur `main` (`.github/workflows/ci.yml`). Un badge de statut est affiché en haut de ce README.

## Licence

Usage interne - prototype non distribué.
