import { FastifyInstance } from 'fastify'
import type { SlackConfig } from '@prisma/client'
import { authenticate, requireRole } from '../middleware/auth'
import {
  validateSlackToken, listSlackChannels, postSlackMessage, maskSlackToken,
  formatSprintCloseMessage, formatDependencyBlockMessage, formatDailySummaryMessage,
  type SprintCloseNotification, type DependencyBlockNotification, type DailySummaryNotification,
} from '../lib/slack'

interface ChannelInput { channelId?: string; channelName?: string; enabled?: boolean }
interface PutSlackConfigBody { botToken?: string; sprintClose?: ChannelInput; blocked?: ChannelInput; daily?: ChannelInput }

function toPublicConfig(config: SlackConfig) {
  return {
    teamName: config.teamName,
    tokenPreview: maskSlackToken(config.botToken),
    updatedAt: config.updatedAt,
    sprintClose: { channelId: config.sprintCloseChannelId, channelName: config.sprintCloseChannelName, enabled: config.sprintCloseEnabled },
    blocked: { channelId: config.blockedChannelId, channelName: config.blockedChannelName, enabled: config.blockedEnabled },
    daily: { channelId: config.dailyChannelId, channelName: config.dailyChannelName, enabled: config.dailyEnabled },
  }
}

