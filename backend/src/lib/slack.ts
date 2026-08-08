// Phase 5 (roadmap v1), Integration Slack, 2026-08-08 : appels Web API Slack (auth.test,
// conversations.list, chat.postMessage). Jeton Bot d'une vraie Slack App (xoxb-...), voir
// schema.prisma pour le detail de la decision. Toutes les methodes Slack repondent en HTTP 200
// meme en cas d'echec (`{ ok: false, error: '...' }`), contrairement a l'API GitHub deja
// integree (lib/github.ts) qui utilise les vrais codes HTTP : verification systematique du champ
// `ok`, jamais de `res.ok`/`res.status` seuls.
const SLACK_API = 'https://slack.com/api'

interface SlackApiResponse {
  ok: boolean
  error?: string
}

/** Messages d'erreur Slack les plus probables en usage reel, traduits pour rester actionnables
 *  (voir routes/slack.ts, affiches directement a l'utilisateur). Repli sur le code d'erreur brut
 *  pour les cas non listes ici, plutot qu'un message generique qui masquerait la vraie cause. */
function slackErrorMessage(error: string | undefined): string {
  switch (error) {
    case 'invalid_auth':
    case 'not_authed':
    case 'token_revoked':
    case 'token_expired':
      return 'Jeton Slack invalide ou revoque'
    case 'account_inactive':
      return 'Ce jeton correspond a un compte ou un workspace Slack supprime'
    case 'missing_scope':
      return 'Le jeton Slack n\'a pas les permissions necessaires (scope manquant sur la Slack App)'
    case 'channel_not_found':
      return 'Canal Slack introuvable'
    case 'not_in_channel':
      return 'Le bot n\'est pas membre de ce canal : invitez-le avec /invite @NomDuBot dans Slack, puis reessayez'
    case 'is_archived':
      return 'Ce canal Slack est archive'
    default:
      return error ? `Erreur Slack : ${error}` : 'Erreur Slack inconnue'
  }
}

async function slackCall<T extends SlackApiResponse>(method: string, token: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json() as T
  if (!json.ok) throw new Error(slackErrorMessage(json.error))
  return json
}

export interface SlackIdentity { team: string; teamId: string }

/** Verifie le jeton et recupere le nom du workspace, avant tout enregistrement (meme logique que
 *  `validateRepo` pour GitHub : mieux vaut echouer maintenant, avec un message clair). */
export async function validateSlackToken(token: string): Promise<SlackIdentity> {
  const json = await slackCall<SlackApiResponse & { team?: string; team_id?: string }>('auth.test', token)
  return { team: json.team ?? 'workspace Slack', teamId: json.team_id ?? '' }
}

export interface SlackChannel { id: string; name: string }

/** Canaux publics et prives visibles par le bot (necessite les scopes channels:read/groups:read
 *  sur la Slack App) - le bot doit ensuite etre invite dans un canal prive ou public restreint
 *  pour pouvoir y poster (voir slackErrorMessage, 'not_in_channel'), lister ne suffit pas. */
export async function listSlackChannels(token: string): Promise<SlackChannel[]> {
  const json = await slackCall<SlackApiResponse & { channels?: { id: string; name: string; is_archived?: boolean }[] }>(
    'conversations.list', token, { types: 'public_channel,private_channel', exclude_archived: true, limit: 200 }
  )
  return (json.channels ?? []).map(c => ({ id: c.id, name: c.name }))
}

/** Poste un message texte (mrkdwn Slack, pas de Block Kit dans cette 1re version) dans un canal. */
export async function postSlackMessage(token: string, channelId: string, text: string): Promise<void> {
  await slackCall('chat.postMessage', token, { channel: channelId, text })
}

/* ─── Formatage des messages par type de notification ──────────────────────
 * Texte simple en mrkdwn Slack (*gras*, `code`), pas de Block Kit : suffisant pour une 1re version,
 * plus simple a maintenir qu'une mise en page en blocs. */

export interface SprintCloseNotification {
  sprintNumber: number
  sprintLabel: string
  spDone: number
  spTotal: number
  itemsDone: number
  itemsTotal: number
}

export function formatSprintCloseMessage(n: SprintCloseNotification): string {
  const label = n.sprintLabel ? ` - ${n.sprintLabel}` : ''
  return `:checkered_flag: *Sprint ${n.sprintNumber} cloture*${label}\n`
    + `${n.itemsDone}/${n.itemsTotal} item(s) termine(s), ${n.spDone}/${n.spTotal} SP livres`
}

export interface BlockedItemNotification {
  itemKey: string
  itemDesc: string
}

export function formatBlockedItemMessage(n: BlockedItemNotification): string {
  return `:no_entry: *${n.itemKey}* passe au statut Bloque\n${n.itemDesc}`
}

export interface DependencyBlockNotification {
  sprintLabel: string
  items: { key: string; desc: string; blockedByKeys: string[] }[]
}

export function formatDependencyBlockMessage(n: DependencyBlockNotification): string {
  const lines = n.items.map(i => `• *${i.key}* ${i.desc} (attend ${i.blockedByKeys.join(', ')})`)
  return `:warning: *Sprint ${n.sprintLabel} active avec des dependances non resolues*\n${lines.join('\n')}`
}

export interface DailySummaryNotification {
  date: string
  entries: { memberName: string; yesterday: string; today: string; blockers: string }[]
}

export function formatDailySummaryMessage(n: DailySummaryNotification): string {
  const lines = n.entries.map(e => {
    const blockers = e.blockers ? `\n    :warning: ${e.blockers}` : ''
    return `*${e.memberName}*\n    Hier : ${e.yesterday || '(rien de note)'}\n    Aujourd'hui : ${e.today || '(rien de note)'}${blockers}`
  })
  return `:sunny: *Daily du ${n.date}*\n\n${lines.join('\n\n')}`
}

/** Aperçu tronqué du jeton, meme logique que maskToken (lib/github.ts) : jamais reaffiche en
 *  clair une fois enregistre. */
export function maskSlackToken(token: string): string {
  return token.length <= 4 ? '••••' : `••••${token.slice(-4)}`
}
