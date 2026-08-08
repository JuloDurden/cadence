import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fetchState, getCurrentSprint } from './cadenceClient.js'
import type { CadenceState, Item } from './types.js'

// Outils de LECTURE SEULE (2026-08-08, Phase 5 roadmap v1, décision Julien via AskUserQuestion) :
// l'écriture (créer/modifier un item, changer un statut...) est un chantier volontairement séparé,
// pour valider d'abord le socket auth + lecture avant d'y ajouter la question des garde-fous par
// rôle sur des actions qui modifient réellement le Backlog.

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] }
}

function clientName(state: CadenceState, clientId: string | undefined | null): string {
  return state.clients.find(c => c.id === clientId)?.name ?? '(sans client)'
}

function sprintLabel(state: CadenceState, sprintId: string | undefined | null): string {
  if (!sprintId) return '(hors sprint)'
  return state.sprints.find(s => s.id === sprintId)?.label ?? '(sprint inconnu)'
}

function epicKey(state: CadenceState, epicId: string | undefined | null): string {
  if (!epicId) return '(sans Epic)'
  return state.hierarchyNodes.find(n => n.id === epicId)?.key ?? '(Epic inconnu)'
}

function statusLabel(state: CadenceState, status: string): string {
  return state.kanbanCols.find(c => c.id === status)?.label ?? status
}

function assigneeNames(state: CadenceState, assignees: string[]): string {
  if (assignees.length === 0) return '(non assigné)'
  return assignees.map(id => state.team.find(m => m.id === id)?.name ?? id).join(', ')
}

function itemLine(state: CadenceState, item: Item): string {
  return `${item.key} [${statusLabel(state, item.status)}] ${item.desc}, ${item.sp} SP, priorité ${item.priority}, `
    + `client ${clientName(state, item.clientId)}, sprint ${sprintLabel(state, item.sprintId)}, Epic ${epicKey(state, item.epicId)}, `
    + `assigné(s) : ${assigneeNames(state, item.assignees)}`
}

