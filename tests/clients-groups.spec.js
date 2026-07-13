const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Clients — Layout groupes + cards (v0.87)', () => {

  test('la page Clients se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/clients');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('le header affiche le nombre de clients et de groupes', async ({ page }) => {
    await goTo(page, '/clients');
    const hdrCtx = page.locator('.hdr-ctx');
    await expect(hdrCtx).toContainText(/\d+ clients/);
    await expect(hdrCtx).toContainText(/\d+ groupes/);
  });

  test('les boutons de vue Liste et Timeline sont présents', async ({ page }) => {
    await goTo(page, '/clients');
    await expect(page.locator('[data-testid="btn-view-liste"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-view-timeline"]')).toBeVisible();
  });

  test('le bouton "+ Ajouter" est présent dans le header', async ({ page }) => {
    await goTo(page, '/clients');
    await expect(page.locator('[data-testid="btn-add-menu"]')).toBeVisible();
  });

  test('le panneau gauche des groupes est visible (DEMO_STATE contient 3 groupes)', async ({ page }) => {
    await goTo(page, '/clients');
    await expect(page.locator('[data-testid="groups-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid^="group-card-"]')).toHaveCount(3);
  });

  test('les noms des groupes prédéfinis apparaissent dans le panneau', async ({ page }) => {
    await goTo(page, '/clients');
    const panel = page.locator('[data-testid="groups-panel"]');
    await expect(panel).toContainText('Grands comptes');
    await expect(panel).toContainText('PME');
    await expect(panel).toContainText('Socle & Qualité');
  });

  test('les clients s\'affichent en cards dans le panneau droit', async ({ page }) => {
    await goTo(page, '/clients');
    // DEMO_STATE contient 6 clients
    await expect(page.locator('[data-testid^="client-card-"]')).toHaveCount(6);
  });

  test('une card client affiche le nom du groupe auquel il appartient', async ({ page }) => {
    await goTo(page, '/clients');
    // cl1 appartient à cg1 "Grands comptes"
    await expect(page.locator('[data-testid="client-card-cl1"]')).toContainText('Grands comptes');
  });

  test('cliquer sur Vue Timeline affiche le tableau timeline', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="btn-view-timeline"]').click();
    // Le tableau timeline doit apparaître, le panneau groupes disparaît
    await expect(page.locator('[data-testid="groups-panel"]')).not.toBeVisible();
    await expect(page.locator('thead')).toContainText('Client');
  });

  test('revenir en vue Liste réaffiche le panneau groupes', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="btn-view-timeline"]').click();
    await page.locator('[data-testid="btn-view-liste"]').click();
    await expect(page.locator('[data-testid="groups-panel"]')).toBeVisible();
  });

});

test.describe('Clients — Menu "+ Ajouter" (v0.87)', () => {

  test('le menu s\'ouvre au clic et propose deux options', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="btn-add-menu"]').click();
    await expect(page.locator('[data-testid="menu-new-client"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-new-group"]')).toBeVisible();
  });

  test('"Nouveau client" ouvre la modal ClientModal', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="btn-add-menu"]').click();
    await page.locator('[data-testid="menu-new-client"]').click();
    // ClientModal n'a pas la classe "open" — on cherche l'en-tête de la modal
    await expect(page.getByRole('heading', { name: 'Nouveau client' })).toBeVisible();
  });

  test('"Nouveau groupe" ouvre la modal GroupModal', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="btn-add-menu"]').click();
    await page.locator('[data-testid="menu-new-group"]').click();
    await expect(page.locator('[data-testid="group-modal"]')).toBeVisible();
  });

  test('le menu se ferme au clic extérieur', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="btn-add-menu"]').click();
    await expect(page.locator('[data-testid="menu-new-client"]')).toBeVisible();
    await page.locator('.page-content').click({ force: true });
    await expect(page.locator('[data-testid="menu-new-client"]')).not.toBeVisible();
  });

});

test.describe('Clients — CRUD groupes depuis le panneau gauche (v0.87)', () => {

  test('créer un groupe via le menu du header (1)', async ({ page }) => {
    await goTo(page, '/clients');
    const before = await page.locator('[data-testid^="group-card-"]').count();
    await page.locator('[data-testid="btn-add-menu"]').click();
    await page.locator('[data-testid="menu-new-group"]').click();
    await expect(page.locator('[data-testid="group-modal"]')).toBeVisible();
    await page.locator('[data-testid="group-name-input"]').fill('Groupe Test E2E');
    await page.locator('[data-testid="group-save-btn"]').click();
    await expect(page.locator('[data-testid^="group-card-"]')).toHaveCount(before + 1);
  });

  test('créer un groupe via le menu du header (2)', async ({ page }) => {
    await goTo(page, '/clients');
    const before = await page.locator('[data-testid^="group-card-"]').count();
    await page.locator('[data-testid="btn-add-menu"]').click();
    await page.locator('[data-testid="menu-new-group"]').click();
    await page.locator('[data-testid="group-name-input"]').fill('Via Header');
    await page.locator('[data-testid="group-save-btn"]').click();
    await expect(page.locator('[data-testid^="group-card-"]')).toHaveCount(before + 1);
  });

  test('le bouton Enregistrer est désactivé si le nom est vide', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="btn-add-menu"]').click();
    await page.locator('[data-testid="menu-new-group"]').click();
    await expect(page.locator('[data-testid="group-save-btn"]')).toBeDisabled();
    await page.locator('[data-testid="group-name-input"]').fill('x');
    await expect(page.locator('[data-testid="group-save-btn"]')).toBeEnabled();
  });

  test('modifier un groupe existant', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="group-edit-cg1"]').click();
    await expect(page.locator('[data-testid="group-modal"]')).toBeVisible();
    await page.locator('[data-testid="group-name-input"]').fill('Grands Comptes Modifié');
    await page.locator('[data-testid="group-save-btn"]').click();
    await expect(page.locator('[data-testid="group-card-cg1"]')).toContainText('Grands Comptes Modifié');
  });

  test('supprimer un groupe existant', async ({ page }) => {
    await goTo(page, '/clients');
    const before = await page.locator('[data-testid^="group-card-"]').count();
    page.once('dialog', d => d.accept());
    await page.locator('[data-testid="group-delete-cg2"]').click();
    await expect(page.locator('[data-testid^="group-card-"]')).toHaveCount(before - 1);
  });

  test('assigner un client à un groupe via la modal', async ({ page }) => {
    await goTo(page, '/clients');
    await page.locator('[data-testid="group-edit-cg2"]').click();
    await page.locator('[data-testid="group-cb-cl1"]').check();
    await page.locator('[data-testid="group-save-btn"]').click();
    await expect(page.locator('[data-testid="group-card-cg2"]')).toContainText('2');
  });

  test('fermer la modal avec Annuler ne crée pas de groupe', async ({ page }) => {
    await goTo(page, '/clients');
    const before = await page.locator('[data-testid^="group-card-"]').count();
    await page.locator('[data-testid="btn-add-menu"]').click();
    await page.locator('[data-testid="menu-new-group"]').click();
    await page.locator('[data-testid="group-name-input"]').fill('Ne pas créer');
    await page.locator('.modal-close').click();
    await expect(page.locator('[data-testid^="group-card-"]')).toHaveCount(before);
  });

});
