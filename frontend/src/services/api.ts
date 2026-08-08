import type { AiConfig, AiToolCall, ApiToken, ApiTokenCreateResult, AuthUser, GitHubCommitSummary, GitHubConfig, GitHubPullRequestSummary, Invitation, JiraConfig, JiraIssueSummary, JiraProject, ManagedUser, PresentationLink, SlackChannel, SlackConfig, UserRole } from '../types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

function getToken(): string | null {
  return localStorage.getItem('cadence_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      // Bug réel trouvé par Julien (Phase 2.5, Onboarding, test manuel sur le vrai backend) :
      // `Content-Type: application/json` était toujours envoyé, même sans corps (ex.
      // `createInvitation`/`revokeInvitation`, POST/DELETE sans body). Fastify refuse par défaut
      // un body vide sous ce content-type (`FST_ERR_CTP_EMPTY_JSON_BODY`) — invisible dans les
      // tests Playwright, dont les mocks (`page.route`) n'exécutent jamais le vrai parseur de
      // corps de Fastify. N'ajouter l'en-tête que si un corps est réellement envoyé.
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  // 204 No Content (ex. PUT /api/state, DELETE /api/invitations/:id) : pas de corps à parser —
  // `res.json()` lèverait une erreur "Unexpected end of JSON input" sur un body vide. Corrigé au
  // passage (Phase 2.5, Onboarding) : `putState` y était déjà exposée, silencieusement avalée par
  // le `.catch()` "offline mode" de `saveToServer` (StateContext.tsx) — jamais remarqué faute de
  // code qui dépende réellement de la valeur résolue, contrairement à `revokeInvitation` ci-dessous.
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  // Le backend renvoie déjà { token, user: { id, email, name, role } } (voir backend/src/routes/auth.ts) —
  // le typage ne déclarait auparavant que `token`, perdant id/role au passage (Chantier J).
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  // Phase 2.5 (roadmap v1), Onboarding : auto-inscription libre, réservée aux rôles PO/Scrum
  // Master/Dev côté serveur (voir backend/src/routes/auth.ts) — même forme de réponse que login,
  // connecte automatiquement la personne (pas d'étape de validation supplémentaire).
  signup: (input: { email: string; password: string; name: string; role: UserRole }) =>
    request<{ token: string; user: AuthUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  // Complète une invitation Stakeholder (token généré par un Admin, voir createInvitation
  // ci-dessous) — même forme de réponse que login/signup.
  // `poste`/`phone` (2026-08-01, retour Julien) : le poste dans l'entreprise remplit
  // `Contact.role` (jusqu'ici toujours vide pour un Stakeholder), le téléphone est facultatif.
  acceptInvite: (input: { token: string; email: string; password: string; name: string; poste: string; phone?: string }) =>
    request<{ token: string; user: AuthUser }>('/api/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  // Vérification amont de la validité d'un lien d'invitation (2026-08-01, retour Julien : un
  // lien révoqué restait affiché/remplissable, l'erreur n'apparaissait qu'à la soumission). Public
  // comme accept-invite. `LoginPage.tsx` masque le formulaire si `valid === false` uniquement,
  // fail-open sur toute autre forme de réponse (pas de backend joignable en test E2E non mocké).
  checkInvite: (token: string) => request<{ valid: boolean }>(`/api/auth/invite-status/${token}`),
  getState: () => request<{ data: unknown }>('/api/state'),
  putState: (data: unknown) =>
    request<void>('/api/state', { method: 'PUT', body: JSON.stringify({ data }) }),
  // Phase 2 (roadmap v1), sous-chantier 1 : gestion des comptes, réservée au rôle Admin côté
  // backend (403 sinon — voir backend/src/routes/users.ts).
  listUsers: () => request<{ users: ManagedUser[] }>('/api/users'),
  createUser: (input: { email: string; password: string; name: string; role: UserRole }) =>
    request<{ user: ManagedUser }>('/api/users', { method: 'POST', body: JSON.stringify(input) }),
  updateUser: (id: string, input: { role?: UserRole; name?: string }) =>
    request<{ user: ManagedUser }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  // Retour Julien (2026-08-01) : supprimer la fiche Équipe ne supprimait pas le compte applicatif
  // lié (il pouvait toujours se connecter) — voir backend/src/routes/users.ts. Un compte Admin ne
  // peut pas être supprimé (403 côté serveur, bouton absent côté client de toute façon).
  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
  // Phase 2.5 (roadmap v1), Onboarding : invitations Stakeholder, réservées Admin côté serveur
  // (voir backend/src/routes/invitations.ts). Pas d'infrastructure d'envoi d'email dans ce
  // prototype — le lien (construit côté frontend à partir du token) est à partager manuellement.
  listInvitations: () => request<{ invitations: Invitation[] }>('/api/invitations'),
  createInvitation: (clientId: string) => request<{ invitation: Invitation }>('/api/invitations', {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  }),
  revokeInvitation: (id: string) => request<void>(`/api/invitations/${id}`, { method: 'DELETE' }),
  // Phase 2.5 (roadmap v1), Onboarding, points 2-4 (tooltips progressifs, checklist, démo
  // interactive) — voir backend/src/routes/onboarding.ts et data/onboardingChecklist.ts (contenu
  // de la checklist, entièrement côté frontend).
  getOnboarding: () => request<{ onboardingSeenAt: string | null; onboardingCompletedItems: string[] }>('/api/onboarding'),
  markOnboardingSeen: () => request<{ onboardingSeenAt: string }>('/api/onboarding/seen', { method: 'POST' }),
  completeOnboardingItem: (itemId: string) =>
    request<{ onboardingCompletedItems: string[] }>('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ itemId }),
    }),
  // Retour Julien (2026-08-01) : bouton "Réinitialiser" dans le panneau — remet la checklist à
  // zéro sans toucher `onboardingSeenAt` (ne redéclenche pas l'ouverture automatique, ce n'est pas
  // le même concept que "je n'ai encore rien vu").
  resetOnboarding: () => request<{ onboardingCompletedItems: string[] }>('/api/onboarding/reset', { method: 'POST' }),
  // Phase 3 (roadmap v1), Mode présentation — lien de partage public réservé Admin + PO côté
  // serveur (voir backend/src/routes/presentation.ts). Un seul lien actif à la fois : `create`
  // régénère (invalide l'ancien), `revoke` supprime sans en recréer un.
  getPresentationLink: () => request<{ link: PresentationLink | null }>('/api/presentation-link'),
  createPresentationLink: () => request<{ link: PresentationLink }>('/api/presentation-link', { method: 'POST' }),
  revokePresentationLink: () => request<void>('/api/presentation-link', { method: 'DELETE' }),
  // Public, pas d'authentification (le token fait office d'autorisation) — utilisé par
  // PresentationPublicPage.tsx via StateContext (prop `publicToken`) pour charger l'état du
  // workspace en lecture seule, à la place de `getState` (qui exige un JWT).
  getPresentationState: (token: string) => request<{ data: unknown }>(`/api/presentation/state/${token}`),
  // Phase 5 (roadmap v1), MCP Claude (Cadence) : jetons d'accès personnels (voir
  // backend/src/routes/apiTokens.ts). Chaque utilisateur connecté gère ses propres jetons, pas de
  // route réservée à un rôle particulier ici (le filtrage par propriétaire se fait côté serveur).
  listApiTokens: () => request<{ tokens: ApiToken[] }>('/api/api-tokens'),
  createApiToken: (name: string) =>
    request<ApiTokenCreateResult>('/api/api-tokens', { method: 'POST', body: JSON.stringify({ name }) }),
  revokeApiToken: (id: string) => request<void>(`/api/api-tokens/${id}`, { method: 'DELETE' }),
  // Phase 5 (roadmap v1), Intégration GitHub : configuration du dépôt lié (voir
  // backend/src/routes/github.ts). Gestion réservée Admin côté serveur, consultation des
  // commits/PR ouverte à tout compte connecté.
  getGitHubConfig: () => request<{ config: GitHubConfig | null }>('/api/github-config'),
  saveGitHubConfig: (input: { owner: string; repo: string; token?: string }) =>
    request<{ config: GitHubConfig }>('/api/github-config', { method: 'PUT', body: JSON.stringify(input) }),
  deleteGitHubConfig: () => request<void>('/api/github-config', { method: 'DELETE' }),
  getGitHubCommits: (key: string) => request<{ commits: GitHubCommitSummary[] }>(`/api/github-config/commits/${encodeURIComponent(key)}`),
  getGitHubPullRequests: (key: string) => request<{ pullRequests: GitHubPullRequestSummary[] }>(`/api/github-config/prs/${encodeURIComponent(key)}`),

  // Phase 5 (roadmap v1), Intégration Slack : configuration réservée Admin (voir
  // backend/src/routes/slack.ts). `verifySlackToken` ne persiste rien : sert uniquement à peupler
  // le sélecteur de canaux avant le tout premier enregistrement (aucune config en base pour
  // `getSlackChannels`, qui lit le jeton déjà stocké, de savoir lequel utiliser).
  getSlackConfig: () => request<{ config: SlackConfig | null }>('/api/slack-config'),
  saveSlackConfig: (input: { botToken?: string; sprintClose?: { channelId: string; channelName: string; enabled: boolean }; blocked?: { channelId: string; channelName: string; enabled: boolean }; daily?: { channelId: string; channelName: string; enabled: boolean } }) =>
    request<{ config: SlackConfig }>('/api/slack-config', { method: 'PUT', body: JSON.stringify(input) }),
  deleteSlackConfig: () => request<void>('/api/slack-config', { method: 'DELETE' }),
  getSlackChannels: () => request<{ channels: SlackChannel[] }>('/api/slack-config/channels'),
  verifySlackToken: (token: string) => request<{ team: string; channels: SlackChannel[] }>('/api/slack-config/verify', { method: 'POST', body: JSON.stringify({ token }) }),

  // Notifications Slack : appels additifs silencieux (le backend ne lève jamais d'erreur HTTP dure
  // ici, voir routes/slack.ts), déclenchés depuis le frontend au moment de l'action existante
  // (clôture de sprint, changement de statut vers Bloqué, activation de sprint), sans toucher au
  // mécanisme de sauvegarde principal (`putState` ci-dessus). Sauf le résumé Daily (bouton
  // explicite), dont le frontend lit `error` pour l'afficher.
  notifySlackSprintClose: (input: { sprintNumber: number; sprintLabel: string; spDone: number; spTotal: number; itemsDone: number; itemsTotal: number }) =>
    request<{ sent: boolean; error?: string }>('/api/slack-config/notify/sprint-close', { method: 'POST', body: JSON.stringify(input) }),
  // Pas de fonction pour 'blocked-item' ici : détecté côté backend (voir routes/state.ts et
  // routes/items.ts), pas déclenché depuis le frontend.
  notifySlackDependencyBlock: (input: { sprintLabel: string; items: { key: string; desc: string; blockedByKeys: string[] }[] }) =>
    request<{ sent: boolean; error?: string }>('/api/slack-config/notify/dependency-block', { method: 'POST', body: JSON.stringify(input) }),
  notifySlackDailySummary: (input: { date: string; entries: { memberName: string; yesterday: string; today: string; blockers: string }[] }) =>
    request<{ sent: boolean; error?: string }>('/api/slack-config/notify/daily-summary', { method: 'POST', body: JSON.stringify(input) }),

  // Phase 5 (roadmap v1), Intégration Jira : configuration réservée Admin (voir
  // backend/src/routes/jira.ts). `getJiraProjects` ne persiste rien (même rôle que
  // `verifySlackToken`) : sert à peupler le sélecteur de projet avant le tout premier
  // enregistrement. `importFromJira` renvoie les issues normalisées, sans rien écrire dans le
  // Backlog : c'est `applyJiraImport` (utils/jiraImport.ts) côté frontend qui fait la fusion, puis
  // `putState` (déjà présent ci-dessus) qui persiste, exactement comme l'import Excel existant.
  getJiraConfig: () => request<{ config: JiraConfig | null }>('/api/jira-config'),
  saveJiraConfig: (input: { siteUrl: string; email: string; apiToken?: string; projectKey: string; projectName: string; cadenceClientId: string }) =>
    request<{ config: JiraConfig }>('/api/jira-config', { method: 'PUT', body: JSON.stringify(input) }),
  deleteJiraConfig: () => request<void>('/api/jira-config', { method: 'DELETE' }),
  getJiraProjects: (input: { siteUrl: string; email: string; apiToken: string }) =>
    request<{ projects: JiraProject[] }>('/api/jira-config/projects', { method: 'POST', body: JSON.stringify(input) }),
  importFromJira: () => request<{ issues: JiraIssueSummary[]; cadenceClientId: string }>('/api/jira-config/import', { method: 'POST' }),

  // Phase 6 (roadmap v1), Compagnon IA, sous-chantier 1, 2026-08-08 : configuration réservée Admin
  // (voir backend/src/routes/ai.ts), même logique que GitHub/Slack/Jira (clé jamais renvoyée en
  // clair, `apiKey` optionnel à la mise à jour pour ne pas la ressaisir à chaque changement de
  // modèle). `sendChatMessage` envoie l'historique complet à chaque appel : pas d'état conversation
  // côté serveur dans cette 1re version (voir ChatContext.tsx).
  getAiConfig: () => request<{ config: AiConfig | null }>('/api/ai-config'),
  saveAiConfig: (input: { apiKey?: string; model?: string }) =>
    request<{ config: AiConfig }>('/api/ai-config', { method: 'PUT', body: JSON.stringify(input) }),
  deleteAiConfig: () => request<void>('/api/ai-config', { method: 'DELETE' }),
  sendChatMessage: (messages: { role: 'user' | 'assistant'; content: string }[]) =>
    request<{ reply: string; toolCalls: AiToolCall[] }>('/api/ai-chat', { method: 'POST', body: JSON.stringify({ messages }) }),
}
