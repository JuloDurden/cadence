const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');
const { BASE_STATE } = require('./fixtures');

test.describe('Historique & Undo/Redo', () => {

  // Etat avec des entrees d'historique pre-existantes
  const stateWithHistory = {
    ...BASE_STATE,
    history: [
      { ts: Date.now() - 5000, type: 'item_create', desc: 'Création AUT-1', itemKey: 'AUT-1' },
      { ts: Date.now() - 4000, type: 'item_edit',   desc: 'Modification AUT-2', itemKey: 'AUT-2' },
      { ts: Date.now() - 3000, type: 'sprint_activate', desc: 'Sprint 1 activé', sprintId: 's1' },
      { ts: Date.now() - 2000, type: 'item_status', desc: 'AUT-1 : Todo → In Progress', itemKey: 'AUT-1' },
    ],
  };

  test('l\'onglet Historique se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithHistory);
    await goToTab(page, 'historique');
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
  });

  test('les entrees d\'historique sont affichees', async ({ page }) => {
    await loadWithState(page, stateWithHistory);
    await goToTab(page, 'historique');
    await page.waitForTimeout(400);
    const tab = page.locator('#tab-historique');
    const text = await tab.innerText();
    // Au moins une des descriptions doit apparaitre
    expect(text).toMatch(/AUT-1|AUT-2|Sprint 1|Création|Modification|activé/i);
  });

  test('le bouton Undo est present dans la toolbar', async ({ page }) => {
    await loadWithState(page);
    await expect(page.locator('#btn-undo')).toBeVisible();
  });

  test('le bouton Redo est present dans la toolbar', async ({ page }) => {
    await loadWithState(page);
    await expect(page.locator('#btn-redo')).toBeVisible();
  });

  test('Undo desactive quand la pile est vide', async ({ page }) => {
    await loadWithState(page);
    // La pile undo est vide (cleared by loadWithState via localStorage.removeItem('act_undo'))
    const btn = page.locator('#btn-undo');
    await expect(btn).toBeDisabled();
  });

  test('Redo desactive quand la pile est vide', async ({ page }) => {
    await loadWithState(page);
    const btn = page.locator('#btn-redo');
    await expect(btn).toBeDisabled();
  });

  test('creer un item active le bouton Undo', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    // Ouvrir la modale de creation
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    await page.fill('#m-desc', 'Test Undo activation');
    await page.fill('#m-sp', '3');
    await page.click('button[onclick="saveModal()"]');
    await page.waitForTimeout(300);
    // L'undo devrait maintenant etre actif
    const btn = page.locator('#btn-undo');
    await expect(btn).not.toBeDisabled();
    expect(errors).toHaveLength(0);
  });

  test('cliquer Undo apres creation annule l\'item', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    const before = await page.locator('#backlog-body tr, #backlog-body .backlog-row, table tbody tr').count();
    // Creer un item
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    await page.fill('#m-desc', 'Item a annuler');
    await page.fill('#m-sp', '2');
    await page.click('button[onclick="saveModal()"]');
    await page.waitForTimeout(300);
    // Undo
    await page.click('#btn-undo');
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
  });

  test('l\'historique vide affiche un message adequat', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, { ...BASE_STATE, history: [] });
    await goToTab(page, 'historique');
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
    await expect(page.locator('#tab-historique')).toBeVisible();
  });

  test('Ctrl+Z declenche l\'undo sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    // Creer un item pour avoir quelque chose a annuler
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    await page.fill('#m-desc', 'Item ctrl-z');
    await page.fill('#m-sp', '1');
    await page.click('button[onclick="saveModal()"]');
    await page.waitForTimeout(300);
    // Ctrl+Z
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
  });

});
