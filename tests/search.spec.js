const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Recherche globale (Ctrl+K)', () => {

  test('Ctrl+K ouvre la modale de recherche', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.keyboard.press('Control+k');
    await expect(page.locator('.search-modal, [class*="search"]').first()).toBeVisible();
  });

});
