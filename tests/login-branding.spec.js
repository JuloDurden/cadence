// Refonte de l'écran de connexion (Phase 6bis, roadmap v1, 2026-08-17) : maquette validée avec
// Julien avant tout code (concept "plein écran épuré"). L'avatar affiche le logo d'équipe
// (Réglages > Apparence) s'il existe, sinon un repli sur le logo Cadence (CadenceMark, en blanc).
// Quand un logo d'équipe est chargé, la marque Cadence apparaît en plus, en petit, à côté du nom
// (décision Julien : la marque de l'outil ne doit jamais disparaître complètement).
// GET /api/public/branding est la seule route que LoginPage.tsx interroge avant authentification
// (voir App.tsx : cette page est rendue hors StateProvider/ProtectedRoute).
const { test, expect } = require('@playwright/test');
const { BASE_URL } = require('./helpers');

async function gotoLogin(page, logoDataUrl) {
  // Mock générique enregistré en premier, le mock spécifique à /api/public/branding ci-dessous
  // (enregistré en dernier) prend le dessus, même convention que le reste des specs (voir
  // tests/users-roles.spec.js).
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) }));
  await page.route('**/api/public/branding', r => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ logoDataUrl }),
  }));
  await page.goto(BASE_URL + '/login');
  await page.waitForLoadState('networkidle');
}

test.describe('Écran de connexion : logo (refonte 2026-08-17)', () => {

  test('sans logo d\'équipe, l\'avatar affiche le repli logo Cadence, sans marque additionnelle', async ({ page }) => {
    await gotoLogin(page, null);
    await expect(page.locator('[data-testid="login-avatar-mark"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-avatar-logo"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="login-brand-mark"]')).toHaveCount(0);
  });

  test('avec un logo d\'équipe, l\'avatar l\'affiche et la marque Cadence apparaît en plus à côté du nom', async ({ page }) => {
    await gotoLogin(page, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
    await expect(page.locator('[data-testid="login-avatar-logo"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-avatar-mark"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="login-brand-mark"]')).toBeVisible();
  });

  test('les formulaires Se connecter / Créer un compte restent fonctionnels avec le nouvel habillage', async ({ page }) => {
    await gotoLogin(page, null);
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    await page.locator('[data-testid="tab-signup"]').click();
    await expect(page.locator('[data-testid="signup-form"]')).toBeVisible();
    await page.locator('[data-testid="tab-login"]').click();
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

});
