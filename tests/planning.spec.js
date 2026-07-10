const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Planning', () => {

  test('affiche la page de planning', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.locator('.page-content')).toBeVisible();
  });

  test('affiche des items du backlog non assignes', async ({ page }) => {
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
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    await expect(dateSpan).toBeVisible();
    await expect(dateSpan).toContainText(/\d{2}\/\d{2}/);
  });

  test('le bouton permet d ouvrir l edition des dates', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    await expect(dateSpan).toBeVisible();
    await dateSpan.click();
    await expect(page.locator('.planning-col').first().locator('input[type="date"]').first()).toBeVisible();
  });

  test('modifier la date de debut auto-calcule la date de fin', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    await dateSpan.click();
    const col = page.locator('.planning-col').first();
    const startInput = col.locator('input[type="date"]').first();
    const endInput   = col.locator('input[type="date"]').nth(1);
    await startInput.fill('2026-08-03');
    await expect(endInput).toHaveValue('2026-08-16');
  });

  test('annuler l edition ferme les inputs sans modifier les dates', async ({ page }) => {
    await goTo(page, '/planning');
    const dateSpan = page.locator('[title="Cliquer pour modifier les dates"]').first();
    const initialText = await dateSpan.innerText();
    await dateSpan.click();
    const col = page.locator('.planning-col').first();
    await col.getByRole('button', { name: 'X', exact: true }).click();
    await expect(dateSpan).toBeVisible();
    await expect(dateSpan).toContainText(initialText.slice(0, 5));
  });

  test('affiche le bouton + Sprint dans le header', async ({ page }) => {
    await goTo(page, '/planning');
    // exact:true pour ne pas matcher "dependances cross-sprint"
    await expect(page.getByRole('button', { name: 'Sprint', exact: tr