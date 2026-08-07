import ExcelJS from 'exceljs'
import type { BDDCriterion, CadenceState, HierarchyLevel, HierarchyNode, Item, ItemType, Priority } from '../types'

/**
 * Export/Import Excel du Product Backlog (Phase 5, roadmap v1, 2026-08-07, retour Julien : "ça
 * peut être clairement intéressant comme pour le JSON"), complète l'export/import JSON déjà en
 * place dans Réglages (`exportJSON`/`importJSON`, SettingsPage.tsx), qui couvre TOUT le workspace
 * (sauvegarde/migration). Celui-ci est volontairement scopé au Backlog : items (feuille "Backlog")
 * ET Epics/Initiatives (feuille "Epics & Initiatives", 2e feuille séparée, décision Julien : des
 * colonnes différentes, pas de sens à les mélanger dans la même feuille que les items).
 *
 * Revu une 1re fois (2026-08-07, retour Julien après un 1er essai trop rapide : "beaucoup
 * d'éléments du backlog ne sont pas insérés"), le 1er essai n'exportait que `desc`/métadonnées,
 * oubliant le contenu réel de la User Story (rôle/besoin/bénéfice), les critères d'acceptation, et
 * les Epics/Initiatives (stockés à part de `state.items` depuis la Phase 1, `state.hierarchyNodes`).
 *
 * Mapping de colonnes explicite à l'import (2026-08-07, retour Julien : "une fenêtre pourrait
 * proposer l'en-tête que l'on souhaite rattacher à la colonne"), ce module ne fait plus de
 * correspondance SILENCIEUSE en-tête↔champ : il expose `readWorkbookSheets` (lecture brute,
 * en-têtes + lignes positionnelles) et `guessFieldMapping` (suggestion, insensible accents/casse,
 * réutilisée comme valeur par défaut de chaque `<select>`), et c'est `ImportExcelMappingModal.tsx`
 * qui affiche la correspondance à l'utilisateur pour confirmation/ajustement avant `applyMapping`.
 * Le nom d'une feuille suggère aussi sa CIBLE (Items vs Epics/Initiatives), via le même mécanisme.
 *
 * `exceljs` plutôt que `xlsx` (SheetJS, présent dans l'ancien prototype `cadence.html`, voir son
 * historique dans changelog.ts v0.15/v0.46), le paquet npm `xlsx` a 2 CVE hautes sans correctif
 * disponible sur le registre (prototype pollution + ReDoS), dont une déclenchable en PARSANT un
 * fichier non fiable : exactement l'usage de lecture d'un fichier importé par l'utilisateur.
 * `exceljs` n'a pas cette vulnérabilité, seulement une dépendance transitive (`uuid`) en sévérité
 * modérée, sans rapport avec le chemin de lecture d'un fichier.
 */

export interface FieldDef { key: string; label: string }

// Champs importables d'une ligne "Backlog" (items), `key` = clé canonique utilisée partout dans
// ce fichier une fois la correspondance appliquée, `label` = en-tête tel qu'exporté (sert aussi de
// suggestion par défaut au mapping : un fichier réexporté puis réimporté sans y toucher matche tout
// automatiquement).
export const ITEM_FIELDS: FieldDef[] = [
  { key: 'key', label: 'Clé' },
  { key: 'title', label: 'Titre' },
  { key: 'role', label: 'Rôle' },
  { key: 'need', label: 'Besoin' },
  { key: 'benefit', label: 'Bénéfice' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Statut' },
  { key: 'sp', label: 'SP' },
  { key: 'client', label: 'Client' },
  { key: 'epic', label: 'Epic/Initiative' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'priority', label: 'Priorité' },
  { key: 'tags', label: 'Tags' },
  { key: 'criteria', label: "Critères d'acceptation" },
]

// Champs importables d'une ligne "Epics & Initiatives" (`state.hierarchyNodes`).
export const EPIC_FIELDS: FieldDef[] = [
  { key: 'key', label: 'Clé' },
  { key: 'level', label: 'Niveau' },
  { key: 'title', label: 'Titre' },
  { key: 'parent', label: 'Parent' },
  { key: 'client', label: 'Client' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'sp', label: 'SP' },
  { key: 'status', label: 'Statut' },
]

export type SheetTarget = 'items' | 'epics' | 'ignore'
export const SHEET_TARGET_LABEL: Record<SheetTarget, string> = {
  items: 'Items du Backlog', epics: 'Epics & Initiatives', ignore: 'Ignorer cette feuille',
}

const TYPE_LABEL: Record<ItemType, string> = { story: 'US', bug: 'Bug', task: 'Tâche', spike: 'Spike' }
const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']
const LEVEL_LABEL: Record<HierarchyLevel, string> = { epic: 'Epic', initiative: 'Initiative' }

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function uid() { return Math.random().toString(36).slice(2, 10) }

function cellToString(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    if ('richText' in v) return (v.richText as { text: string }[]).map(t => t.text).join('')
    if ('text' in v) return String((v as { text: unknown }).text ?? '')
    if ('result' in v) return String((v as { result: unknown }).result ?? '')
    return ''
  }
  return String(v)
}

