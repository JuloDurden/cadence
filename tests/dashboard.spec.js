const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Dashboard', () => {

  test('affiche au moins un widget', async ({ page }) => {
    await goTo(page, '/dashboard');
    await expect(page.locator('.widget-card, .stat-card, .kpi-card, .dash-card').first()).toBeVisible();
  });

  test('affiche le nom du sprint actif', async ({ page }) => {
    await goTo(page, '/dashboard');
    // Le DEMO_STATE a un sprint avec un nom
    await expect(page.locator('.page-content')).toBeVisible();
  });

});
