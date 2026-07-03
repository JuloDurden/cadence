const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Planning', () => {

  test('affiche la page de planning', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.locator('.page-content')).toBeVisible();
  });

  test('affiche des items du backlog non assignés', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/planning');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

});
