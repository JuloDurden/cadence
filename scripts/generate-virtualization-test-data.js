#!/usr/bin/env node
/**
 * Génère un jeu de données Backlog volumineux pour tester manuellement la virtualisation
 * (Phase 7, perf, sous-chantier 3/5, 2026-08-24) - voir docs/corrections.md.
 *
 * Pourquoi ce script : les fixtures des tests E2E existants (tests/backlog.spec.js et autres)
 * comptent quelques dizaines d'items au plus, très en dessous du seuil de virtualisation
 * (VIRTUALIZE_THRESHOLD = 200, frontend/src/components/backlog/BacklogItemsTable.tsx). Le chemin
 * virtualisé (react-virtuoso) n'est donc jamais exercé par ces tests - seul un jeu de données
 * réellement volumineux permet de le voir fonctionner à l'écran.
 *
 * Usage :
 *   1. Dans Cadence, Réglages > Exporter (JSON) pour récupérer un export de l'état réel.
 *   2. node scripts/generate-virtualization-test-data.js chemin/vers/export.json
 *   3. Le fichier `<export>-virtualise.json` est généré à côté de l'original.
 *   4. Réglages > Importer (JSON) sur ce nouveau fichier.
 *   5. Backlog, mode "Grouper : aucun" (ou groupé, la virtualisation s'applique aux deux) :
 *      la table doit maintenant afficher une zone à défilement interne borné (au lieu d'une
 *      liste qui s'étend indéfiniment) - c'est le signal visuel que le chemin virtualisé est actif.
 *
 * Les items générés portent le tag "perf-test" : pour les retirer ensuite, filtrer le Backlog par
 * ce tag, tout sélectionner (case à cocher de l'en-tête), puis Supprimer en masse - ou simplement
 * ne pas réimporter ce fichier dans l'état réel si le test se fait sur une copie jetable.
 */
const fs = require('fs')
const path = require('path')

const inputPath = process.argv[2]
const count = parseInt(process.argv[3] ?? '250', 10)

if (!inputPath) {
  console.error('Usage: node scripts/generate-virtualization-test-data.js <export.json> [nombre-items=250]')
  process.exit(1)
}

const raw = fs.readFileSync(inputPath, 'utf8')
const state = JSON.parse(raw)

if (!Array.isArray(state.items) || typeof state.settings !== 'object' || state.settings === null) {
  console.error("Ce fichier ne ressemble pas à un export Cadence valide (attendu : 'items' tableau + 'settings' objet).")
  process.exit(1)
}

const clients = Array.isArray(state.clients) && state.clients.length > 0 ? state.clients : [{ id: null }]
const sprints = Array.isArray(state.sprints) ? state.sprints : []
const kanbanCols = Array.isArray(state.kanbanCols) && state.kanbanCols.length > 0 ? state.kanbanCols : [{ id: 'todo' }]
const team = Array.isArray(state.team) ? state.team : []

const PRIORITIES = ['critical', 'high', 'medium', 'low']
const TYPES = ['story', 'bug', 'task', 'spike']

function uid() { return Math.random().toString(36).slice(2) }

const generated = []
for (let i = 0; i < count; i++) {
  const client = clients[i % clients.length]
  // Un item sur 3 non assigné à un sprint (mélange réaliste), les autres cyclent sur les sprints
  // existants - reproduit la répartition qui a révélé le bug de tri par Sprint (retour Julien,
  // 2026-08-24) sur un volume suffisant pour bien voir le tri corrigé en action.
  const sprint = sprints.length > 0 && i % 3 !== 0 ? sprints[i % sprints.length] : null
  const hasExpandPanel = i % 4 === 0   // 1 item sur 4 avec User Story + critères, pour exercer
                                        // aussi le panneau déplié dans le chemin virtualisé.
  generated.push({
    id: 'perftest-' + uid(),
    key: `VIRT-${String(i + 1).padStart(4, '0')}`,
    desc: `[Test perf] Item généré #${i + 1} pour la virtualisation du Backlog`,
    sp: [1, 2, 3, 5, 8][i % 5],
    status: kanbanCols[i % kanbanCols.length].id,
    clientId: client.id,
    sprintId: sprint ? sprint.id : null,
    priority: PRIORITIES[i % PRIORITIES.length],
    assignees: team.length > 0 ? [team[i % team.length].id] : [],
    tags: ['perf-test'],
    type: TYPES[i % TYPES.length],
    ...(hasExpandPanel ? {
      role: 'Product Owner',
      need: 'valider que la virtualisation fonctionne avec un panneau déplié',
      benefit: 'être certain qu\'aucune ligne ne manque au défilement',
      criteria: [
        { id: 'c-' + uid(), given: 'la table Backlog contient plus de 200 items', when: 'je fais défiler la liste', then: 'les lignes se chargent sans à-coup' },
      ],
    } : {}),
    createdAt: new Date().toISOString(),
  })
}

state.items = [...state.items, ...generated]

const parsed = path.parse(inputPath)
const outputPath = path.join(parsed.dir, `${parsed.name}-virtualise${parsed.ext}`)
fs.writeFileSync(outputPath, JSON.stringify(state, null, 2))

console.log(`${count} items générés (tag "perf-test"). Total Backlog : ${state.items.length} items.`)
console.log(`Fichier écrit : ${outputPath}`)
console.log('Réglages > Importer (JSON) sur ce fichier pour tester.')
