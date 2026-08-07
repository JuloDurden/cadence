const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

test.describe('Réglages', () => {

  test('affiche les onglets de configuration', async ({ page }) => {
    await goTo(page, '/settings');
    await expect(page.locator('.page-content')).toBeVisible();
  });

  test('affiche la section Configuration des sprints', async ({ page }) => {
    await goTo(page, '/settings');
    await expect(page.getByText('Configuration des sprints')).toBeVisible();
  });

  test('affiche le champ Durée du sprint en semaines', async ({ page }) => {
    await goTo(page, '/settings');
    await expect(page.getByText('Durée du sprint (semaines)')).toBeVisible();
  });

  test('affiche le champ Date de debut du Sprint 1', async ({ page }) => {
    await goTo(page, '/settings');
    await expect(page.getByText('Date de debut du Sprint 1')).toBeVisible();
    // L'input de type date est présent dans la section sprint
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeAttached();
  });

  test('affiche le champ Capacite par defaut', async ({ page }) => {
    await goTo(page, '/settings');
    await expect(page.getByText('Capacite par defaut (SP/sprint)')).toBeVisible();
  });

  test('affiche le bouton Enregistrer', async ({ page }) => {
    await goTo(page, '/settings');
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible();
  });

  test('affiche la section Import / Export', async ({ page }) => {
    await goTo(page, '/settings');
    await expect(page.getByText('Import / Export')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exporter JSON' })).toBeVisible();
  });

  test('affiche la section Colonnes Kanban avec un picker de couleur par colonne', async ({ page }) => {
    await goTo(page, '/settings');
    await expect(page.getByText('Colonnes Kanban')).toBeVisible();
    await expect(page.locator('[data-testid="color-picker-trigger"]').first()).toBeVisible();
  });

  test('cliquer le picker de couleur ouvre la palette prédéfinie', async ({ page }) => {
    await goTo(page, '/settings');
    await page.locator('[data-testid="color-picker-trigger"]').first().click();
    const popover = page.locator('[data-testid="color-picker-popover"]');
    await expect(popover).toBeVisible();
    await expect(popover.locator('[data-testid="color-picker-swatch"]')).toHaveCount(13);
    // Choisir une couleur de la palette referme le popover
    await popover.locator('[data-testid="color-picker-swatch"]').first().click();
    await expect(popover).not.toBeVisible();
  });

  // Section Réinitialisation (2026-08-07) : préparation d'un jeu de démo propre, réservée Admin.
  // Élargie à Admin + PO (2026-08-07, suite, retour Julien : "un bouton pour supprimer tout sauf
  // les comptes utilisateurs") pour accueillir le reset total — voir describe ci-dessous. Les 2
  // boutons ciblés (Product Backlog, Clients) restent réservés Admin, gating individuel inchangé.
  test.describe('Réinitialisation (Admin)', () => {

    // Rôle corrigé : PO -> DEV (2026-08-07) — depuis l'élargissement de la section à Admin + PO
    // pour le bouton de reset total, un PO voit désormais la section (juste sans les 2 boutons
    // Admin). Seul un rôle sans aucun des deux droits (Dev, Scrum Master, Stakeholder) ne la voit
    // plus du tout ; Dev choisi comme représentant, voir le describe "Réinitialisation totale".
    test('la section Réinitialisation est absente pour un rôle sans droits (Dev)', async ({ page }) => {
      await goTo(page, '/settings', { role: 'DEV' });
      await expect(page.getByText('Réinitialisation', { exact: true })).toHaveCount(0);
    });

    test('affiche la section Réinitialisation avec les 2 boutons pour un Admin', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await expect(page.getByText('Réinitialisation', { exact: true })).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-backlog"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toBeVisible();
    });

    test('le bouton Réinitialiser les clients est désactivé tant que le Product Backlog n\'est pas vide', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await expect(page.locator('[data-testid="reset-backlog-count"]')).not.toContainText('0 item(s), 0 Epic');
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toBeDisabled();
      await expect(page.locator('[data-testid="reset-clients-count"]')).toContainText('Disponible une fois le Product Backlog vide');
    });

    test('annuler la confirmation ne modifie pas le Product Backlog', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      const before = await page.locator('[data-testid="reset-backlog-count"]').textContent();
      await page.locator('[data-testid="btn-reset-backlog"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-cancel"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="reset-backlog-count"]')).toHaveText(before);
    });

    test('confirmer réinitialise le Product Backlog et débloque la réinitialisation des clients', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await page.locator('[data-testid="btn-reset-backlog"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-confirm"]').click();
      await expect(page.locator('[data-testid="reset-backlog-count"]')).toContainText('0 item(s), 0 Epic(s)/Initiative(s)');
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toBeEnabled();
    });

    test('confirmer réinitialise la liste des clients une fois le Backlog vide', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await page.locator('[data-testid="btn-reset-backlog"]').click();
      await page.locator('[data-testid="dialog-confirm"]').click();
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toBeEnabled();

      await page.locator('[data-testid="btn-reset-clients"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-confirm"]').click();
      await expect(page.locator('[data-testid="reset-clients-count"]')).toHaveText('0 client(s)');
    });

  });

  // Reset total (v0.97.7, 2026-08-07, retour Julien : "un bouton pour supprimer tout sauf les
  // comptes utilisateurs") — réservé Admin + PO (décision Julien, AskUserQuestion), confirmation
  // renforcée par saisie du mot-clé "SUPPRIMER" (ResetAllDataModal.tsx), pas le simple Oui/Non de
  // DialogContext. Vide données métier (items, Epics/Initiatives, sprints, équipe, clients...) sans
  // toucher aux comptes (hors périmètre du blob JSON testé ici) ni aux réglages personnalisés
  // (`kanbanCols` vérifié préservé ci-dessous, proxy pour `settings`/`customTags`).
  test.describe('Réinitialisation totale (v0.97.7)', () => {

    test('le bouton de reset total est visible pour un PO, sans les 2 boutons réservés Admin', async ({ page }) => {
      await goTo(page, '/settings', { role: 'PO' });
      await expect(page.getByText('Réinitialisation', { exact: true })).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-all"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-backlog"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toHaveCount(0);
    });

    test('le bouton de reset total est aussi visible pour un Admin, à côté des 2 boutons ciblés', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await expect(page.locator('[data-testid="btn-reset-all"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-backlog"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toBeVisible();
    });

    test('ouvrir la modal affiche le récapitulatif, le bouton de confirmation reste désactivé tant que le mot-clé n\'est pas exact', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await page.locator('[data-testid="btn-reset-all"]').click();

      const modal = page.locator('[data-testid="reset-all-modal"]');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('irréversible');

      const confirmBtn = page.locator('[data-testid="reset-all-confirm-btn"]');
      await expect(confirmBtn).toBeDisabled();

      await page.locator('[data-testid="reset-all-keyword-input"]').fill('suppr');
      await expect(confirmBtn).toBeDisabled();

      await page.locator('[data-testid="reset-all-keyword-input"]').fill('SUPPRIMER');
      await expect(confirmBtn).toBeEnabled();
    });

    test('annuler la modal ne modifie rien', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      const before = await page.locator('[data-testid="reset-backlog-count"]').textContent();

      await page.locator('[data-testid="btn-reset-all"]').click();
      await page.locator('[data-testid="reset-all-keyword-input"]').fill('SUPPRIMER');
      await page.locator('[data-testid="reset-all-modal"]').getByRole('button', { name: 'Annuler' }).click();

      await expect(page.locator('[data-testid="reset-all-modal"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="reset-backlog-count"]')).toHaveText(before);
    });

    test('confirmer avec le mot-clé exact réinitialise tout et conserve les réglages (colonnes Kanban)', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      const kanbanColsBefore = await page.locator('[data-testid="color-picker-trigger"]').count();
      expect(kanbanColsBefore).toBeGreaterThan(0);

      await page.locator('[data-testid="btn-reset-all"]').click();
      await page.locator('[data-testid="reset-all-keyword-input"]').fill('SUPPRIMER');
      await page.locator('[data-testid="reset-all-confirm-btn"]').click();

      await expect(page.locator('[data-testid="reset-all-modal"]')).not.toBeVisible();
      await expect(page.getByRole('status')).toContainText('réinitialisées');
      await expect(page.locator('[data-testid="reset-backlog-count"]')).toContainText('0 item(s), 0 Epic(s)/Initiative(s)');
      await expect(page.locator('[data-testid="reset-clients-count"]')).toHaveText('0 client(s)');
      // Réglages préservés : mêmes colonnes Kanban qu'avant (settings/kanbanCols non touchés).
      await expect(page.locator('[data-testid="color-picker-trigger"]')).toHaveCount(kanbanColsBefore);
    });

    test('confirmer vide aussi les fiches équipe (page Team), sans supprimer les comptes utilisateurs', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await page.locator('[data-testid="btn-reset-all"]').click();
      await page.locator('[data-testid="reset-all-keyword-input"]').fill('SUPPRIMER');
      await page.locator('[data-testid="reset-all-confirm-btn"]').click();
      await expect(page.locator('[data-testid="reset-all-modal"]')).not.toBeVisible();

      // Les fiches équipe (TeamMember) disparaissent avec le reset ; les comptes applicatifs
      // (table `User`, hors du blob JSON réinitialisé ici) ne sont jamais touchés — vérifié par
      // lecture de code (voir docs/corrections.md), pas testable en E2E sans flux de connexion
      // dédié : cet Admin reste connecté juste après le reset, preuve indirecte que son propre
      // compte a bien survécu à l'opération.
      //
      // Navigation SPA (clic sur le lien de la Sidebar), pas `goTo('/team')` (2026-08-07, test
      // corrigé) — `goTo` recharge une page complète et re-mocke `/api/**` à zéro (voir
      // helpers.js), donc `GET /api/state` renvoie de nouveau `{ data: null }` et l'app repart du
      // DEMO_STATE en mémoire : le reset qu'on vient de faire (jamais vraiment persisté par ce mock
      // générique) redeviendrait invisible. Un clic sur le lien reste dans la même page React
      // (React Router), donc dans le même state en mémoire déjà réinitialisé.
      await page.locator('a[href="/team"]').click();
      await expect(page.locator('.page-content')).toBeVisible();
      await expect(page.locator('[data-testid="member-card"]')).toHaveCount(0);
    });

  });

});
