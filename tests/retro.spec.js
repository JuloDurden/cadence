const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Rétrospective', () => {

  test('affiche les colonnes de rétrospective', async ({ page }) => {
    await goTo(page, '/retro');
    await expect(page.locator('.page-content')).toBeVisible();
  });

});
