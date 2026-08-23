import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/auth'
import { postSlackMessage, formatBlockedItemMessage } from '../lib/slack'
import { broadcastSync } from '../lib/realtimeSync'

// Correctif 2026-07-22, complément final (voir docs/corrections.md, Sprint Review) : le tri
// `orderBy: { updatedAt: 'desc' }` ajouté au correctif précédent supposait un ordre toujours
// déterministe entre PUT et GET, mais s'il existe plusieurs lignes `workspace_state` dont le
// `updatedAt` tombe sur la même valeur (deux écritures rapprochées, résolution de l'horloge de la
// base), `ORDER BY` sans second critère de tri ne garantit RIEN en cas d'égalité — Postgres peut
// renvoyer l'une ou l'autre ligne de façon incohérente d'une requête à l'autre. C'est ce qui
// produisait le "une fois sur deux" observé par l'utilisateur : deux lignes bien réelles, dont le
// choix entre elles n'était pas déterministe en cas d'égalité de date.
//
// Solution définitive : un vrai singleton, garanti par la base elle-même via un identifiant fixe
// et un `upsert` atomique (une seule opération, aucune fenêtre de course possible), plutôt qu'un
// "trouver puis créer/mettre à jour" qui laisse toujours une place à l'ambiguïté. GET/PUT ciblent
// désormais tous les deux exactement la même ligne, sans jamais dépendre d'un tri.
const SINGLETON_ID = 'workspace-state-singleton'

// Phase 5 (roadmap v1), Intégration Slack, 2026-08-08 : alerte "item passé au statut Bloqué" (voir
// lib/slack.ts, formatBlockedItemMessage). Contrairement à la clôture/activation de sprint (2 pages
// seulement, RoadmapPage/PlanningPage, appel additif ajouté directement là-bas), un changement de
// statut peut venir d'une bonne dizaine d'écrans différents (Backlog, Kanban, Sprint Planning,
// Sprint Review, glisser-déposer...), tous passant in fine par ce même `PUT /api/state` générique
// (voir StateContext.tsx, saveToServer). Plutôt que dupliquer l'appel Slack dans chaque écran,
// détection par comparaison de l'état précédent/nouveau ICI, au seul endroit qu'ils traversent
// tous. Coût nul si l'alerte n'est pas activée (court-circuité avant toute lecture/comparaison).
interface MinimalItem { id: string; key: string; desc: string; status: string }

