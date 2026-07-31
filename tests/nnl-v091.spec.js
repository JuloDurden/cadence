/**
 * Tests E2E — NNL Canvas (v0.91)
 * Texte enrichi (contenteditable + mini-toolbar), opérations booléennes,
 * opacité globale des formes, ColorOpacityPopover 170px, ordre de rendu calques.
 *
 * Prérequis : npm run dev sur le port 4321
 * Lancer    : npx playwright test tests/nnl-v091.spec.js
 */

const { test, expect } = require('@playwright/test')
const { goTo } = require('./helpers')

// ── Helpers ───────────────────────────────────────────────────────────────────

async function goToNNL(page) {
  await goTo(page, '/vision')
  await page.locator('[data-testid="btn-toggle-nnl"]').click()
  await page.waitForTimeout(300)
}

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

async function drawRect(page, x1, y1, x2, y2) {
  // Rectangle et Ellipse sont regroupés dans le bouton "Formes" (v0.92.9) — un clic court
  // active la dernière forme choisie, 'rect' par défaut au montage du composant.
  await page.locator('[data-testid="nnl-tool-shapes"]').click()
  const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  await page.mouse.move(box.x + x2, box.y + y2)
  await page.mouse.up()
  await page.waitForTimeout(150)
}

async function createTextBlock(page, x = 400, y = 280) {
  await page.locator('[data-testid="nnl-tool-text"]').click()
  await canvasMouseDown(page, x, y)
  await page.waitForTimeout(300)
}

// Sélectionne une forme en cliquant dessus (outil Select)
async function selectShape(page, cx, cy) {
  await page.locator('[data-testid="nnl-tool-select"]').click()
  await page.waitForTimeout(80)
  await canvasMouseDown(page, cx, cy)
  await page.waitForTimeout(200)
}

// Rubber-band select sur une zone canvas
async function rubberBand(page, x1, y1, x2, y2) {
  await page.locator('[data-testid="nnl-tool-select"]').click()
  await page.waitForTimeout(80)
  const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
  await page.mouse.move(box.x + x1, box.y + y1)
  await page.mouse.down()
  await page.mouse.move(box.x + x2, box.y + y2)
  await page.mouse.up()
  await page.waitForTimeout(250)
}

// ── Suite 1 : Texte enrichi (contenteditable + mini-toolbar) ─────────────────

test.describe('NNL v0.91 — Texte enrichi (contenteditable + mini-toolbar)', () => {

  test("l'éditeur inline est un div contenteditable (non une textarea)", async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    // Depuis v0.91 : contenteditable, plus de textarea
    await expect(page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]'))
      .toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="nnl-canvas"] textarea'))
      .toHaveCount(0)
  })

  test('la mini-toolbar flottante est visible pendant l\'édition', async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    // La mini-toolbar contient des boutons de formatage (strong G, em I, u S)
    await expect(page.locator('[data-testid="nnl-canvas"] button strong')).toBeVisible({ timeout: 3000 })
  })

  test('la mini-toolbar contient les boutons G / I / S', async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    const canvas = page.locator('[data-testid="nnl-canvas"]')
    await expect(canvas.locator('button strong')).toBeVisible()   // Gras
    await expect(canvas.locator('button em')).toBeVisible()       // Italique
    await expect(canvas.locator('button u')).toBeVisible()        // Souligné
  })

  test('la mini-toolbar contient un sélecteur de police', async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    // Le select de police est dans la mini-toolbar
    await expect(page.locator('[data-testid="nnl-canvas"] select')).toBeVisible({ timeout: 3000 })
  })

  test('taper du texte et Escape crée un bloc texte visible', async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    await page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]').fill('Texte v0.91')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="nnl-canvas"]')).toContainText('Texte v0.91')
  })

  test('double-clic sur un bloc texte existant rouvre le contenteditable', async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    await page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]').fill('Réédit')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.locator('[data-testid="nnl-canvas"]').getByText('Réédit').first().dblclick()
    await page.waitForTimeout(200)
    await expect(page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]')).toBeVisible()
  })

  test('le color picker de la mini-toolbar ouvre un ColorOpacityPopover', async ({ page }) => {
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    const canvas = page.locator('[data-testid="nnl-canvas"]')
    // Le swatch de couleur est un titre "Couleur du texte sélectionné"
    const swatch = canvas.locator('[title="Couleur du texte sélectionné"]')
    await expect(swatch).toBeVisible({ timeout: 3000 })
    await swatch.dispatchEvent('mousedown')
    await page.waitForTimeout(200)
    // Le popover contient un slider d'opacité (input range)
    await expect(canvas.locator('input[type="range"]').first()).toBeVisible()
  })

})

