const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Vision Board — Page /vision (v0.88)', () => {

  test('la page Vision se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/vision');
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('le header affiche "Vision Board"', async ({ page }) => {
    await goTo(page, '/vision');
    await expect(page.locator('.app-header')).toContainText('Vision Board');
  });

  test('le champ nom du produit est pré-rempli avec "AutoClaimsTech"', async ({ page }) => {
    await goTo(page, '/vision');
    const input = page.locator('.vb-product-name-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('AutoClaimsTech');
  });

  test('le bouton Vision Board est actif dans le toggle', async ({ page }) => {
    await goTo(page, '/vision');
    const visionBtn = page.locator('.app-header button[title="Vision Board"]');
    await expect(visionBtn).toBeVisible();
  });

  test('le bouton NNL est actif dans le toggle (v0.89 implémenté)', async ({ page }) => {
    await goTo(page, '/vision');
    const nnlBtn = page.locator('[data-testid="btn-toggle-nnl"]');
    await expect(nnlBtn).toBeVisible();
    await expect(nnlBtn).not.toBeDisabled();
  });

  test('le bouton Exporter PDF est présent', async ({ page }) => {
    await goTo(page, '/vision');
    await expect(page.getByRole('button', { name: /Exporter PDF/i })).toBeVisible();
  });

  test('le Vision Board affiche les 5 sections avec leurs titres', async ({ page }) => {
    await goTo(page, '/vision');
    const board = page.locator('.vision-board');
    await expect(board).toBeVisible();
    await expect(board).toContainText('Vision');
    await expect(board).toContainText('Groupe cible');
    await expect(board).toContainText('Besoins');
    await expect(board).toContainText('Produit');
    await expect(board).toContainText('Objectifs business');
  });

  test('les textareas sont pré-remplis avec le contenu AutoClaimsTech', async ({ page }) => {
    await goTo(page, '/vision');
    const textareas = page.locator('.vb-textarea');
    await expect(textareas).toHaveCount(5); // Vision + 4 colonnes
    // La section Vision contient du texte de démo
    const visionTA = textareas.first();
    const value = await visionTA.inputValue();
    expect(value.length).toBeGreaterThan(10);
  });

  test('la grille 4 colonnes est présente', async ({ page }) => {
    await goTo(page, '/vision');
    const grid = page.locator('.vb-grid');
    await expect(grid).toBeVisible();
    // 4 sections dans la grille
    await expect(grid.locator('.vb-section')).toHaveCount(4);
  });

  test('modifier un textarea déclenche la sauvegarde et affiche un toast', async ({ page }) => {
    await goTo(page, '/vision');
    // Modifier la section Vision
    const visionTA = page.locator('.vb-textarea').first();
    await visionTA.click();
    await visionTA.fill('Test de modification Vision Board');
    await visionTA.blur();
    // Toast de confirmation
    const toast = page.locator('[role="status"]').filter({ hasText: /enregistr/i });
    await expect(toast).toBeVisible({ timeout: 2000 });
  });

  test('la page Vision est accessible depuis la sidebar', async ({ page }) => {
    await goTo(page, '/backlog');
    const visionLink = page.locator('.sidebar-nav a[href="/vision"]');
    await expect(visionLink).toBeVisible();
    await visionLink.click();
    await expect(page).toHaveURL(/\/vision/);
    await expect(page.locator('.vision-board')).toBeVisible();
  });

});