function serializeCriteria(criteria: BDDCriterion[] | undefined): string {
  if (!criteria || criteria.length === 0) return ''
  return criteria.map((c, i) => `${i + 1}. GIVEN ${c.given} WHEN ${c.when} THEN ${c.then}`).join('\n')
}

const CRITERION_LINE = /^\s*\d+[.)]\s*GIVEN\s+(.*?)\s+WHEN\s+(.*?)\s+THEN\s+(.*)$/i

/** Reconnaît le format "1. GIVEN ... WHEN ... THEN ..." (1 ligne par critère) généré par
 *  `serializeCriteria`. Une ligne qui ne matche pas est ignorée plutôt que de faire échouer tout le
 *  reste, `undefined` seulement si RIEN n'a pu être reconnu (l'appelant garde alors la valeur
 *  existante plutôt que d'effacer les critères d'un item sur un simple souci de formatage). */
function parseCriteria(text: string): BDDCriterion[] | undefined {
  const parsed: BDDCriterion[] = []
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    const m = CRITERION_LINE.exec(line)
    if (m) parsed.push({ id: uid(), given: m[1].trim(), when: m[2].trim(), then: m[3].trim() })
  }
  return parsed.length > 0 ? parsed : undefined
}

function buildItemRow(item: Item, state: CadenceState): Record<string, string | number> {
  const client = state.clients.find(c => c.id === item.clientId)
  const epic = item.epicId ? state.hierarchyNodes.find(n => n.id === item.epicId) : undefined
  const sprint = item.sprintId ? state.sprints.find(s => s.id === item.sprintId) : undefined
  const statusLabel = state.kanbanCols.find(c => c.id === item.status)?.label ?? item.status
  return {
    'Clé': item.key,
    'Titre': item.desc,
    'Rôle': item.role ?? '',
    'Besoin': item.need ?? '',
    'Bénéfice': item.benefit ?? '',
    'Type': TYPE_LABEL[item.type ?? 'story'],
    'Statut': statusLabel,
    'SP': item.sp,
    'Client': client?.name ?? '',
    'Epic/Initiative': epic?.key ?? '',
    'Sprint': sprint?.label ?? '',
    'Priorité': item.priority,
    'Tags': (item.tags ?? []).join(', '),
    "Critères d'acceptation": serializeCriteria(item.criteria),
  }
}

function buildEpicRow(node: HierarchyNode, state: CadenceState): Record<string, string | number> {
  const parent = node.parentId ? state.hierarchyNodes.find(n => n.id === node.parentId) : undefined
  const client = node.clientId ? state.clients.find(c => c.id === node.clientId) : undefined
  const sprint = node.sprintId ? state.sprints.find(s => s.id === node.sprintId) : undefined
  const statusLabel = node.status ? (state.kanbanCols.find(c => c.id === node.status)?.label ?? node.status) : ''
  return {
    'Clé': node.key,
    'Niveau': LEVEL_LABEL[node.level],
    'Titre': node.desc,
    'Parent': parent?.key ?? '',
    'Client': client?.name ?? '',
    'Sprint': sprint?.label ?? '',
    'SP': node.sp ?? '',
    'Statut': statusLabel,
  }
}

/** Génère le classeur Excel du Backlog courant, 2 feuilles ("Backlog" pour les items, "Epics &
 *  Initiatives" pour `state.hierarchyNodes`), en-têtes en gras, texte long avec retour à la ligne.
 *  Retourne le buffer prêt à être enveloppé dans un `Blob` par l'appelant (voir `exportExcel` dans
 *  SettingsPage.tsx, même découpage que `exportJSON`). */
