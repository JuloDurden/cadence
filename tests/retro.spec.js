const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Rétrospective', () => {

  test('affiche le label du sprint et le sélecteur de format', async ({ page }) => {
    await goTo(page, '/retro');
    await expect(page.locator('.page-content')).toBeVisible();
    // Label sprint dans le header
    await expect(page.getByText(/Sprint \d/)).toBeVisible();
    // Sélecteur de format
    const formatSelect = page.locator('select.hdr-select').first();
    await expect(formatSelect).toBeVisible();
    await expect(formatSelect).toHaveValue('start-stop-continue');
  });

  test('affiche les boutons de contrôle (copier, archiver, effacer)', async ({ page }) => {
    await goTo(page, '/retro');
    await expect(page.locator('button[title="Copier le résumé"]')).toBeVisible();
    await expect(page.locator('button[title="Archiver cette rétrospective"]')).toBeVisible();
    await expect(page.locator('button[title="Effacer toutes les saisies"]')).toBeVisible();
  });

  test('affiche le compteur items et actions', async ({ page }) => {
    await goTo(page, '/retro');
    await expect(page.getByText(/items · \d+\/\d+ actions/)).toBeVisible();
  });

  test('la section Rétrospective du jour est collapsible', async ({ page }) => {
    await goTo(page, '/retro');
    // Colonnes visibles par défaut
    await expect(page.getByPlaceholder('Ajouter...').first()).toBeVisible();
    // Fermer la section
    await page.locator('.daily-section-btn').first().click();
    await expect(page.getByPlaceholder('Ajouter...').first()).not.toBeVisible();
    // Rouvrir
    await page.locator('.daily-section-btn').first().click();
    await expect(page.getByPlaceholder('Ajouter...').first()).toBeVisible();
  });

  test('affiche les 3 colonnes Start / Stop / Continue', async ({ page }) => {
    await goTo(page, '/retro');
    await expect(page.getByText('Start', { exact: true })).toBeVisible();
    await expect(page.getByText('Stop', { exact: true })).toBeVisible();
    await expect(page.getByText('Continue', { exact: true })).toBeVisible();
  });

  test('change de format et affiche les colonnes Mad / Sad / Glad', async ({ page }) => {
    await goTo(page, '/retro');
    await page.locator('select.hdr-select').first().selectOption('mad-sad-glad');
    await expect(page.getByText('Mad', { exact: true })).toBeVisible();
    await expect(page.getByText('Sad', { exact: true })).toBeVisible();
    await expect(page.getByText('Glad', { exact: true })).toBeVisible();
  });

  test('peut ajouter un item dans une colonne', async ({ page }) => {
    await goTo(page, '/retro');
    const input = page.getByPlaceholder('Ajouter...').first();
    await input.fill('Premier item de test');
    await input.press('Enter');
    await expect(page.getByText('Premier item de test')).toBeVisible();
  });

  test('les boutons thumbs-up et thumbs-down sont présents sur un item', async ({ page }) => {
    await goTo(page, '/retro');
    // Ajouter un item
    await page.getByPlaceholder('Ajouter...').first().fill('Item avec votes');
    await page.getByPlaceholder('Ajouter...').first().press('Enter');
    // Vérifier les boutons de vote
    await expect(page.locator('button[title="J\'aime"]')).toBeVisible();
    await expect(page.locator('button[title="Je n\'aime pas"]')).toBeVisible();
  });

  test('vote like puis dislike sur un item (mutuellement exclusifs)', async ({ page }) => {
    await goTo(page, '/retro');
    // Ajouter un item
    await page.getByPlaceholder('Ajouter...').first().fill('Item vote test');
    await page.getByPlaceholder('Ajouter...').first().press('Enter');
    // Liker
    const likeBtn = page.locator('button[title="J\'aime"]').first();
    const dislikeBtn = page.locator('button[title="Je n\'aime pas"]').first();
    await likeBtn.click();
    // Après un like, cliquer dislike doit enlever le like
    await dislikeBtn.click();
    // Le compteur like doit repasser à 0
    await expect(likeBtn).toContainText('0');
    // Le compteur dislike doit être 1
    await expect(dislikeBtn).toContainText('1');
  });

  test('affiche la section Archives (vide par défaut)', async ({ page }) => {
    await goTo(page, '/retro');
    await expect(page.locator('.daily-section-btn').filter({ hasText: 'Archives' })).toBeVisible();
    await expect(page.getByText('Aucune archive')).toBeVisible();
  });

  test('archiver crée une entrée dans les archives', async ({ page }) => {
    await goTo(page, '/retro');
    // Ajouter un item pour que la session ne soit pas vide
    await page.getByPlaceholder('Ajouter...').first().fill('Item à archiver');
    await page.getByPlaceholder('Ajouter...').first().press('Enter');
    await expect(page.getByText('Item à archiver')).toBeVisible();
    // Archiver
    await page.locator('button[title="Archiver cette rétrospective"]').click();
    // L'archive doit apparaître dans la section Archives
    await expect(page.locator('.archive-card')).toBeVisible();
    // La session courante doit être vidée
    await expect(page.getByText('Item à archiver')).not.toBeVisible();
  });

  test('peut ajouter une action dans le plan d\'actions', async ({ page }) => {
    await goTo(page, '/retro');
    await page.getByPlaceholder('Nouvelle action...').fill('Améliorer la CI');
    await page.locator('button:has-text("+ Action")').click();
    await expect(page.getByText('Améliorer la CI')).toBeVisible();
  });

  test('effacer réinitialise la session', async ({ page }) => {
    await goTo(page, '/retro');
    // Ajouter un item
    await page.getByPlaceholder('Ajouter...').first().fill('Item temporaire');
    await page.getByPlaceholder('Ajouter...').first().press('Enter');
    await expect(page.getByText('Item temporaire')).toBeVisible();
    // Effacer
    await page.locator('button[title="Effacer toutes les saisies"]').click();
    await expect(page.getByText('Item temporaire')).not.toBeVisible();
  });

});
