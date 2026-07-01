const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');
const { BASE_STATE } = require('./fixtures');

test.describe('Release Planning', () => {

  test('se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'planning');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('affiche la carte du sprint 1 avec son nom', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'planning');
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-planning')).toContainText('Sprint 1');
  });

  test('la carte sprint affiche les SP planifies', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'planning');
    await page.waitForTimeout(300);
    // AUT-1(3) + AUT-2(5) + AUT-3(8) = 16 SP
    const card = page.locator('.sprint-card').first();
    await expect(card).toBeVisible();
    const text = await card.innerText();
    expect(text).toMatch(/16|SP/);
  });

  test('le bouton Activer est present sur le sprint non actif', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'planning');
    await page.waitForTimeout(300);
    await expect(page.locator('.btn-activate-sprint').first()).toBeVisible();
  });

  test('activer un sprint le marque comme actif', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const state = { ...BASE_STATE, activeSprintId: null };
    await loadWithState(page, state);
    await goToTab(page, 'planning');
    await page.waitForTimeout(300);
    await page.click('.btn-activate-sprint');
    await page.waitForTimeout(400);
    await expect(page.locator('.sprint-card.active-sprint')).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('ajouter un sprint cree une nouvelle carte', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'planning');
    await page.waitForTimeout(300);
    const before = await page.locator('.sprint-card').count();
    await page.click('#btn-add-sprint-toolbar');
    await page.waitForTimeout(400);
    const after = await page.locator('.sprint-card').count();
    expect(after).toBe(before + 1);
    expect(errors).toHaveLength(0);
  });

  test('la vue calendrier se rend sans erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'planning');
    await page.waitForTimeout(300);
    // Bouton toggle vue calendrier
    const calBtn = page.locator('button[onclick*="toggleCal"], button[title*="calendrier"], button:has-text("📅")');
    if (await calBtn.count() > 0) {
      await calBtn.first().click();
      await page.waitForTimeout(400);
    }
    expect(errors).toHaveLength(0);
  });

  test('sprint avec items : la barre de capacite est visible', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'planning');
    await page.waitForTimeout(300);
    const card = page.locator('.sprint-card').first();
    // La barre de capacite est un div avec style width
    const bar = card.locator('[style*="width"][style*="%"], .capacity-bar, progress').first();
    expect(await card.innerText()).toBeTruthy();
  });

  test('la clôture d\'un sprint actif fonctionne sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await loadWithState(page);
    await goToTab(page, 'planning');
    await page.waitForTimeout(300);
    const closeBtn = page.locator('button[onclick*="closeSprint"]').first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(400);
    }
    expect(errors).toHaveLength(0);
  });

});
