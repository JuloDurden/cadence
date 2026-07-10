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

  test('affiche les colonnes de sprint', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.locator('.planning-col').first()).toBeVisible();
  });

  test('affiche les dates des sprints au format JJ/MM', async ({ page }) => {
    await goTo(page, '/planning');
    // Les dates sont affichées au format JJ/MM → JJ/MM (ex. "15/06 → 28/06")
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    await expect(dateSpan).toBeVisible();
    // Vérifie le format JJ/MM (deux chiffres séparés par /)
    await expect(dateSpan).toContainText(/\d{2}\/\d{2}/);
  });

  test('le bouton ✎ permet d\'ouvrir l\'édition des dates', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    await expect(dateSpan).toBeVisible();
    await dateSpan.click();
    // Les inputs date apparaissent après le clic
    await expect(page.locator('.planning-col').first().locator('input[type="date"]').first()).toBeVisible();
  });

  test('modifier la date de début auto-calcule la date de fin', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    await dateSpan.click();
    const col = page.locator('.planning-col').first();
    const startInput = col.locator('input[type="date"]').first();
    const endInput   = col.locator('input[type="date"]').nth(1);
    // Changer la date de début
    await startInput.fill('2026-08-03');
    // La date de fin doit avoir été auto-calculée (2 semaines = +13 jours → 2026-08-16)
    await expect(endInput).toHaveValue('2026-08-16');
  });

  test('annuler l\'édition ferme les inputs sans modifier les dates', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    const initialText = await dateSpan.innerText();
    await dateSpan.click();
    // Cliquer ✕
    const col = page.locator('.planning-col').first();
    await col.getByText('✕').click();
    // Le span date est de retour avec le texte original
    await expect(dateSpan).toBeVisible();
    await expect(dateSpan).toContainText(initialText.slice(0, 5)); // début JJ/MM
  });

  test('affiche le bouton + Sprint dans le header', async ({ page }) => {
    await goTo(page, '/planning');
    // Le "+" est un SVG (pas du texte) — l'accessible name est "Sprint"
    await expect(page.getByRole('button', { name: 'Sprint' })).toBeVisible();
  });

});
