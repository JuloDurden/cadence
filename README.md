# Cadence

Outil de planification de releases Agile pour équipes Scrum. Application web autonome, zéro dépendance, zéro installation.

## Fonctionnalités principales

- Release Planning multi-sprints avec drag-and-drop
- Product Backlog avec scoring WSJF / RICE / MoSCoW
- Kanban board configurable (catalogue de statuts)
- Dashboard : burndown, lead/cycle time, RAG clients
- DoR / DoD par item avec jauges de progression
- Daily Standup helper (timer, blockers, export)
- Rétrospective (Start/Stop/Continue, Mad/Sad/Glad)
- Auto-planning avec contraintes de capacité et dépendances
- Historique des actions + Undo Ctrl+Z
- Recherche globale Ctrl+K
- Export PDF et Excel
- Thème personnalisable via DESIGN.md
- Mode sombre / clair

## Lancer le prototype

Ouvrir `release-planning.html` directement dans le navigateur.

Aucune installation nécessaire — l'application est un fichier HTML autonome (zéro dépendance runtime).

## Tests

### Prérequis

- Node.js 18+
- npm

```bash
npm install
```

### Tests logiques (sans navigateur)

Vérifient les fonctions métier : statuts, tri, calculs SP.

```bash
npm run test:logic
```

### Tests E2E Playwright (avec navigateur)

Vérifient les interactions UI sur l'ensemble des fonctionnalités.

```bash
# Mode headless (CI)
npm run test:e2e

# Mode headed (voir le navigateur)
npm run test:e2e:headed
```

### Lancer tous les tests

```bash
npm test
```

## Structure du projet

```
release-planning.html   Application complète (HTML/CSS/JS monofichier)
demo-data.js            Données de démonstration AutoClaimsTech
DESIGN.md               Design system (tokens couleurs, typographie)
BACKLOG_FEATURES.md     Backlog des fonctionnalités futures
tests/
  fixtures.js           Données de test
  helpers.js            Utilitaires Playwright (loadWithState, goToTab)
  server.js             Serveur HTTP local pour les tests
  run-tests.js          Runner de tests logiques (zéro dépendance)
  kanban.spec.js        Tests E2E Kanban
  dashboard.spec.js     Tests E2E Dashboard
  dor-dod.spec.js       Tests E2E DoR / DoD
  clients.spec.js       Tests E2E Clients
```

## CI/CD

Les tests sont lancés automatiquement sur GitHub Actions à chaque push.
Voir `.github/workflows/ci.yml`.

## Versioning

Le projet suit le versioning sémantique. Le changelog complet est accessible dans l'onglet 📋 de l'application.
Version actuelle : **v0.45.0**
