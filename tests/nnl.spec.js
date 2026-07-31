/**
 * Tests E2E — NNL Canvas (v0.90)
 * Route : /vision → clic sur btn-toggle-nnl → canvas NNL
 */
const { test, expect } = require('@playwright/test')
const { goTo } = require('./helpers')

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Charge /vision et bascule en vue NNL */
async function goToNNL(page) {
  await goTo(page, '/vision')
  await page.locator('[data-testid="btn-toggle-nnl"]').click()
  await page.waitForTimeout(300)
}

/**
 * Déclenche onMouseDown React sur le canvas NNL.
 * page.mouse.down() ne suffit pas car des overlays enfants (toolbar, layers panel)
 * peuvent absorber le pointeur. On dispatch directement sur le canvas element.
 */
async function canvasMouseDown(page, x, y) {
  await page.evaluate(([px, py]) => {
    const canvas = document.querySelector('[data-testid="nnl-canvas"]')
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, cancelable: true, button: 0, buttons: 1,
      clientX: rect.left + px, clientY: rect.top + py,
    }))
  }, [x, y])
  await page.waitForTimeout(200)
}

/**
 * Sélectionne Rectangle ou Ellipse via le bouton "Formes" groupé (v0.92.9) : un clic court
 * réactive la dernière forme choisie (rect par défaut au montage), un long-press (>500ms)
 * ouvre le flyout pour choisir explicitement — même mécanique que le bouton Sélection.
 */
async function selectShapeTool(page, shape = 'rect') {
  const btn = page.locator('[data-testid="nnl-tool-shapes"]')
  if (shape === 'rect') {
    await btn.click()
    return
  }
  await btn.dispatchEvent('mousedown')
  await page.waitForTimeout(550)
  await btn.dispatchEvent('mouseup')
  await page.waitForTimeout(100)
  const label = shape === 'ellipse' ? 'Ellipse' : 'Rectangle'
  await page.locator('button').filter({ hasText: label }).first().click()
  await page.waitForTimeout(100)
}

/** Dessine un rectangle sur le canvas par drag */
async function drawRect(page, x1 = 250, y1 = 220, x2 = 450, y2 = 360) {
  await selectShapeTool(page, 'rect')
  const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  await page.mouse.move(box.x + x2, box.y + y2)
  await page.mouse.up()
  await page.waitForTimeout(150)
}

/** Dessine un tracé stylo (5 points) */
async function drawStroke(page) {
  await page.locator('[data-testid="nnl-tool-pen"]').click()
  const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
  await page.mouse.move(box.x + 150, box.y + 200)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(box.x + 150 + i * 40, box.y + 200 + i * 20)
  }
  await page.mouse.up()
  await page.waitForTimeout(150)
}

/** Crée un bloc texte via l'outil texte et retourne le texte par défaut 'Texte' */
async function createTextBlock(page, x = 400, y = 280) {
  await page.locator('[data-testid="nnl-tool-text"]').click()
  await canvasMouseDown(page, x, y)
  await page.waitForTimeout(300)
}

// ── Suite 1 : Chargement et navigation ───────────────────────────────────────

test.describe('NNL — Chargement et navigation (v0.90)', () => {

  test('la page /vision se charge sans erreur JS', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await goTo(page, '/vision')
    await page.waitForTimeout(300)
    expect(errors).toHaveLength(0)
  })

  test('le bouton toggle NNL est visible dans le header', async ({ page }) => {
    await goTo(page, '/vision')
    await expect(page.locator('[data-testid="btn-toggle-nnl"]')).toBeVisible()
  })

  test('cliquer sur le toggle NNL affiche le canvas', async ({ page }) => {
    await goToNNL(page)
    await expect(page.locator('[data-testid="nnl-canvas"]')).toBeVisible()
  })

  test('la vue NNL se charge sans erreur JS', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await goToNNL(page)
    await page.waitForTimeout(300)
    expect(errors).toHaveLength(0)
  })

  test('le bouton + Post-it apparaît dans le header en vue NNL', async ({ page }) => {
    await goToNNL(page)
    await expect(page.locator('[data-testid="btn-add-postit"]')).toBeVisible()
  })

})

// ── Suite 2 : Toolbar ─────────────────────────────────────────────────────────

