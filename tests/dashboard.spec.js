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
