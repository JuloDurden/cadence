import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import demoStateData from '../prisma/demo-seed-data.json'

const prisma = new PrismaClient()

// Démo publique v1 (2026-09-09) : script séparé de seed.ts (qui reste dédié à l'instance réelle
// de Julien), à lancer une seule fois sur le déploiement de démo dédié (base Postgres séparée sur
// Railway, voir docs/roadmap-v1.md, "Phase 8 - Démo publique") - jamais sur la base réelle.
// `npx tsx src/seedDemo.ts` (ou `npm run db:seed:demo`, voir package.json).

// Même id fixe que le singleton lu/écrit par GET/PUT /api/state (routes/state.ts,
// SINGLETON_ID) - ce script doit écrire exactement la même ligne, sinon le compte démo se
// connecterait à un état vide (404 sur GET /api/state) au lieu du jeu de données préparé.
const WORKSPACE_STATE_SINGLETON_ID = 'workspace-state-singleton'

// Identifiants du compte démo, donnés tels quels aux recruteurs (pas un secret à protéger -
// l'accès qu'il donne est déjà volontairement limité, voir middleware/auth.ts `forbidDemo`).
// Changeable ici avant le premier lancement de ce script si Julien préfère d'autres identifiants.
const DEMO_EMAIL = 'demo@cadence.app'
const DEMO_PASSWORD = 'CadenceDemo2026'

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  // Admin avec blocages ciblés (décision Julien, 2026-09-09) : le compte démo reste ADMIN pour
  // montrer toute l'étendue de l'outil - seul `isDemo: true` le distingue, et c'est ce flag seul
  // que `forbidDemo` (middleware/auth.ts) et le masquage du bouton Compagnon IA (Header.tsx)
  // vérifient. `onboardingSeenAt` posé dès la création pour qu'un recruiter ne voie jamais le
  // panneau "Guide de démarrage" pensé pour un tout nouveau compte.
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { isDemo: true, role: 'ADMIN' },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      name: 'Compte Démo',
      role: 'ADMIN',
      isDemo: true,
      onboardingSeenAt: new Date(),
    },
  })

  // Jeu de données de démo (backlog, sprints, équipe, clients, vision produit "AutoClaimsTech" -
  // même contenu fictif déjà utilisé comme état affiché avant chargement serveur, voir
  // frontend/src/data/demo.ts, DEMO_STATE). Recopié en JSON ici plutôt qu'importé directement du
  // frontend : ce backend est déployé seul sur Railway, sans accès au dossier frontend/ à
  // l'exécution - copie volontaire, à resynchroniser manuellement si DEMO_STATE évolue côté
  // frontend et que Julien veut la même évolution ici.
  await prisma.workspaceState.upsert({
    where: { id: WORKSPACE_STATE_SINGLETON_ID },
    update: { data: demoStateData, version: 1 },
    create: { id: WORKSPACE_STATE_SINGLETON_ID, data: demoStateData, version: 1 },
  })

  console.log(`Seed démo OK - ${DEMO_EMAIL} / ${DEMO_PASSWORD} (utilisateur ${user.id})`)
}

main().finally(() => prisma.$disconnect())