export async function buildBacklogWorkbookBuffer(state: CadenceState): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()

  const backlogSheet = wb.addWorksheet('Backlog')
  backlogSheet.columns = ITEM_FIELDS.map(f => ({
    header: f.label, key: f.label,
    width: f.key === 'title' || f.key === 'criteria' ? 42 : (f.key === 'role' || f.key === 'need' || f.key === 'benefit' ? 28 : 16),
  }))
  backlogSheet.getRow(1).font = { bold: true }
  for (const item of state.items) backlogSheet.addRow(buildItemRow(item, state))
  backlogSheet.getColumn("Critères d'acceptation").alignment = { wrapText: true, vertical: 'top' }
  backlogSheet.getColumn('Titre').alignment = { wrapText: true, vertical: 'top' }

  const epicsSheet = wb.addWorksheet('Epics & Initiatives')
  epicsSheet.columns = EPIC_FIELDS.map(f => ({ header: f.label, key: f.label, width: f.key === 'title' ? 42 : 16 }))
  epicsSheet.getRow(1).font = { bold: true }
  for (const node of state.hierarchyNodes) epicsSheet.addRow(buildEpicRow(node, state))

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

export interface RawSheet {
  name: string
  headers: string[]              // en-têtes bruts tels que lus (1 par colonne, en ordre)
  rows: string[][]                // lignes brutes, positionnelles (même ordre que `headers`)
  suggestedTarget: SheetTarget    // deviné depuis le nom de la feuille
}

/** Lecture brute d'un classeur Excel, sans AUCUNE correspondance en-tête↔champ Cadence (voir
 *  commentaire d'en-tête du fichier), 1re ligne = en-têtes, lignes suivantes = données,
 *  positionnelles. Feuilles complètement vides (aucune ligne au-delà des en-têtes) ignorées. */
export async function readWorkbookSheets(buffer: ArrayBuffer): Promise<RawSheet[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const sheets: RawSheet[] = []
  for (const sheet of wb.worksheets) {
    const headerRow = sheet.getRow(1)
    const headers: string[] = []
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => { headers[colNumber - 1] = cellToString(cell.value).trim() })
    while (headers.length > 0 && !headers[headers.length - 1]) headers.pop()
    if (headers.length === 0) continue

    const rows: string[][] = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const values: string[] = []
      for (let col = 1; col <= headers.length; col++) values[col - 1] = cellToString(row.getCell(col).value)
      if (values.some(v => v.trim() !== '')) rows.push(values)
    })
    if (rows.length === 0) continue

    const n = normalize(sheet.name)
    const suggestedTarget: SheetTarget = n.includes('epic') || n.includes('initiative') ? 'epics' : 'items'
    sheets.push({ name: sheet.name, headers, rows, suggestedTarget })
  }
  return sheets
}

/** Suggestion de correspondance en-tête→champ (1 par colonne, `null` = "Ignorer cette colonne") —
 *  simple recherche du libellé le plus proche (insensible accents/casse), sert de valeur PAR
 *  DÉFAUT à chaque `<select>` de `ImportExcelMappingModal.tsx`, jamais appliquée sans confirmation. */
export function guessFieldMapping(headers: string[], fields: FieldDef[]): (string | null)[] {
  return headers.map(h => fields.find(f => normalize(f.label) === normalize(h))?.key ?? null)
}

/** Applique une correspondance confirmée par l'utilisateur : `mapping[i]` = clé de champ pour
 *  `headers[i]`/chaque `rows[*][i]`, ou `null` pour ignorer cette colonne. Renvoie des lignes
 *  indexées par clé de champ canonique (`ITEM_FIELDS`/`EPIC_FIELDS`), prêtes pour
 *  `applyBacklogExcelImport`. 2 colonnes mappées sur le même champ : la dernière l'emporte. */
export function applyMapping(rows: string[][], mapping: (string | null)[]): Record<string, string>[] {
  return rows.map(row => {
    const obj: Record<string, string> = {}
    mapping.forEach((fieldKey, i) => { if (fieldKey) obj[fieldKey] = row[i] ?? '' })
    return obj
  })
}

/** Génère la prochaine clé pour un préfixe donné (même logique que `ItemModal.tsx`/
 *  `HierarchyNodeModal.tsx`, dupliquée ici à l'identique), `Item.key` et `HierarchyNode.key`
 *  partagent le même espace de numérotation par préfixe (`state.itemKeyCounters`, voir
 *  `types/index.ts`), donc `existingKeys` doit couvrir les deux à chaque appel pour ne jamais
 *  réattribuer une clé déjà prise par un Epic à un item ou inversement. */
