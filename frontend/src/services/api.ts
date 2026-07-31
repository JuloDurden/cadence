import type { AuthUser, ManagedUser, UserRole } from '../types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

function getToken(): string | null {
  return localStorage.getItem('cadence_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
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
}
