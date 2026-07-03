const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Réglages', () => {

  test('affiche les onglets de configuration', async ({ page }) => {
    await goTo(page, '/settings');
    await expect(page.locator('.page-content')).toBeVisible();
  });

});