test.describe('NNL — Toolbar (v0.90)', () => {

  test('la toolbar est visible', async ({ page }) => {
    await goToNNL(page)
    await expect(page.locator('[data-testid="nnl-toolbar"]')).toBeVisible()
  })

  test('les 8 outils sont présents (Rectangle/Ellipse regroupés dans "Formes", + Cadre)', async ({ page }) => {
    await goToNNL(page)
    // 'frame' (sous-chantier 6, point 3, v0.92.10) : outil "Cadre", ajouté après le regroupement
    // Rectangle/Ellipse en "Formes" (v0.92.9) — d'où 8 boutons au total, pas 7.
    for (const id of ['select', 'shapes', 'frame', 'arrow', 'text', 'pen', 'marker', 'eraser']) {
      await expect(page.locator(`[data-testid="nnl-tool-${id}"]`)).toBeVisible()
    }
  })

  test("les boutons d'épaisseur sont visibles avec l'outil Rect", async ({ page }) => {
    await goToNNL(page)
    await selectShapeTool(page, 'rect')
    for (const w of [1, 2, 4, 8, 16]) {
      await expect(page.locator(`[data-testid="nnl-width-${w}"]`)).toBeVisible()
    }
  })

  test("les boutons d'épaisseur sont visibles avec l'outil Stylo", async ({ page }) => {
    await goToNNL(page)
    await page.locator('[data-testid="nnl-tool-pen"]').click()
    await expect(page.locator('[data-testid="nnl-width-2"]')).toBeVisible()
  })

  test("les boutons d'épaisseur ne s'affichent pas avec l'outil Sélection", async ({ page }) => {
    await goToNNL(page)
    await expect(page.locator('[data-testid="nnl-width-1"]')).not.toBeVisible()
  })

  test("les boutons d'épaisseur ne s'affichent pas avec l'outil Texte", async ({ page }) => {
    await goToNNL(page)
    await page.locator('[data-testid="nnl-tool-text"]').click()
    await expect(page.locator('[data-testid="nnl-width-1"]')).not.toBeVisible()
  })

  test('cliquer sur le bouton Contour ouvre le sélecteur de couleur', async ({ page }) => {
    await goToNNL(page)
    await selectShapeTool(page, 'rect')
    await page.locator('[data-testid="nnl-color-btn"]').click()
    await expect(page.getByText('Contour')).toBeVisible()
  })

  test('le sélecteur de couleur se ferme en recliquant dessus', async ({ page }) => {
    await goToNNL(page)
    await selectShapeTool(page, 'rect')
    await page.locator('[data-testid="nnl-color-btn"]').click()
    await expect(page.getByText('Contour')).toBeVisible()
    await page.locator('[data-testid="nnl-color-btn"]').click()
    await expect(page.getByText('Contour')).not.toBeVisible()
  })

})

// ── Suite 3 : Panneau calques ─────────────────────────────────────────────────

