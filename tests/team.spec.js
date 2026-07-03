const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Équipe (Team)', () => {

  test('affiche les membres de l'équipe', async ({ page }) => {
    await goTo(page, '/team');
    await expect(page.locator('.page-content')).toBeVisible();
  });

});
