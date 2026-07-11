const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Planning v0.80.0 - toggle vues', () => {

  test('les 2 boutons de vue sont presents (Grille, Swimlanes)', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.getByTitle('Vue grille')).toBeVisible();
    await expect(page.getByTitle('Swimlanes par client')).toBeVisible();
  });

  test('la vue Grille est active par defaut - .planning-grid visible', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.locator('.planning-grid')).toBeVisible();
    await expect(page.locator('.swimlanes-view')).not.toBeVisible();
  });

  test('cliquer Swimlanes affiche .swimlanes-view et masque .planning-grid', async ({ page }) => {
    await goTo(page, '/planning');
    await page.getByTitle('Swimlanes par client').click();
    await expect(page.locator('.swimlanes-view')).toBeVisible();
    await expect(page.locator('.planning-grid')).not.toBeVisible();
  });

  test('retour en Grille depuis Swimlanes restaure .planning-grid', async ({ page }) => {
    await goTo(page, '/planning');
    await page.getByTitle('Swimlanes par client').click();
    await page.getByTitle('Vue grille').click();
    await expect(page.locator('.planning-grid')).toBeVisible();
    await expect(page.locator('.swimlanes-view')).not.toBeVisible();
  });

});

test.describe('Planning v0.80.0 - vue Swimlanes', () => {

  test('le header Swimlanes liste les sprints', async ({ page }) => {
    await goTo(page, '/planning');
    await page.getByTitle('Swimlanes par client').click();
    const header = page.locator('.swimlanes-header');
    await expect(header).toBeVisible();
    await expect(header).toContainText('Sprint 1');
    await expect(header).toContainText('Sprint 2');
  });

  test('le header Swimlanes affiche la colonne Non assigne', async ({ page }) => {
    await goTo(page, '/planning');
    await page.getByTitle('Swimlanes par client').click();
    await expect(page.locator('.swimlanes-header')).toContainText('Non assign');
  });

  test('les lignes clients (swimlanes-row) sont presentes', async ({ page }) => {
    await goTo(page, '/planning');
    await page.getByTitle('Swimlanes par client').click();
    await expect(page.locator('.swimlanes-row').first()).toBeVisible();
  });

  test('les lignes Swimlanes contiennent le nom d un client connu', async ({ page }) => {
    await goTo(page, '/planning');
    await page.getByTitle('Swimlanes par client').click();
    await expect(page.locator('.swimlanes-client-label').first()).toContainText('FAXFA');
  });

  test('pas d erreur JS en vue Swimlanes', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/planning');
    await page.getByTitle('Swimlanes par client').click();
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

});

test.describe('Planning v0.80.0 - bouton Dependances', () => {

  test('le bouton Dependances est visible en vue Grille', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.getByTitle('Vue dependances cross-sprint')).toBeVisible();
  });

  test('le bouton Dependances est absent en vue Swimlanes', async ({ page }) => {
    await goTo(page, '/planning');
    await page.getByTitle('Swimlanes par client').click();
    await expect(page.getByTitle('Vue dependances cross-sprint')).not.toBeVisible();
  });

  test('cliquer Dependances ne provoque pas d erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/planning');
    await page.getByTitle('Vue dependances cross-sprint').click();
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
  });

  test('le bouton Dependances reapparait apres retour en Grille depuis Swimlanes', async ({ page }) => {
    await goTo(page, '/planning');
    await page.getByTitle('Swimlanes par client').click();
    await expect(page.getByTitle('Vue dependances cross-sprint')).not.toBeVisible();
    await page.getByTitle('Vue grille').click();
    await expect(page.getByTitle('Vue dependances cross-sprint')).toBeVisible();
  });

});

test.describe('Planning v0.80.0 - indicateur de faisabilite', () => {

  test('un badge de faisabilite est visible sur un sprint ouvert', async ({ page }) => {
    await goTo(page, '/planning');
    // Sprint 1 cloture velocitySnapshot=100 => les sprints 2/3/4 affichent un badge
    const feasBadge = page.locator('span').filter({
      hasText: /Velocite OK|Charge limite|Surcharge/,
    }).first();
    await expect(feasBadge).toBeVisible();
  });

  test('le badge Historique insuffisant n est jamais affiche', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.getByText('Historique insuffisant')).not.toBeVisible();
  });

  test('le sprint 2 (100 SP sur velocite 100) affiche Charge limite', async ({ page }) => {
    await goTo(page, '/planning');
    await expect(page.locator('span').filter({ hasText: 'Charge limite' }).first()).toBeVisible();
  });

  test('le badge de faisabilite est absent sur les sprints clotures', async ({ page }) => {
    await goTo(page, '/planning');
    const closedCol = page.locator('.planning-col-closed').first();
    await expect(closedCol).toBeVisible();
    await expect(
      closedCol.locator('span').filter({ hasText: /Charge limite|Velocite OK|Surcharge/ })
    ).not.toBeVisible();
  });

});

test.describe('Planning v0.80.0 - deadlines flottantes', () => {

  test('un badge deadline est visible dans le header d un sprint', async ({ page }) => {
    await goTo(page, '/planning');
    // FAX-013 (Sprint 3) deadline 30/06 < fin sprint 26/07
    // epic => rendu comme groupe, pas PlanningCard => badge dans le header SprintColumn
    const badge = page.locator('span').filter({ hasText: /deadline/ }).first();
    await expect(badge).toBeVisible();
  });

  test('le badge deadline du header Sprint 3 affiche 1 deadline depassee', async ({ page }) => {
    await goTo(page, '/planning');
    const sprintThreeCol = page.locator('.planning-col').filter({ hasText: 'Sprint 3' });
    await expect(sprintThreeCol).toBeVisible();
    const badge = sprintThreeCol.locator('span').filter({ hasText: /deadline/ });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('1');
  });

  test('le title du badge deadline identifie l item et sa date ISO', async ({ page }) => {
    await goTo(page, '/planning');
    const sprintThreeCol = page.locator('.planning-col').filter({ hasText: 'Sprint 3' });
    const badge = sprintThreeCol.locator('span').filter({ hasText: /deadline/ }).first();
    const titleAttr = await badge.getAttribute('title');
    expect(titleAttr).toContain('FAX-013');
    expect(titleAttr).toContain('2026-06-30');
  });

  test('le badge deadline est absent des colonnes sans deadline depassee', async ({ page }) => {
    await goTo(page, '/planning');
    // Sprint 1 (cloture) et Sprint 2 n ont pas de deadline depassee dans la demo
    const sprintOneCol = page.locator('.planning-col').filter({ hasText: 'Sprint 1' });
    await expect(
      sprintOneCol.locator('span').filter({ hasText: /deadline/ })
    ).not.toBeVisible();
  });

});