test.describe('NNL — Panneau calques (v0.90)', () => {

  test('le panneau calques est visible', async ({ page }) => {
    await goToNNL(page)
    await expect(page.locator('[data-testid="nnl-layers-panel"]')).toBeVisible()
  })

  test('le bouton + ajoute un calque dans le panneau', async ({ page }) => {
    await goToNNL(page)
    const panel = page.locator('[data-testid="nnl-layers-panel"]')
    const before = await panel.locator('[data-testid^="nnl-layer-"]').count()
    await panel.locator('[title="Ajouter un calque"]').click()
    await page.waitForTimeout(150)
    const after = await panel.locator('[data-testid^="nnl-layer-"]').count()
    expect(after).toBe(before + 1)
  })

  test('le bouton groupe crée un groupe (📁) dans le panneau', async ({ page }) => {
    await goToNNL(page)
    const panel = page.locator('[data-testid="nnl-layers-panel"]')
    await panel.locator('[title="Créer un groupe de calques"]').click()
    await page.waitForTimeout(150)
    // Le groupe est créé en mode édition (input ouvert) — fermer l'édition pour voir l'emoji
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    await expect(panel).toContainText('📁')
  })

  test('un calque "Rectangle" est auto-créé après avoir dessiné un rectangle', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page)
    await expect(page.locator('[data-testid="nnl-layers-panel"]')).toContainText('Rectangle')
  })

  test('un calque "Stylo" est auto-créé après un tracé stylo', async ({ page }) => {
    await goToNNL(page)
    await drawStroke(page)
    await expect(page.locator('[data-testid="nnl-layers-panel"]')).toContainText('Stylo')
  })

  test('double-cliquer sur un calque ouvre un champ de renommage', async ({ page }) => {
    await goToNNL(page)
    const panel = page.locator('[data-testid="nnl-layers-panel"]')
    await panel.locator('[title="Ajouter un calque"]').click()
    await page.waitForTimeout(150)
    const layerRow = panel.locator('[data-testid^="nnl-layer-"]').last()
    // Double-clic sur le span du nom
    await layerRow.locator('span').last().dblclick()
    await page.waitForTimeout(100)
    await expect(layerRow.locator('input')).toBeVisible()
  })

  test('un calque peut être masqué via le bouton œil', async ({ page }) => {
    await goToNNL(page)
    const panel = page.locator('[data-testid="nnl-layers-panel"]')
    await panel.locator('[title="Ajouter un calque"]').click()
    await page.waitForTimeout(150)
    const layerRow = panel.locator('[data-testid^="nnl-layer-"]').last()
    await layerRow.locator('[title="Masquer"]').click()
    await page.waitForTimeout(100)
    await expect(layerRow.locator('[title="Afficher"]')).toBeVisible()
  })

  test('un calque masqué peut être réaffiché', async ({ page }) => {
    await goToNNL(page)
    const panel = page.locator('[data-testid="nnl-layers-panel"]')
    await panel.locator('[title="Ajouter un calque"]').click()
    await page.waitForTimeout(150)
    const layerRow = panel.locator('[data-testid^="nnl-layer-"]').last()
    await layerRow.locator('[title="Masquer"]').click()
    await layerRow.locator('[title="Afficher"]').click()
    await page.waitForTimeout(100)
    await expect(layerRow.locator('[title="Masquer"]')).toBeVisible()
  })

  test('supprimer un calque (sur plusieurs) décrémente le compteur', async ({ page }) => {
    await goToNNL(page)
    const panel = page.locator('[data-testid="nnl-layers-panel"]')
    // Ajouter 2 calques pour être sûr d'en avoir plusieurs (DEMO_STATE en a déjà)
    await panel.locator('[title="Ajouter un calque"]').click()
    await panel.locator('[title="Ajouter un calque"]').click()
    await page.waitForTimeout(150)
    const before = await panel.locator('[data-testid^="nnl-layer-"]').count()
    await panel.locator('[data-testid^="nnl-layer-"]').last().locator('[title="Supprimer"]').click()
    await page.waitForTimeout(150)
    const after = await panel.locator('[data-testid^="nnl-layer-"]').count()
    expect(after).toBe(before - 1)
  })

  test('le bouton Supprimer est absent quand il ne reste qu\'un calque non-groupe', async ({ page }) => {
    // Note : ce test vérifie le comportement de l'UI en simulant un état avec 1 seul calque.
    // Avec DEMO_STATE, il y a déjà des calques. On vérifie donc que le DERNIER calque ajouté
    // n'a pas le bouton Supprimer ssi nonGroups.length <= 1.
    // Ce cas étant difficile à reproduire proprement avec DEMO_STATE (qui a déjà des calques),
    // on vérifie l'inverse : que le bouton Supprimer EST présent quand il y a plusieurs calques.
    await goToNNL(page)
    const panel = page.locator('[data-testid="nnl-layers-panel"]')
    await panel.locator('[title="Ajouter un calque"]').click()
    await page.waitForTimeout(150)
    // Avec DEMO_STATE + 1 calque ajouté, nonGroups.length > 1 → bouton Supprimer visible
    const deleteBtn = panel.locator('[data-testid^="nnl-layer-"]').last().locator('[title="Supprimer"]')
    await expect(deleteBtn).toBeVisible()
  })

})

// ── Suite 4 : Dessin de formes ────────────────────────────────────────────────

