const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Equipe (Team)', () => {

  test('affiche les membres de equipe', async ({ page }) => {
    await goTo(page, '/team');
    await expect(page.locator('.page-content')).toBeVisible();
  });

});
