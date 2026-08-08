// Phase 5 (roadmap v1), Intégration GitHub, 2026-08-08 : appels REST GitHub (API de recherche pour
// lier commits/PR à un item via sa Clé, ex. "FAX-012" retrouvée dans un message de commit ou un
// titre de PR). En-têtes/endpoints vérifiés sur la doc officielle GitHub (search/commits,
// search/issues) au moment d'écrire ce fichier : `Accept: application/vnd.github+json` suffit
// désormais (l'ancien en-tête preview `cloak-preview` pour la recherche de commits n'est plus
// nécessaire, cette recherche est en disponibilité générale).
const GITHUB_API_VERSION = '2022-11-28'

export interface GitHubConfigRow { owner: string; repo: string; token: string }

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  }
}

async function githubGet(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, { headers: githubHeaders(token) })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(res.status === 404 ? 'Dépôt introuvable ou jeton sans accès' : `GitHub API ${res.status} : ${body.slice(0, 300)}`)
  }
  return res.json()
}

/** Vérifie qu'un dépôt est bien accessible avec ce jeton, avant d'enregistrer la config (mieux
 *  vaut échouer maintenant, avec un message clair, qu'au premier item consulté). */
export async function validateRepo(owner: string, repo: string, token: string): Promise<void> {
  await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token)
}

export interface CommitSummary { sha: string; message: string; author: string; date: string; url: string }

/** Recherche des commits dont le message contient la Clé (ex. "FAX-012"), sur le dépôt configuré
 *  uniquement (`repo:owner/repo` dans la requête). Pas de qualificatif de champ dédié côté GitHub
 *  pour "message seulement" : la recherche porte sur le message du commit par défaut. */
export async function searchCommits(config: GitHubConfigRow, key: string): Promise<CommitSummary[]> {
  const q = `${key} repo:${config.owner}/${config.repo}`
  const body = await githubGet(`/search/commits?q=${encodeURIComponent(q)}&sort=committer-date&order=desc`, config.token) as {
    items: { sha: string; html_url: string; commit?: { message?: string; author?: { name?: string; date?: string } }; author?: { login?: string } }[]
  }
  return body.items.map(it => ({
    sha: it.sha,
    message: (it.commit?.message ?? '').split('\n')[0],
    author: it.commit?.author?.name ?? it.author?.login ?? 'inconnu',
    date: it.commit?.author?.date ?? '',
    url: it.html_url,
  }))
}

export interface PullRequestSummary { number: number; title: string; state: string; merged: boolean; author: string; url: string }

/** Recherche des Pull Requests dont le titre/corps contient la Clé. `is:pull-request` obligatoire
 *  côté GitHub depuis leur ajout de la recherche sémantique (une requête sans `is:issue` ni
 *  `is:pull-request` renvoie désormais 422), on ne veut de toute façon que les PR ici. */
export async function searchPullRequests(config: GitHubConfigRow, key: string): Promise<PullRequestSummary[]> {
  const q = `${key} repo:${config.owner}/${config.repo} is:pull-request`
  const body = await githubGet(`/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc`, config.token) as {
    items: { number: number; title: string; state: string; html_url: string; user?: { login?: string }; pull_request?: { merged_at?: string | null } }[]
  }
  return body.items.map(it => ({
    number: it.number,
    title: it.title,
    state: it.state,
    merged: it.pull_request?.merged_at != null,
    author: it.user?.login ?? 'inconnu',
    url: it.html_url,
  }))
}

/** N'affiche jamais le jeton en clair une fois enregistré, seulement ses 4 derniers caractères
 *  (assez pour le reconnaître, pas assez pour le rejouer), même logique que les jetons API MCP. */
export function maskToken(token: string): string {
  return token.length <= 4 ? '••••' : `••••${token.slice(-4)}`
}