function extractItems(data: unknown): MinimalItem[] {
  const items = (data as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  return items.filter((i): i is MinimalItem =>
    typeof i === 'object' && i !== null && typeof (i as MinimalItem).id === 'string' && typeof (i as MinimalItem).status === 'string'
  )
}

/** Items qui viennent de passer au statut 'blocked' entre `previousData` et `nextData` (absent ou
 *  à un autre statut avant, 'blocked' maintenant) - jamais l'inverse (un item qui sort de Bloqué
 *  n'a pas d'alerte dédiée dans ce 1er chantier). */
function newlyBlockedItems(previousData: unknown, nextData: unknown): MinimalItem[] {
  const previousStatusById = new Map(extractItems(previousData).map(i => [i.id, i.status]))
  return extractItems(nextData).filter(i => i.status === 'blocked' && previousStatusById.get(i.id) !== 'blocked')
}

export async function stateRoutes(fastify: FastifyInstance) {
  // GET /api/public/branding : logo d'équipe + thème/couleur principale, pour l'écran de
  // connexion (Phase 6bis, roadmap v1, refonte du login, 2026-08-17 ; thème/couleur ajoutés le
  // même jour, retour Julien via docs/corrections futures.md, "Réglages (suite)" : la refonte du
  // login gardait le bleu/indigo par défaut, jamais le thème sombre ni la couleur personnalisée
  // choisis en Réglages). Public (aucune authentification) : LoginPage.tsx est rendue hors
  // StateProvider/ProtectedRoute (voir App.tsx), elle n'a donc accès à aucune donnée du workspace
  // avant connexion. Volontairement minimal : seuls le logo et le thème/la couleur (déjà visibles
  // de tous une fois connecté, sans caractère sensible) sont exposés, jamais le reste de
  // `settings` ni aucune autre donnée du workspace.
  fastify.get('/api/public/branding', async () => {
    const state = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
    const settings = (state?.data as {
      settings?: { logoDataUrl?: string; theme?: string; primaryColorLight?: string; primaryColorDark?: string }
    } | undefined)?.settings
    return {
      logoDataUrl: settings?.logoDataUrl ?? null,
      theme: settings?.theme ?? 'light',
      primaryColorLight: settings?.primaryColorLight ?? null,
      primaryColorDark: settings?.primaryColorDark ?? null,
    }
  })

  // GET /api/state — charger l'état du workspace
  fastify.get('/api/state', { preHandler: authenticate }, async (_req, reply) => {
    let state = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })

    // Migration ponctuelle : d'anciennes lignes avec un id généré (cuid) peuvent déjà exister,
    // d'avant ce correctif. On adopte la plus récente comme état canonique unique, une seule fois —
    // aucune intervention manuelle nécessaire pour migrer.
    if (!state) {
      const legacy = await fastify.prisma.workspaceState.findFirst({
        where: { id: { not: SINGLETON_ID } },
        orderBy: { updatedAt: 'desc' },
      })
      if (legacy) {
        try {
          state = await fastify.prisma.workspaceState.create({
            data: { id: SINGLETON_ID, data: legacy.data as object, version: legacy.version },
          })
        } catch {
          // Deux requêtes concurrentes ont pu migrer en même temps (ex. deux onglets ouverts au
          // même instant) : la seconde se heurte à la contrainte d'unicité sur l'id fixe — sans
          // gravité, il suffit de relire la ligne que l'autre vient de créer.
          state = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
        }
      }
    }

    if (!state) return reply.code(404).send({ error: 'Aucun état trouvé' })
    return { data: state.data, version: state.version }
  })

  // PUT /api/state — sauvegarder l'état du workspace
  //
  // Contrôle de concurrence optimiste (2026-08-20, retour Julien, voir docs/corrections futures.md
  // "Le PUT /api/state reste un écrasement complet du blob JSON...") : jusqu'ici, ce PUT écrasait
  // toujours l'état en base avec la copie complète envoyée par le client, sans jamais vérifier
  // qu'elle avait bien été construite à partir de la dernière version connue - deux utilisateurs
  // modifiant des parties différentes de l'état en même temps pouvaient silencieusement s'écraser
  // l'un l'autre, la colonne `version` existant déjà mais n'étant jamais lue à l'écriture.
  //
  // Le client envoie désormais la `version` qu'il a chargée (StateContext.tsx, `versionRef`).
  // L'écriture n'a lieu que si cette version correspond ENCORE à celle en base au moment précis de
  // l'écriture : comparaison et écriture en une seule opération atomique (`updateMany` filtré sur
  // `id` ET `version`), pour fermer la fenêtre de course qu'un "lire la version puis écrire" en 2
  // requêtes séparées laisserait ouverte entre deux PUT concurrents. Si `result.count === 0`, soit
  // la ligne n'existe pas encore (tout premier PUT du workspace, `version` non pertinente : création
  // normale), soit une autre écriture a eu lieu entre-temps (vrai conflit : 409, avec l'état et la
  // version actuellement en base, pour que le client puisse se resynchroniser sans requête
  // supplémentaire). `version` reste optionnelle en entrée (comportement historique conservé, sans
  // contrôle, si absente) : aucun appelant de ce repo n'omet plus `version` (StateContext.tsx la
  // fournit toujours dès qu'un état a été chargé), mais un futur appelant externe qui l'ignorerait
  // ne doit pas se retrouver bloqué sans recours.
  //
  // Faux conflits évités malgré la synchronisation temps réel (routes/realtimeWs.ts) : ce canal
  // diffuse les actions du reducer indépendamment de ce PUT (voir son en-tête) - sans rien de plus,
  // un client déjà à jour CONTENU par cette synchro se ferait quand même rejeter ici dès qu'un
  // collègue connecté sauvegarde quoi que ce soit, sa `version` locale n'ayant jamais été avancée.
  // Une sauvegarde réussie diffuse donc aussi la nouvelle version à tous les clients connectés
  // (`state_version`, en plus de `state_action` déjà existant) : `versionRef` reste à jour sans
  // round-trip, et un vrai conflit (client déconnecté du canal temps réel, ou domaine non couvert
  // par lui comme Now/Next/Later - voir SYNCABLE, StateContext.tsx) continue d'être détecté.
  fastify.put<{ Body: { data: unknown; version?: number } }>(
    '/api/state',
    { preHandler: authenticate },
    async (req, reply) => {
      // Phase 7, sécurité (2026-08-23) : `data` était jusqu'ici accepté en `unknown` sans aucun
      // contrôle - n'importe quel body JSON valide (y compris `null`, un tableau, une chaîne...)
      // écrasait l'état du workspace. Une validation de structure complète (chaque champ de chaque
      // item/sprint/HierarchyNode...) serait disproportionnée vu la taille et l'évolution constante
      // de cette forme ; on se limite donc à rejeter ce qui ne peut de toute façon jamais être un
      // état de workspace valide - un objet non nul, pas un tableau. La taille du body reste bornée
      // par la limite par défaut de Fastify (1 Mo, `bodyLimit` non surchargé dans index.ts) - déjà
      // un filet contre un payload abusif, pas besoin d'en ajouter un ici.
      if (typeof req.body?.data !== 'object' || req.body.data === null || Array.isArray(req.body.data)) {
        return reply.code(400).send({ error: "Le champ 'data' doit être un objet" })
      }

      const slackConfig = await fastify.prisma.slackConfig.findFirst()
      if (slackConfig?.blockedEnabled && slackConfig.blockedChannelId) {
        const previous = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
        const blocked = newlyBlockedItems(previous?.data, req.body.data)
        // Fire-and-forget : ne bloque jamais la réponse au client sur l'envoi Slack, et une
        // panne Slack ne doit jamais empêcher une sauvegarde réelle de l'état.
        for (const item of blocked) {
          postSlackMessage(slackConfig.botToken, slackConfig.blockedChannelId, formatBlockedItemMessage({ itemKey: item.key, itemDesc: item.desc }))
            .catch(() => {})
        }
      }

      const providedVersion = req.body.version

      if (typeof providedVersion !== 'number') {
        const updated = await fastify.prisma.workspaceState.upsert({
          where: { id: SINGLETON_ID },
          update: { data: req.body.data as object, version: { increment: 1 } },
          create: { id: SINGLETON_ID, data: req.body.data as object },
        })
        broadcastSync({ type: 'state_version', version: updated.version })
        return reply.code(200).send({ version: updated.version })
      }

      const result = await fastify.prisma.workspaceState.updateMany({
        where: { id: SINGLETON_ID, version: providedVersion },
        data: { data: req.body.data as object, version: { increment: 1 } },
      })

      if (result.count === 0) {
        const current = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
        if (!current) {
          const created = await fastify.prisma.workspaceState.create({
            data: { id: SINGLETON_ID, data: req.body.data as object },
          })
          broadcastSync({ type: 'state_version', version: created.version })
          return reply.code(200).send({ version: created.version })
        }
        return reply.code(409).send({ error: 'conflict', data: current.data, version: current.version })
      }

      const updated = await fastify.prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
      broadcastSync({ type: 'state_version', version: updated!.version })
      return reply.code(200).send({ version: updated!.version })
    }
  )
}