function nextKeyForPrefix(prefix: string, existingKeys: string[], counters: Record<string, number>): { key: string; nextCounters: Record<string, number> } {
  const usedNums = existingKeys
    .filter(k => k?.startsWith(`${prefix}-`))
    .map(k => parseInt(k.slice(prefix.length + 1), 10))
    .filter(n => !isNaN(n))
  const liveMax = usedNums.length > 0 ? Math.max(...usedNums) : 0
  const persisted = counters[prefix] ?? 0
  const nextNum = Math.max(liveMax, persisted) + 1
  return { key: `${prefix}-${String(nextNum).padStart(3, '0')}`, nextCounters: { ...counters, [prefix]: nextNum } }
}

export interface BacklogImportResult {
  newState: CadenceState
  itemsAdded: number; itemsUpdated: number; itemsSkipped: number
  epicsAdded: number; epicsUpdated: number; epicsSkipped: number
}

/** Applique les lignes mappées (déjà indexées par clé de champ canonique, voir `applyMapping`) au
 *  Backlog, ajout ET mise à jour par Clé (2026-08-07, retour Julien via AskUserQuestion). Politique
 *  uniforme sur toute mise à jour : une cellule VIDE conserve la valeur existante (n'efface jamais
 *  un champ faute de donnée dans le fichier) ; seule une cellule non vide qui ne correspond à AUCUNE
 *  valeur connue (ex. Statut avec un libellé introuvable) retombe aussi sur l'existant plutôt que
 *  sur une valeur par défaut arbitraire. Les Epics/Initiatives sont traités AVANT les items, pour
 *  qu'une colonne "Epic/Initiative" d'un item du même fichier puisse résoudre un Epic tout juste
 *  créé par la feuille "Epics & Initiatives". Fonction pure, aucun effet de bord, c'est l'appelant
 *  (`importExcel`, SettingsPage.tsx) qui dispatch/persiste `newState`. */
