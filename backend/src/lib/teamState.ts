import type { PrismaClient, Role } from '@prisma/client'
import { randomUUID } from 'crypto'
import { defaultPosteForRole, posteHasNoVelocity } from './teamDefaults'

// Doit rester la même valeur que `SINGLETON_ID` dans routes/state.ts — un seul singleton
// `WorkspaceState` pour tout le workspace (voir ce fichier pour le raisonnement complet : upsert
// atomique sur un id fixe, pas de recherche par tri qui laisserait place à l'ambiguïté).
const SINGLETON_ID = 'workspace-state-singleton'

// Phase 2.5 (roadmap v1) — Onboarding. Crée une fiche Équipe déjà liée (`linkedUserId`) au compte
// qui vient d'être créé, directement dans `WorkspaceState.data.team` — équivalent serveur de ce
// que `UsersSettingsSection.tsx` fait côté client pour un compte créé par un Admin (v0.93.7),
// nécessaire ici car `LoginPage.tsx` (signup/accept-invite) n'est pas monté sous `StateProvider`.
// Best-effort : si aucun état n'existe encore (aucun PUT /api/state jamais reçu, cas quasi
// théorique dans ce prototype), on n'échoue pas la création du compte pour autant — la fiche
// pourra toujours être liée manuellement depuis Team ensuite.
export async function createLinkedTeamMember(prisma: PrismaClient, userId: string, name: string, role: Role) {
  const state = await prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
  if (!state) return

  const data = state.data as Record<string, unknown>
  const team = Array.isArray(data.team) ? (data.team as Record<string, unknown>[]) : []
  const poste = defaultPosteForRole(role)
  const member = {
    id: randomUUID(),
    name,
    role: poste,
    spPerDay: posteHasNoVelocity(poste) ? 0 : 2,
    tags: [] as string[],
    linkedUserId: userId,
  }

  await prisma.workspaceState.update({
    where: { id: SINGLETON_ID },
    // `as object` : même choix que routes/state.ts (PUT /api/state) — le JSON du workspace n'est
    // pas typé côté Prisma au-delà de `Json`, pas de valeur à modéliser un type plus précis ici.
    data: { data: { ...data, team: [...team, member] } as object, version: { increment: 1 } },
  })
}

// Phase 2.5 (roadmap v1), verrouillage Stakeholder — un Stakeholder invité n'a plus de fiche
// Équipe (createLinkedTeamMember ci-dessus, réservée aux rôles internes PO/SM/Dev) : il devient un
// Contact (déjà un sous-objet de Client, voir components/clients/ClientModal.tsx) sur le Client
// choisi par l'Admin à l'invitation (voir routes/invitations.ts). `linkedUserId` sur le Contact
// suit le même principe que sur TeamMember : lie ce contact au compte qui vient d'être créé.
// Best-effort comme ci-dessus : si le Client référencé a été supprimé entre la génération du lien
// et son acceptation, on n'échoue pas la création du compte — le contact pourra être ajouté
// manuellement ensuite depuis la fiche Client par un Admin/PO.
export async function createLinkedClientContact(prisma: PrismaClient, clientId: string, userId: string, name: string, email: string) {
  const state = await prisma.workspaceState.findUnique({ where: { id: SINGLETON_ID } })
  if (!state) return

  const data = state.data as Record<string, unknown>
  const clients = Array.isArray(data.clients) ? (data.clients as Record<string, unknown>[]) : []
  const clientIdx = clients.findIndex(c => c.id === clientId)
  if (clientIdx === -1) return

  const contact = {
    id: randomUUID(),
    name,
    role: '',
    email,
    linkedUserId: userId,
  }
  const client = clients[clientIdx]
  const existingContacts = Array.isArray(client.contacts) ? (client.contacts as Record<string, unknown>[]) : []
  const newClients = clients.map((c, i) => i === clientIdx ? { ...c, contacts: [...existingContacts, contact] } : c)

  await prisma.workspaceState.update({
    where: { id: SINGLETON_ID },
    data: { data: { ...data, clients: newClients } as object, version: { increment: 1 } },
  })
}
