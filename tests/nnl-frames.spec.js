/**
 * Tests E2E — Cadres Epic/Initiative sur le canevas NNL (Phase 1, sous-chantier 6/6)
 * Route : /vision → clic sur btn-toggle-nnl → canvas NNL
 *
 * Couvre les points 1 à 5 bis du sous-chantier (voir docs/roadmap-v1.md, docs/corrections.md) :
 * rendu + containment géométrique (points 1-2), outil de création "Cadre" (point 3), sélection/
 * édition/déplacement solidaire/suppression (point 3.5), synchronisation NNL → Backlog (point 4),
 * synchronisation Backlog → NNL + éjection à la désassociation (points 5 et 5 bis, v0.92.14/.15).
 *
 * S'appuie sur le cadre de démo `frame1` (DEMO_STATE, lié à l'Epic FAX-002 / id "i2") et sur les
 * post-its nnl1/nnl3/nnl5 déjà présents — voir frontend/src/data/demo.ts pour leurs coordonnées.
 */
const { test, expect } = require('@playwright/test')
const { goTo } = require('./helpers')

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Charge /vision et bascule en vue NNL (rechargement complet — repart de DEMO_STATE).
 *  `role` optionnel : nécessaire pour les tests qui éditent un item depuis le Backlog ensuite
 *  (EPIC/INITIATIVE + Enregistrer réservés PO/Admin depuis la Phase 2, canManageBacklog). */
async function goToNNL(page, opts = {}) {
  await goTo(page, '/vision', opts)
  await page.locator('[data-testid="btn-toggle-nnl"]').click()
  await page.waitForTimeout(300)
}

/** Lit `left`/`top` (px, coordonnées écran) depuis l'attribut style inline d'un élément. */
async function readLeftTop(locator) {
  const style = await locator.getAttribute('style')
  // `-?` : un post-it éjecté d'un cadre proche de l'origine (comme frame1, dont le bord gauche
  // touche x=0 en coordonnées monde) peut se retrouver à une coordonnée écran négative — la
  // regex doit accepter le signe, sinon `.exec()` ne matche rien et renvoie `null` (constaté par
  // Julien, 2026-07-30 : TypeError sur `.exec(style)[1]` dans le test d'éjection).
  return {
    left: parseFloat(/left:\s*(-?[\d.]+)/.exec(style)[1]),
    top: parseFloat(/top:\s*(-?[\d.]+)/.exec(style)[1]),
  }
}

/** Lit les bornes écran (x/y/largeur/hauteur) du <rect> principal d'un cadre. */
async function readFrameBounds(page, frameId) {
  const rect = page.locator(`[data-testid="nnl-frame-${frameId}"] rect`).first()
  return {
    x: parseFloat(await rect.getAttribute('x')),
    y: parseFloat(await rect.getAttribute('y')),
    w: parseFloat(await rect.getAttribute('width')),
    h: parseFloat(await rect.getAttribute('height')),
  }
}

function isInside(pos, bounds) {
  return pos.left >= bounds.x && pos.left <= bounds.x + bounds.w
      && pos.top  >= bounds.y && pos.top  <= bounds.y + bounds.h
}

/** Lie un post-it existant (par son data-testid) à un item du Backlog via l'onglet
 *  "Rattachement" de la NNLItemModal (recherche par clé, puis clic sur le résultat). */
async function linkPostitToItem(page, postitId, itemKey) {
  await page.locator(`[data-testid="nnl-postit-${postitId}"]`).dblclick()
  await page.locator('.modal-tab-btn').filter({ hasText: 'Rattachement' }).click()
  await page.locator('[placeholder="Clé ou description…"]').fill(itemKey)
  await page.getByText(itemKey, { exact: false }).first().click()
  await page.locator('[data-testid="nnl-modal-submit"]').click()
  await page.waitForTimeout(200)
}

/** Ouvre l'item (ligne de tableau contenant sa clé) depuis le Backlog et change son Epic/
 *  Initiative (`''` pour désassocier). Suppose être déjà sur /backlog. */
async function setItemEpicFromBacklog(page, itemKey, epicId) {
  await page.locator('tr', { hasText: itemKey }).first().dblclick()
  const itemModal = page.locator('[data-testid="item-modal"]')
  await expect(itemModal).toBeVisible()
  await itemModal.locator('.form-group').filter({ hasText: 'EPIC / INITIATIVE' }).locator('select').selectOption(epicId)
  await itemModal.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(itemModal).not.toBeVisible()
  await page.waitForTimeout(200)
}

