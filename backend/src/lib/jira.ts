// Phase 5 (roadmap v1), Integration Jira, 2026-08-08 : appels REST Jira Cloud (myself,
// project/search, field, search/jql). Auth Basic email:jeton API (voir schema.prisma). Contrairement
// a Slack (toujours HTTP 200, `{ ok: false }`), Jira renvoie de vrais codes HTTP, plus proche de
// l'API GitHub deja integree (lib/github.ts).
//
// `/rest/api/3/search/jql` confirme via la doc Atlassian a jour au moment d'ecrire ce fichier :
// l'ancien `/rest/api/3/search` est deprecie et entierement retire de Jira Cloud, la pagination du
// nouvel endpoint utilise `nextPageToken`, plus `startAt`.
function basicAuthHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
}

/** Normalise une URL de site Jira saisie librement ("monsite.atlassian.net" ou avec https://,
 *  avec ou sans slash final) vers une base d'URL utilisable telle quelle. */
export function normalizeSiteUrl(siteUrl: string): string {
  const trimmed = siteUrl.trim().replace(/\/+$/, '')
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export interface JiraConfigRow { siteUrl: string; email: string; apiToken: string }

async function jiraRequest(method: 'GET' | 'POST', config: JiraConfigRow, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${normalizeSiteUrl(config.siteUrl)}${path}`, {
    method,
    headers: {
      Authorization: basicAuthHeader(config.email, config.apiToken),
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const errJson = await res.json() as { errorMessages?: string[]; message?: string }
      detail = errJson.errorMessages?.[0] ?? errJson.message ?? ''
    } catch { /* corps d'erreur non JSON, on garde le message par statut ci-dessous */ }
    if (res.status === 401) throw new Error('Email ou jeton API Jira invalide')
    if (res.status === 403) throw new Error(detail || 'Accès refusé par Jira (permissions insuffisantes sur ce projet)')
    if (res.status === 404) throw new Error(detail || 'Site ou projet Jira introuvable')
    throw new Error(detail || `Erreur Jira ${res.status}`)
  }
  return res.json()
}

/** Vérifie la connexion avant tout enregistrement (même logique que validateRepo/validateSlackToken). */
export async function validateJiraConnection(config: JiraConfigRow): Promise<void> {
  await jiraRequest('GET', config, '/rest/api/3/myself')
}

export interface JiraProject { key: string; name: string }

export async function listJiraProjects(config: JiraConfigRow): Promise<JiraProject[]> {
  const body = await jiraRequest('GET', config, '/rest/api/3/project/search?maxResults=100') as { values?: { key: string; name: string }[] }
  return (body.values ?? []).map(p => ({ key: p.key, name: p.name }))
}

interface JiraFieldDef { id: string; name: string }

async function findFieldIdByNamePattern(config: JiraConfigRow, pattern: RegExp): Promise<string | null> {
  const fields = await jiraRequest('GET', config, '/rest/api/3/field') as JiraFieldDef[]
  return fields.find(f => pattern.test(f.name))?.id ?? null
}

/** Champ personnalisé Story Points, jamais le même id d'une instance Jira à l'autre (ex.
 *  "customfield_10016"), auto-détecté par nom plutôt que demandé à l'utilisateur. */
export const findStoryPointsFieldId = (config: JiraConfigRow) => findFieldIdByNamePattern(config, /story point/i)

/** Repli pour les projets "classiques" (company-managed), voir schema.prisma. */
export const findEpicLinkFieldId = (config: JiraConfigRow) => findFieldIdByNamePattern(config, /epic link/i)

export interface JiraIssueSummary {
  key: string
  type: string
  title: string
  status: string
  priority: string
  storyPoints: number | null
  parentKey: string | null
}

interface JiraIssueRaw {
  key: string
  fields: {
    summary?: string
    issuetype?: { name?: string }
    status?: { name?: string }
    priority?: { name?: string }
    parent?: { key?: string }
    [customFieldId: string]: unknown
  }
}

function mapIssue(issue: JiraIssueRaw, storyPointsFieldId: string | null, epicLinkFieldId: string | null): JiraIssueSummary {
  const fields = issue.fields ?? {}
  const spRaw = storyPointsFieldId ? fields[storyPointsFieldId] : undefined
  const epicLinkRaw = epicLinkFieldId ? fields[epicLinkFieldId] : undefined
  return {
    key: issue.key,
    type: fields.issuetype?.name ?? 'Task',
    title: fields.summary ?? '',
    status: fields.status?.name ?? '',
    priority: fields.priority?.name ?? '',
    storyPoints: typeof spRaw === 'number' ? spRaw : null,
    parentKey: fields.parent?.key ?? (typeof epicLinkRaw === 'string' ? epicLinkRaw : null),
  }
}

const MAX_ISSUES = 500

/** Toutes les issues d'un projet (Epics + items de travail), paginées via `nextPageToken`, jusqu'à
 *  MAX_ISSUES (garde-fou raisonnable pour ce prototype, pas de projet Jira à des milliers d'issues
 *  attendu ici). `fields` demandés explicitement : les champs personnalisés (Story Points, Epic
 *  Link) ne sont jamais renvoyés par défaut par Jira, contrairement aux champs standards. */
export async function searchJiraIssues(config: JiraConfigRow & { projectKey: string }, storyPointsFieldId: string | null, epicLinkFieldId: string | null): Promise<JiraIssueSummary[]> {
  const fields = ['summary', 'issuetype', 'status', 'priority', 'parent', storyPointsFieldId, epicLinkFieldId].filter((f): f is string => !!f)
  const issues: JiraIssueSummary[] = []
  let nextPageToken: string | undefined
  do {
    const body = await jiraRequest('POST', config, '/rest/api/3/search/jql', {
      jql: `project = "${config.projectKey}" ORDER BY key ASC`,
      fields,
      maxResults: 100,
      ...(nextPageToken ? { nextPageToken } : {}),
    }) as { issues?: JiraIssueRaw[]; nextPageToken?: string }
    for (const raw of body.issues ?? []) issues.push(mapIssue(raw, storyPointsFieldId, epicLinkFieldId))
    nextPageToken = body.nextPageToken
  } while (nextPageToken && issues.length < MAX_ISSUES)
  return issues
}

/** Aperçu tronqué du jeton, même logique que maskToken/maskSlackToken. */
export function maskJiraToken(token: string): string {
  return token.length <= 4 ? '••••' : `••••${token.slice(-4)}`
}