// Phase 5 (roadmap v1), Integration Slack, 2026-08-08 : config reservee Admin (secret
// d'organisation, meme logique que l'integration GitHub), consultation/notifications ouvertes a
// tout compte connecte : poster un message Slack n'est pas une action sensible par role, contrairement
// a la configuration du workspace elle-meme. Les 4 routes de notification ne renvoient jamais
// d'erreur HTTP dure (toujours 200, `{ sent, error? }`) : appelees en side-effect silencieux depuis
// le frontend apres une action deja effectuee (cloture de sprint, changement de statut...), sauf
// pour le resume Daily (bouton explicite), ou le frontend lit `error` pour l'afficher.
export async function slackRoutes(fastify: FastifyInstance) {
  const adminOnly = [authenticate, requireRole('ADMIN')]

  fastify.get('/api/slack-config', { preHandler: adminOnly }, async () => {
    const config = await fastify.prisma.slackConfig.findFirst()
    if (!config) return { config: null }
    return { config: toPublicConfig(config) }
  })

  fastify.put<{ Body: PutSlackConfigBody }>('/api/slack-config', { preHandler: adminOnly }, async (req, reply) => {
    const existing = await fastify.prisma.slackConfig.findFirst()
    const token = req.body.botToken?.trim() || existing?.botToken
    if (!token) return reply.code(400).send({ error: 'Jeton Bot requis pour une première connexion' })

    let identity
    try {
      identity = await validateSlackToken(token)
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Connexion Slack impossible' })
    }

    const sprintClose = req.body.sprintClose
    const blocked = req.body.blocked
    const daily = req.body.daily
    const data = {
      botToken: token,
      teamName: identity.team,
      sprintCloseChannelId: sprintClose?.channelId ?? existing?.sprintCloseChannelId ?? null,
      sprintCloseChannelName: sprintClose?.channelName ?? existing?.sprintCloseChannelName ?? null,
      sprintCloseEnabled: sprintClose?.enabled ?? existing?.sprintCloseEnabled ?? false,
      blockedChannelId: blocked?.channelId ?? existing?.blockedChannelId ?? null,
      blockedChannelName: blocked?.channelName ?? existing?.blockedChannelName ?? null,
      blockedEnabled: blocked?.enabled ?? existing?.blockedEnabled ?? false,
      dailyChannelId: daily?.channelId ?? existing?.dailyChannelId ?? null,
      dailyChannelName: daily?.channelName ?? existing?.dailyChannelName ?? null,
      dailyEnabled: daily?.enabled ?? existing?.dailyEnabled ?? false,
    }

    const saved = existing
      ? await fastify.prisma.slackConfig.update({ where: { id: existing.id }, data })
      : await fastify.prisma.slackConfig.create({ data })
    return { config: toPublicConfig(saved) }
  })

  fastify.delete('/api/slack-config', { preHandler: adminOnly }, async (_req, reply) => {
    await fastify.prisma.slackConfig.deleteMany({})
    return reply.code(204).send()
  })

  fastify.get('/api/slack-config/channels', { preHandler: adminOnly }, async (_req, reply) => {
    const config = await fastify.prisma.slackConfig.findFirst()
    if (!config) return reply.code(404).send({ error: 'Aucun workspace Slack connecté' })
    try {
      return { channels: await listSlackChannels(config.botToken) }
    } catch (e) {
      return reply.code(502).send({ error: e instanceof Error ? e.message : 'Erreur Slack' })
    }
  })

  // Vérifie un jeton pas encore enregistré et renvoie ses canaux : sans cette route, impossible de
  // proposer un sélecteur de canal AVANT le tout premier enregistrement (aucune config en base pour
  // GET /channels ci-dessus de savoir quel jeton utiliser). N'écrit rien en base, contrairement au
  // PUT ci-dessus qui, lui, persiste.
  fastify.post<{ Body: { token: string } }>('/api/slack-config/verify', { preHandler: adminOnly }, async (req, reply) => {
    const token = req.body.token?.trim()
    if (!token) return reply.code(400).send({ error: 'Jeton requis' })
    try {
      const identity = await validateSlackToken(token)
      const channels = await listSlackChannels(token)
      return { team: identity.team, channels }
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Connexion Slack impossible' })
    }
  })

  /** Poste dans le canal configuré pour ce type de notification, si activé. Ne lève jamais : le
   *  résultat `{ sent, error? }` laisse l'appelant décider quoi en faire (silencieux ou toast). */
  async function sendToConfiguredChannel(
    channel: 'sprintClose' | 'blocked' | 'daily', text: string
  ): Promise<{ sent: boolean; error?: string }> {
    const config = await fastify.prisma.slackConfig.findFirst()
    if (!config) return { sent: false }
    const enabled = channel === 'sprintClose' ? config.sprintCloseEnabled : channel === 'blocked' ? config.blockedEnabled : config.dailyEnabled
    const channelId = channel === 'sprintClose' ? config.sprintCloseChannelId : channel === 'blocked' ? config.blockedChannelId : config.dailyChannelId
    if (!enabled || !channelId) return { sent: false }
    try {
      await postSlackMessage(config.botToken, channelId, text)
      return { sent: true }
    } catch (e) {
      return { sent: false, error: e instanceof Error ? e.message : 'Erreur Slack' }
    }
  }

  fastify.post<{ Body: SprintCloseNotification }>('/api/slack-config/notify/sprint-close', { preHandler: authenticate }, async req => {
    return sendToConfiguredChannel('sprintClose', formatSprintCloseMessage(req.body))
  })

  // Pas de route 'notify/blocked-item' ici : contrairement à la clôture de sprint, le changement de
  // statut vers Bloqué peut venir d'une dizaine d'écrans différents (voir routes/state.ts, en-tête
  // du PUT /api/state) - détecté directement là-bas par comparaison d'état, et dans
  // routes/items.ts (PATCH, seul chemin d'écriture d'un item hors PUT /api/state), plutôt que par
  // un appel additif frontend dupliqué dans chaque écran.

  fastify.post<{ Body: DependencyBlockNotification }>('/api/slack-config/notify/dependency-block', { preHandler: authenticate }, async req => {
    if (req.body.items.length === 0) return { sent: false }
    return sendToConfiguredChannel('blocked', formatDependencyBlockMessage(req.body))
  })

  fastify.post<{ Body: DailySummaryNotification }>('/api/slack-config/notify/daily-summary', { preHandler: authenticate }, async req => {
    if (req.body.entries.length === 0) return { sent: false, error: 'Aucune entrée Daily à envoyer' }
    return sendToConfiguredChannel('daily', formatDailySummaryMessage(req.body))
  })
}
