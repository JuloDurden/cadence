import type { AuthUser, Invitation, ManagedUser, UserRole } from '../types'

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
  acceptInvite: (input: { token: string; email: string; password: string; name: string }) =>
    request<{ token: string; user: AuthUser }>('/api/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
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
  // Phase 2.5 (roadmap v1), Onboarding : invitations Stakeholder, réservées Admin côté serveur
  // (voir backend/src/routes/invitations.ts). Pas d'infrastructure d'envoi d'email dans ce
  // prototype — le lien (construit côté frontend à partir du token) est à partager manuellement.
  listInvitations: () => request<{ invitations: Invitation[] }>('/api/invitations'),
  createInvitation: (clientId: string) => request<{ invitation: Invitation }>('/api/invitations', {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  }),
  revokeInvitation: (id: string) => request<void>(`/api/invitations/${id}`, { method: 'DELETE' }),
}
