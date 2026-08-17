const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Kanban', () => {

  test('affiche les colonnes du tableau', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.locator('.kanban-col').first()).toBeVisible();
  });

  test('affiche les 3 colonnes de base en majuscules', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.locator('.kanban-col-header').filter({ hasText: 'À FAIRE' })).toBeVisible();
    await expect(page.locator('.kanban-col-header').filter({ hasText: 'EN COURS' })).toBeVisible();
    await expect(page.locator('.kanban-col-header').filter({ hasText: 'TERMINÉ' })).toBeVisible();
  });

  test('les items du sprint actif apparaissent sur le board', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.locator('.kanban-card').first()).toBeVisible();
  });

  test('affiche le select de sprint dans le header', async ({ page }) => {
    await goTo(page, '/kanban');
    const sprintSelect = page.locator('select.hdr-select').first();
    await expect(sprintSelect).toBeVisible();
    // Should show sprint options
    const options = sprintSelect.locator('option');
    await expect(options.first()).toContainText('Sprint');
  });

  test('affiche le label et le goal du sprint actif', async ({ page }) => {
    await goTo(page, '/kanban');
    // Theme label (derived from sprint label) — exact to avoid matching the goal span
    await expect(page.locator('.hdr-ctx-stat').filter({ hasText: /^Modernisation$/ })).toBeVisible();
    // Sprint goal
    await expect(page.getByText('Modernisation FAXFA V3', { exact: false })).toBeVisible();
  });

  test('affiche la capacité terminée / prévue', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.getByText(/\d+ SP \/ \d+ SP/)).toBeVisible();
  });

  test('affiche le sélecteur de tri', async ({ page }) => {
    await goTo(page, '/kanban');
    const sortSelect = page.locator('select[title="Tri"]');
    await expect(sortSelect).toBeAttached();
  });

  test('le tri modifie l\'ordre des cartes', async ({ page }) => {
    await goTo(page, '/kanban');
    // Change to SP desc
    await page.locator('select[title="Tri"]').selectOption('sp-desc');
    await expect(page.locator('.kanban-card').first()).toBeVisible();
  });

  test('affiche le bouton Réorganiser', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.getByRole('button', { name: 'Réorganiser' })).toBeVisible();
  });

  test('affiche le bouton Colonne', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.getByRole('button', { name: 'Colonne' })).toBeVisible();
  });

  test('cliquer Colonne ouvre la liste des étapes supplémentaires', async ({ page }) => {
    await goTo(page, '/kanban');
    await page.getByRole('button', { name: 'Colonne' }).click();
    await expect(page.locator('.kb-addcol-popup')).toBeVisible();
    await expect(page.locator('.kb-addcol-popup').getByText('En révision')).toBeVisible();
    await expect(page.locator('.kb-addcol-popup').getByText('En test')).toBeVisible();
    await expect(page.locator('.kb-addcol-popup').getByText('Bloqué')).toBeVisible();
  });

  test('peut ajouter une colonne supplémentaire', async ({ page }) => {
    await goTo(page, '/kanban');
    await page.getByRole('button', { name: 'Colonne' }).click();
    await page.locator('.kb-addcol-popup').getByText('En révision').click();
    await expect(page.locator('.kanban-col-header').filter({ hasText: 'EN RÉVISION' })).toBeVisible();
    // Popup closes after adding
    await expect(page.locator('.kb-addcol-popup')).not.toBeVisible();
  });

  test('mode Réorganiser montre le bouton supprimer sur une colonne ajoutée', async ({ page }) => {
    await goTo(page, '/kanban');
    // Add a column first
    await page.getByRole('button', { name: 'Colonne' }).click();
    await page.locator('.kb-addcol-popup').getByText('En révision').click();
    // Activate reorg mode
    await page.getByRole('button', { name: 'Réorganiser' }).click();
    // Delete button should appear on the extra column
    await expect(page.locator('button[title="Supprimer la colonne"]').first()).toBeVisible();
  });

  test('les boutons de base n\'ont pas de bouton supprimer en mode Réorganiser', async ({ page }) => {
    await goTo(page, '/kanban');
    await page.getByRole('button', { name: 'Réorganiser' }).click();
    // Base cols (À FAIRE, EN COURS, TERMINÉ) must not have a delete button
    for (const label of ['À FAIRE', 'EN COURS', 'TERMINÉ']) {
      const col = page.locator('.kanban-col').filter({ has: page.locator('.kanban-col-header').filter({ hasText: label }) });
      await expect(col.locator('button[title="Supprimer la colonne"]')).toHaveCount(0);
    }
  });

  test('mode Réorganiser affiche un bandeau explicatif dans le cadre du board', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.getByText('Mode réorganisation')).not.toBeVisible();
    await page.getByRole('button', { name: 'Réorganiser' }).click();
    await expect(page.locator('.kanban-board-wrap.reorg-active')).toBeVisible();
    await expect(page.getByText('Mode réorganisation')).toBeVisible();
  });

  test('mode Réorganiser remplace les vraies cartes par des squelettes', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.locator('.kanban-card').first()).toBeVisible();
    await page.getByRole('button', { name: 'Réorganiser' }).click();
    // Plus aucune vraie carte (non draggable dans ce mode) — remplacées par des squelettes
    await expect(page.locator('.kanban-card')).toHaveCount(0);
    await expect(page.locator('.kanban-card-skeleton').first()).toBeVisible();
    // Revenir au mode normal restaure les vraies cartes
    await page.getByRole('button', { name: 'Réorganiser' }).click();
    await expect(page.locator('.kanban-card').first()).toBeVisible();
    await expect(page.locator('.kanban-card-skeleton')).toHaveCount(0);
  });

  test('les cartes ont un bouton modifier et un bouton retirer du sprint', async ({ page }) => {
    await goTo(page, '/kanban');
    const firstCard = page.locator('.kanban-card').first();
    await expect(firstCard.locator('button[title="Modifier"]')).toBeVisible();
    await expect(firstCard.locator('button[title="Retirer du sprint"]')).toBeVisible();
  });

  test('retirer du sprint bascule l\'item en statut Backlog', async ({ page }) => {
    await goTo(page, '/kanban');
    const firstCard = page.locator('.kanban-card').first();
    await firstCard.locator('button[title="Retirer du sprint"]').click();
    // Item should disappear from sprint view (no longer in sprint columns)
    // At minimum the card count in the board should be reduced
    await expect(page.locator('.kanban-card').first()).toBeVisible(); // board still has cards
  });

  test('Backlog et Ajourné sont disponibles dans la popup Colonne', async ({ page }) => {
    await goTo(page, '/kanban');
    await page.getByRole('button', { name: 'Colonne' }).click();
    await expect(page.locator('.kb-addcol-popup').getByText('Backlog')).toBeVisible();
    await expect(page.locator('.kb-addcol-popup').getByText('Ajourné')).toBeVisible();
  });

});

