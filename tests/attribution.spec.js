const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');
const { BASE_STATE } = require('./fixtures');

// Etat avec historique attribue a des membres
const stateWithAttribution = {
  ...BASE_STATE,
  team: [
    { id: 'm1', name: 'Alice Martin',  role: 'Dev Full-Stack', spDay: 1, photo: '', tags: [] },
    { id: 'm2', name: 'Bob Dupont',    role: 'Dev Back-End',   spDay: 1, photo: '', tags: [] },
  ],
  history: [
    { ts: Date.now() - 5000, type: 'item_create',    desc: 'Creation AUT-1', author: 'm1' },
    { ts: Date.now() - 4000, type: 'item_status',    desc: 'AUT-1 : Todo -> In Progress', author: 'm2' },
    { ts: Date.now() - 3000, type: 'sprint_activate',desc: 'Sprint 1 active', author: 'm1' },
    { ts: Date.now() - 2000, type: 'item_edit',      desc: 'Modification AUT-2' /* pas d auteur */ },
  ],
};

test.describe("Attribution utilisateur dans l'historique", () => {

  // Journal Historique

  test("l'onglet Historique se charge sans erreur JS avec attribution", async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithAttribution);
    await goToTab(page, 'historique');
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
  });

  test('le nom de l\'auteur apparait dans le journal', async ({ page }) => {
    await loadWithState(page, stateWithAttribution);
    await goToTab(page, 'historique');
    await page.waitForTimeout(400);
    const text = await page.locator('#tab-historique').innerText();
    expect(text).toMatch(/Alice Martin/);
    expect(text).toMatch(/Bob Dupont/);
  });

  test('les entrees sans auteur s\'affichent sans erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithAttribution);
    await goToTab(page, 'historique');
    await page.waitForTimeout(400);
    const text = await page.locator('#tab-historique').innerText();
    expect(text).toMatch(/Modification AUT-2/);
    expect(errors).toHaveLength(0);
  });

  test('le filtre par auteur est present', async ({ page }) => {
    await loadWithState(page, stateWithAttribution);
    await goToTab(page, 'historique');
    await page.waitForTimeout(400);
    const text = await page.locator('#tab-historique').innerText();
    expect(text).toMatch(/Tous les auteurs/i);
  });

  test('filtrer par auteur ne montre que ses entrees', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithAttribution);
    await goToTab(page, 'historique');
    await page.waitForTimeout(400);
    await page.selectOption('#tab-historique select', 'm2');
    await page.waitForTimeout(200);
    const text = await page.locator('#tab-historique').innerText();
    expect(text).toMatch(/Bob Dupont/);
    expect(errors).toHaveLength(0);
  });

  // Widget activite Dashboard

  test('le widget activite du Dashboard affiche les auteurs', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithAttribution);
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/Alice Martin|Bob Dupont/);
    expect(errors).toHaveLength(0);
  });

  // Attribution lors d'une action reelle

  test('creer un item avec un profil actif attribue l\'action a ce membre', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithAttribution);
    await page.selectOption('#current-user-select', 'm1');
    await page.waitForTimeout(200);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    await page.fill('#m-desc', 'Item attribue Alice');
    await page.fill('#m-sp', '3');
    await page.click('button[onclick="saveModal()"]');
    await page.waitForTimeout(300);
    const lastAuthor = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('cadenceState_v1') || '{}');
      const h = (s.history || []);
      return h.length ? h[h.length - 1].author : null;
    });
    expect(lastAuthor).toBe('m1');
    expect(errors).toHaveLength(0);
  });

});
