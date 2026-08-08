# MCP Cadence

Serveur MCP (Model Context Protocol) qui expose le Backlog, les sprints, l'équipe, les clients et
les Epics/Initiatives de Cadence à Claude, en langage naturel : lecture, et depuis la v0.97.10,
création/édition d'items et d'Epics/Initiatives.

Phase 5 (roadmap v1), 2026-08-08. Décision Julien (AskUserQuestion) : ce serveur ne fait aucune
authentification ni vérification de rôle lui-même, il porte simplement le jeton reçu sur chaque
appel à l'API Cadence (routes ciblées par action, `routes/items.ts`/`routes/hierarchyNodes.ts` côté
backend, plutôt qu'un patch générique de tout le workspace via `PUT /api/state`) : c'est le backend
qui applique les mêmes rôles (Admin/PO/Scrum Master/Dev/Stakeholder) que le reste de l'application,
jamais un accès "tout ou rien". Aucune suppression dans cette version (décision Julien).

## 1. Générer un jeton

1. Ouvrir Cadence, se connecter avec le compte dont Claude doit hériter les droits.
2. Réglages > section "Jetons API personnels (MCP)".
3. Donner un nom au jeton (ex. "Claude Desktop"), cliquer sur "+ Générer un jeton".
4. Copier immédiatement le jeton affiché : il ne sera plus jamais visible ensuite. En cas de
   perte, révoquer ce jeton et en générer un nouveau.

## 2. Construire le serveur

```bash
cd mcp
npm install
npm run build
```

Produit `mcp/dist/index.js`.

## 3. Configurer le client MCP

### Claude Desktop

Dans la configuration de Claude Desktop (`claude_desktop_config.json`), ajouter :

```json
{
  "mcpServers": {
    "cadence": {
      "command": "node",
      "args": ["CHEMIN_ABSOLU_VERS/cadence/mcp/dist/index.js"],
      "env": {
        "CADENCE_API_URL": "http://localhost:3001",
        "CADENCE_API_TOKEN": "COLLER_LE_JETON_ICI"
      }
    }
  }
}
```

### Claude Code / Cowork (projet)

À la racine du dépôt, `.mcp.json` :

```json
{
  "mcpServers": {
    "cadence": {
      "command": "node",
      "args": ["./mcp/dist/index.js"],
      "env": {
        "CADENCE_API_URL": "http://localhost:3001",
        "CADENCE_API_TOKEN": "COLLER_LE_JETON_ICI"
      }
    }
  }
}
```

`CADENCE_API_URL` doit pointer vers le backend Cadence déjà démarré (`npm run dev` dans
`backend/`) : ce serveur MCP ne démarre pas le backend, il s'y connecte.

## 4. Outils exposés

### Lecture

- `list_items` : items du Backlog, filtrables par sprint (ou "current"), statut, client, Epic,
  assigné, tag, type, priorité
- `get_item` : détail complet d'un item (User Story, critères d'acceptation, dépendances) par Clé
- `list_sprints` : tous les sprints, dates, capacité, sprint en cours signalé
- `get_current_sprint_summary` : répartition par statut et % complété du sprint en cours
- `list_team` : membres de l'équipe, rôle, tags, charge du sprint en cours
- `list_clients` : clients, importance, RAG, CA annuel
- `list_hierarchy` : Epics et Initiatives, filtrables par niveau/client
- `search_backlog` : recherche libre dans le Backlog (titre, rôle/besoin/bénéfice)

### Écriture

Aucune suppression. Les règles de rôle reproduisent exactement celles de l'application
(`frontend/src/utils/permissions.ts`) :

- **PO ou Admin** : création et édition complète (tous les champs) des items et des
  Epics/Initiatives
- **Dev** : édition d'un item limitée au statut, aux SP, à la DoD, aux dépendances et à sa propre
  auto-assignation (`assignSelf`) ; ne peut rien créer, ne peut pas toucher aux Epics/Initiatives
- **Scrum Master, Stakeholder** : aucun outil d'écriture n'aboutit (403)

Outils : `create_item`, `update_item`, `create_hierarchy_node`, `update_hierarchy_node`. Un rôle
insuffisant ou un champ non autorisé renvoie une erreur explicite (ex. "Champ(s) réservé(s) à un PO
ou Admin : title"), jamais un échec silencieux.

## Révoquer l'accès

Réglages > "Jetons API personnels (MCP)" > "Révoquer" sur le jeton concerné : l'accès est coupé
immédiatement, sans attendre l'expiration du jeton.
