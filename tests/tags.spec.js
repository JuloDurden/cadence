const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Tags (Backlog)', () => {

  test('le backlog affiche la colonne Tags', async ({ page }) => {
    await goTo(page, '/backlog');
    await expect(page.locator('[data-testid="backlog-table"] th:has-text("Tags")')).toBeVisible();
  });

});