test.describe('Now / Next / Later — Vue NNL (v0.89)', () => {

  test('la page se charge en vue NNL sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  test('le bouton toggle NNL est actif (plus disabled)', async ({ page }) => {
    await goTo(page, '/vision');
    const nnlBtn = page.locator('[data-testid="btn-toggle-nnl"]');
    await expect(nnlBtn).toBeVisible();
    await expect(nnlBtn).not.toBeDisabled();
  });

  test('la canvas NNL est visible après activation du toggle', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await expect(page.locator('[data-testid="nnl-canvas"]')).toBeVisible();
  });

  test('les 8 post-its de démo AutoClaimsTech sont présents', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    const postits = page.locator('[data-testid^="nnl-postit-"]');
    await expect(postits).toHaveCount(8);
  });

  test('les post-its feature et release sont bien distingués (classes CSS)', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await expect(page.locator('.nnl-postit-feature').first()).toBeVisible();
    await expect(page.locator('.nnl-postit-release').first()).toBeVisible();
  });

  test('le bouton "+ Post-it" est visible en vue NNL', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await expect(page.locator('[data-testid="btn-add-postit"]')).toBeVisible();
  });

  test('la modal "+ Post-it" propose Feature et Release (v0.90 — NNLItemModal)', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await page.locator('[data-testid="btn-add-postit"]').click();
    // La NNLItemModal s'ouvre en mode création avec les boutons de type
    await expect(page.locator('[data-testid="menu-add-feature"]')).toBeVisible();
    await expect(page.locator('[data-testid="menu-add-release"]')).toBeVisible();
  });

  test('ajouter un post-it Feature augmente le nombre de post-its', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    const before = await page.locator('[data-testid^="nnl-postit-"]').count();
    await page.locator('[data-testid="btn-add-postit"]').click();
    // Sélectionner Feature (déjà sélectionné par défaut), puis valider
    await page.locator('[data-testid="menu-add-feature"]').click();
    await page.locator('[data-testid="nnl-modal-submit"]').click();
    await page.waitForTimeout(200);
    const after = await page.locator('[data-testid^="nnl-postit-"]').count();
    expect(after).toBe(before + 1);
  });

  test('ajouter un post-it Release augmente le nombre de post-its', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    const before = await page.locator('[data-testid^="nnl-postit-"]').count();
    await page.locator('[data-testid="btn-add-postit"]').click();
    // Sélectionner Release puis valider
    await page.locator('[data-testid="menu-add-release"]').click();
    await page.locator('[data-testid="nnl-modal-submit"]').click();
    await page.waitForTimeout(200);
    const after = await page.locator('[data-testid^="nnl-postit-"]').count();
    expect(after).toBe(before + 1);
  });

  test('double-clic sur un post-it ouvre la modal de détail (v0.90)', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    const postit = page.locator('[data-testid^="nnl-postit-"]').first();
    await postit.dblclick();
    // La NNLItemModal s'ouvre en mode édition
    await expect(page.locator('[data-testid="nnl-modal-submit"]')).toBeVisible();
  });

  test('supprimer un post-it diminue le nombre de post-its', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    const before = await page.locator('[data-testid^="nnl-postit-"]').count();
    // Hover pour faire apparaître le bouton ×
    const postit = page.locator('[data-testid^="nnl-postit-"]').first();
    await postit.hover();
    await postit.locator('button[title="Supprimer"]').click();
    await page.waitForTimeout(200);
    const after = await page.locator('[data-testid^="nnl-postit-"]').count();
    expect(after).toBe(before - 1);
  });

  test('repasser en vue Vision Board masque la canvas NNL', async ({ page }) => {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await expect(page.locator('[data-testid="nnl-canvas"]')).toBeVisible();
    // Retour sur Vision Board
    await page.locator('.app-header button[title="Vision Board"]').click();
    await expect(page.locator('[data-testid="nnl-canvas"]')).toHaveCount(0);
    await expect(page.locator('.vision-board')).toBeVisible();
  });

});

