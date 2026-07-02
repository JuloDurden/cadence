const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');

test.describe('Product Backlog', () => {

  test('se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('affiche les items du sprint actif avec leur cle', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-backlog')).toContainText('AUT-1');
    await expect(page.locator('#tab-backlog')).toContainText('AUT-2');
    await expect(page.locator('#tab-backlog')).toContainText('AUT-3');
  });

  test('le filtre Sprint filtre les items du sprint selectionne', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    // Selectionner le sprint s1 — doit montrer AUT-1, AUT-2, AUT-3 mais pas AUT-4 (non assigne)
    await page.selectOption('#backlog-filter-sprint', 's1');
    await page.waitForTimeout(200);
    await expect(page.locator('#tab-backlog')).toContainText('AUT-1');
    await expect(page.locator('#tab-backlog')).toContainText('AUT-3');
    await expect(page.locator('#tab-backlog')).not.toContainText('AUT-4');
  });

  test('le filtre Sprint "Non assigne" filtre les items non assignes', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    await page.selectOption('#backlog-filter-sprint', 'unassigned');
    await page.waitForTimeout(200);
    await expect(page.locator('#tab-backlog')).toContainText('AUT-4');
    await expect(page.locator('#tab-backlog')).not.toContainText('AUT-1');
  });

  test('vider le filtre Sprint restaure tous les items', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    await page.selectOption('#backlog-filter-sprint', 's1');
    await page.waitForTimeout(200);
    await page.selectOption('#backlog-filter-sprint', '');
    await page.waitForTimeout(200);
    await expect(page.locator('#tab-backlog')).toContainText('AUT-1');
    await expect(page.locator('#tab-backlog')).toContainText('AUT-4');
  });

  test('le tri par SP change l\'ordre des items', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    await page.selectOption('#backlog-sort', 'sp-desc');
    await page.waitForTimeout(200);
    expect(errors).toHaveLength(0);
    // AUT-3 a 8 SP (le plus grand) - doit apparaitre en premier
    const rows = page.locator('#tab-backlog tbody tr');
    const firstRow = await rows.first().textContent();
    expect(firstRow).toContain('AUT-3');
  });

  test('ouvrir la modale "Nouvelle US" ne genere pas d\'erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    expect(errors).toHaveLength(0);
  });

  test('la modale nouvelle US contient les champs essentiels', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    await expect(page.locator('#m-desc')).toBeVisible();
    await expect(page.locator('#m-sp')).toBeVisible();
    await expect(page.locator('#m-client')).toBeVisible();
    await expect(page.locator('#m-sprint')).toBeVisible();
  });

  test('creer un item via la modale l\'ajoute au backlog', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    await page.fill('#m-desc', 'Test creation item E2E');
    await page.fill('#m-sp', '3');
    await page.click('button[onclick="saveModal()"]');
    await page.waitForTimeout(400);
    await expect(page.locator('#tab-backlog')).toContainText('Test creation item E2E');
    expect(errors).toHaveLength(0);
  });

  test('supprimer un item le retire du backlog', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);

    // Confirmer la boite de dialogue de suppression
    page.on('dialog', d => d.accept());
    // Cliquer le bouton supprimer de AUT-1
    await page.click('button[aria-label="Supprimer AUT-1"]');
    await page.waitForTimeout(400);

    await expect(page.locator('#tab-backlog')).not.toContainText('AUT-1');
    expect(errors).toHaveLength(0);
  });

  test('la colonne Statut affiche un badge colore', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    await expect(page.locator('#tab-backlog th:has-text("Statut")')).toBeVisible();
    // Les badges statut sont des spans colores
    const badges = page.locator('#tab-backlog tbody tr').first().locator('span[style*="border-radius"]');
    expect(await badges.count()).toBeGreaterThan(0);
  });

  test('l\'item non assigne apparait dans la section Backlog non ass