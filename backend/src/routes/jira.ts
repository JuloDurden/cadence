import { FastifyInstance } from 'fastify'
import type { JiraConfig } from '@prisma/client'
import { authenticate, requireRole } from '../middleware/auth'
import {
  validateJiraConnection, listJiraProjects, findStoryPointsFieldId, findEpicLinkFieldId,
  searchJiraIssues, maskJiraToken, normalizeSiteUrl,
} from '../lib/jira'

interface PutJiraConfigBody {
  siteUrl: string; email: string; apiToken?: string
  projectKey: string; projectName: string; cadenceClientId: string
}

function toPublicConfig(config: JiraConfig) {
  return {
    siteUrl: config.siteUrl,
    email: config.email,
    tokenPreview: maskJiraToken(config.apiToken),
    projectKey: config.projectKey,
    projectName: config.projectName,
    storyPointsFieldId: config.storyPointsFieldId,
    epicLinkFieldId: config.epicLinkFieldId,
    cadenceClientId: config.cadenceClientId,
    updatedAt: config.updatedAt,
  }
}

// Phase 5 (roadmap v1), Integration Jira, 2026-08-08 : config reservee Admin (secret d'organisation,
// meme logique que GitHub/Slack). L'import lui-meme (POST .../import) est ouvert a PO + Admin
// (canManageBacklog cote frontend, voir permissions.ts) : c'est une ecriture dans le Backlog, pas
// juste une consultation, donc le meme perimetre que la creation/edition manuelle d'un item plutot
// que le perimetre "authenticate seul" utilise par les routes de consultation GitHub/Slack.
//
// Cette route ne pousse rien elle-meme dans WorkspaceState : elle renvoie les issues Jira
// normalisees (JiraIssueSummary[]) au frontend, qui applique `applyJiraImport` (pure, voir
// utils/jiraImport.ts) puis persiste via le flux normal `saveToServer` (PUT /api/state), exactement
// comme l'import Excel existant (`applyBacklogExcelImport`) ne touche jamais la base directement.
export async function jiraRoutes(fastify: FastifyInstance) {
  const adminOnly = [authenticate, requireRole('ADMIN')]
  const canImport = [authenticate, requireRole('PO', 'ADMIN')]

  fastify.get('/api/jira-config', { preHandler: adminOnly }, async () => {
    const config = await fastify.prisma.jiraConfig.findFirst()
    if (!config) return { config: null }
    return { config: toPublicConfig(config) }
  })

  // PUT (re)configure la connexion. `apiToken` optionnel a la mise a jour (garde le jeton existant
  // si omis), verifie aupres de Jira AVANT d'ecrire quoi que ce soit (myself), puis auto-detecte
  // storyPointsFieldId/epicLinkFieldId (jamais saisis par l'utilisateur, voir schema.prisma).
  fastify.put<{ Body: PutJiraConfigBody }>(
    '/api/jira-config',
    {
      schema: {
        body: {
          type: 'object', required: ['siteUrl', 'email', 'projectKey', 'projectName', 'cadenceClientId'],
          properties: {
            siteUrl: { type: 'string', minLength: 1 },
            email: { type: 'string', minLength: 1 },
            apiToken: { type: 'string' },
            projectKey: { type: 'string', minLength: 1 },
            projectName: { type: 'string', minLength: 1 },
            cadenceClientId: { type: 'string', minLength: 1 },
          },
        },
      },
      preHandler: adminOnly,
    },
    async (req, reply) => {
      const existing = await fastify.prisma.jiraConfig.findFirst()
      const apiToken = req.body.apiToken?.trim() || existing?.apiToken
      if (!apiToken) return reply.code(400).send({ error: 'Jeton API requis pour une première connexion' })

      const candidate = { siteUrl: normalizeSiteUrl(req.body.siteUrl), email: req.body.email.trim(), apiToken }
      try {
        await validateJiraConnection(candidate)
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : 'Connexion Jira impossible' })
      }

      let storyPointsFieldId: string | null = existing?.storyPointsFieldId ?? null
      let epicLinkFieldId: string | null = existing?.epicLinkFieldId ?? null
      try {
        storyPointsFieldId = await findStoryPointsFieldId(candidate)
        epicLinkFieldId = await findEpicLinkFieldId(candidate)
      } catch {
        // Non bloquant : l'auto-detection des champs personnalises est un confort (SP/rattachement
        // Epic), pas une condition de connexion valide, on garde les valeurs precedentes si echec.
      }

      const data = {
        ...candidate,
        projectKey: req.body.projectKey,
        projectName: req.body.projectName,
        cadenceClientId: req.body.cadenceClientId,
        storyPointsFieldId,
        epicLinkFieldId,
      }

      const saved = existing
        ? await fastify.prisma.jiraConfig.update({ where: { id: existing.id }, data })
        : await fastify.prisma.jiraConfig.create({ data })

      return { config: toPublicConfig(saved) }
    }
  )

  fastify.delete('/api/jira-config', { preHandler: adminOnly }, async (_req, reply) => {
    await fastify.prisma.jiraConfig.deleteMany({})
    return reply.code(204).send()
  })

  // Liste les projets Jira accessibles avec CE jeton, AVANT tout enregistrement (meme role que
  // POST /api/slack-config/verify) : permet au picker de projet du frontend de proposer une liste
  // plutot qu'une saisie libre de la clé de projet, source d'erreurs de frappe.
  fastify.post<{ Body: { siteUrl: string; email: string; apiToken: string } }>(
    '/api/jira-config/projects',
    { preHandler: adminOnly },
    async (req, reply) => {
      const { siteUrl, email, apiToken } = req.body
      if (!siteUrl?.trim() || !email?.trim() || !apiToken?.trim()) {
        return reply.code(400).send({ error: 'Site, email et jeton requis' })
      }
      const candidate = { siteUrl: normalizeSiteUrl(siteUrl), email: email.trim(), apiToken: apiToken.trim() }
      try {
        await validateJiraConnection(candidate)
        return { projects: await listJiraProjects(candidate) }
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : 'Connexion Jira impossible' })
      }
    }
  )

  // Recupere et normalise les issues du projet configure, sans rien ecrire dans le Backlog (voir
  // en-tete du fichier) : c'est `applyJiraImport` cote frontend qui fait le rapprochement par
  // `jiraKey` et la fusion dans WorkspaceState.
  fastify.post('/api/jira-config/import', { preHandler: canImport }, async (_req, reply) => {
    const config = await fastify.prisma.jiraConfig.findFirst()
    if (!config) return reply.code(404).send({ error: 'Aucun projet Jira connecté' })
    try {
      const issues = await searchJiraIssues(config, config.storyPointsFieldId, config.epicLinkFieldId)
      return { issues, cadenceClientId: config.cadenceClientId }
    } catch (e) {
      return reply.code(502).send({ error: e instanceof Error ? e.message : 'Erreur Jira' })
    }
  })
}
