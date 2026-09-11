import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import demoStateData from '../../prisma/demo-seed-data.json'

// Démo publique v1, sous-chantier 3/5 (2026-09-09) : réinitialisation automatique (fin de session,
// décision Julien "1h ou 2h") + bouton manuel (routes/demo.ts). Séparé de seedDemo.ts (script à
// lancer une seule fois, à la main, pour la création initiale) - ce module est importé par le
// process backend qui tourne en continu.

// Même id fixe que GET/PUT /api/state (routes/state.ts, SINGLETON_ID) et que seedDemo.ts -
// écrire ailleurs laisserait le compte démo sur son état courant, reset ou pas.
const WORKSPACE_STATE_SINGLETON_ID = 'workspace-state-singleton'

// Mêmes identifiants que seedDemo.ts (à garder synchronisés si l'un des deux change un jour) : le
// reset remet aussi le mot de passe à sa valeur d'origine, au cas où un recruteur l'aurait changé
// depuis Réglages > Sécurité pendant sa session.
const DEMO_PASSWORD = 'CadenceDemo2026'

// "Une session de 1h ou 2h" (décision Julien, 2026-09-09) : 2h retenues, l'estimation la plus
// généreuse des deux - un recruteur qui teste l'outil sérieusement doit avoir le temps de tout
// parcourir sans se faire couper en cours de test.
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000

// Fréquence de vérification, pas la durée de session elle-même - 5 min de marge sur le moment réel
// du reset est négligeable face à une fenêtre de 2h, et évite d'interroger la base en continu.
const CHECK_INTERVAL_MS = 5 * 60 * 1000

/** Remet le compte démo et l'état du workspace à leur contenu de départ. Utilisée à la fois par
 *  le reset automatique de fin de session (ci-dessous) et par le bouton manuel (routes/demo.ts). */
export async function resetDemoWorkspace(prisma: PrismaClient): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  await prisma.workspaceState.upsert({
    where: { id: WORKSPACE_STATE_SINGLETON_ID },
    update: { data: demoStateData, version: 1 },
    create: { id: WORKSPACE_STATE_SINGLETON_ID, data: demoStateData, version: 1 },
  })
  // `updateMany` plutôt que cibler un id précis : réparation "au cas où" mentionnée dans la
  // décision Julien (reset du compte démo lui-même, pas seulement des données) - couvre aussi bien
  // un mot de passe changé qu'un rôle rétrogradé depuis Réglages > Utilisateurs par erreur. En
  // pratique un seul compte a `isDemo: true` (seedDemo.ts n'en crée qu'un), mais `updateMany`
  // reste correct même si Julien en crée un second un jour. `onboardingSeenAt: null` pour que le
  // prochain recruteur revoie le "Guide de démarrage" comme un tout nouveau compte (décision
  // Julien, 2026-09-11 : chaque recruteur doit absolument le voir). `lastLoginAt: new Date()`
  // plutôt que `null` : voir le commentaire dans checkAndResetIfSessionExpired ci-dessous.
  await prisma.user.updateMany({
    where: { isDemo: true },
    data: { passwordHash, role: 'ADMIN', lastLoginAt: new Date(), onboardingSeenAt: null },
  })
}

async function checkAndResetIfSessionExpired(prisma: PrismaClient): Promise<void> {
  const demoUser = await prisma.user.findFirst({ where: { isDemo: true } })
  // Pas de compte démo (déploiement réel de Julien, ou démo pas encore seedée) : rien à faire -
  // c'est cette condition, pas une variable d'environnement, qui garantit qu'aucune donnée réelle
  // n'est jamais touchée par ce job (voir index.ts, où il est démarré sans condition). `lastLoginAt`
  // n'est nul que dans la fenêtre entre le tout premier seed (seedDemo.ts) et la toute première
  // connexion - après ça, il est toujours renseigné, soit par une connexion (routes/auth.ts), soit
  // par un reset (ci-dessus, `lastLoginAt: new Date()`), donc le minuteur ne peut plus rester
  // bloqué indéfiniment. Bug corrigé le 2026-09-11 : la version précédente remettait `lastLoginAt`
  // à `null` après chaque reset et attendait une nouvelle connexion pour repartir - un recruteur
  // qui continuait à utiliser un jeton déjà valide après un clic sur "Réinitialiser la démo", sans
  // repasser par l'écran de connexion, ne redéclenchait alors jamais le reset automatique suivant,
  // même après plusieurs jours d'inactivité.
  if (!demoUser?.lastLoginAt) return
  const elapsedMs = Date.now() - demoUser.lastLoginAt.getTime()
  if (elapsedMs >= SESSION_DURATION_MS) {
    await resetDemoWorkspace(prisma)
  }
}

/** À appeler une fois au démarrage du serveur (index.ts). Vérifie périodiquement si la session du
 *  compte démo a dépassé sa durée et, si oui, réinitialise. Ne fait jamais rien si aucun compte
 *  `isDemo` n'existe - sûr à démarrer inconditionnellement, y compris sur l'instance réelle de
 *  Julien qui n'en aura jamais. */
export function startDemoResetScheduler(prisma: PrismaClient): void {
  setInterval(() => {
    checkAndResetIfSessionExpired(prisma).catch(err => {
      console.error('Démo publique : échec de la vérification de réinitialisation automatique', err)
    })
  }, CHECK_INTERVAL_MS)
}
