const { test, expect } = require('@playwright/test');
const { goTo, BASE_URL } = require('./helpers');

test.describe('Daily Standup', () => {

  test('affiche la date du jour et le sélecteur de durée', async ({ page }) => {
    await goTo(page, '/daily');
    await expect(page.locator('.page-content')).toBeVisible();
    // Sélecteur de durée du timer (5 / 10 / 15 / 20 / 30 min)
    await expect(page.locator('select.hdr-select')).toBeVisible();
    // Affichage mm:ss du timer
    await expect(page.getByText(/^\d{2}:\d{2}$/).first()).toBeVisible();
  });

  test('affiche les cartes des membres du DEMO_STATE', async ({ page }) => {
    await goTo(page, '/daily');
    await expect(page.locator('[data-testid="daily-member-card"]').first()).toBeVisible();
    await expect(page.locator('text=Aldo Raines')).toBeVisible();
  });

  test('peut saisir une entrée daily pour un membre', async ({ page }) => {
    await goTo(page, '/daily');
    // Trouve la carte Aldo Raines et saisit dans la première textarea (Hier)
    const card = page.locator('[data-testid="daily-member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('textarea').first().fill('Travail sur la feature X');
    await expect(card.locator('textarea').first()).toHaveValue('Travail sur la feature X');
  });

  test('les membres absents apparaissent dans l\'encadré et pas dans les cartes', async ({ page }) => {
    await goTo(page, '/team');
    const today = new Date().toISOString().slice(0, 10);
    // Crée une absence pour Aldo Raines couvrant aujourd'hui
    await page.click('button:has-text("+ Absence")');
    await page.fill('input[placeholder="Congés été…"]', 'Congé test');
    await page.locator('input[type="date"]').first().fill(today);
    await page.locator('input[type="date"]').nth(1).fill(today);
    await page.locator('.modal-footer .btn-primary').click();
    await expect(page.locator('text=Congé test').first()).toBeVisible();
    // Navigation React Router via sidebar (préserve le state)
    await page.click('a[href="/daily"]');
    await page.waitForURL('**/daily');
    // L'encadré absents doit être visible
    await expect(page.locator('text=Absents aujourd\'hui')).toBeVisible();
    // Aldo Raines ne doit pas avoir de carte membre (absent)
    await expect(
      page.locator('[data-testid="daily-member-card"]').filter({ hasText: 'Aldo Raines' })
    ).not.toBeVisible();
  });

});
