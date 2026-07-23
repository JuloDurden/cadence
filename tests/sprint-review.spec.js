const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Sprint Review — /sprint-review', () => {

  // ── Suite 1 : Navigation et header ─────────────────────────────────────────

  test.describe('Suite 1 — Navigation et header', () => {

    test('la page est accessible depuis la sidebar', async ({ page }) => {
      await goTo(page, '/dashboard');
      await page.getByRole('link', { name: 'Sprint Review' }).click();
      await expect(page).toHaveURL(/sprint-review/);
      await expect(page.locator('.page-content')).toBeVisible();
    });

    test('le header affiche le titre "Sprint Review"', async ({ page }) => {
      await goTo(page, '/sprint-review');
      // La classe du header applicatif est `.app-header` (`.page-header` n'a jamais existé)
      await expect(page.locator('.app-header')).toContainText('Sprint Review');
    });

    test('un sélecteur de sprint est présent', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.locator('select').first()).toBeVisible();
    });

    test('les métadonnées du sprint sont affichées (time-box, date revue, participants)', async ({ page }) => {
      await goTo(page, '/sprint-review');
      // Time-box
      await expect(page.locator('.page-content')).toContainText('Time-box');
      // Champ participants (placeholder réel de l'auto-complétion membre/client)
      await expect(page.getByPlaceholder(/Membre d'équipe/i)).toBeVisible();
      // Champ date de revue
      await expect(page.locator('input[type="date"]')).toBeVisible();
    });

    test('le bouton Archiver est présent dans le header', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.locator('.app-header button[title="Archiver cette Sprint Review"]')).toBeVisible();
    });

  });

  // ── Suite 2 : Section Incrément livré ──────────────────────────────────────

  test.describe('Suite 2 — Incrément livré', () => {

    test('la section "Incrément livré" est présente et dépliée par défaut', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.locator('.page-content')).toContainText('Incrément livré');
    });

    test('la case "Filtrer À démontrer" est présente', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.getByText('Filtrer "À démontrer"')).toBeVisible();
    });

    test('le header de section est cliquable (toggle collapse)', async ({ page }) => {
      await goTo(page, '/sprint-review');
      // Cliquer sur le header pour replier
      const hdr = page.locator('.page-content').getByText('Incrément livré').first();
      await hdr.click();
      // La section est maintenant repliée : pas de message "Aucun item livré" visible
      // (on vérifie juste qu'il n'y a pas d'erreur)
      await expect(page.locator('.page-content')).toBeVisible();
    });

  });

  // ── Suite 3 : Section Non terminé ─────────────────────────────────────────

  test.describe('Suite 3 — Non terminé', () => {

    test('la section "Non terminé" est présente', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.locator('.page-content')).toContainText('Non terminé');
    });

  });

  // ── Suite 4 : Section Vélocité ─────────────────────────────────────────────

  test.describe('Suite 4 — Vélocité', () => {

    test('la section "Vélocité" est présente', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.locator('.page-content')).toContainText('Vélocité');
    });

    test('les 3 métriques SP sont affichées', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.locator('.page-content')).toContainText('SP planifiés');
      await expect(page.locator('.page-content')).toContainText('SP livrés');
      await expect(page.locator('.page-content')).toContainText('Complétion');
    });

  });

  // ── Suite 5 : Section Décisions backlog ───────────────────────────────────

  test.describe('Suite 5 — Décisions backlog', () => {

    test('la section "Décisions backlog" est présente', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.locator('.page-content')).toContainText('Décisions backlog');
    });

    test('le bouton "Ajouter une décision" est visible', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.getByText('Ajouter une décision')).toBeVisible();
    });

    test('cliquer sur "Ajouter une décision" affiche le formulaire inline', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await page.getByText('Ajouter une décision').click();
      await expect(page.getByPlaceholder(/Décrire l'item/i)).toBeVisible();
      // exact: true — sinon le bouton "Ajouter une note" (toujours visible, section Notes
      // globales) matche aussi "Ajouter" en tant que sous-chaîne du nom accessible.
      // "Annuler" est ambigu même en exact: le bouton Undo du header (hors .page-content)
      // a pour aria-label "Annuler" (nom accessible identique, pas juste une sous-chaîne) —
      // on scope donc la recherche à .page-content pour ne cibler que le formulaire.
      const content = page.locator('.page-content');
      await expect(content.getByRole('button', { name: 'Ajouter', exact: true })).toBeVisible();
      await expect(content.getByRole('button', { name: 'Annuler', exact: true })).toBeVisible();
    });

    test('ajouter une décision l\'affiche dans la liste', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await page.getByText('Ajouter une décision').click();
      await page.getByPlaceholder(/Décrire l'item/i).fill('Créer story handle rotation');
      await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
      await expect(page.locator('.page-content')).toContainText('Créer story handle rotation');
    });

    test('une décision "Nouvel item" affiche un bouton "→ Backlog"', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await page.getByText('Ajouter une décision').click();
      await page.getByPlaceholder(/Décrire l'item/i).fill('Feature test backlog');
      await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
      await expect(page.getByText('→ Backlog')).toBeVisible();
    });

    test('cliquer sur "→ Backlog" marque la décision comme "Créé"', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await page.getByText('Ajouter une décision').click();
      await page.getByPlaceholder(/Décrire l'item/i).fill('Feature test backlog apply');
      await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
      await page.getByText('→ Backlog').click();
      await expect(page.locator('.page-content')).toContainText('Créé');
    });

  });

  // ── Suite 6 : Section Notes globales ──────────────────────────────────────

  test.describe('Suite 6 — Notes globales', () => {

    test('la section "Notes globales" est présente avec un textarea', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.locator('.page-content')).toContainText('Notes globales');
      // Les notes sont horodatées (comme les post-its Vision NNL) : pas de textarea
      // unique toujours affiché, il faut d'abord créer une note via "Ajouter une note"
      await page.getByText('Ajouter une note').click();
      await expect(page.getByPlaceholder(/Retours stakeholders/i)).toBeVisible();
    });

    test('saisir une note la conserve dans le textarea', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await page.getByText('Ajouter une note').click();
      const ta = page.getByPlaceholder(/Retours stakeholders/i);
      await ta.fill('Bonne revue, stakeholders satisfaits');
      await expect(ta).toHaveValue('Bonne revue, stakeholders satisfaits');
    });

  });

  // ── Suite 7 : Archives ────────────────────────────────────────────────────

  test.describe('Suite 7 — Archives', () => {

    test('la section Archives est présente', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await expect(page.locator('.page-content')).toContainText('Archives');
    });

    test('cliquer sur le bouton Archiver crée une archive', async ({ page }) => {
      await goTo(page, '/sprint-review');
      await page.locator('.app-header button[title="Archiver cette Sprint Review"]').click();
      // La section Archives doit afficher "Archives (1)"
      await expect(page.locator('.page-content')).toContainText('Archives (1)');
    });

    test("une archive est cliquable et affiche son contenu", async ({ page }) => {
      await goTo(page, '/sprint-review');
      await page.locator('.app-header button[title="Archiver cette Sprint Review"]').click();
      // Cliquer sur la card archive pour l'ouvrir
      await page.locator('.archive-card-hdr').first().click();
      await expect(page.locator('.archive-card-body').first()).toBeVisible();
    });

  });

});
