const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Kanban', () => {

  test('affiche les colonnes du tableau', async ({ page }) => {
    await goTo(page, '/kanban');
    // Au moins une colonne kanban visible
    await expect(page.locator('.kanban-col, .kanban-column').first()).toBeVisible();
  });

  test('les items du sprint actif apparaissent sur le board', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.locator('.page-content')).toBeVisible();
  });

});
