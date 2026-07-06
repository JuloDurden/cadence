# Cadence

[![Tests CI](https://github.com/JuloDurden/cadence/actions/workflows/ci.yml/badge.svg)](https://github.com/JuloDurden/cadence/actions/workflows/ci.yml)

Outil de planification de releases Agile pour équipes Scrum. Application web autonome - un seul fichier HTML, zéro dépendance, zéro installation.

## Lancer l'application

Ouvrir `cadence.html` directement dans le navigateur. C'est tout.

## Fonctionnalités

### Backlog & stories

- Product Backlog avec clés auto-incrémentées par client (ex. `AUT-12`)
- Modale User Story complète : description, SP, rôle/besoin/bénéfice (format Connextra), critères BDD, dépendances, deadline
- Scoring WSJF, RICE et MoSCoW
- Filtres et tri (priorité, SP, statut, client, assigné)
- DoR et DoD par item avec jauges de progression et compteur X/Y
- Export Excel et CSV du backlog, import depuis Excel/CSV
- Tags / labels libres sur les items : autocomplete, multi-tags, filtre, export
- Tags de compétences sur les membres : suggestion d'assigné selon les tags communs

### Release Planning

- Vue multi-sprints avec glisser-déposer des items
- Barre de capacité par sprint (SP planifiés vs capacité équipe)
- Vue calendrier mensuelle
- Sprint Goal affiché sur la carte sprint
- Clôture de sprint avec snapshot de vélocité figé
- Auto-planning : affectation automatique selon capacité, dépendances et critères personnalisables
- Mode What-if : N scénarios de planification simultanés — wallet cards animées, forks, comparaison côte à côte, filtres highlights, badges de mouvement

### Kanban

- Board configurable : catalogue de statuts à la carte (Todo, Doing, Review, Done, Blocked, etc.)
- Drag-and-drop entre colonnes
- Tri par priorité, SP ou assigné
- Badge RAG (Rouge/Ambre/Vert) par item

### Dashboard

- Widgets : burndown, vélocité, lead time, cycle time, CFD
- RAG par client
- Activité récente de l'équipe
- Statistiques globales sur sprints clôturés

### Cérémonies Scrum

- **Daily Standup** : cartes par membre (Hier / Aujourd'hui / Blocages), timer configurable, blocker board, export résumé
- **Rétrospective** : formats Start/Stop/Continue, Mad/Sad/Glad, 4Ls — votes nominatifs, plan d'actions
- **Sprint Review** : présentation des US livrées

### Équipe & clients

- Gestion des membres avec rôles, SP/jour et absences
- Calcul de capacité sprint en temps réel
- Gestion des clients avec tiers, CA annuel, contacts, RAG
- Rapport client exportable en HTML imprimable

### Outils transverses

- Recherche globale `Ctrl+K` — full-text sur items, clés, descriptions, notes
- Historique des actions + Undo `Ctrl+Z` / Redo `Ctrl+Y`
- Mode sombre / clair
- Sauvegarde automatique dans `localStorage`

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl+K` | Ouvrir la recherche globale |
| `Ctrl+Z` | Annuler la dernière action |
| `Ctrl+Y` | Rétablir |
| `Échap` | Fermer la modale / la recherche |

## Tests

### Prérequis

```bash
node -v   # 18+
npm install
```

### Commandes

```bash
npm run test:logic      # Tests logiques (sans navigateur)
npm run test:e2e        # Tests E2E Playwright (headless)
npm run test:e2e:headed # Tests E2E avec le navigateur visible
npm test                # Tout lancer
npm run lint            # ESLint sur les fichiers de test
```

144 tests E2E répartis sur 15 suites couvrent l'ensemble des fonctionnalités.

## Structure du projet

```
cadence.html            Application complète (HTML/CSS/JS monofichier, ~570 Ko)
demo-data.js            Données de démonstration chargées au premier lancement
USER-GUIDE.md           Guide utilisateur
.github/
  workflows/ci.yml      Pipeline CI GitHub Actions
tests/
  fixtures.js           État de base partagé entre les tests
  helpers.js            Utilitaires Playwright (loadWithState, goToTab)
  server.js             Serveur HTTP local pour les tests (port 4321)
  run-tests.js          Runner de tests logiques (zéro dépendance)
  *.spec.js             Suites de tests E2E (15 fichiers)
```

## Architecture

Cadence est une Single Page Application monofichier :

- **HTML** — structure et templates inline
- **CSS** — design system intégré (variables CSS, dark mode, composants)
- **JS** — logique applicative vanilla (pas de framework), state centralisé dans un objet `S`, persisté en `localStorage` sous la clé `cadenceState_v1`

La séparation des données de démo dans `demo-data.js` est la seule dépendance runtime, chargée via `<script>` dans `cadence.html`.

## CI/CD

GitHub Actions exécute automatiquement les tests à chaque `push` et `pull_request` sur la branche `main`.

Le pipeline (`.github/workflows/ci.yml`) lance :

1. `npm run test:logic` — 29 tests logiques Node.js (zéro navigateur)
2. `npm run test:e2e` — 144 tests Playwright en mode headless (Chromium)

Un badge de statut est affiché en haut de ce README. Tout échec bloque le merge.

## Licence

Usage interne — prototype non distribué.