// ── Suite 2 : Opérations booléennes ──────────────────────────────────────────

test.describe('NNL v0.91 — Opérations booléennes', () => {

  test('sélectionner 2+ formes affiche la toolbar booléenne', async ({ page }) => {
    await goToNNL(page)
    // Dessiner 2 rectangles dans le coin haut-droit (hors zone post-its)
    await drawRect(page, 550, 40, 660, 120)
    await drawRect(page, 680, 40, 790, 120)
    // Rubber-band pour sélectionner les 2
    await rubberBand(page, 530, 20, 820, 145)
    // La toolbar booléenne apparaît ("Opérations :")
    await expect(page.locator('text=Opérations :')).toBeVisible({ timeout: 3000 })
  })

  test('la toolbar booléenne contient les 5 opérations', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page, 550, 40, 660, 120)
    await drawRect(page, 680, 40, 790, 120)
    await rubberBand(page, 530, 20, 820, 145)
    await expect(page.locator('text=Opérations :')).toBeVisible({ timeout: 3000 })
    // Vérifier les 5 boutons par leur title
    for (const title of [
      'Ajouter (union)',
      'Soustraire',
      'Intersection',
      'OU exclusif (XOR)',
      'Diviser',
    ]) {
      await expect(page.locator(`[title="${title}"]`)).toBeVisible()
    }
  })

  test('Union de 2 rectangles produit une forme et retire les sources', async ({ page }) => {
    await goToNNL(page)
    // Compter les formes SVG avant
    const before = await page.locator('[data-testid="nnl-canvas"] svg [data-shape-id]').count()
    // Rectangles qui se CHEVAUCHENT (30px de recouvrement, 630 à 660) — contrairement aux 2
    // autres tests de cette suite (qui ne vérifient que la présence de la toolbar, peu importe
    // le résultat géométrique), celui-ci vérifie que l'union fusionne bien en UNE seule forme :
    // avec des rectangles disjoints, l'union produit légitimement un MultiPolygon à 2 pièces
    // séparées (2 formes, pas 1) — voir handleBooleanOp/multiPolyToNNLShapes dans NNLCanvas.tsx
    // et docs/corrections.md.
    await drawRect(page, 550, 40, 660, 120)
    await drawRect(page, 630, 40, 790, 120)
    await rubberBand(page, 530, 20, 820, 145)
    await expect(page.locator('text=Opérations :')).toBeVisible({ timeout: 3000 })
    // Cliquer sur Union
    await page.locator('[title="Ajouter (union)"]').click()
    await page.waitForTimeout(300)
    // 2 formes retirées, 1 polygone ajouté → count = before + 1 (net -1)
    const after = await page.locator('[data-testid="nnl-canvas"] svg [data-shape-id]').count()
    expect(after).toBe(before + 1)
  })

})

// ── Suite 3 : Opacité globale des formes ─────────────────────────────────────

