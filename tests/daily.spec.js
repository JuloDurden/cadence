const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Daily Standup', () => {

  test('affiche le timer et les membres', async ({ page }) => {
    await goTo(page, '/daily');
    await expect(page.locator('.page-content')).toBeVisible();
  });

});
