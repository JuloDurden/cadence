const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');
const { BASE_STATE } = require('./fixtures');

test.describe('Retrospective', () => {

  // Fixtures avec une retro de demo
  const stateWithRetro = {
    ...BASE_STATE,
    retros: [{
      id: 'r1',
      sprintId: 's1',
      format: 'ssc',
      cards: [
        { id: 'c1', column: 'start', text: 'Faire du TDD', votes: 2, createdBy: null },
        { id: 'c2', column: 'stop', text: 'Les reunions longues', votes: 1, createdBy: null },
        { id: 'c3', column: 'continue', text: 'Les daily standups', votes: 3, createdBy: null },
      ],
      votes: {},
      actions: [],
    }],
    nextRetroId: 2,
  };

  test('se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithRetro);
    await goToTab(page, 'retro');
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
  });

  test('affiche le board Start/Stop/Continue par defaut', async ({ page }) => {
    await loadWithState(page, stateWithRetro);
    await goToTab(page, 'retro');
    await page.waitForTimeout(400);
    const tab = page.locator('#tab-retro');
    const text = await tab.innerText();
    expect(text).toMatch(/Start|Stop|Continue/i);
  });

  test('les cartes de la retro sont affichees', async ({ page }) => {
    await loadWithState(page, stateWithRetro);
    await goToTab(page, 'retro');
    await page.waitForTimeout(400);
    await expect(page.locator('#tab-retro')).toContainText('Faire du TDD');
    await expect(page.locator('#tab-retro')).toContainText('Les reunions longues');
  });

  test('le vote sur une carte ne genere pas d\'erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithRetro);
    await goToTab(page, 'retro');
    await page.waitForTimeout(400);
    const voteBtn = page.locator('#tab-retro button[onclick*="voteRetroCard"]').first();
    if (await voteBtn.count() > 0) {
      await voteBtn.click();
      await page.waitForTimeout(200);
    }
    expect(errors).toHaveLength(0);
  });

  test('ajouter une carte ne genere pas d\'erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithRetro);
    await goToTab(page, 'retro');
    await page.waitForTimeout(400);
    const addBtn = page.locator('#tab-retro button[onclick*="addRetroCard"]').first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(300);
    }
    expect(errors).toHaveLength(0);
  });

  test('le selecteur de format est present (Start/Stop/Continue, Mad/Sad/Glad, 4Ls)', async ({ page }) => {
    await loadWithState(page, stateWithRetro);
    await goToTab(page, 'retro');
    await page.waitForTimeout(400);
    const formatSelector = page.locator('#tab-retro select, #tab-retro button:has-text("Mad"), #tab-retro button:has-text("4Ls")');
    expect(await formatSelector.count()).toBeGreaterThan(0);
  });

  test('la section Actions issues de la retro est presente', async ({ page }) => {
    await loadWithState(page, stateWithRetro);
    await goToTab(page, 'retro');
    await page.waitForTimeout(400);
    const tabText = await page.locator('#tab-retro').innerText();
    expect(tabText).toMatch(/action|suivi/i);
  });

  test('retro sans donnees : etat vide rendu sans crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, { ...BASE_STATE, retros: [] });
    await goToTab(page, 'retro');
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
    await expect(page.locator('#tab-retro')).toBeVisible();
  });

});