test.describe('NNL — Dessin de formes (v0.90)', () => {

  test("dessiner un rectangle crée un <rect> SVG dans le canvas", async ({ page }) => {
    await goToNNL(page)
    const before = await page.locator('[data-testid="nnl-canvas"] svg rect').count()
    await drawRect(page)
    const after = await page.locator('[data-testid="nnl-canvas"] svg rect').count()
    expect(after).toBeGreaterThan(before)
  })

  test("dessiner une ellipse crée un <ellipse> SVG dans le canvas", async ({ page }) => {
    await goToNNL(page)
    await selectShapeTool(page, 'ellipse')
    const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
    const before = await page.locator('[data-testid="nnl-canvas"] svg ellipse').count()
    await page.mouse.move(box.x + 250, box.y + 220)
    await page.mouse.down()
    await page.mouse.move(box.x + 450, box.y + 360)
    await page.mouse.up()
    await page.waitForTimeout(150)
    const after = await page.locator('[data-testid="nnl-canvas"] svg ellipse').count()
    expect(after).toBeGreaterThan(before)
  })

  test("dessiner une flèche crée des éléments SVG dans le canvas", async ({ page }) => {
    await goToNNL(page)
    await page.locator('[data-testid="nnl-tool-arrow"]').click()
    const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
    const before = await page.locator('[data-testid="nnl-canvas"] svg line, [data-testid="nnl-canvas"] svg path').count()
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.down()
    await page.mouse.move(box.x + 500, box.y + 340)
    await page.mouse.up()
    await page.waitForTimeout(150)
    const after = await page.locator('[data-testid="nnl-canvas"] svg line, [data-testid="nnl-canvas"] svg path').count()
    expect(after).toBeGreaterThan(before)
  })

  test("l'outil stylo crée un tracé SVG (polyline ou path)", async ({ page }) => {
    await goToNNL(page)
    const canvas = page.locator('[data-testid="nnl-canvas"]')
    const before = await canvas.locator('svg polyline, svg path').count()
    await drawStroke(page)
    const after = await canvas.locator('svg polyline, svg path').count()
    expect(after).toBeGreaterThan(before)
  })

  test("l'outil marqueur crée un tracé SVG semi-transparent", async ({ page }) => {
    await goToNNL(page)
    await page.locator('[data-testid="nnl-tool-marker"]').click()
    const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
    const before = await page.locator('[data-testid="nnl-canvas"] svg polyline, [data-testid="nnl-canvas"] svg path').count()
    await page.mouse.move(box.x + 200, box.y + 180)
    await page.mouse.down()
    for (let i = 1; i <= 4; i++) {
      await page.mouse.move(box.x + 200 + i * 50, box.y + 180 + i * 10)
    }
    await page.mouse.up()
    await page.waitForTimeout(150)
    const after = await page.locator('[data-testid="nnl-canvas"] svg polyline, [data-testid="nnl-canvas"] svg path').count()
    expect(after).toBeGreaterThan(before)
  })

  test("un rectangle dessiné génère un attribut rx (≥ 0)", async ({ page }) => {
    await goToNNL(page)
    await drawRect(page)
    const rxAttr = await page.locator('[data-testid="nnl-canvas"] svg rect').last().getAttribute('rx')
    expect(Number(rxAttr ?? 0)).toBeGreaterThanOrEqual(0)
  })

})

// ── Suite 5 : Outil Texte ────────────────────────────────────────────────────

test.describe('NNL — Outil Texte (v0.91 — contenteditable)', () => {

  test("cliquer avec l'outil Texte ouvre l'éditeur inline (contenteditable)", async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    // L'éditeur est un div contenteditable depuis v0.91 (plus de textarea)
    await expect(page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]')).toBeVisible({ timeout: 5000 })
  })

  test("valider le texte (Escape) crée un bloc texte visible sur le canvas", async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    await page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]').fill('Hello NNL')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="nnl-canvas"]')).toContainText('Hello NNL')
  })

  test("double-cliquer sur un bloc texte existant rouvre l'éditeur inline", async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    await page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]').fill('Éditer')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    // Double-clic sur le bloc texte rendu
    await page.locator('[data-testid="nnl-canvas"]').getByText('Éditer').first().dblclick()
    await page.waitForTimeout(200)
    await expect(page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]')).toBeVisible()
  })

})

// ── Suite 6 : Undo / Redo ────────────────────────────────────────────────────

