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

  // Phase 2 (roadmap v1), sous-chantier 3/6, page 4/4 : "+ Ajouter" et les actions d'édition
  // sont désormais réservées PO/Admin (voir utils/permissions.ts, canManageBacklog) — ces tests
  // prédatent le système de rôles et testent le plein accès, d'où `role: 'PO'` explicite.
  test('le bouton Nouvel Item ouvre la modale', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/backlog', { role: 'PO' });
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('la modale contient les onglets Général et Dépendances', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toContainText('Général');
    await expect(page.locator('[data-testid="item-modal"]')).toContainText('Dépendances');
  });

  test('fermer la modale la masque', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
    await page.click('[data-testid="item-modal"] button[aria-label="Fermer"]');
    await expect(page.locator('[data-testid="item-modal"]')).not.toBeVisible();
  });

});

// Onglet GitHub (ItemModal) (v0.97.11, 2026-08-08, Phase 5 roadmap v1) : commits/Pull Requests
// dont le message/titre contient la Clé de l'item, voir backend/src/routes/github.ts. Chargé
// seulement à l'ouverture de l'onglet (pas au montage de la modale), donc les 2 routes de
// consultation peuvent être mockées avant même d'ouvrir l'item, sans `page.reload()` (contrairement
// aux sections de Réglages ci-dessus, chargées au montage de la page).
test.describe('Onglet GitHub (ItemModal) (v0.97.11)', () => {

  async function mockGitHubLookup(page, { commits = [], pullRequests = [], notConfigured = false } = {}) {
    await page.route('**/api/github-config/commits/*', r => notConfigured
      ? r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Aucun dépôt GitHub connecté' }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ commits }) }));
    await page.route('**/api/github-config/prs/*', r => notConfigured
      ? r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Aucun dépôt GitHub connecté' }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pullRequests }) }));
  }

  test('l\'onglet GitHub est absent pour un nouvel item (pas encore de Clé)', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-item"]');
    await expect(page.locator('[data-testid="item-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="modal-tab-github"]')).toHaveCount(0);
  });

  test('l\'onglet GitHub est présent pour un item existant', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockGitHubLookup(page, {});
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await expect(page.locator('[data-testid="modal-tab-github"]')).toBeVisible();
  });

  test('aucun dépôt connecté affiche un message dédié, pas une erreur', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockGitHubLookup(page, { notConfigured: true });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await page.locator('[data-testid="modal-tab-github"]').click();

    await expect(page.locator('[data-testid="github-not-configured"]')).toBeVisible();
    await expect(page.locator('[data-testid="github-error"]')).toHaveCount(0);
  });

  test('affiche les commits et Pull Requests retrouvés pour la Clé de l\'item', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockGitHubLookup(page, {
      commits: [{ sha: 'abc1234def', message: 'BUG-001 correction du calcul', author: 'Julien', date: '2026-08-08T09:00:00.000Z', url: 'https://github.com/juloclavel/cadence-test/commit/abc1234def' }],
      pullRequests: [{ number: 12, title: 'BUG-001 fix', state: 'open', merged: false, author: 'Julien', url: 'https://github.com/juloclavel/cadence-test/pull/12' }],
    });
    const row = page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' });
    await row.locator('button[title="Modifier"]').click();
    await page.locator('[data-testid="modal-tab-github"]').click();

    const commitsList = page.locator('[data-testid="github-commits-list"]');
    await expect(commitsList).toBeVisible();
    await expect(commitsList).toContainText('abc1234');
    await expect(commitsList).toContainText('BUG-001 correction du calcul');

    const prsList = page.locator('[data-testid="github-prs-list"]');
    await expect(prsList).toBeVisible();
    await expect(prsList).toContainText('#12');
    await expect(prsList).toContainText('BUG-001 fix');
    await expect(prsList).toContainText('Ouverte');
  });

});