// ── Suite 1 : Rendu + toolbar (points 1-2, v0.92.7/v0.92.8) ───────────────────

test.describe('NNL — Cadres : rendu et toolbar (points 1-2)', () => {

  test('le cadre de démonstration (frame1, Epic FAX-002) est rendu au chargement', async ({ page }) => {
    await goToNNL(page)
    await expect(page.locator('[data-testid="nnl-frame-frame1"]')).toBeVisible()
    await expect(page.locator('[data-testid="nnl-canvas"]')).toContainText('FAX-002')
  })

  test('l\'outil Cadre est présent dans la toolbar', async ({ page }) => {
    await goToNNL(page)
    await expect(page.locator('[data-testid="nnl-tool-frame"]')).toBeVisible()
  })

  test('le panneau de calques affiche la section "Cadres" avec le cadre de démo', async ({ page }) => {
    await goToNNL(page)
    await expect(page.locator('[data-testid="nnl-layers-panel"]')).toContainText('Cadres (1)')
    await expect(page.locator('[data-testid="nnl-layers-frame-frame1"]')).toBeVisible()
  })

})

// ── Suite 2 : Création via l'outil Cadre (point 3, v0.92.10) ──────────────────

test.describe('NNL — Cadres : création via l\'outil Cadre (point 3)', () => {

  test('dessiner un cadre ouvre la modale de liaison', async ({ page }) => {
    await goToNNL(page)
    await page.locator('[data-testid="nnl-tool-frame"]').click()
    const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
    await page.mouse.move(box.x + 700, box.y + 80)
    await page.mouse.down()
    await page.mouse.move(box.x + 850, box.y + 200)
    await page.mouse.up()
    await page.waitForTimeout(150)
    await expect(page.locator('[data-testid="nnl-frame-link-modal"]')).toBeVisible()
  })

  test('annuler la modale de liaison n\'ajoute pas de cadre', async ({ page }) => {
    await goToNNL(page)
    const before = await page.locator('[data-testid="nnl-canvas"] [data-frame-id]').count()
    await page.locator('[data-testid="nnl-tool-frame"]').click()
    const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
    await page.mouse.move(box.x + 700, box.y + 80)
    await page.mouse.down()
    await page.mouse.move(box.x + 850, box.y + 200)
    await page.mouse.up()
    await page.waitForTimeout(150)
    await page.locator('[data-testid="nnl-frame-link-modal"] .modal-footer .btn-secondary').click()
    await page.waitForTimeout(150)
    const after = await page.locator('[data-testid="nnl-canvas"] [data-frame-id]').count()
    expect(after).toBe(before)
  })

  test('choisir un Epic existant dans la modale crée un cadre lié à cet Epic', async ({ page }) => {
    await goToNNL(page)
    const before = await page.locator('[data-testid="nnl-canvas"] [data-frame-id]').count()
    await page.locator('[data-testid="nnl-tool-frame"]').click()
    const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
    await page.mouse.move(box.x + 700, box.y + 80)
    await page.mouse.down()
    await page.mouse.move(box.x + 850, box.y + 200)
    await page.mouse.up()
    await page.waitForTimeout(150)
    // i3 = MAN-003 (Epic existant du jeu de démo, distinct de FAX-002 déjà utilisé par frame1)
    await page.locator('[data-testid="nnl-frame-pick-i3"]').click()
    await page.waitForTimeout(200)
    const after = await page.locator('[data-testid="nnl-canvas"] [data-frame-id]').count()
    expect(after).toBe(before + 1)
    await expect(page.locator('[data-testid="nnl-canvas"]')).toContainText('MAN-003')
  })

  test('créer un nouvel Epic depuis la modale de liaison crée un cadre lié au nouvel Epic', async ({ page }) => {
    await goToNNL(page)
    const before = await page.locator('[data-testid="nnl-canvas"] [data-frame-id]').count()
    await page.locator('[data-testid="nnl-tool-frame"]').click()
    const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
    await page.mouse.move(box.x + 700, box.y + 300)
    await page.mouse.down()
    await page.mouse.move(box.x + 850, box.y + 420)
    await page.mouse.up()
    await page.waitForTimeout(150)
    await page.locator('[data-testid="nnl-frame-create-new"]').click()
    const nodeModal = page.locator('[data-testid="hierarchy-node-modal"]')
    await expect(nodeModal).toBeVisible()
    await nodeModal.locator('input').first().fill('Epic de test créé depuis NNL')
    await nodeModal.getByRole('button', { name: 'Créer' }).click()
    await page.waitForTimeout(200)
    await expect(nodeModal).not.toBeVisible()
    const after = await page.locator('[data-testid="nnl-canvas"] [data-frame-id]').count()
    expect(after).toBe(before + 1)
  })

})

