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

module.exports = { BASE_URL, goTo };
