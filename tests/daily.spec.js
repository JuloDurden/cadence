const { test, expect } = require('@playwright/test');
const { goTo, BASE_URL } = require('./helpers');

test.describe('Daily Standup', () => {

  test('affiche le sélecteur de durée et le timer mm:ss', async ({ page }) => {
    await goTo(page, '/daily');
    await expect(page.locator('.page-content')).toBeVisible();
    // Sélecteur de durée (5 / 10 / 15 / 20 / 30 min)
    await expect(page.locator('select.hdr-select')).toBeVisible();
    // Affichage mm:ss
    await expect(page.getByText(/^\d{2}:\d{2}$/).first()).toBeVisible();
  });

  test('affiche les boutons de contrôle du timer et les actions', async ({ page }) => {
    await goTo(page, '/daily');
    // Barre de progression timer
    await expect(page.locator('.timer-bar-wrap')).toBeVisible();
    // Bouton play/pause (title Démarrer au départ)
    await expect(page.locator('button[title="Démarrer"]')).toBeVisible();
    // Bouton réinitialiser
    await expect(page.locator('button[title="Réinitialiser"]')).toBeVisible();
    // Bouton copier résumé
    await expect(page.locator('button[title="Copier le résumé du jour"]')).toBeVisible();
    // Bouton archiver (archive + vide les saisies en une seule action atomique,
    // ancien bouton "Effacer" séparé supprimé/fusionné — voir commit 7fc628e)
    await expect(page.locator('button[title="Archiver ce daily (et vider les saisies du jour)"]')).toBeVisible();
  });

  test('affiche les cartes des membres du DEMO_STATE', async ({ page }) => {
    await goTo(page, '/daily');
    await expect(page.locator('[data-testid="daily-member-card"]').first()).toBeVisible();
    await expect(page.locator('text=Aldo Raines')).toBeVisible();
  });

  test('la section Aujourd\'hui est collapsible', async ({ page }) => {
    await goTo(page, '/daily');
    // Section ouverte par défaut — les cartes sont visibles
    await expect(page.locator('[data-testid="daily-member-card"]').first()).toBeVisible();
    // Cliquer sur le bouton de section pour fermer
    await page.locator('.daily-section-btn').first().click();
    await expect(page.locator('[data-testid="daily-member-card"]').first()).not.toBeVisible();
    // Rouvrir
    await page.locator('.daily-section-btn').first().click();
    await expect(page.locator('[data-testid="daily-member-card"]').first()).toBeVisible();
  });

  test('affiche la section Archives (vide par défaut)', async ({ page }) => {
    await goTo(page, '/daily');
    // La section Archives doit être visible
    await expect(page.locator('.daily-section-btn').filter({ hasText: 'Archives' })).toBeVisible();
    // Message vide
    await expect(page.locator('text=Aucune archive')).toBeVisible();
  });

  test('peut saisir une entrée daily pour un membre', async ({ page }) => {
    await goTo(page, '/daily');
    const card = page.locator('[data-testid="daily-member-card"]').filter({ hasText: 'Aldo Raines' });
    await card.locator('textarea').first().fill('Travail sur la feature X');
    await expect(card.locator('textarea').first()).toHaveValue('Travail sur la feature X');
  });

  test('les labels Hier/Aujourd\'hui/Blocages s\'affichent sur les cartes', async ({ page }) => {
    await goTo(page, '/daily');
    const card = page.locator('[data-testid="daily-member-card"]').first();
    await expect(card.getByText('Hier', { exact: true })).toBeVisible();
    await expect(card.getByText("Aujourd'hui", { exact: true })).toBeVisible();
    await expect(card.getByText('Blocages', { exact: true })).toBeVisible();
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
    await expect(page.locator("text=Absents aujourd'hui")).toBeVisible();
    // Aldo Raines ne doit pas avoir de carte membre (absent)
    await expect(
      page.locator('[data-testid="daily-member-card"]').filter({ hasText: 'Aldo Raines' })
    ).not.toBeVisible();
  });

});
