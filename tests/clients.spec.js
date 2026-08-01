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

  // 2026-08-01, retour Julien : le champ Contact.phone existait déjà dans le type mais n'était
  // affiché nulle part — ajouté ici en même temps que le champ "poste" du formulaire d'invitation
  // Stakeholder (voir tests/signup-invite.spec.js), qui remplit Contact.role.
  test('un numéro de téléphone peut être ajouté à un contact et persiste après réouverture', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid^="client-card-"] button[title="Modifier"]').first().click();
    await page.getByRole('button', { name: '+ Contact' }).click();
    await page.locator('input[placeholder="Nom"]').last().fill('Alex Contact');
    await page.locator('input[placeholder="Rôle"]').last().fill('Directrice IT');
    await page.locator('input[placeholder="Email"]').last().fill('alex@client.com');
    await page.locator('input[placeholder="Téléphone"]').last().fill('0612345678');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await page.locator('[data-testid^="client-card-"] button[title="Modifier"]').first().click();
    await expect(page.locator('input[placeholder="Téléphone"]').last()).toHaveValue('0612345678');
  });

});