test.describe('v0.90 — NNL enrichissements', () => {

  async function goToNNL(page) {
    await goTo(page, '/vision');
    await page.locator('[data-testid="btn-toggle-nnl"]').click();
    await expect(page.locator('[data-testid="nnl-canvas"]')).toBeVisible();
  }

  test('la barre d\'outils NNL est visible', async ({ page }) => {
    await goToNNL(page);
    await expect(page.locator('[data-testid="nnl-toolbar"]')).toBeVisible();
  });

  test('les 8 outils de la barre NNL sont présents', async ({ page }) => {
    await goToNNL(page);
    // Rectangle/Ellipse regroupés dans "Formes" (v0.92.9) et outil "Cadre" ajouté (v0.92.10,
    // sous-chantier 6 point 3) — liste mise à jour en conséquence (voir aussi tests/nnl.spec.js).
    const tools = ['select', 'shapes', 'frame', 'arrow', 'text', 'pen', 'marker', 'eraser'];
    for (const t of tools) {
      await expect(page.locator(`[data-testid="nnl-tool-${t}"]`)).toBeVisible();
    }
  });

  test('le panneau Calques est visible', async ({ page }) => {
    await goToNNL(page);
    await expect(page.locator('[data-testid="nnl-layers-panel"]')).toBeVisible();
  });

  test('la modal NNLItemModal contient les 3 onglets', async ({ page }) => {
    await goToNNL(page);
    await page.locator('[data-testid="btn-add-postit"]').click();
    // Général est le premier onglet (actif par défaut)
    await expect(page.locator('.modal-tab-btn').filter({ hasText: 'Général' })).toBeVisible();
    await expect(page.locator('.modal-tab-btn').filter({ hasText: 'Notes' })).toBeVisible();
    await expect(page.locator('.modal-tab-btn').filter({ hasText: 'Rattachement' })).toBeVisible();
  });

  test('la modal dispose des 3 modes d\'affichage (fenêtre, volet, plein écran)', async ({ page }) => {
    await goToNNL(page);
    await page.locator('[data-testid="btn-add-postit"]').click();
    // Les 3 boutons view switcher sont présents dans le header
    await expect(page.locator('.modal-header .btn-icon')).toHaveCount(3 + 1); // 3 views + fermer
  });

  test('fermer la modal via Annuler ne crée pas de post-it', async ({ page }) => {
    await goToNNL(page);
    const before = await page.locator('[data-testid^="nnl-postit-"]').count();
    await page.locator('[data-testid="btn-add-postit"]').click();
    await page.locator('.modal-footer .btn-secondary').click();
    await page.waitForTimeout(150);
    const after = await page.locator('[data-testid^="nnl-postit-"]').count();
    expect(after).toBe(before);
  });

  test('la modal de détail s\'ouvre en édition et le bouton est "Enregistrer"', async ({ page }) => {
    await goToNNL(page);
    const postit = page.locator('[data-testid^="nnl-postit-"]').first();
    await postit.dblclick();
    await expect(page.locator('[data-testid="nnl-modal-submit"]')).toContainText('Enregistrer');
  });

  test('la modal de création a le bouton "Créer"', async ({ page }) => {
    await goToNNL(page);
    await page.locator('[data-testid="btn-add-postit"]').click();
    await expect(page.locator('[data-testid="nnl-modal-submit"]')).toContainText('Créer');
  });

  test('le sélecteur de couleur est présent dans la modal', async ({ page }) => {
    await goToNNL(page);
    await page.locator('[data-testid="btn-add-postit"]').click();
    await expect(page.locator('input[type="color"]')).toBeVisible();
  });

  test('l\'onglet Notes permet d\'ajouter du texte', async ({ page }) => {
    await goToNNL(page);
    await page.locator('[data-testid="btn-add-postit"]').click();
    await page.locator('.modal-tab-btn').filter({ hasText: 'Notes' }).click();
    const noteArea = page.locator('textarea[placeholder*="note"]');
    await expect(noteArea).toBeVisible();
  });

  test('l\'onglet Rattachement affiche la recherche d\'items', async ({ page }) => {
    await goToNNL(page);
    await page.locator('[data-testid="btn-add-postit"]').click();
    await page.locator('.modal-tab-btn').filter({ hasText: 'Rattachement' }).click();
    await expect(page.locator('input[placeholder*="lé"]')).toBeVisible();
  });

  test('les post-its affichent une couleur de fond', async ({ page }) => {
    await goToNNL(page);
    // Le premier post-it doit avoir un backgroundColor non transparent (fond couleur complet)
    const postit = page.locator('[data-testid^="nnl-postit-"]').first();
    await expect(postit).toBeVisible();
    const bg = await postit.evaluate(el => window.getComputedStyle(el).backgroundColor);
    // La couleur ne doit pas être transparente
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('transparent');
  });

  test('la minimap reste en bas à droite', async ({ page }) => {
    await goToNNL(page);
    const mm = page.locator('.nnl-minimap');
    await expect(mm).toBeVisible();
    const box = await mm.boundingBox();
    const vp = page.viewportSize();
    expect(box.x + box.width).toBeCloseTo(vp.width - 14, 0);
  });

});
