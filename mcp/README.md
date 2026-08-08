# MCP Cadence

Serveur MCP (Model Context Protocol) qui expose le Backlog, les sprints, l'équipe, les clients et
les Epics/Initiatives de Cadence à Claude, en langage naturel, en lecture seule.

Phase 5 (roadmap v1), 2026-08-08. Décision Julien (AskUserQuestion) : ce serveur ne fait aucune
authentification lui-même, il porte simplement le jeton reçu sur chaque appel à l'API Cadence
existante (`GET /api/state`) : c'est le backend qui applique les mêmes rôles (Admin/PO/Scrum
Master/Dev/Stakeholder) que le reste de l'application, jamais un accès "tout ou rien".
L'écriture (créer/modifier un item...) n'est pas couverte par ce premier chantier, volontairement
séparée pour la suite.

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

## 4. Outils exposés (lecture seule)

- `list_items` : items du Backlog, filtrables par sprint (ou "current"), statut, client, Epic,
  assigné, tag, type, priorité
- `get_item` : détail complet d'un item (User Story, critères d'acceptation, dépendances) par Clé
- `list_sprints` : tous les sprints, dates, capacité, sprint en cours signalé
- `get_current_sprint_summary` : répartition par statut et % complété du sprint en cours
- `list_team` : membres de l'équipe, rôle, tags, charge du sprint en cours
- `list_clients` : clients, importance, RAG, CA annuel
- `list_hierarchy` : Epics et Initiatives, filtrables par niveau/client
- `search_backlog` : recherche libre dans le Backlog (titre, rôle/besoin/bénéfice)

## Révoquer l'accès

Réglages > "Jetons API personnels (MCP)" > "Révoquer" sur le jeton concerné : l'accès est coupé
immédiatement, sans attendre l'expiration du jeton.