// ── Suite 3 : Sélection, édition, déplacement, suppression (point 3.5, v0.92.11/.12) ──

test.describe('NNL — Cadres : sélection, édition, déplacement, suppression (point 3.5)', () => {

  test('sélectionner un cadre depuis le panneau de calques affiche son panneau de propriétés', async ({ page }) => {
    await goToNNL(page)
    await page.locator('[data-testid="nnl-layers-frame-frame1"]').click()
    await page.waitForTimeout(150)
    await expect(page.getByText('Relier à…')).toBeVisible()
  })

  test('changer la couleur du cadre puis la réinitialiser (palette harmonisée, v0.92.12)', async ({ page }) => {
    await goToNNL(page)
    await page.locator('[data-testid="nnl-layers-frame-frame1"]').click()
    await page.waitForTimeout(150)
    const frameRect = page.locator('[data-testid="nnl-frame-frame1"] rect').first()
    const before = await frameRect.getAttribute('stroke')

    await page.locator('[title="Couleur du cadre"]').click()
    const popover = page.locator('[title="Couleur du cadre"]').locator('xpath=following-sibling::div[1]')
    await popover.locator('> div').first().click()
    await page.waitForTimeout(100)
    const after = await frameRect.getAttribute('stroke')
    expect(after).not.toBe(before)

    await page.locator('[title="Couleur du cadre"]').click()
    await page.locator('[title="Couleur par défaut du niveau"]').click()
    await page.waitForTimeout(100)
    const reset = await frameRect.getAttribute('stroke')
    expect(reset).toBe(before)
  })

  test('déplacer un cadre nouvellement créé déplace avec lui le post-it qu\'il contient (déplacement solidaire, v0.92.12)', async ({ page }) => {
    await goToNNL(page)
    const postit = page.locator('[data-testid="nnl-postit-nnl5"]')
    const { left: pLeft0, top: pTop0 } = await readLeftTop(postit)

    // Dessiner un cadre englobant largement ce post-it (coordonnées écran connues à l'avance)
    await page.locator('[data-testid="nnl-tool-frame"]').click()
    const box = await page.locator('[data-testid="nnl-canvas"]').boundingBox()
    const x1 = pLeft0 - 60, y1 = pTop0 - 60, x2 = pLeft0 + 60, y2 = pTop0 + 60
    await page.mouse.move(box.x + x1, box.y + y1)
    await page.mouse.down()
    await page.mouse.move(box.x + x2, box.y + y2)
    await page.mouse.up()
    await page.waitForTimeout(150)
    await page.locator('[data-testid="nnl-frame-pick-i3"]').click()
    await page.waitForTimeout(200)

    // Revenir en mode Sélection avant de glisser le contour du nouveau cadre
    await page.locator('[data-testid="nnl-tool-select"]').click()
    await page.waitForTimeout(80)
    await page.mouse.move(box.x + x1, box.y + y1)
    await page.mouse.down()
    await page.mouse.move(box.x + x1 + 40, box.y + y1 + 25)
    await page.mouse.up()
    await page.waitForTimeout(200)

    const { left: pLeft1, top: pTop1 } = await readLeftTop(postit)
    expect(pLeft1 - pLeft0).toBeGreaterThan(20)
    expect(pTop1 - pTop0).toBeGreaterThan(10)
  })

  test('supprimer un cadre sélectionné via la touche Suppr', async ({ page }) => {
    await goToNNL(page)
    await page.locator('[data-testid="nnl-layers-frame-frame1"]').click()
    await page.waitForTimeout(150)
    await expect(page.getByText('Relier à…')).toBeVisible()
    await page.keyboard.press('Delete')
    await page.waitForTimeout(200)
    await expect(page.locator('[data-testid="nnl-frame-frame1"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="nnl-layers-panel"]')).not.toContainText('Cadres (1)')
  })

})

// ── Suite 4 : Synchronisation NNL → Backlog (point 4, v0.92.13) ───────────────

