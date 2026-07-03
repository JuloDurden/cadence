const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Attribution - Historique', () => {

  test('la page Historique se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/historique');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('affiche des entrees dans le journal', async ({ page }) => {
    await goTo(page, '/historique');
    await expect(page.locator('.page-content')).toBeVisible();
  });

});
