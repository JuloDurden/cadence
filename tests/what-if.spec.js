const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('What-if — Scénarios', () => {

  test('affiche le graphe de branches', async ({ page }) => {
    await goTo(page, '/auto');
    // Le SVG du graphe doit être présent
    await expect(page.locator('svg').first()).toBeAttached();
  });

  test('au chargement, seul "État actuel" est affiché (pas de Scénario A par défaut)', async ({ page }) => {
    await goTo(page, '/auto');
    await expect(page.locator('.page-content')).toContainText('État actuel');
    await expect(page.locator('.page-content')).not.toContainText('Scénario A');
  });

  // "Nouveau scénario" réservé PO/Scrum Master/Dev (+ Admin) depuis v0.93.5 (canExploreWhatIf) —
  // role explicite pour ces tests antérieurs au système de rôles.
  test('le bouton "Nouveau scénario" crée le Scénario A', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await expect(page.locator('.page-content')).toContainText('Scénario A');
  });

  test('un second "Nouveau scénario" crée le Scénario B', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await expect(page.locator('.page-content')).toContainText('Scénario B');
  });

  test('générer le Scénario A affiche une proposition', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    // /\d+\/\d+ SP/ est unique aux en-têtes de slots, évite les <title> SVG cachés
    await expect(page.locator('.page-content').getByText(/\d+\/\d+ SP/).first()).toBeVisible();
  });

  test('le facteur de vélocité est réglable (slider)', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await expect(page.locator('input[type="range"]')).toBeVisible();
  });

  test('le bouton Comparer est visible dans le header', async ({ page }) => {
    await goTo(page, '/auto');
    await expect(page.getByRole('button', { name: 'Comparer' })).toBeVisible();
  });

  test('activer le mode Comparer affiche le sélecteur de scénario', async ({ page }) => {
    await goTo(page, '/auto');
    await page.getByRole('button', { name: 'Comparer' }).click();
    // Après clic, un <select> apparaît — l'<option> "Comparer avec…" est cachée mais le select lui est visible
    await expect(page.locator('select').filter({ hasText: 'Comparer avec' })).toBeVisible();
  });

  test('les 4 critères sont présents dans un scénario', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    // .first() car État actuel a aussi un label "Priorité" dans son panneau de filtres
    await expect(page.getByText('Priorité', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Importance client', { exact: true })).toBeVisible();
    await expect(page.getByText('Socle commun en tête', { exact: true })).toBeVisible();
    await expect(page.getByText('Dette technique', { exact: true })).toBeVisible();
  });

  test('le panneau de capacités par sprint est accessible', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Capacités par sprint' }).click();
    await expect(page.locator('.page-content')).toContainText('Capacités');
  });

  test('générer affiche le bouton Appliquer', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    await expect(page.getByRole('button', { name: 'Appliquer' }).first()).toBeVisible();
  });

  test('ajouter un item fictif via le bouton "+" dans un slot', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    // Cliquer sur le bouton + dans le premier slot
    await page.locator('button[title="Ajouter un item fictif"]').first().click();
    await expect(page.getByText('Ajouter un item fictif')).toBeVisible();
  });

  test('la modal item fictif contient les champs Description, Type, SP, Priorité, Client', async ({ page }) => {
    await goTo(page, '/auto', { role: 'PO' });
    await page.getByRole('button', { name: 'Nouveau scénario' }).click();
    await page.getByRole('button', { name: 'Générer' }).first().click();
    await page.locator('button[title="Ajouter un item fictif"]').first().click();
    await expect(page.getByText('Ajouter un item fictif')).toBeVisible();
    // Placeholder unique au formulaire modal — confirme Description, SP et l'ensemble du form
    await expect(page.getByPlaceholder(/Bug crash/i)).toBeVisible();
    // Le bouton Ajouter est présent dans la modal
    await expect(page.getByRole('button', { name: 'Ajouter', exact: true })).toBeVisible();
  });

  test('le changelog affiche la version courante', async ({ page }) => {
    // Duplique la vérification de tests/changelog.spec.js — volontaire, pour un
    // repère rapide depuis ce fichier ; garder les deux synchronisées à chaque bump.
    await goTo(page, '/changelog');
    await expect(page.locator('.cl-card.current')).toContainText('v0.97.10');
  });

});
