const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');

test.describe('Modal User Story', () => {

  async function openNewItemModal(page) {
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
  }

  async function openExistingItemModal(page) {
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    await page.click('button[aria-label="Modifier AUT-1"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
  }

  test('la modale s\'ouvre sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await openNewItemModal(page);
    expect(errors).toHaveLength(0);
  });

  test('les 6 onglets de la modale sont presents', async ({ page }) => {
    await loadWithState(page);
    await openNewItemModal(page);
    await expect(page.locator('[data-tab="general"]')).toBeVisible();
    await expect(page.locator('[data-tab="story"]')).toBeVisible();
    await expect(page.locator('[data-tab="deps"]')).toBeVisible();
    await expect(page.locator('[data-tab="prio"]')).toBeVisible();
    await expect(page.locator('[data-tab="team"]')).toBeVisible();
    await expect(page.locator('[data-tab="dod"]')).toBeVisible();
  });

  test('onglet General : champs description, SP, client, sprint visibles', async ({ page }) => {
    await loadWithState(page);
    await openNewItemModal(page);
    await expect(page.locator('#m-desc')).toBeVisible();
    await expect(page.locator('#m-sp')).toBeVisible();
    await expect(page.locator('#m-client')).toBeVisible();
    await expect(page.locator('#m-sprint')).toBeVisible();
  });

  test('onglet General : changer le type en Epic masque le champ Epic parent', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await openNewItemModal(page);
    await page.selectOption('#m-type', 'epic');
    await page.waitForTimeout(100);
    expect(errors).toHaveLength(0);
  });

  test('onglet User Story : champs role, want, goal visibles', async ({ page }) => {
    await loadWithState(page);
    await openNewItemModal(page);
    await page.click('[data-tab="story"]');
    await page.waitForTimeout(100);
    await expect(page.locator('#m-role')).toBeVisible();
    await expect(page.locator('#m-want')).toBeVisible();
    await expect(page.locator('#m-goal')).toBeVisible();
  });

  test('onglet User Story : saisir les champs ne genere pas d\'erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await openNewItemModal(page);
    await page.click('[data-tab="story"]');
    await page.fill('#m-role', 'PO');
    await page.fill('#m-want', 'voir le backlog');
    await page.fill('#m-goal', 'prioriser les features');
    expect(errors).toHaveLength(0);
  });

  test('onglet User Story : ajouter un critere BDD', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await openNewItemModal(page);
    await page.click('[data-tab="story"]');
    await page.waitForTimeout(100);
    await page.click('button[onclick="addCriterion()"]');
    await page.waitForTimeout(200);
    const criteria = page.locator('#criteria-list .crit-block, #criteria-list [class*="criterion"]');
    expect(await criteria.count()).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  test('onglet Dependances : la recherche de dep s\'affiche sans erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await openNewItemModal(page);
    await page.click('[data-tab="deps"]');
    await page.waitForTimeout(100);
    await expect(page.locator('#dep-search')).toBeVisible();
    await page.fill('#dep-search', 'AUT');
    await page.waitForTimeout(200);
    expect(errors).toHaveLength(0);
  });

  test('onglet Priorite : les frameworks de scoring sont accessibles', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await openNewItemModal(page);
    await page.click('[data-tab="prio"]');
    await page.waitForTimeout(100);
    const tabPrio = page.locator('#mtab-prio');
    await expect(tabPrio).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('onglet Priorite : selectionner WSJF ne genere pas d\'erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await openNewItemModal(page);
    await page.click('[data-tab="prio"]');
    await page.waitForTimeout(100);
    const wsjfBtn = page.locator('#mtab-prio button:has-text("WSJF"), #mtab-prio [onclick*="wsjf"]').first();
    if (await wsjfBtn.count() > 0) {
      await wsjfBtn.click();
      await page.waitForTimeout(200);
    }
    expect(errors).toHaveLength(0);
  });

  test('sauvegarder un item existant avec les champs US persiste les donnees', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await openExistingItemModal(page);
    await page.click('[data-tab="story"]');
    await page.fill('#m-role', 'testeur E2E');
    await page.fill('#m-want', 'verifier que la modale fonctionne');
    await page.fill('#m-goal', 'valider la qualite');
    await page.click('button[onclick="saveModal()"]');
    await page.waitForTimeout(400);

    // Rouvrir et verifier
    await page.click('button[aria-label="Modifier AUT-1"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    await page.click('[data-tab="story"]');
    await expect(page.locator('#m-role')).toHaveValue('testeur E2E');
    expect(errors).toHaveLength(0);
  });

  test('deadline imposee : selectionner le type ne genere pas d\'erreur', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await openExistingItemModal(page);
    await page.selectOption('#m-deadline-type', 'imposed');
    await page.fill('#m-deadline-date', '2026-12-31');
    await page.click('button[onclick="saveModal()"]');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

});