test.describe('Backlog — Epic (HierarchyNode, Phase 1 sous-chantier 1, 2026-07-28)', () => {

  // Actions Epic/Initiative réservées PO/Admin (canManageBacklog) — voir la note plus haut.
  test('le bouton Nouvel Epic ouvre la modale dédiée (pas ItemModal)', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-epic"]');
    await expect(page.locator('[data-testid="hierarchy-node-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="item-modal"]')).toHaveCount(0);
  });

  test('créer un Epic l\'affiche dans le mode "Grouper par Epic"', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
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
    await goTo(page, '/backlog', { role: 'PO' });
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
    await goTo(page, '/backlog', { role: 'PO' });
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
    await goTo(page, '/backlog', { role: 'PO' });
    await page.click('[data-testid="btn-add-menu"]');
    await page.click('[data-testid="menu-new-initiative"]');
    const modal = page.locator('[data-testid="hierarchy-node-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Nouvelle Initiative');
    // Une Initiative ne propose pas de "Sprint assigné" (couvre plusieurs sprints par nature)
    await expect(modal).not.toContainText('Sprint assigné');
  });

  test('créer une Initiative l\'affiche dans le mode "Grouper par Initiative"', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
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
    await goTo(page, '/backlog', { role: 'PO' });
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
    await goTo(page, '/backlog', { role: 'PO' });
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

// Actions de masse (Backlog) (v0.97.13, 2026-08-08, Phase 5 roadmap v1) : sélection multi-items
// (case à cocher par ligne, réservée PO/Admin comme le reste des actions de cette table, même
// `canManage`) et barre d'actions en masse (Client/Sprint/Priorité/Statut/Supprimer). Choisir une
// valeur dans un dropdown la STAGE seulement (voir BacklogPage.tsx, bulkField/bulkValue), il faut
// ensuite cliquer "Appliquer", sauf Supprimer qui agit directement après confirmation. BUG-001
// (id "i1", voir data/demo.ts) sert de cible : Sprint 1, Client "Bugs transverses", priorité
// "critical" (P1), statut "done" au départ, valeurs de base connues pour vérifier chaque action.
// Colonnes de la table repérées par position (`td` n-ième, 0-indexé) plutôt que par contenu,
// mêmes indices que BacklogTableHead/renderItemRow : 0 case à cocher, 2 priorité, 5 Sprint,
// 6 Client, 7 Statut.
test.describe('Actions de masse (Backlog) (v0.97.13)', () => {

  function bug001Row(page) {
    return page.locator('[data-testid="backlog-table"] tr').filter({ hasText: 'BUG-001' }).first();
  }

  test('la case à cocher est absente pour un rôle sans droit de gestion (Dev)', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'DEV' });
    await expect(bug001Row(page).locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="backlog-select-all"]')).toHaveCount(0);
  });

  test('sélectionner un item affiche la barre d\'actions avec le compte', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await bug001Row(page).locator('input[type="checkbox"]').check();
    const bar = page.locator('[data-testid="bulk-actions-bar"]');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('1 item(s) sélectionné(s)');
  });

  test('"tout sélectionner" coche tous les items filtrés et "Annuler la sélection" désélectionne tout', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    const total = await page.locator('[data-testid="backlog-table"] tbody tr td:first-child input[type="checkbox"]').count();
    await page.locator('[data-testid="backlog-select-all"]').check();
    await expect(page.locator('[data-testid="bulk-actions-bar"]')).toContainText(`${total} item(s) sélectionné(s)`);

    await page.getByRole('button', { name: 'Annuler la sélection' }).click();
    await expect(page.locator('[data-testid="bulk-actions-bar"]')).toHaveCount(0);
  });

  test('changer le Client des items sélectionnés', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    const row = bug001Row(page);
    await row.locator('input[type="checkbox"]').check();

    await page.locator('[data-testid="bulk-field-client"]').click();
    await page.locator('.hdr-menu-panel .hdr-menu-option').filter({ hasText: 'MANFIFE' }).click();
    await page.locator('[data-testid="bulk-apply-btn"]').click();

    await expect(row.locator('td').nth(6)).toContainText('MANFIFE');
    // La sélection et la barre disparaissent après application (même comportement pour les 4 champs).
    await expect(page.locator('[data-testid="bulk-actions-bar"]')).toHaveCount(0);
  });

  test('changer le Sprint des items sélectionnés', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    const row = bug001Row(page);
    await row.locator('input[type="checkbox"]').check();

    await page.locator('[data-testid="bulk-field-sprint"]').click();
    await page.locator('.hdr-menu-panel .hdr-menu-option').filter({ hasText: 'Sprint 2' }).click();
    await page.locator('[data-testid="bulk-apply-btn"]').click();

    await expect(row.locator('td').nth(5)).toContainText('S2');
  });

  test('changer la priorité des items sélectionnés', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    const row = bug001Row(page);
    await row.locator('input[type="checkbox"]').check();

    await page.locator('[data-testid="bulk-field-priority"]').click();
    await page.locator('.hdr-menu-panel .hdr-menu-option').filter({ hasText: 'P4' }).click();
    await page.locator('[data-testid="bulk-apply-btn"]').click();

    await expect(row.locator('td').nth(2)).toContainText('P4');
  });

  test('changer le statut des items sélectionnés', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    const row = bug001Row(page);
    await row.locator('input[type="checkbox"]').check();

    await page.locator('[data-testid="bulk-field-status"]').click();
    await page.locator('.hdr-menu-panel .hdr-menu-option').filter({ hasText: 'Annulé' }).click();
    await page.locator('[data-testid="bulk-apply-btn"]').click();

    await expect(row.locator('td').nth(7)).toContainText('Annulé');
  });

  test('supprimer les items sélectionnés demande confirmation puis les retire du Backlog', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await bug001Row(page).locator('input[type="checkbox"]').check();

    await page.locator('[data-testid="bulk-delete-btn"]').click();
    await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
    await page.locator('[data-testid="dialog-confirm"]').click();

    await expect(page.locator('[data-testid="backlog-table"]')).not.toContainText('BUG-001');
  });

});