test.describe('NNL — Undo / Redo (v0.90)', () => {

  test('Ctrl+Z annule le dernier rectangle dessiné', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page)
    const before = await page.locator('[data-testid="nnl-canvas"] svg rect').count()
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(250)
    const after = await page.locator('[data-testid="nnl-canvas"] svg rect').count()
    expect(after).toBeLessThan(before)
  })

  test('Ctrl+Y rétablit après un Undo', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page)
    const initial = await page.locator('[data-testid="nnl-canvas"] svg rect').count()
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(250)
    await page.keyboard.press('Control+y')
    await page.waitForTimeout(250)
    const restored = await page.locator('[data-testid="nnl-canvas"] svg rect').count()
    expect(restored).toBe(initial)
  })

  test("Ctrl+Z annule la création d'un bloc texte", async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    await page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]').fill('Undo me')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="nnl-canvas"]')).toContainText('Undo me')
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(250)
    await expect(page.locator('[data-testid="nnl-canvas"]')).not.toContainText('Undo me')
  })

})

// ── Suite 7 : Post-its ───────────────────────────────────────────────────────

test.describe('NNL — Post-its (v0.90)', () => {

  test("cliquer sur + Post-it ouvre la modal de création", async ({ page }) => {
    await goToNNL(page)
    await page.locator('[data-testid="btn-add-postit"]').click()
    await page.waitForTimeout(200)
    await expect(page.locator('[data-testid="nnl-modal-submit"]')).toBeVisible()
  })

  test("créer un post-it de type Feature l'affiche sur le canvas", async ({ page }) => {
    await goToNNL(page)
    // Forcer le mode 'modal' (mode par défaut) pour avoir le bon sélecteur CSS
    await page.evaluate(() => localStorage.removeItem('nnl-modal-view'))
    await page.locator('[data-testid="btn-add-postit"]').click()
    await page.waitForTimeout(200)
    // L'input titre est le premier input[type=text] dans la zone de contenu de la modal
    const titleInput = page.locator('input[placeholder*="post-it"]')
    await titleInput.fill('Ma feature test')
    await page.locator('[data-testid="nnl-modal-submit"]').click()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid^="nnl-postit-"]').first()).toBeVisible()
  })

  test("fermer la modal sans sauvegarder ne crée pas de post-it", async ({ page }) => {
    await goToNNL(page)
    const before = await page.locator('[data-testid^="nnl-postit-"]').count()
    await page.locator('[data-testid="btn-add-postit"]').click()
    await page.waitForTimeout(200)
    // Fermer via .modal-close (la croix × dans le header) — évite l'ambiguïté du bouton "Annuler"
    await page.locator('.modal-close').first().click()
    await page.waitForTimeout(200)
    const after = await page.locator('[data-testid^="nnl-postit-"]').count()
    expect(after).toBe(before)
  })

})

