const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Clients', () => {

  test('liste les clients du DEMO_STATE', async ({ page }) => {
    await goTo(page, '/clients');
    await expect(page.locator('.page-content')).toBeVisible();
    // FAXFA est un client dans DEMO_STATE
    await expect(page.locator('.page-content')).toContainText('FAXFA');
  });

  test('ouvre la modal Nouveau client', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="btn-add-menu"]').click();
    await page.locator('[data-testid="menu-new-client"]').click();
    await expect(page.getByRole('heading', { name: 'Nouveau client' })).toBeVisible();
  });

  test('la modal client contient la case Exclure du critère Importance client', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="btn-add-menu"]').click();
    await page.locator('[data-testid="menu-new-client"]').click();
    await expect(page.getByText('Exclure du critère "Importance client" (Auto-planning)')).toBeVisible();
    // La case est décochée par défaut
    const checkbox = page.locator('input[type="checkbox"]').last();
    await expect(checkbox).not.toBeChecked();
  });

  test('la case Exclure est disponible en modification d\'un client existant', async ({ page }) => {
    await goTo(page, '/clients');
    // Ouvrir le premier client via le bouton modifier (panel droit uniquement)
    await page.locator('[data-testid^="client-card-"] button[title="Modifier"]').first().click();
    await expect(page.getByText('Exclure du critère "Importance client" (Auto-planning)')).toBeVisible();
  });

});
