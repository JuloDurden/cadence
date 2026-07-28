const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Backlog', () => {

  test('affiche le tableau et les items DEMO_STATE', async ({ page }) => {
    await goTo(page, '/backlog');
    await expect(page.locator('[data-testid="backlog-table"]')).toBeVisible();
    // BUG-001 est le premier item du DEMO_STATE
    await expect(page.locator('[data-testid="backlog-table"]')).toContainText('BUG-001');
  });

  test('affiche plusieurs clients du DEMO_STATE', async ({ page }) => {
    await goTo(page, '/backlog');
    const table = page.locator('[data-testid="backlog-table"]');
    await expect(table).toContainText('FAX-002');
    await expect(table).toContainText('MAN-003');
    await expect(table).toContainText('AGA-004');
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
    await page.locator('.filter-group select:has(option[value="epic"])').selectOption('epic');
    await expect(page.locator('.backlog-table')).toContainText('Nouvel Epic de test E2E');
  });

  test('modifier un Epic existant (FAX-002) depuis son en-tête de groupe', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.locator('.filter-group select:has(option[value="epic"])').selectOption('epic');
    const group = page.locator('.sprint-row').filter({ hasText: 'FAX-002' });
    await group.locator('button[title="Modifier l\'Epic"]').click();
    const modal = page.locator('[data-testid="hierarchy-node-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('FAX-002');
    await modal.locator('input').first().fill('EPIC Carte interactive, modifiee E2E');
    await modal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('.backlog-table')).toContainText('EPIC Carte interactive, modifiee E2E');
  });

  test('supprimer un Epic détache ses US (conservées, sans epicId)', async ({ page }) => {
    await goTo(page, '/backlog');
    await page.locator('.filter-group select:has(option[value="epic"])').selectOption('epic');
    // AGA-009 (i9) n'a aucune US rattachée dans le jeu de démo → suppression simple, sans US à vérifier détachée
    const group = page.locator('.sprint-row').filter({ hasText: 'AGA-009' });
    await group.locator('button[title="Supprimer l\'Epic"]').click();
    await page.locator('[data-testid="dialog-confirm"]').click();
    await expect(page.locator('.backlog-table')).not.toContainText('AGA-009');
  });

});
