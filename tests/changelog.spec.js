const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Changelog', () => {

  test('affiche la page Changelog', async ({ page }) => {
    await goTo(page, '/changelog');
    await expect(page.locator('.page-content')).toBeVisible();
  });

  test('affiche la version courante en tête de liste', async ({ page }) => {
    await goTo(page, '/changelog');
    // v0.83.0 est la version courante
    await expect(page.locator('.cl-card.current')).toBeVisible();
    await expect(page.locator('.cl-card.current')).toContainText('v0.86');
  });

  test('affiche le badge "En cours" sur la version courante', async ({ page }) => {
    await goTo(page, '/changelog');
    await expect(page.locator('.cl-card-badge')).toBeVisible();
    await expect(page.locator('.cl-card-badge')).toContainText('En cours');
  });

  test('la heatmap affiche les 4 boutons de fenêtre temporelle', async ({ page }) => {
    await goTo(page, '/changelog');
    await expect(page.getByRole('button', { name: '15 j' })).toBeVisible();
    await expect(page.getByRole('button', { name: '1 mois' })).toBeVisible();
    await expect(page.getByRole('button', { name: '3 mois' })).toBeVisible();
    await expect(page.getByRole('button', { name: '6 mois' })).toBeVisible();
  });

  test('la heatmap affiche "1 mois" sélectionné par défaut', async ({ page }) => {
    await goTo(page, '/changelog');
    // Le label de la meta doit contenir "30 derniers jours"
    await expect(page.locator('.cl-heatmap-meta')).toContainText('30 derniers jours');
  });

  test('cliquer sur "15 j" met à jour le label de la heatmap', async ({ page }) => {
    await goTo(page, '/changelog');
    await page.getByRole('button', { name: '15 j' }).click();
    await expect(page.locator('.cl-heatmap-meta')).toContainText('15 derniers jours');
  });

  test('cliquer sur "3 mois" met à jour le label de la heatmap', async ({ page }) => {
    await goTo(page, '/changelog');
    await page.getByRole('button', { name: '3 mois' }).click();
    await expect(page.locator('.cl-heatmap-meta')).toContainText('90 derniers jours');
  });

  test('cliquer sur "6 mois" met à jour le label de la heatmap', async ({ page }) => {
    await goTo(page, '/changelog');
    await page.getByRole('button', { name: '6 mois' }).click();
    await expect(page.locator('.cl-heatmap-meta')).toContainText('180 derniers jours');
  });

  test('la recherche filtre les versions', async ({ page }) => {
    await goTo(page, '/changelog');
    // "Backlog virtuelle" est une expression spécifique à v0.74.0
    await page.locator('.form-input').fill('Backlog virtuelle');
    await expect(page.locator('[data-version="v0.74.0"]')).toBeVisible();
    // v0.76.0 (auto-planning) ne contient pas "Backlog virtuelle" → doit disparaître
    await expect(page.locator('.cl-card.current')).toHaveCount(0);
  });

  test('la navigation latérale liste les versions', async ({ page }) => {
    await goTo(page, '/changelog');
    await expect(page.locator('.cl-nav')).toBeVisible();
    await expect(page.locator('.cl-nav-item')).not.toHaveCount(0);
  });

});
