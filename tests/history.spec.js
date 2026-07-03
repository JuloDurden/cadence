const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Historique', () => {

  test('affiche la page historique sans erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/historique');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
    await expect(page.locator('.page-content')).toBeVisible();
  });

});