export function applyBacklogExcelImport(
  state: CadenceState,
  itemRows: Record<string, string>[],
  epicRows: Record<string, string>[],
): BacklogImportResult {
  let items = [...state.items]
  let nodes = [...state.hierarchyNodes]
  let counters = { ...(state.itemKeyCounters ?? {}) }
  let epicsAdded = 0, epicsUpdated = 0, epicsSkipped = 0
  let itemsAdded = 0, itemsUpdated = 0, itemsSkipped = 0

  const allKeys = () => [...items.map(i => i.key), ...nodes.map(n => n.key)]

  // ── Epics & Initiatives ────────────────────────────────────────────────
  for (const row of epicRows) {
    const title = (row.title ?? '').trim()
    if (!title) { epicsSkipped++; continue }

    const keyRaw = (row.key ?? '').trim()
    const existing = keyRaw ? nodes.find(n => n.key === keyRaw) : undefined

    const levelRaw = (row.level ?? '').trim()
    const levelMatch = levelRaw ? (Object.entries(LEVEL_LABEL) as [HierarchyLevel, string][]).find(([, l]) => normalize(l) === normalize(levelRaw)) : undefined
    const level: HierarchyLevel = levelMatch?.[0] ?? existing?.level ?? 'epic'

    const clientRaw = (row.client ?? '').trim()
    const clientMatch = clientRaw ? state.clients.find(c => normalize(c.name) === normalize(clientRaw)) : undefined
    const clientId = clientRaw ? (clientMatch?.id ?? existing?.clientId) : existing?.clientId

    const parentRaw = (row.parent ?? '').trim()
    const parentMatch = parentRaw ? nodes.find(n => normalize(n.key) === normalize(parentRaw)) : undefined
    const parentId = parentRaw ? (parentMatch?.id ?? existing?.parentId ?? null) : (existing?.parentId ?? null)

    const sprintRaw = (row.sprint ?? '').trim()
    const sprintMatch = sprintRaw ? state.sprints.find(s => normalize(s.label) === normalize(sprintRaw)) : undefined
    const sprintId = sprintRaw ? (sprintMatch?.id ?? existing?.sprintId ?? null) : (existing?.sprintId ?? null)

    const spRaw = (row.sp ?? '').trim()
    const spNum = Number(spRaw)
    const sp = spRaw !== '' && Number.isFinite(spNum) ? spNum : existing?.sp

    const statusRaw = (row.status ?? '').trim()
    const statusMatch = statusRaw ? state.kanbanCols.find(c => normalize(c.label) === normalize(statusRaw)) : undefined
    const status = statusRaw ? (statusMatch?.id ?? existing?.status) : existing?.status

    if (existing) {
      nodes = nodes.map(n => n.id === existing.id ? { ...n, desc: title, level, clientId, parentId, sprintId, sp, status } : n)
      epicsUpdated++
    } else {
      const client = clientId ? state.clients.find(c => c.id === clientId) : undefined
      const prefix = client?.prefix ?? 'ITEM'
      const { key, nextCounters } = nextKeyForPrefix(prefix, allKeys(), counters)
      counters = nextCounters
      const newNode: HierarchyNode = {
        id: uid(), key, level, parentId, desc: title, clientId, sprintId, sp, status, createdAt: new Date().toISOString(),
      }
      nodes = [...nodes, newNode]
      epicsAdded++
    }
  }

  // ── Items ──────────────────────────────────────────────────────────────
  for (const row of itemRows) {
    const desc = (row.title ?? '').trim()
    if (!desc) { itemsSkipped++; continue }

    const keyRaw = (row.key ?? '').trim()
    const existing = keyRaw ? items.find(i => i.key === keyRaw) : undefined

    const clientRaw = (row.client ?? '').trim()
    const clientMatch = clientRaw ? state.clients.find(c => normalize(c.name) === normalize(clientRaw)) : undefined
    const clientId = clientRaw ? (clientMatch?.id ?? existing?.clientId ?? state.clients[0]?.id ?? '') : (existing?.clientId ?? state.clients[0]?.id ?? '')

    const typeRaw = (row.type ?? '').trim()
    const typeMatch = typeRaw ? (Object.entries(TYPE_LABEL) as [ItemType, string][]).find(([, label]) => normalize(label) === normalize(typeRaw)) : undefined
    const type: ItemType = typeMatch?.[0] ?? existing?.type ?? 'story'

    const prioRaw = (row.priority ?? '').trim()
    const prioMatch = prioRaw ? PRIORITIES.find(p => normalize(p) === normalize(prioRaw)) : undefined
    const priority: Priority = prioMatch ?? existing?.priority ?? 'medium'

    const statusRaw = (row.status ?? '').trim()
    const statusMatch = statusRaw ? state.kanbanCols.find(c => normalize(c.label) === normalize(statusRaw)) : undefined
    const status = statusRaw
      ? (statusMatch?.id ?? existing?.status ?? state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id ?? 'todo')
      : (existing?.status ?? state.kanbanCols.find(c => c.isDefault)?.id ?? state.kanbanCols[0]?.id ?? 'todo')

    const epicRaw = (row.epic ?? '').trim()
    const epicMatch = epicRaw ? nodes.find(n => normalize(n.key) === normalize(epicRaw)) : undefined
    const epicId = epicRaw ? (epicMatch?.id ?? existing?.epicId ?? null) : (existing?.epicId ?? null)

    const sprintRaw = (row.sprint ?? '').trim()
    const sprintMatch = sprintRaw ? state.sprints.find(s => normalize(s.label) === normalize(sprintRaw)) : undefined
    const sprintId = sprintRaw ? (sprintMatch?.id ?? existing?.sprintId ?? null) : (existing?.sprintId ?? null)

    const spRaw = (row.sp ?? '').trim()
    const spNum = Number(spRaw)
    const sp = spRaw !== '' && Number.isFinite(spNum) ? spNum : (existing?.sp ?? 0)

    const tagsRaw = (row.tags ?? '').trim()
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : (existing?.tags ?? [])

    const roleRaw = (row.role ?? '').trim()
    const role = roleRaw || existing?.role
    const needRaw = (row.need ?? '').trim()
    const need = needRaw || existing?.need
    const benefitRaw = (row.benefit ?? '').trim()
    const benefit = benefitRaw || existing?.benefit

    const criteriaRaw = (row.criteria ?? '').trim()
    const criteria = criteriaRaw ? (parseCriteria(criteriaRaw) ?? existing?.criteria) : existing?.criteria

    if (existing) {
      items = items.map(i => i.id === existing.id
        ? { ...i, desc, type, priority, status, clientId, epicId, sprintId, sp, tags, role, need, benefit, criteria }
        : i)
      itemsUpdated++
    } else {
      const client = state.clients.find(c => c.id === clientId)
      const prefix = client?.prefix ?? 'ITEM'
      const { key, nextCounters } = nextKeyForPrefix(prefix, allKeys(), counters)
      counters = nextCounters
      const newItem: Item = {
        id: uid(), key, desc, sp, status, clientId, sprintId, priority,
        assignees: [], tags, type, epicId, role, need, benefit, criteria, createdAt: new Date().toISOString(),
      }
      items = [...items, newItem]
      itemsAdded++
    }
  }

  const newState: CadenceState = { ...state, items, hierarchyNodes: nodes, itemKeyCounters: counters }
  return { newState, itemsAdded, itemsUpdated, itemsSkipped, epicsAdded, epicsUpdated, epicsSkipped }
}
