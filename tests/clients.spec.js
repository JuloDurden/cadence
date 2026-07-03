const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Clients', () => {

  test('liste les clients du DEMO_STATE', async ({ page }) => {
    await goTo(page, '/clients');
    await expect(page.locator('.page-content')).toBeVisible();
    // FAXFA est un client dans DEMO_STATE
    await expect(page.locator('.page-content')).toContainText('FAXFA');
  });

});
