// Phase 7 (roadmap v1), Polish final - PWA (sous-chantier 5/5, 2026-08-23) : le manifeste et le
// service worker (vite.config.ts, plugin VitePWA) ne sont générés qu'au build de production
// (même principe que la CSP, `apply: 'build'`) - non testables ici, les tests E2E tournent contre
// le serveur de dev (`vite dev`, voir playwright.config.js). Seul le bandeau hors connexion
// (OfflineBanner.tsx, hooks/useOnlineStatus.ts) est un composant React ordinaire, indépendant du
// build : `navigator.onLine`/les événements 'online'/'offline' fonctionnent pareil en dev, donc
// testable ici. Manifeste/service worker/icônes à vérifier manuellement par Julien après un vrai
// `npm run build` + `vite preview` local (voir docs/corrections.md).
const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Phase 7 - PWA : bandeau hors connexion', () => {

  test('le bandeau apparaît hors connexion et disparaît au retour du réseau', async ({ page, context }) => {
    await goTo(page, '/backlog');
    const banner = page.locator('[data-testid="offline-banner"]');
    await expect(banner).not.toBeVisible();

    await context.setOffline(true);
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Hors connexion');

    await context.setOffline(false);
    await expect(banner).not.toBeVisible();
  });

  test('le bandeau hors connexion reste visible en changeant de page', async ({ page, context }) => {
    await goTo(page, '/backlog');
    await context.setOffline(true);
    const banner = page.locator('[data-testid="offline-banner"]');
    await expect(banner).toBeVisible();

    await page.getByRole('link', { name: 'Kanban' }).click();
    await expect(banner).toBeVisible();

    await context.setOffline(false);
  });
});
