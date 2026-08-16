/**
 * Helpers E2E pour la version React (Vite + React Router).
 *
 * Strategie :
 *  1. Injecter cadence_token dans localStorage pour bypasser la ProtectedRoute
 *  2. Mocker /api/** pour eviter les erreurs reseau (l'app demarre sur DEMO_STATE)
 *  3. Naviguer vers la route React cible
 */

const BASE_URL = 'http://localhost:4321';

/**
 * Charge une route React avec auth injectee.
 * @param {import('@playwright/test').Page} page
 * @param {string} route  ex: '/backlog', '/kanban', '/'
 * @param {{ role?: string, name?: string, userId?: string, onboardingSeenAt?: string|null, onboardingCompletedItems?: string[] }} [opts]
 *   Phase 2 (roadmap v1) — simule un compte connecte avec un role/nom/id donnes
 *   (cadence_user_role/cadence_user/cadence_user_id, lus par useAuth.ts). Sans ces options, le
 *   comportement est identique a avant (valeurs vides, comme au login normal sans injection) — a
 *   utiliser uniquement pour les tests qui en dependent. `userId` ajoute au sous-chantier 5
 *   (interactions nominatives) : necessaire pour tester l'attribution reelle des notes d'item
 *   (Note.authorId = currentUserId). `onboardingSeenAt`/`onboardingCompletedItems` ajoutes en
 *   Phase 2.5, Onboarding, points 2-4 (v0.95) : reponse mockee de GET /api/onboarding. Par defaut
 *   "deja vu" (compte existant, comme la tres grande majorite des tests qui n'ont rien a voir avec
 *   l'Onboarding) — passer `onboardingSeenAt: null` pour simuler un compte reellement neuf, voir
 *   tests/onboarding.spec.js.
 */
async function goTo(page, route = '/backlog', opts = {}) {
  // Intercepter les appels API pour eviter les erreurs reseau
  await page.route('**/api/**', r => {
    // Cas particulier de `/api/onboarding` : sans lui, le mock générique `{ data: null }`
    // ci-dessous ferait lire `onboardingSeenAt` comme `undefined`, donc "compte neuf", et
    // ouvrirait automatiquement le panneau "Guide de démarrage" (position fixe, recouvre le bord
    // droit de l'écran) sur TOUS les tests qui passent par ce helper, sans lien avec ce qu'ils
    // testent.
    if (r.request().url().includes('/api/onboarding')) {
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          onboardingSeenAt: opts.onboardingSeenAt !== undefined ? opts.onboardingSeenAt : '2026-01-01T00:00:00.000Z',
          onboardingCompletedItems: opts.onboardingCompletedItems ?? [],
        }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) });
  });

  // Charger la page login pour avoir acces au localStorage du bon domaine
  await page.goto(BASE_URL + '/login');
  await page.waitForLoadState('domcontentloaded');

  // Injecter le token d'auth (bypass ProtectedRoute)
  await page.evaluate(({ role, name, userId }) => {
    localStorage.setItem('cadence_token', 'test-token-e2e');
    if (role) localStorage.setItem('cadence_user_role', role);
    if (name) localStorage.setItem('cadence_user', name);
    if (userId) localStorage.setItem('cadence_user_id', userId);
  }, opts);

  // Naviguer vers la route cible
  await page.goto(BASE_URL + route);
  await page.waitForLoadState('networkidle');
}

/**
 * Clique sur un onglet des Réglages (voir SettingsPage.tsx, Phase 6bis sous-chantier 1). Les
 * sections Utilisateurs/Invitations (`team`), Mode présentation/pages présentables (`advanced`),
 * Jetons API (`security`), GitHub/Slack/Jira/IA (`integrations`) ne sont montées dans le DOM que
 * lorsque leur onglet est actif : tout test qui les cible directement doit d'abord ouvrir le bon
 * onglet. À rappeler après tout `page.reload()` : le tab actif est un simple `useState`, remis à
 * "general" par défaut à chaque montage du composant.
 * @param {import('@playwright/test').Page} page
 * @param {'general'|'team'|'integrations'|'security'|'import-export'|'advanced'} id
 */
async function openSettingsTab(page, id) {
  await page.locator(`[data-testid="settings-tab-${id}"]`).click();
}

/**
 * Helpers pour le header du Backlog (Trier/Filtrer/Grouper, "unibody" — retour Julien,
 * 2026-07-29) : 3 boutons à dropdown remplacent les anciens <select> individuels du bloc de
 * filtres. Centralisés ici plutôt que dupliqués dans chaque spec, pour qu'un futur changement
 * d'UI n'ait qu'un seul endroit à corriger.
 */

/** Sélectionne un mode de tri (data-testid="sort-by-option-<value>", "none" pour "Aucun tri"). */
async function setBacklogSortBy(page, value) {
  await page.locator('[data-testid="btn-sort-by"]').click();
  await page.locator(`[data-testid="sort-by-option-${value || 'none'}"]`).click();
}

/** Sélectionne un mode de regroupement (data-testid="group-by-option-<value>"). */
async function setBacklogGroupBy(page, value) {
  await page.locator('[data-testid="btn-group-by"]').click();
  await page.locator(`[data-testid="group-by-option-${value}"]`).click();
}

/** Ouvre le dropdown "Filtrer" et choisit une valeur pour un axe (client/sprint/epic/
 *  initiative/tag/status), via son <select> data-testid="filter-<axis>" dédié. Le panel reste
 *  ouvert après (les 6 axes se combinent, contrairement à Trier/Grouper). */
async function setBacklogFilter(page, axis, value) {
  await page.locator('[data-testid="btn-filter"]').click();
  await page.locator(`[data-testid="filter-${axis}"]`).selectOption(value);
}

/** Coche/décoche le filtre "Prêt" (DoR complète), dans le dropdown "Filtrer". */
async function toggleBacklogReadyFilter(page) {
  await page.locator('[data-testid="btn-filter"]').click();
  await page.locator('[data-testid="filter-ready"]').click();
}

module.exports = {
  BASE_URL, goTo, openSettingsTab,
  setBacklogSortBy, setBacklogGroupBy, setBacklogFilter, toggleBacklogReadyFilter,
};