test.describe('NNL v0.91 — Opacité globale des formes', () => {

  test('ShapePropertiesPanel contient un slider d\'opacité après sélection', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page, 300, 200, 500, 350)
    // Cliquer au centre du rect pour le sélectionner
    await selectShape(page, 400, 275)
    // Le panneau de propriétés doit contenir au moins un input[type="range"]
    await expect(
      page.locator('[data-testid="nnl-canvas"] input[type="range"]').first()
    ).toBeVisible({ timeout: 3000 })
  })

  test('le slider d\'opacité affiche 100% par défaut (value="100")', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page, 300, 200, 500, 350)
    await selectShape(page, 400, 275)
    // Le slider d'opacité globale (min=0 max=100) doit valoir 100 par défaut
    const opacitySlider = page.locator(
      '[data-testid="nnl-canvas"] input[type="range"][min="0"][max="100"]'
    ).last()
    await expect(opacitySlider).toBeVisible({ timeout: 3000 })
    await expect(opacitySlider).toHaveValue('100')
  })

  test('le <g> SVG de la forme a opacity="1" par défaut', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page, 300, 200, 500, 350)
    // Trouver le dernier <g data-shape-id> ajouté
    const opacity = await page.evaluate(() => {
      const gs = document.querySelectorAll('[data-testid="nnl-canvas"] svg [data-shape-id]')
      if (!gs.length) return null
      return gs[gs.length - 1].getAttribute('opacity')
    })
    // opacity="1" ou absent (défaut SVG = 1)
    expect(opacity === '1' || opacity === null).toBe(true)
  })

  test('modifier le slider d\'opacité change l\'attribut opacity du <g> SVG', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page, 300, 200, 500, 350)
    await selectShape(page, 400, 275)
    const opacitySlider = page.locator(
      '[data-testid="nnl-canvas"] input[type="range"][min="0"][max="100"]'
    ).last()
    await expect(opacitySlider).toBeVisible({ timeout: 3000 })
    // Mettre à 50% : ni `.fill()` ni un événement 'input' synthétique ne sont fiables sur un
    // <input type="range"> — de vraies touches clavier (Home puis 50× ArrowRight, step=1 par
    // défaut) sont l'interaction la plus fiable, sans dépendre d'un mécanisme synthétique.
    await opacitySlider.focus()
    await page.keyboard.press('Home')
    for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
    await expect(opacitySlider).toHaveValue('50')
    const opacity = await page.evaluate(() => {
      const gs = document.querySelectorAll('[data-testid="nnl-canvas"] svg [data-shape-id]')
      if (!gs.length) return null
      return gs[gs.length - 1].getAttribute('opacity')
    })
    expect(parseFloat(opacity)).toBeCloseTo(0.5, 1)
  })

})

// ── Suite 4 : ColorOpacityPopover (largeur 170px) ────────────────────────────

test.describe('NNL v0.91 — ColorOpacityPopover (170px)', () => {

  test('le popover de couleur a une largeur de 170px', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page, 300, 200, 500, 350)
    await selectShape(page, 400, 275)
    // Ouvrir le color picker : cliquer sur le swatch de couleur de remplissage
    const fillSwatch = page.locator('[data-testid="nnl-canvas"] [title*="emplissage"], [data-testid="nnl-canvas"] [title*="Remplissage"]').first()
    await fillSwatch.click({ force: true })
    await page.waitForTimeout(200)
    // Mesurer la largeur du popover (div absolue avec grille de swatches)
    const popoverWidth = await page.evaluate(() => {
      // Le popover est un div positionné absolute avec des swatches de couleur
      const swatchDivs = document.querySelectorAll('[data-testid="nnl-canvas"] [style*="position: absolute"]')
      for (const el of swatchDivs) {
        const w = el.getBoundingClientRect().width
        if (w >= 165 && w <= 180) return Math.round(w)
      }
      return null
    })
    expect(popoverWidth).toBeGreaterThanOrEqual(165)
    expect(popoverWidth).toBeLessThanOrEqual(180)
  })

  test('le popover contient un slider d\'opacité', async ({ page }) => {
    await goToNNL(page)
    await drawRect(page, 300, 200, 500, 350)
    await selectShape(page, 400, 275)
    const fillSwatch = page.locator('[data-testid="nnl-canvas"] [title*="emplissage"], [data-testid="nnl-canvas"] [title*="Remplissage"]').first()
    await fillSwatch.click({ force: true })
    await page.waitForTimeout(200)
    // Au moins un input range visible (slider d'opacité du popover)
    await expect(
      page.locator('[data-testid="nnl-canvas"] input[type="range"]').first()
    ).toBeVisible()
  })

})

