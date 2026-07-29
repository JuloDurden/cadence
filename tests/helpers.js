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
 */
async function goTo(page, route = '/backlog') {
  // Intercepter les appels API pour eviter les erreurs reseau
  await page.route('**/api/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) })
  );

  // Charger la page login pour avoir acces au localStorage du bon domaine
  await page.goto(BASE_URL + '/login');
  await page.waitForLoadState('domcontentloaded');

  // Injecter le token d'auth (bypass ProtectedRoute)
  await page.evaluate(() => localStorage.setItem('cadence_token', 'test-token-e2e'));

  // Naviguer vers la route cible
  await page.goto(BASE_URL + route);
  await page.waitForLoadState('networkidle');
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
  BASE_URL, goTo,
  setBacklogSortBy, setBacklogGroupBy, setBacklogFilter, toggleBacklogReadyFilter,
};
