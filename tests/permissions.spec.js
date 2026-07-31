// Phase 2 (roadmap v1), sous-chantier 3 : permissions fines par page. Un seul fichier, complété
// page par page (Daily, Rétrospective, Auto-planning/What-if, Backlog — voir docs/roadmap-v1.md
// pour la matrice complète). Convention actée avec Julien avant de commencer (2026-07-31) : le
// rôle Admin passe toujours, même quand une action est réservée à un autre rôle (voir
// `utils/permissions.ts`, `hasRole()`).
const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Phase 2 — permissions : Daily (archivage réservé Scrum Master)', () => {

  test('le Scrum Master voit les boutons d\'archivage', async ({ page }) => {
    await goTo(page, '/daily', { role: 'SCRUM_MASTER' });
    await expect(page.locator('[data-testid="btn-archive-daily"]')).toBeVisible();
  });

  test('Admin voit aussi les boutons d\'archivage (superuser)', async ({ page }) => {
    await goTo(page, '/daily', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="btn-archive-daily"]')).toBeVisible();
  });

  test('un Dev ne voit pas le bouton d\'archivage', async ({ page }) => {
    await goTo(page, '/daily', { role: 'DEV' });
    await expect(page.locator('[data-testid="btn-archive-daily"]')).toHaveCount(0);
  });

  test('un PO ne voit pas le bouton d\'archivage', async ({ page }) => {
    await goTo(page, '/daily', { role: 'PO' });
    await expect(page.locator('[data-testid="btn-archive-daily"]')).toHaveCount(0);
  });
});
