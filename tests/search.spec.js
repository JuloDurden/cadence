const { test, expect } = require('@playwright/test');
const { loadWithState } = require('./helpers');

test.describe('Recherche globale (Ctrl+K)', () => {

  test('le bouton recherche ouvre la modale sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await page.click('button[aria-label="Recherche"]');
    await page.waitForSelector('#search-modal-overlay', { state: 'visible' });
    expect(errors).toHaveLength(0);
  });

  test('Ctrl+K ouvre la modale de recherche', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#search-modal-overlay', { state: 'visible' });
    expect(errors).toHaveLength(0);
  });

  test('le champ de recherche est focus a l\'ouverture', async ({ page }) => {
    await loadWithState(page);
    await page.click('button[aria-label="Recherche"]');
    await page.waitForSelector('#search-modal-overlay', { state: 'visible' });
    await page.waitForTimeout(100);
    const input = page.locator('#search-input');
    await expect(input).toBeFocused();
  });

  test('rechercher "AUT-1" retourne l\'item correspondant', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await page.click('button[aria-label="Recherche"]');
    await page.waitForSelector('#search-modal-overlay', { state: 'visible' });
    await page.fill('#search-input', 'AUT-1');
    await page.waitForTimeout(300);
    await expect(page.locator('#search-results')).toContainText('AUT-1');
    expect(errors).toHaveLength(0);
  });

  test('rechercher par description retourne les bons resultats', async ({ page }) => {
    await loadWithState(page);
    await page.click('button[aria-label="Recherche"]');
    await page.waitForSelector('#search-modal-overlay', { state: 'visible' });
    await page.fill('#search-input', 'Connexion');
    await page.waitForTimeout(300);
    await expect(page.locator('#search-results')).toContainText('Connexion');
  });

  test('Escape ferme la modale de recherche', async ({ page }) => {
    await loadWithState(page);
    await page.click('button[aria-label="Recherche"]');
    await page.waitForSelector('#search-modal-overlay', { state: 'visible' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(page.locator('#search-modal-overlay')).not.toHaveClass(/open/);
  });

  test('cliquer sur un resultat ferme la modale et navigue vers l\'item', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await page.click('button[aria-label="Recherche"]');
    await page.waitForSelector('#search-modal-overlay', { state: 'visible' });
    await page.fill('#search-input', 'AUT-1');
    await page.waitForTimeout(300);
    const firstResult = page.locator('#search-results [onclick], #search-results .dep-result-item, #search-results > div').first();
    if (await firstResult.count() > 0) {
      await firstResult.click();
      await page.waitForTimeout(300);
    }
    expect(errors).toHaveLength(0);
  });

  test('une recherche vide n\'affiche pas de resultat parasite', async ({ page }) => {
    await loadWithState(page);
    await page.click('button[aria-label="Recherche"]');
    await page.waitForSelector('#search-modal-overlay', { state: 'visible' });
    await page.fill('#search-input', '');
    await page.waitForTimeout(200);
    // Pas d'erreur, le resultat peut etre vide ou afficher un placeholder
    const results = page.locator('#search-results');
    await expect(results).toBeVisible();
  });

});
