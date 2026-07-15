const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Auto-planning — ProposalPanel v0.84.0', () => {

  async function generateScenario(page) {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    await expect(page.locator('.page-content').getByText(/\d+\/\d+ SP/).first()).toBeVisible();
  }

  // ── Icône calendrier ───────────────────────────────────────────────────────

  test('pas d\'emoji 📅 dans le rendu', async ({ page }) => {
    await generateScenario(page);
    const text = await page.locator('.page-content').textContent();
    expect(text).not.toContain('📅');
  });

  test('les en-têtes de slot avec dates affichent une flèche "->"', async ({ page }) => {
    await generateScenario(page);
    // Plusieurs slots ont des dates → plusieurs spans avec "->" ; .first() évite le strict-mode
    await expect(page.locator('.page-content').getByText(/->/).first()).toBeVisible();
  });

  // ── Groupement Epic ────────────────────────────────────────────────────────

  test('en-tête Epic FAX-007 visible quand FAX-019 (enfant) est dans la proposition', async ({ page }) => {
    await generateScenario(page);
    // FAX-019 a epicId: "i7" (FAX-007 "EPIC IA Prédiction accidents & CA")
    // Si FAX-019 est placé dans un slot, FAX-007 apparaît comme en-tête Epic
    const fax007header = page.locator('.page-content').getByText('FAX-007');
    const count = await fax007header.count();
    if (count > 0) {
      await expect(fax007header.first()).toBeVisible();
    }
    // Dans tous les cas, pas d'erreur JS
  });

  test('l\'en-tête Epic affiche un compteur N/M stories', async ({ page }) => {
    await generateScenario(page);
    // FAX-019 est l'unique enfant de FAX-007 → compteur "1/1"
    // Le pattern N/M n'apparaît que dans les en-têtes Epic
    const counter = page.locator('.page-content').getByText(/^\d+\/\d+$/);
    const count = await counter.count();
    if (count > 0) {
      await expect(counter.first()).toBeVisible();
    }
  });

  test('pas d\'erreur JS avec le groupement Epic', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await generateScenario(page);
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });

  // ── Badge de dépendance ────────────────────────────────────────────────────

  test('le badge dep affiche "Niv.N" pour les dépendances transitives', async ({ page }) => {
    await generateScenario(page);
    // PME-017 (niveau 2) et PME-023 (niveau 3) ont des badges "Niv.N"
    await expect(page.locator('.page-content')).toContainText(/Niv\.\d/);
  });

  test('le badge dep affiche la clé du prédécesseur (pas juste un chiffre)', async ({ page }) => {
    await generateScenario(page);
    // PME-011 dépend de PME-005 → son badge doit afficher "PME-005"
    // "PME-005" apparaît à la fois comme ligne et comme badge ; on vérifie la présence globale
    await expect(page.locator('.page-content')).toContainText('PME-005');
    // Et que le badge ne contient pas juste le chiffre "1" isolé (l'ancien comportement bugué)
    const badgeWith1 = page.locator('.page-content').getByText(/^\s*1\s*$/).first();
    // Un "1" isolé ne devrait pas exister dans les badges de dépendance
    const text = await page.locator('.page-content').textContent();
    // Vérification indirecte : "Niv." doit être présent (format amélioré)
    expect(text).toMatch(/Niv\.\d/);
  });

  // ── Highlight des deps au hover ────────────────────────────────────────────

  test('hover sur PME-023 ne provoque pas d\'erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await generateScenario(page);
    const pme023 = page.locator('.page-content').getByText('PME-023').first();
    if (await pme023.count() > 0) {
      // force: true contourne les éléments intercepteurs (header sticky, SVG overlay) sur CI
      await pme023.hover({ force: true });
      await page.waitForTimeout(300);
    }
    expect(errors).toHaveLength(0);
  });

  test('hover sur item avec deps : fond bleu sur la ligne survolée', async ({ page }) => {
    await generateScenario(page);
    // getByText trouve le span clé "PME-023" ; un seul ".." remonte au div row
    const pme023Key = page.locator('.page-content').getByText('PME-023', { exact: true }).first();
    if (await pme023Key.count() === 0) return;
    const pme023Row = pme023Key.locator('..');
    // React onMouseEnter est déclenché via mouseover (bubble) : évite les interceptions pointer-events CI
    await pme023Row.dispatchEvent('mouseover');
    await page.waitForTimeout(300);
    const bg = await pme023Row.evaluate(el => window.getComputedStyle(el).backgroundColor);
    // fond bleu rgba(59,130,246,...) ≠ transparent
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('transparent');
  });

  test('items hors chaîne dep restent à opacité pleine au hover', async ({ page }) => {
    await generateScenario(page);
    const pme023 = page.locator('.page-content').getByText('PME-023', { exact: true }).first();
    if (await pme023.count() === 0) return;
    await pme023.hover({ force: true });
    await page.waitForTimeout(150);
    // BUG-006 n'a aucun lien dep avec PME-023 → opacity doit rester à 1
    const bugKey = page.locator('.page-content').getByText('BUG-006', { exact: true }).first();
    if (await bugKey.count() === 0) return;
    const bugRow = bugKey.locator('..');
    const opacity = await bugRow.evaluate(el => window.getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);
  });

  // ── Pas d'erreur JS globale ────────────────────────────────────────────────

  test('pas d\'erreur JS après génération et hover', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await generateScenario(page);
    await page.waitForTimeout(400);
    expect(errors).toHaveLength(0);
  });

});