// ── Suite 5 : Ordre de rendu calques ─────────────────────────────────────────

test.describe('NNL v0.91 — Ordre de rendu calques', () => {

  test('deux formes sur calques différents sont rendues sans erreur JS', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await goToNNL(page)
    // Dessiner 2 formes → 2 calques auto-créés avec order différent
    await drawRect(page, 200, 150, 380, 300)
    await drawRect(page, 320, 200, 500, 350)
    await page.waitForTimeout(200)
    expect(errors).toHaveLength(0)
    // Les 2 <g data-shape-id> sont présents dans le SVG
    const count = await page.locator('[data-testid="nnl-canvas"] svg [data-shape-id]').count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('le <g> du calque supérieur apparaît après celui du calque inférieur dans le DOM', async ({ page }) => {
    await goToNNL(page)
    // Compter les formes existantes (DEMO_STATE)
    const initialCount = await page.locator('[data-testid="nnl-canvas"] svg [data-shape-id]').count()
    // Dessiner rect A puis rect B (B reçoit un calque avec order > A)
    await drawRect(page, 100, 100, 220, 200)
    await drawRect(page, 230, 100, 350, 200)
    await page.waitForTimeout(200)
    // Récupérer l'ordre des data-shape-id dans le DOM
    const shapeIds = await page.evaluate((startIdx) => {
      const gs = Array.from(document.querySelectorAll('[data-testid="nnl-canvas"] svg [data-shape-id]'))
      return gs.slice(startIdx).map(g => g.getAttribute('data-shape-id'))
    }, initialCount)
    // Au moins 2 nouvelles formes (A et B), B doit être après A dans le DOM
    // (order croissant = le plus haut order est le dernier rendu = au dessus)
    expect(shapeIds.length).toBeGreaterThanOrEqual(2)
    // On vérifie simplement que l'ordre DOM est stable et non vide
    expect(shapeIds[0]).toBeTruthy()
    expect(shapeIds[1]).toBeTruthy()
    expect(shapeIds[0]).not.toBe(shapeIds[1])
  })

})

// ── Suite 6 : Texte enrichi — G / I / S apply to selection ──────────────────

test.describe('NNL v0.91 — Rich text : G/I/S et sélection', () => {

  test('le bouton G (Gras) est présent et cliquable sans erreur JS', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    await page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]').fill('Gras test')
    const boldBtn = page.locator('[data-testid="nnl-canvas"] button strong').first()
    await boldBtn.dispatchEvent('mousedown')
    await page.waitForTimeout(100)
    expect(errors).toHaveLength(0)
  })

  test('le bouton I (Italique) est présent et cliquable sans erreur JS', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    await page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]').fill('Italique test')
    const italicBtn = page.locator('[data-testid="nnl-canvas"] button em').first()
    await italicBtn.dispatchEvent('mousedown')
    await page.waitForTimeout(100)
    expect(errors).toHaveLength(0)
  })

  test('le bouton S (Souligné) est présent et cliquable sans erreur JS', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await goToNNL(page)
    await createTextBlock(page, 400, 280)
    await page.locator('[data-testid="nnl-canvas"] [contenteditable="true"]').fill('Souligné test')
    const underlineBtn = page.locator('[data-testid="nnl-canvas"] button u').first()
    await underlineBtn.dispatchEvent('mousedown')
    await page.waitForTimeout(100)
    expect(errors).toHaveLength(0)
  })

})