test.describe('NNL — Cadres : synchronisation NNL → Backlog (point 4)', () => {

  test('déplacer un post-it lié à l\'intérieur du cadre de son Epic met à jour l\'epicId de l\'item', async ({ page }) => {
    await goToNNL(page)
    // nnl1 est déjà à l'intérieur du cadre frame1 (Epic FAX-002) — voir demo.ts
    await linkPostitToItem(page, 'nnl1', 'FAX-019')

    // Léger déplacement (reste dans le cadre) pour déclencher la synchronisation au relâchement
    const postit = page.locator('[data-testid="nnl-postit-nnl1"]')
    const box = await postit.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 10)
    await page.mouse.up()
    await page.waitForTimeout(300)

    // .filter() plutôt qu'un simple toContainText : un autre toast (sauvegarde NNL) peut
    // s'afficher au même moment, et getByRole('status') matcherait alors plusieurs éléments.
    await expect(page.getByRole('status').filter({ hasText: 'FAX-002' })).toBeVisible()

    await page.getByRole('link', { name: 'Product Backlog' }).click()
    await expect(page).toHaveURL(/backlog/)
    await page.locator('tr', { hasText: 'FAX-019' }).first().dblclick()
    const itemModal = page.locator('[data-testid="item-modal"]')
    await expect(itemModal).toBeVisible()
    const epicSelect = itemModal.locator('.form-group').filter({ hasText: 'EPIC / INITIATIVE' }).locator('select')
    await expect(epicSelect).toHaveValue('i2')
  })

})

// ── Suite 5 : Synchronisation Backlog → NNL + éjection (points 5 et 5 bis, v0.92.14/.15) ──

test.describe('NNL — Cadres : synchronisation Backlog → NNL + éjection à la désassociation (points 5/5bis)', () => {

  test('changer l\'Epic d\'un item lié depuis le Backlog déplace son post-it dans le cadre correspondant', async ({ page }) => {
    await goToNNL(page, { role: 'PO' })
    // nnl3 est hors des bornes de frame1 (x=0..340) — voir demo.ts (nnl3.x = 380)
    await linkPostitToItem(page, 'nnl3', 'FAX-019')

    const postit = page.locator('[data-testid="nnl-postit-nnl3"]')
    const before = await readLeftTop(postit)
    const frameBefore = await readFrameBounds(page, 'frame1')
    expect(isInside(before, frameBefore)).toBeFalsy()

    await page.getByRole('link', { name: 'Product Backlog' }).click()
    await expect(page).toHaveURL(/backlog/)
    await setItemEpicFromBacklog(page, 'FAX-019', 'i2')

    await page.getByRole('link', { name: 'Vision' }).click()
    await expect(page).toHaveURL(/vision/)
    await page.locator('[data-testid="btn-toggle-nnl"]').click()
    await page.waitForTimeout(300)

    const after = await readLeftTop(page.locator('[data-testid="nnl-postit-nnl3"]'))
    const frameAfter = await readFrameBounds(page, 'frame1')
    expect(isInside(after, frameAfter)).toBeTruthy()
  })

  test('désassocier ensuite l\'Epic de cet item éjecte son post-it du cadre (correctif v0.92.15)', async ({ page }) => {
    await goToNNL(page, { role: 'PO' })
    await linkPostitToItem(page, 'nnl3', 'FAX-019')

    // Rattacher d'abord à FAX-002 (fait entrer le post-it dans frame1)
    await page.getByRole('link', { name: 'Product Backlog' }).click()
    await expect(page).toHaveURL(/backlog/)
    await setItemEpicFromBacklog(page, 'FAX-019', 'i2')

    await page.getByRole('link', { name: 'Vision' }).click()
    await page.locator('[data-testid="btn-toggle-nnl"]').click()
    await page.waitForTimeout(300)
    const inFrame = await readLeftTop(page.locator('[data-testid="nnl-postit-nnl3"]'))
    const frameBounds1 = await readFrameBounds(page, 'frame1')
    expect(isInside(inFrame, frameBounds1)).toBeTruthy()

    // Désassocier (Epic vidé) : le post-it doit désormais sortir du cadre
    await page.getByRole('link', { name: 'Product Backlog' }).click()
    await expect(page).toHaveURL(/backlog/)
    await setItemEpicFromBacklog(page, 'FAX-019', '')

    await page.getByRole('link', { name: 'Vision' }).click()
    await page.locator('[data-testid="btn-toggle-nnl"]').click()
    await page.waitForTimeout(300)
    const ejected = await readLeftTop(page.locator('[data-testid="nnl-postit-nnl3"]'))
    const frameBounds2 = await readFrameBounds(page, 'frame1')
    expect(isInside(ejected, frameBounds2)).toBeFalsy()
  })

})
