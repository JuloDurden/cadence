const { test, expect } = require('@playwright/test');
const { goTo, setBacklogGroupBy } = require('./helpers');

test.describe('Backlog', () => {

  test('affiche le tableau et les items DEMO_STATE', async ({ page }) => {
    await goTo(page, '/backlog');
    await expect(page.locator('[data-testid="backlog-table"]')).toBeVisible();
    // BUG-001 est le premier item du DEMO_STATE
    await expect(page.locator('[data-testid="backlog-table"]')).toContainText('BUG-001');
  });

  test('le groupement "Grouper par Epic" persiste au retour sur la page (retour Julien, 2026-07-29)', async ({ page }) => {
    await goTo(page, '/backlog');
    await setBacklogGroupBy(page, 'epic');
    await expect(page.locator('[data-testid="btn-group-by"]')).toContainText('Epic');
    // Navigation vers une autre page puis retour — le groupement doit être retrouvé, pas
    // réinitialisé à "none" (avant ce correctif, la config d'affichage n'était pas persistée).
    await goTo(page, '/planning');
    await goTo(page, '/backlog');
    await expect(page.locator('[data-testid="btn-group-by"]')).toContainText('Epic');
  });

  test('affiche plusieurs clients du DEMO_STATE', async ({ page }) => {
    // FAX-002/MAN-003/AGA-004 sont des clés d'Epic (HierarchyNode) depuis la Phase 1
    // (2026-07-28) — un Epic n'est plus un Item et n'apparaît plus dans le tableau par
    // défaut (vue "Tous les items"). On vérifie donc de vraies clés d'Item par client.
    await goTo(page, '/backlog');
    const table = page.locator('[data-testid="backlog-table"]');
    await expect(table).toContainText('FAX-019');
    await expect(table).toContainText('MAN-020');
    await expect(table).toContainText('AGA-021');
  });

  test('le bouton Nouvel Item ouvre la modale', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('la modale contient les onglets Général et Dépendances', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toContainText('Général');
    await expect(page.locator('[data-testid="item-modal"]')).toContainText('Dépendances');
  });

  test('fermer la modale la masque', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
    await page.click('[data-testid="item-modal"] button[aria-label="Fermer"]');
    await expect(page.locator('[data-testid="item-modal"]')).not.toBeVisible();
  });

});

test.describe('Backlog — Epic (HierarchyNode, Phase 1 sous-chantier 1, 2026-07-28)', () => {

  test('le bouton Nouvel Epic ouvre la modale dédiée (pas ItemModal)', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-epic"]');
    await expect(page.locator('[data-testid="hierarchy-node-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="item-modal"]')).toHaveCount(0);
  });

  test('créer un Epic l\'affiche dans le mode "Grouper par Epic"', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-epic"]');
    const modal = page.locator('[data-testid="hierarchy-node-modal"]');
    await modal.locator('input').first().fill('Nouvel Epic de test E2E');
    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).not.toBeVisible();
    await setBacklogGroupBy(page, 'epic');
    await expect(page.locator('[data-testid="backlog-table"]')).toContainText('Nouvel Epic de test E2E');
  });

  test('modifier un Epic existant (FAX-002) depuis son en-tête de groupe', async ({ page }) => {
    await goTo(page, '/backlog');
    await setBacklogGroupBy(page, 'epic');
    const group = page.locator('.backlog-group-card').filter({ hasText: 'FAX-002' });
    await group.locator('button[title="Modifier l\'Epic"]').click();
    const modal = page.locator('[data-testid="hierarchy-node-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('FAX-002');
    await modal.locator('input').first().fill('EPIC Carte interactive, modifiee E2E');
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('[data-testid="backlog-table"]')).toContainText('EPIC Carte interactive, modifiee E2E');
  });

  test('supprimer un Epic détache ses US (conservées, sans epicId)', async ({ page }) => {
    await goTo(page, '/backlog');
    await setBacklogGroupBy(page, 'epic');
    // AGA-009 (i9) n'a aucune US rattachée dans le jeu de démo → suppression simple, sans US à vérifier détachée
    const group = page.locator('.backlog-group-card').filter({ hasText: 'AGA-009' });
    await group.locator('button[title="Supprimer l\'Epic"]').click();
    await page.locator('[data-testid="dialog-confirm"]').click();
    await expect(page.locator('[data-testid="backlog-table"]')).not.toContainText('AGA-009');
  });

});