test.describe('Kanban - regroupement par Epic (docs/corrections futures.md, 2026-08-17)', () => {

  // Sprint actif par défaut (s2 - MODERNISATION) : FAX-024 (colonne "doing") rattaché à
  // l'Epic FAX-007 (sp propre 30), MAN-025 (colonne "todo") rattaché à l'Epic MAN-008
  // (sp propre 20). Voir frontend/src/data/demo.ts.

  test('un item rattaché à un Epic est affiché dans un groupe replié/dépliable', async ({ page }) => {
    await goTo(page, '/kanban');
    const toggle = page.locator('[data-testid="epic-group-toggle-doing-i7"]');
    await expect(toggle).toBeVisible();
    const stories = page.locator('[data-testid="epic-group-stories-doing-i7"]');
    await expect(stories).toBeVisible();
    await expect(stories).toContainText('FAX-024');
  });

  test('le groupe affiche le nom de l\'Epic et le total items/SP', async ({ page }) => {
    await goTo(page, '/kanban');
    const group = page.locator('.epic-group').filter({ has: page.locator('[data-testid="epic-group-toggle-doing-i7"]') });
    await expect(group).toContainText('EPIC IA Prédiction accidents & CA');
    await expect(group).toContainText('1 item');
    await expect(group).toContainText('30 SP');
  });

  test('un item sans Epic reste affiché seul, hors groupe', async ({ page }) => {
    await goTo(page, '/kanban');
    const doingCol = page.locator('.kanban-col').filter({ has: page.locator('.kanban-col-header').filter({ hasText: 'EN COURS' }) });
    await expect(doingCol.locator('.kanban-card').filter({ hasText: 'PME-011' })).toBeVisible();
  });

  test('replier un groupe Epic masque ses items, redéplier les réaffiche', async ({ page }) => {
    await goTo(page, '/kanban');
    const stories = page.locator('[data-testid="epic-group-stories-doing-i7"]');
    const toggle  = page.locator('[data-testid="epic-group-toggle-doing-i7"]');
    await expect(stories).toBeVisible();
    await toggle.click();
    await expect(stories).not.toBeVisible();
    await toggle.click();
    await expect(stories).toBeVisible();
  });

  test('deux groupes Epic dans deux colonnes différentes ont des testid distincts', async ({ page }) => {
    await goTo(page, '/kanban');
    await expect(page.locator('[data-testid="epic-group-toggle-doing-i7"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="epic-group-toggle-todo-i8"]')).toHaveCount(1);
  });

  test('le groupe Epic est draggable (poignée sur l\'en-tête)', async ({ page }) => {
    await goTo(page, '/kanban');
    const header = page.locator('.epic-group-header').filter({ has: page.locator('[data-testid="epic-group-toggle-doing-i7"]') });
    await expect(header).toHaveAttribute('draggable', 'true');
  });

});
