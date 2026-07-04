const { test, expect } = require('@playwright/test');
const { goTo, BASE_URL } = require('./helpers');

test.describe('Equipe (Team)', () => {

  test('affiche la page avec les membres et les sections', async ({ page }) => {
    await goTo(page, '/team');
    await expect(page.locator('.page-content')).toBeVisible();
    await expect(page.locator('text=Absences planifiées')).toBeVisible();
    await expect(page.locator('text=Jours fériés')).toBeVisible();
  });

  test('affiche les membres du DEMO_STATE', async ({ page }) => {
    await goTo(page, '/team');
    await expect(page.locator('text=Aldo Raines')).toBeVisible();
    await expect(page.locator('[data-testid="member-card"]').first()).toBeVisible();
  });

  test('ouvre la modale Nouveau membre', async ({ page }) => {
    await goTo(page, '/team');
    await page.click('button:has-text("+ Membre")');
    await expect(page.locator('.modal-title:has-text("Nouveau membre")')).toBeVisible();
    await expect(page.locator('input[placeholder="Prénom Nom"]')).toBeVisible();
  });

  test('crée un nouveau membre', async ({ page }) => {
    await goTo(page, '/team');
    await page.click('button:has-text("+ Membre")');
    await page.fill('input[placeholder="Prénom Nom"]', 'Alice Durand');
    await page.click('button:has-text("Créer")');
    await expect(page.locator('.modal-title')).not.toBeVisible();
    await expect(page.locator('text=Alice Durand')).toBeVisible();
  });

  test('modifie un membre existant', async ({ page }) => {
    await goTo(page, '/team');
    // Utilise le premier membre demo (Aldo Raines)
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('button[title="Modifier"]').click();
    await expect(page.locator('.modal-title:has-text("Modifier le membre")')).toBeVisible();
    await page.locator('input[placeholder="Prénom Nom"]').fill('Aldo Raines V2');
    await page.click('button:has-text("Enregistrer")');
    await expect(page.locator('text=Aldo Raines V2')).toBeVisible();
  });

  test('supprime un membre créé', async ({ page }) => {
    await goTo(page, '/team');
    await page.click('button:has-text("+ Membre")');
    await page.fill('input[placeholder="Prénom Nom"]', 'Charlie Temp');
    await page.click('button:has-text("Créer")');
    await expect(page.locator('text=Charlie Temp')).toBeVisible();
    page.on('dialog', d => d.accept());
    const card = page.locator('[data-testid="member-card"]').filter({ hasText: 'Charlie Temp' });
    await card.locator('button[title="Supprimer"]').click();
    await expect(page.locator('text=Charlie Temp')).not.toBeVisible();
  });

  test('ferme la modale avec Annuler', async ({ page }) => {
    await goTo(page, '/team');
    await page.click('button:has-text("+ Membre")');
    await expect(page.locator('.modal-title:has-text("Nouveau membre")')).toBeVisible();
    await page.click('button:has-text("Annuler")');
    await expect(page.locator('.modal-title')).not.toBeVisible();
  });

  test('ouvre la modale Ajouter une absence', async ({ page }) => {
    await goTo(page, '/team');
    await page.click('button:has-text("+ Absence")');
    await expect(page.locator('.modal-title').filter({ hasText: 'Ajouter une absence' })).toBeVisible();
  });

  test('crée une absence et l\'affiche dans le tableau', async ({ page }) => {
    await goTo(page, '/team');
    await page.click('button:has-text("+ Absence")');
    await expect(page.locator('.modal-title').filter({ hasText: 'Ajouter une absence' })).toBeVisible();
    await page.fill('input[placeholder="Congés été…"]', 'Vacances juillet');
    await page.locator('input[type="date"]').first().fill('2025-07-01');
    await page.locator('input[type="date"]').nth(1).fill('2025-07-15');
    await page.locator('.modal-footer .btn-primary').click();
    await expect(page.locator('.modal-title')).not.toBeVisible();
    await expect(page.locator('text=Vacances juillet')).toBeVisible();
  });

  test('affiche les jours fériés de l\'année', async ({ page }) => {
    await goTo(page, '/team');
    await expect(page.locator('text=Jour de l\'An')).toBeVisible();
  });

});