test.describe('Backlog — regroupement en cards (retour Julien, 2026-07-29)', () => {

  test('un mode de regroupement (Sprint) affiche des cards plutôt que des lignes de tableau', async ({ page }) => {
    await goTo(page, '/backlog');
    await setBacklogGroupBy(page, 'sprint');
    await expect(page.locator('.backlog-group-card').first()).toBeVisible();
    // Chaque card contient sa propre mini-table d'items (en-tête "Clé" partagé)
    await expect(page.locator('.backlog-group-card').first().locator('table.backlog-table')).toBeVisible();
  });

  test('le mode "Grouper : aucun" reste une table plate, sans card', async ({ page }) => {
    await goTo(page, '/backlog');
    await expect(page.locator('[data-testid="backlog-table"]')).toHaveCount(1);
    await expect(page.locator('.backlog-group-card')).toHaveCount(0);
  });

  test('une card peut être repliée puis dépliée', async ({ page }) => {
    await goTo(page, '/backlog');
    await setBacklogGroupBy(page, 'epic');
    const card = page.locator('.backlog-group-card').first();
    const toggle = card.locator('[data-testid^="backlog-group-toggle-"]').first();
    const toggleTestId = await toggle.getAttribute('data-testid');
    const groupId = toggleTestId.replace('backlog-group-toggle-', '');
    const body = card.locator(`[data-testid="backlog-group-body-${groupId}"]`);
    await expect(body).toBeVisible();
    await toggle.click();
    await expect(body).not.toBeVisible();
    await toggle.click();
    await expect(body).toBeVisible();
  });

});

test.describe('Backlog — niveau Initiative (sous-chantier 4, redémarré 2026-07-29)', () => {

  test('le bouton Nouvelle Initiative ouvre la modale dédiée', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-initiative"]');
    const modal = page.locator('[data-testid="hierarchy-node-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Nouvelle Initiative');
    // Une Initiative ne propose pas de "Sprint assigné" (couvre plusieurs sprints par nature)
    await expect(modal).not.toContainText('Sprint assigné');
  });

  test('créer une Initiative l\'affiche dans le mode "Grouper par Initiative"', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-initiative"]');
    const modal = page.locator('[data-testid="hierarchy-node-modal"]');
    await modal.locator('input').first().fill('Initiative de test E2E');
    await modal.getByRole('button', { name: 'Créer' }).click();
    await expect(modal).not.toBeVisible();
    await setBacklogGroupBy(page, 'initiative');
    await expect(page.locator('[data-testid="backlog-table"]')).toContainText('Initiative de test E2E');
  });

  test('rattacher un Epic existant à une Initiative l\'affiche imbriqué dans sa card', async ({ page }) => {
    await goTo(page, '/backlog');
    // Créer l'Initiative
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-initiative"]');
    const initModal = page.locator('[data-testid="hierarchy-node-modal"]');
    await initModal.locator('input').first().fill('Initiative parente E2E');
    await initModal.getByRole('button', { name: 'Créer' }).click();
    await expect(initModal).not.toBeVisible();

    // Rattacher l'Epic FAX-002 à cette Initiative via "Initiative parente"
    await setBacklogGroupBy(page, 'epic');
    const epicCard = page.locator('.backlog-group-card').filter({ hasText: 'FAX-002' });
    await epicCard.locator('button[title="Modifier l\'Epic"]').click();
    const epicModal = page.locator('[data-testid="hierarchy-node-modal"]');
    await expect(epicModal).toBeVisible();
    // selectOption({ label }) exige une chaîne exacte, pas une regex (Playwright) — on
    // récupère la value de l'option correspondante par son texte, puis on sélectionne par value.
    const parentSelect = epicModal.locator('.form-group').filter({ hasText: 'Initiative parente' }).locator('select');
    const parentOptionValue = await parentSelect.locator('option', { hasText: 'Initiative parente E2E' }).getAttribute('value');
    await parentSelect.selectOption(parentOptionValue);
    await epicModal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(epicModal).not.toBeVisible();

    // Basculer en mode Initiative : l'Epic doit apparaître imbriqué dans la card Initiative
    await setBacklogGroupBy(page, 'initiative');
    const initiativeCard = page.locator('.backlog-group-card').filter({ hasText: 'Initiative parente E2E' }).first();
    await expect(initiativeCard).toContainText('FAX-002');
  });

  test('supprimer une Initiative détache ses Epics enfants (conservés)', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-initiative"]');
    const initModal = page.locator('[data-testid="hierarchy-node-modal"]');
    await initModal.locator('input').first().fill('Initiative à supprimer E2E');
    await initModal.getByRole('button', { name: 'Créer' }).click();
    await expect(initModal).not.toBeVisible();

    await setBacklogGroupBy(page, 'initiative');
    const initiativeCard = page.locator('.backlog-group-card').filter({ hasText: 'Initiative à supprimer E2E' }).first();
    await initiativeCard.locator('button[title="Supprimer l\'Initiative"]').click();
    await page.locator('[data-testid="dialog-confirm"]').click();
    await expect(page.locator('[data-testid="backlog-table"]')).not.toContainText('Initiative à supprimer E2E');
  });

});