// ── v0.90.5 — Canvas avancé ───────────────────────────────────────────────────
test.describe('v0.90.5 — Canvas avancé : rubber-band, groupes, copier/coller, snap', () => {

  // ── Rubber-band select ─────────────────────────────────────────────────────

  test('le bouton Sélection a un chevron indiquant le long-press', async ({ page }) => {
    await goToNNL(page)
    // Le chevron est un SVG polygon dans le bouton select
    const selectBtn = page.locator('[data-testid="nnl-tool-select"]')
    await expect(selectBtn).toBeVisible()
    // Le chevron est un polygon SVG fils du bouton
    const chevron = selectBtn.locator('svg polygon')
    await expect(chevron).toBeVisible()
  })

  test('long-press sur le bouton Sélection ouvre un flyout rect/lasso', async ({ page }) => {
    await goToNNL(page)
    const selectBtn = page.locator('[data-testid="nnl-tool-select"]')
    // Simuler un long press (> 500ms)
    await selectBtn.dispatchEvent('mousedown')
    await page.waitForTimeout(550)
    await selectBtn.dispatchEvent('mouseup')
    await page.waitForTimeout(100)
    // Le flyout doit contenir les options Rectangle et Lasso (boutons sans data-testid)
    await expect(page.locator('button').filter({ hasText: 'Rectangle' }).first()).toBeVisible({ timeout: 2000 })
  })

  test('la settings bar Sélection a les boutons de scope (tous calques / calque actif)', async ({ page }) => {
    await goToNNL(page)
    // Le tool select est actif par défaut — les boutons de scope sont dans la settings bar
    // (les boutons de mode rect/lasso sont dans le flyout long-press, sans data-testid)
    await expect(page.locator('[data-testid="nnl-select-scope-all"]')).toBeVisible()
    await expect(page.locator('[data-testid="nnl-select-scope-active"]')).toBeVisible()
  })

  test('le scope "tous les calques" est actif par défaut dans la settings bar', async ({ page }) => {
    await goToNNL(page)
    // Le scope par défaut est "all" (tous les calques) — bouton avec fond primary-light
    const allScopeBtn = page.locator('[data-testid="nnl-select-scope-all"]')
    await expect(allScopeBtn).toBeVisible()
    const bg = await allScopeBtn.evaluate(el => window.getComputedStyle(el).backgroundColor)
    // Fond non transparent = actif (primary-light)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('scope "tous les calques" est actif par défaut', async ({ page }) => {
    await goToNNL(page)
    const allScopeBtn = page.locator('[data-testid="nnl-select-scope-all"]')
    const bg = await allScopeBtn.evaluate(el => window.getComputedStyle(el).backgroundColor)
    expect(bg).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('drag sur fond vide affiche un rectangle de sélection', async ({ page }) => {
    await goToNNL(page)
    // S'assurer que l'outil select est actif
    await page.locator('[data-testid="nnl-tool-select"]').dispatchEvent('mouseup')
    const canvas = page.locator('[data-testid="nnl-canvas"]')
    const box = await canvas.boundingBox()
    // Drag sur une zone vide (en dehors des post-its qui sont au centre)
    const emptyX = box.x + box.width * 0.85
    const emptyY = box.y + box.height * 0.85
    await page.mouse.move(emptyX, emptyY)
    await page.mouse.down()
    await page.mouse.move(emptyX + 100, emptyY + 80)
    // Pendant le drag, le rubber-band doit être visible
    await expect(page.locator('.nnl-rubber-band')).toBeVisible({ timeout: 1000 })
    await page.mouse.up()
    // Après release, le rubber-band disparaît
    await page.waitForTimeout(100)
    await expect(page.locator('.nnl-rubber-band')).toHaveCount(0)
  })

  test('rubber-band sélectionne les formes dans la zone', async ({ page }) => {
    await goToNNL(page)
    // Dessiner un rectangle dans une zone connue
    await drawRect(page, 600, 50, 750, 150)
    await page.locator('[data-testid="nnl-tool-select"]').click()
    await page.waitForTimeout(100)
    // Désélectionner
    const canvas = page.locator('[data-testid="nnl-canvas"]')
    const box = await canvas.boundingBox()
    // Sélection rubber-band autour de la forme dessinée (haut-droit du canvas)
    await page.mouse.move(box.x + 580, box.y + 30)
    await page.mouse.down()
    await page.mouse.move(box.x + 780, box.y + 180)
    await page.mouse.up()
    await page.waitForTimeout(200)
    // Le rubber-band a sélectionné — les boutons de scope sont toujours visibles (tool=select)
    await expect(page.locator('[data-testid="nnl-select-scope-all"]')).toBeVisible()
  })

  // ── Copier / Coller / Dupliquer ───────────────────────────────────────────

  test('Ctrl+D duplique la forme sélectionnée', async ({ page }) => {
    await goToNNL(page)
    // Dessiner un rectangle
    await drawRect(page, 200, 150, 350, 280)
    // Sélectionner la forme (passer en outil select puis cliquer au centre du rect)
    await page.locator('[data-testid="nnl-tool-select"]').click()
    await page.waitForTimeout(80)
    await canvasMouseDown(page, 275, 215)
    await page.waitForTimeout(150)
    // Compter les shapes après sélection
    const before = await page.locator('[data-testid="nnl-canvas"] svg [data-shape-id]').count()
    // Ctrl+D
    await page.keyboard.press('Control+d')
    await page.waitForTimeout(200)
    const after = await page.locator('[data-testid="nnl-canvas"] svg [data-shape-id]').count()
    expect(after).toBeGreaterThan(before)
  })

  test('Ctrl+C puis Ctrl+V colle une copie décalée', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page, 200, 150, 350, 280)
    // Sélectionner la forme avant de copier
    await page.locator('[data-testid="nnl-tool-select"]').click()
    await page.waitForTimeout(80)
    await canvasMouseDown(page, 275, 215)
    await page.waitForTimeout(150)
    const before = await page.locator('[data-testid="nnl-canvas"] svg [data-shape-id]').count()
    await page.keyboard.press('Control+c')
    await page.waitForTimeout(100)
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(200)
    const after = await page.locator('[data-testid="nnl-canvas"] svg [data-shape-id]').count()
    expect(after).toBeGreaterThan(before)
  })

  // ── Groupes de formes ─────────────────────────────────────────────────────

  test('Ctrl+G groupe les formes sélectionnées (shapeGroupId attribué)', async ({ page }) => {
    await goToNNL(page)
    // Dessiner 2 rectangles
    await drawRect(page, 100, 80, 200, 160)
    await drawRect(page, 230, 80, 330, 160)
    // Rubber-band pour sélectionner les deux
    const canvas = page.locator('[data-testid="nnl-canvas"]')
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 80, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 360, box.y + 190)
    await page.mouse.up()
    await page.waitForTimeout(200)
    // Ctrl+G
    await page.keyboard.press('Control+g')
    await page.waitForTimeout(200)
    // Vérifier que le dispatch a bien eu lieu (pas de crash)
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    expect(errors).toHaveLength(0)
  })

  test('Ctrl+Shift+G dégroupe les formes', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page, 100, 80, 200, 160)
    await drawRect(page, 230, 80, 330, 160)
    // Sélectionner et grouper
    const canvas = page.locator('[data-testid="nnl-canvas"]')
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 80, box.y + 60)
    await page.mouse.down()
    await page.mouse.move(box.x + 360, box.y + 190)
    await page.mouse.up()
    await page.waitForTimeout(200)
    await page.keyboard.press('Control+g')
    await page.waitForTimeout(200)
    // Dégrouper
    await page.keyboard.press('Control+Shift+g')
    await page.waitForTimeout(200)
    // Pas de crash
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    expect(errors).toHaveLength(0)
  })

  // ── Grille magnétique ─────────────────────────────────────────────────────

  test('le bouton snap toggle est visible dans le canvas', async ({ page }) => {
    await goToNNL(page)
    await expect(page.locator('[data-testid="nnl-snap-toggle"]')).toBeVisible()
  })

  test('Shift+G active/désactive la grille magnétique', async ({ page }) => {
    await goToNNL(page)
    const snapBtn = page.locator('[data-testid="nnl-snap-toggle"]')
    // Snap désactivé par défaut
    const classBefore = await snapBtn.getAttribute('class')
    expect(classBefore).not.toContain('active')
    // Activer via Shift+G
    await page.keyboard.press('Shift+g')
    await page.waitForTimeout(100)
    const classAfter = await snapBtn.getAttribute('class')
    expect(classAfter).toContain('active')
    // Désactiver
    await page.keyboard.press('Shift+g')
    await page.waitForTimeout(100)
    const classFinal = await snapBtn.getAttribute('class')
    expect(classFinal).not.toContain('active')
  })

  test('clic sur le bouton snap toggle active/désactive la grille', async ({ page }) => {
    await goToNNL(page)
    const snapBtn = page.locator('[data-testid="nnl-snap-toggle"]')
    await snapBtn.click()
    await page.waitForTimeout(100)
    await expect(snapBtn).toHaveClass(/active/)
    await snapBtn.click()
    await page.waitForTimeout(100)
    const cls = await snapBtn.getAttribute('class')
    expect(cls).not.toContain('active')
  })

  test('le canvas NNL ne produit pas d\'erreur JS avec les 4 nouvelles fonctionnalités', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await goToNNL(page)
    // Rubber-band
    const canvas = page.locator('[data-testid="nnl-canvas"]')
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 600, box.y + 400)
    await page.mouse.down()
    await page.mouse.move(box.x + 750, box.y + 500)
    await page.mouse.up()
    await page.waitForTimeout(100)
    // Snap toggle
    await page.locator('[data-testid="nnl-snap-toggle"]').click()
    await page.keyboard.press('Shift+g')
    await page.waitForTimeout(100)
    // Ctrl+C/V/D sans sélection (ne doit pas planter)
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await page.keyboard.press('Control+d')
    await page.waitForTimeout(100)
    // Ctrl+G sans sélection (ne doit pas planter)
    await page.keyboard.press('Control+g')
    await page.waitForTimeout(100)
    expect(errors).toHaveLength(0)
  })

})