export function registerTools(server: McpServer) {

  server.registerTool('list_items', {
    description: "Liste les items du Product Backlog Cadence (User Stories, Bugs, Tâches, Spikes), avec filtres optionnels. Utiliser \"current\" comme valeur de sprint pour le sprint en cours.",
    inputSchema: {
      sprint: z.string().optional().describe('Libellé du sprint (ex. "Sprint 3"), ou "current" pour le sprint en cours'),
      status: z.string().optional().describe('Libellé du statut Kanban (ex. "Terminé", "En cours")'),
      clientName: z.string().optional(),
      epicKey: z.string().optional().describe('Clé de l\'Epic ou de l\'Initiative parent (ex. "FAX-007")'),
      assignee: z.string().optional().describe('Nom (ou partie du nom) d\'un membre de l\'équipe'),
      tag: z.string().optional(),
      type: z.string().optional().describe('story, bug, task ou spike'),
      priority: z.string().optional().describe('critical, high, medium ou low'),
      limit: z.number().int().positive().max(200).optional().describe('Par défaut 50'),
    },
  }, async ({ sprint, status, clientName: filterClient, epicKey: filterEpic, assignee, tag, type, priority, limit }) => {
    const state = await fetchState()
    const currentSprint = getCurrentSprint(state)
    const sprintId = sprint
      ? (normalize(sprint) === 'current' ? currentSprint?.id : state.sprints.find(s => normalize(s.label) === normalize(sprint))?.id)
      : undefined
    if (sprint && !sprintId) return text(`Aucun sprint ne correspond à "${sprint}".`)

    let items = state.items
    if (sprintId) items = items.filter(i => i.sprintId === sprintId)
    if (status) items = items.filter(i => normalize(statusLabel(state, i.status)) === normalize(status))
    if (filterClient) items = items.filter(i => normalize(clientName(state, i.clientId)).includes(normalize(filterClient)))
    if (filterEpic) items = items.filter(i => normalize(epicKey(state, i.epicId)) === normalize(filterEpic))
    if (assignee) items = items.filter(i => i.assignees.some(id => normalize(state.team.find(m => m.id === id)?.name ?? '').includes(normalize(assignee))))
    if (tag) items = items.filter(i => i.tags.some(t => normalize(t) === normalize(tag)))
    if (type) items = items.filter(i => normalize(i.type ?? 'story') === normalize(type))
    if (priority) items = items.filter(i => normalize(i.priority) === normalize(priority))

    const max = limit ?? 50
    const truncated = items.length > max
    const lines = items.slice(0, max).map(i => itemLine(state, i))
    const header = `${items.length} item(s) trouvé(s)${truncated ? `, ${max} affiché(s)` : ''} :`
    return text([header, ...lines].join('\n'))
  })

  server.registerTool('get_item', {
    description: "Détail complet d'un item du Backlog (User Story rôle/besoin/bénéfice, critères d'acceptation, dépendances...) à partir de sa Clé.",
    inputSchema: { key: z.string().describe('Clé de l\'item, ex. "FAX-012"') },
  }, async ({ key }) => {
    const state = await fetchState()
    const item = state.items.find(i => normalize(i.key) === normalize(key))
    if (!item) return text(`Aucun item avec la clé "${key}".`)

    const criteria = (item.criteria ?? []).map((c, i) => `  ${i + 1}. GIVEN ${c.given} WHEN ${c.when} THEN ${c.then}`).join('\n')
    const deps = (item.deps ?? []).map(id => state.items.find(i => i.id === id)?.key ?? id).join(', ')
    const lines = [
      `${item.key}, ${item.desc}`,
      `Statut : ${statusLabel(state, item.status)} · Type : ${item.type ?? 'story'} · Priorité : ${item.priority} · ${item.sp} SP`,
      `Client : ${clientName(state, item.clientId)} · Sprint : ${sprintLabel(state, item.sprintId)} · Epic/Initiative : ${epicKey(state, item.epicId)}`,
      `Assigné(s) : ${assigneeNames(state, item.assignees)}`,
      item.tags.length > 0 ? `Tags : ${item.tags.join(', ')}` : undefined,
      item.role || item.need || item.benefit
        ? `User Story : en tant que ${item.role ?? '?'}, je souhaite ${item.need ?? '?'}, afin de ${item.benefit ?? '?'}`
        : undefined,
      criteria ? `Critères d'acceptation :\n${criteria}` : undefined,
      deps ? `Dépend de : ${deps}` : undefined,
    ].filter(Boolean)
    return text(lines.join('\n'))
  })

  server.registerTool('list_sprints', {
    description: 'Liste tous les sprints de Cadence (dates, capacité, statut ouvert/clôturé), avec le sprint en cours signalé.',
    inputSchema: {},
  }, async () => {
    const state = await fetchState()
    const current = getCurrentSprint(state)
    const lines = state.sprints.map(s =>
      `${s.label}${s.id === current?.id ? ' [EN COURS]' : ''} : ${s.startDate} → ${s.endDate}, capacité ${s.capacity} SP, `
      + `${s.closed ? 'clôturé' : 'ouvert'}${s.goal ? `, objectif : ${s.goal}` : ''}`
    )
    return text(lines.join('\n') || 'Aucun sprint défini.')
  })

  server.registerTool('get_current_sprint_summary', {
    description: 'Résumé du sprint en cours : nombre et SP d\'items par statut, pourcentage complété.',
    inputSchema: {},
  }, async () => {
    const state = await fetchState()
    const current = getCurrentSprint(state)
    if (!current) return text('Aucun sprint en cours.')

    const items = state.items.filter(i => i.sprintId === current.id)
    const totalSp = items.reduce((sum, i) => sum + i.sp, 0)
    const doneCols = new Set(state.kanbanCols.filter(c => c.isDone).map(c => c.id))
    const doneSp = items.filter(i => doneCols.has(i.status)).reduce((sum, i) => sum + i.sp, 0)
    const byStatus = new Map<string, { count: number; sp: number }>()
    for (const i of items) {
      const label = statusLabel(state, i.status)
      const entry = byStatus.get(label) ?? { count: 0, sp: 0 }
      entry.count++; entry.sp += i.sp
      byStatus.set(label, entry)
    }
    const pct = totalSp > 0 ? Math.round((doneSp / totalSp) * 100) : 0
    const breakdown = [...byStatus.entries()].map(([label, { count, sp }]) => `  ${label} : ${count} item(s), ${sp} SP`)
    const lines = [
      `${current.label} (${current.startDate} → ${current.endDate}, capacité ${current.capacity} SP)`,
      `${items.length} item(s), ${totalSp} SP au total, ${doneSp} SP terminés (${pct}%)`,
      ...breakdown,
    ]
    return text(lines.join('\n'))
  })

  server.registerTool('list_team', {
    description: 'Liste les membres de l\'équipe (rôle, compétences/tags, charge du sprint en cours en SP).',
    inputSchema: {},
  }, async () => {
    const state = await fetchState()
    const current = getCurrentSprint(state)
    const currentItems = current ? state.items.filter(i => i.sprintId === current.id) : []
    const lines = state.team.map(m => {
      const sp = currentItems.filter(i => i.assignees.includes(m.id)).reduce((sum, i) => sum + i.sp, 0)
      return `${m.name}, ${m.role}, ${m.spPerDay} SP/jour${m.tags.length > 0 ? `, tags : ${m.tags.join(', ')}` : ''}`
        + (current ? `, charge sprint en cours : ${sp} SP` : '')
    })
    return text(lines.join('\n') || 'Aucun membre d\'équipe.')
  })

  server.registerTool('list_clients', {
    description: 'Liste les clients (importance, santé RAG, chiffre d\'affaires annuel).',
    inputSchema: {},
  }, async () => {
    const state = await fetchState()
    const lines = state.clients.map(c => `${c.name} [${c.prefix}], ${c.tier}, RAG ${c.rag}, CA annuel ${c.annualRevenue} €`)
    return text(lines.join('\n') || 'Aucun client.')
  })

  server.registerTool('list_hierarchy', {
    description: 'Liste les Epics et Initiatives (regroupements de haut niveau, distincts des items), avec filtres optionnels.',
    inputSchema: {
      level: z.enum(['epic', 'initiative']).optional(),
      clientName: z.string().optional(),
    },
  }, async ({ level, clientName: filterClient }) => {
    const state = await fetchState()
    let nodes = state.hierarchyNodes
    if (level) nodes = nodes.filter(n => n.level === level)
    if (filterClient) nodes = nodes.filter(n => normalize(clientName(state, n.clientId)).includes(normalize(filterClient)))

    const lines = nodes.map(n => {
      const childCount = state.items.filter(i => i.epicId === n.id).length
      return `${n.key} [${n.level}] ${n.desc}, client ${clientName(state, n.clientId)}, sprint ${sprintLabel(state, n.sprintId)}, `
        + `${n.sp ?? '?'} SP, statut ${n.status ? statusLabel(state, n.status) : '(non défini)'}, ${childCount} item(s) rattaché(s)`
    })
    return text(lines.join('\n') || 'Aucun Epic/Initiative.')
  })

  server.registerTool('search_backlog', {
    description: 'Recherche libre dans le Backlog (titre, rôle/besoin/bénéfice de la User Story), insensible aux accents et à la casse.',
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().positive().max(200).optional().describe('Par défaut 30'),
    },
  }, async ({ query, limit }) => {
    const state = await fetchState()
    const q = normalize(query)
    const matches = state.items.filter(i =>
      normalize(i.desc).includes(q) || normalize(i.role ?? '').includes(q) || normalize(i.need ?? '').includes(q) || normalize(i.benefit ?? '').includes(q)
    )
    const max = limit ?? 30
    const lines = matches.slice(0, max).map(i => itemLine(state, i))
    return text([`${matches.length} résultat(s) pour "${query}" :`, ...lines].join('\n'))
  })
}
