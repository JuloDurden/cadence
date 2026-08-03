const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Dashboard', () => {

  test('affiche les KPI StatCards', async ({ page }) => {
    await goTo(page, '/dashboard');
    await expect(page.getByText('US terminées')).toBeVisible();
    await expect(page.getByText('Sprint actuel')).toBeVisible();
  });

  test('affiche la section page-content', async ({ page }) => {
    await goTo(page, '/dashboard');
    await expect(page.locator('.page-content')).toBeVisible();
  });

});

// Chantier "Dashboard widgets" (roadmap v1, Phase 4, 2026-08-03) — placement libre sur grille façon
// iOS Springboard (voir DashboardWidgetGrid.tsx, data/dashboardWidgets.ts). Réglage de workspace
// (comme le reste de state.settings), personnalisable par Admin + PO uniquement.
test.describe('Dashboard — widgets configurables (Phase 4)', () => {

  const DEFAULT_WIDGET_IDS = [
    'kpi-done', 'kpi-velocity', 'kpi-current-sprint', 'kpi-blockers',
    'velocity-chart', 'burndown-chart', 'client-rag', 'recent-activity',
  ];

  test('les 8 widgets par défaut sont affichés, dans leur position d\'origine', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    for (const id of DEFAULT_WIDGET_IDS) {
      await expect(page.locator(`[data-testid="dashboard-widget-${id}"]`)).toBeVisible();
    }
  });

  test('un Admin et un PO voient le bouton "Personnaliser", un Dev ne le voit pas', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="dashboard-customize-toggle"]')).toBeVisible();

    await goTo(page, '/dashboard', { role: 'PO' });
    await expect(page.locator('[data-testid="dashboard-customize-toggle"]')).toBeVisible();

    await goTo(page, '/dashboard', { role: 'DEV' });
    await expect(page.locator('[data-testid="dashboard-customize-toggle"]')).toHaveCount(0);
  });

  test('le mode édition affiche les poignées, boutons de taille et de suppression', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await expect(page.locator('[data-testid="dashboard-widget-size-kpi-done"]')).toHaveCount(0);

    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await expect(page.locator('[data-testid="dashboard-widget-size-kpi-done"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-widget-remove-kpi-done"]')).toBeVisible();
  });

  test('changer la taille d\'un widget fait passer S -> M -> S', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    const sizeBtn = page.locator('[data-testid="dashboard-widget-size-kpi-done"]');
    await expect(sizeBtn).toHaveText('S');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('M');
    await sizeBtn.click();
    await expect(sizeBtn).toHaveText('S');
  });

  test('retirer un widget le fait disparaître et le remet disponible pour être rajouté', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();

    await page.locator('[data-testid="dashboard-widget-remove-kpi-blockers"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-kpi-blockers"]')).toHaveCount(0);

    await page.locator('[data-testid="dashboard-add-widget-toggle"]').click();
    await expect(page.locator('[data-testid="dashboard-add-widget-kpi-blockers"]')).toBeVisible();

    await page.locator('[data-testid="dashboard-add-widget-kpi-blockers"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-kpi-blockers"]')).toBeVisible();
  });

  test('sortir du mode édition masque les poignées et boutons', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-remove-kpi-done"]')).toBeVisible();

    await page.locator('[data-testid="dashboard-customize-toggle"]').click();
    await expect(page.locator('[data-testid="dashboard-widget-remove-kpi-done"]')).toHaveCount(0);
  });
});
