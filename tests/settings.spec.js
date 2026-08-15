const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

/** Clique sur un onglet des Réglages (voir SettingsPage.tsx, Phase 6bis sous-chantier 1). À
 *  rappeler après tout `page.reload()` : le tab actif est un simple `useState`, remis à
 *  "general" par défaut à chaque montage du composant. */
async function openSettingsTab(page, id) {
  await page.locator(`[data-testid="settings-tab-${id}"]`).click();
}

test.describe('Réglages', () => {

  // Onglets (Phase 6bis, roadmap v1, sous-chantier 1, 2026-08-13) : la page, auparavant un long
  // scroll de <section>, est découpée en 6 onglets (Général/Équipe/Intégrations/Sécurité/
  // Import-Export/Avancé), certains gatés par rôle (un onglet dont tout le contenu est réservé à
  // un rôle ne s'affiche pas du tout, voir SettingsPage.tsx `visibleTabIds`).
  test.describe('Onglets (sous-chantier 1)', () => {

    test('affiche la barre d\'onglets avec "Général" actif par défaut', async ({ page }) => {
      await goTo(page, '/settings');
      await expect(page.locator('[data-testid="settings-tab-general"]')).toBeVisible();
      await expect(page.locator('[data-testid="settings-tab-general"]')).toHaveClass(/active/);
      await expect(page.getByText('Configuration des sprints')).toBeVisible();
    });

    test('un rôle sans droits (Dev) ne voit que les onglets Général, Sécurité et Import/Export', async ({ page }) => {
      await goTo(page, '/settings', { role: 'DEV' });
      await expect(page.locator('[data-testid="settings-tab-general"]')).toBeVisible();
      await expect(page.locator('[data-testid="settings-tab-security"]')).toBeVisible();
      await expect(page.locator('[data-testid="settings-tab-import-export"]')).toBeVisible();
      await expect(page.locator('[data-testid="settings-tab-team"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="settings-tab-integrations"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="settings-tab-advanced"]')).toHaveCount(0);
    });

    test('un PO voit en plus l\'onglet Avancé, mais pas Équipe ni Intégrations', async ({ page }) => {
      await goTo(page, '/settings', { role: 'PO' });
      await expect(page.locator('[data-testid="settings-tab-advanced"]')).toBeVisible();
      await expect(page.locator('[data-testid="settings-tab-team"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="settings-tab-integrations"]')).toHaveCount(0);
    });

    test('un Admin voit les 6 onglets', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      for (const id of ['general', 'team', 'integrations', 'security', 'import-export', 'advanced']) {
        await expect(page.locator(`[data-testid="settings-tab-${id}"]`)).toBeVisible();
      }
    });

    test('cliquer sur Sécurité affiche les Jetons API et masque la Configuration des sprints', async ({ page }) => {
      await goTo(page, '/settings');
      await openSettingsTab(page, 'security');
      await expect(page.locator('[data-testid="api-tokens-section"]')).toBeVisible();
      await expect(page.getByText('Configuration des sprints')).not.toBeVisible();
    });

    test('cliquer sur Import/Export affiche la section Import / Export', async ({ page }) => {
      await goTo(page, '/settings');
      await openSettingsTab(page, 'import-export');
      await expect(page.getByText('Import / Export')).toBeVisible();
    });

    test('cliquer sur Équipe affiche la gestion des utilisateurs (Admin)', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await openSettingsTab(page, 'team');
      await expect(page.locator('.page-content')).toBeVisible();
      await expect(page.getByText('Configuration des sprints')).not.toBeVisible();
    });

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
    await openSettingsTab(page, 'import-export');
    await expect(page.getByText('Import / Export')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exporter JSON' })).toBeVisible();
  });

  // Apparence étoffée (Phase 6bis, sous-chantier 4, v0.98.8) : thème Système + cartes visuelles,
  // couleur principale par thème avec aperçu, logo d'équipe, densité, page de démarrage, sidebar
  // repliée par défaut. Section AppearanceSection.tsx, affichée sous l'onglet "Général" (par
  // défaut), aucun clic d'onglet nécessaire avant ces tests.
  test.describe('Apparence étoffée (v0.98.8)', () => {

    test('affiche les 3 cartes de thème, Clair actif par défaut sur le jeu de démo', async ({ page }) => {
      await goTo(page, '/settings');
      await expect(page.locator('[data-testid="theme-card-system"]')).toBeVisible();
      await expect(page.locator('[data-testid="theme-card-light"]')).toBeVisible();
      await expect(page.locator('[data-testid="theme-card-dark"]')).toBeVisible();
      await expect(page.locator('[data-testid="theme-card-light"]')).toHaveClass(/active/);
    });

    test('cliquer sur la carte Système la rend active et applique le thème résolu immédiatement', async ({ page }) => {
      await goTo(page, '/settings');
      await page.locator('[data-testid="theme-card-system"]').click();
      await expect(page.locator('[data-testid="theme-card-system"]')).toHaveClass(/active/);
      await expect(page.locator('[data-testid="theme-card-light"]')).not.toHaveClass(/active/);
      // Résolu tout de suite (prefers-color-scheme non forcé en test = clair), sans attendre
      // "Enregistrer" (retour Julien, 2026-08-14 : "le thème Système ne se met à jour qu'en
      // appliquant").
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });

    test('cliquer sur Clair puis Sombre applique le thème sur <html> immédiatement, sans "Enregistrer"', async ({ page }) => {
      await goTo(page, '/settings');
      await page.locator('[data-testid="theme-card-dark"]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.locator('[data-testid="theme-card-light"]').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });

    // Un seul réglage de couleur visible à la fois, celui du thème effectivement affiché, pas de
    // bascule manuelle indépendante (retour Julien, 2026-08-14).
    test('seul le réglage de couleur du thème actuellement affiché est visible', async ({ page }) => {
      await goTo(page, '/settings');
      await expect(page.locator('[data-testid="primary-color-light"]')).toBeVisible();
      await expect(page.locator('[data-testid="primary-color-dark"]')).toHaveCount(0);

      await page.locator('[data-testid="theme-card-dark"]').click();
      await expect(page.locator('[data-testid="primary-color-dark"]')).toBeVisible();
      await expect(page.locator('[data-testid="primary-color-light"]')).toHaveCount(0);
    });

    test('choisir une couleur principale claire met à jour l\'aperçu et le champ hexadécimal', async ({ page }) => {
      await goTo(page, '/settings');
      await page.locator('[data-testid="primary-color-light"]').fill('#059669');
      await expect(page.getByText('#059669', { exact: false })).toBeVisible();
    });

    test('affiche le logo par défaut (initiales) et le bouton de retrait est absent tant qu\'aucun logo n\'est chargé', async ({ page }) => {
      await goTo(page, '/settings');
      await expect(page.locator('[data-testid="logo-preview"]')).toContainText('ACT');
      await expect(page.locator('[data-testid="logo-remove-btn"]')).toHaveCount(0);
    });

    test('la densité par défaut est Confortable, déplacer le curseur change le libellé', async ({ page }) => {
      await goTo(page, '/settings');
      await expect(page.locator('[data-testid="density-label"]')).toHaveText('Confortable');
      await page.locator('[data-testid="density-slider"]').fill('0');
      await expect(page.locator('[data-testid="density-label"]')).toHaveText('Très compact');
      await page.locator('[data-testid="density-slider"]').fill('4');
      await expect(page.locator('[data-testid="density-label"]')).toHaveText('Très spacieux');
    });

    test('changer la page de démarrage envoie la sauvegarde immédiatement, sans cliquer sur "Enregistrer"', async ({ page }) => {
      await goTo(page, '/settings');
      const [request] = await Promise.all([
        page.waitForRequest(r => r.url().includes('/api/state') && r.method() === 'PUT'),
        page.locator('[data-testid="start-page-select"]').selectOption('/kanban'),
      ]);
      const body = request.postDataJSON();
      expect(body.data.settings.defaultStartPage).toBe('/kanban');
    });

    test('activer la sidebar repliée par défaut replie immédiatement la Sidebar affichée', async ({ page }) => {
      await goTo(page, '/settings');
      const toggle = page.locator('[data-testid="sidebar-collapsed-default-toggle"]');
      await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
      await toggle.click();
      await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
    });

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
  // les comptes utilisateurs") pour accueillir le reset total, voir describe ci-dessous. Les 2
  // boutons ciblés (Product Backlog, Clients) restent réservés Admin, gating individuel inchangé.
  // Section déplacée sous l'onglet "Avancé" (Phase 6bis, sous-chantier 1, 2026-08-13) : ouvrir cet
  // onglet est un préalable commun à tous les tests ci-dessous, hors le test "rôle sans droits" qui
  // vérifie justement que l'onglet lui-même est absent.
  test.describe('Réinitialisation (Admin)', () => {

    // Rôle corrigé : PO -> DEV (2026-08-07), depuis l'élargissement de la section à Admin + PO
    // pour le bouton de reset total, un PO voit désormais la section (juste sans les 2 boutons
    // Admin). Seul un rôle sans aucun des deux droits (Dev, Scrum Master, Stakeholder) ne la voit
    // plus du tout ; Dev choisi comme représentant, voir le describe "Réinitialisation totale".
    // Ni la section ni son onglet "Avancé" ne sont accessibles à ce rôle.
    test('la section Réinitialisation est absente pour un rôle sans droits (Dev)', async ({ page }) => {
      await goTo(page, '/settings', { role: 'DEV' });
      await expect(page.locator('[data-testid="settings-tab-advanced"]')).toHaveCount(0);
      await expect(page.getByText('Réinitialisation', { exact: true })).toHaveCount(0);
    });

    test('affiche la section Réinitialisation avec les 2 boutons pour un Admin', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await openSettingsTab(page, 'advanced');
      await expect(page.getByText('Réinitialisation', { exact: true })).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-backlog"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toBeVisible();
    });

    test('le bouton Réinitialiser les clients est désactivé tant que le Product Backlog n\'est pas vide', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await openSettingsTab(page, 'advanced');
      await expect(page.locator('[data-testid="reset-backlog-count"]')).not.toContainText('0 item(s), 0 Epic');
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toBeDisabled();
      await expect(page.locator('[data-testid="reset-clients-count"]')).toContainText('Disponible une fois le Product Backlog vide');
    });

    test('annuler la confirmation ne modifie pas le Product Backlog', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await openSettingsTab(page, 'advanced');
      const before = await page.locator('[data-testid="reset-backlog-count"]').textContent();
      await page.locator('[data-testid="btn-reset-backlog"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-cancel"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="reset-backlog-count"]')).toHaveText(before);
    });

    test('confirmer réinitialise le Product Backlog et débloque la réinitialisation des clients', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await openSettingsTab(page, 'advanced');
      await page.locator('[data-testid="btn-reset-backlog"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-confirm"]').click();
      await expect(page.locator('[data-testid="reset-backlog-count"]')).toContainText('0 item(s), 0 Epic(s)/Initiative(s)');
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toBeEnabled();
    });

    test('confirmer réinitialise la liste des clients une fois le Backlog vide', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await openSettingsTab(page, 'advanced');
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
  // comptes utilisateurs"), réservé Admin + PO (décision Julien, AskUserQuestion), confirmation
  // renforcée par saisie du mot-clé "SUPPRIMER" (ResetAllDataModal.tsx), pas le simple Oui/Non de
  // DialogContext. Vide données métier (items, Epics/Initiatives, sprints, équipe, clients...) sans
  // toucher aux comptes (hors périmètre du blob JSON testé ici) ni aux réglages personnalisés
  // (`kanbanCols` vérifié préservé ci-dessous, proxy pour `settings`/`customTags`). Section sous
  // l'onglet "Avancé" (Phase 6bis, sous-chantier 1) : ouvrir cet onglet est un préalable commun.
  test.describe('Réinitialisation totale (v0.97.7)', () => {

    test('le bouton de reset total est visible pour un PO, sans les 2 boutons réservés Admin', async ({ page }) => {
      await goTo(page, '/settings', { role: 'PO' });
      await openSettingsTab(page, 'advanced');
      await expect(page.getByText('Réinitialisation', { exact: true })).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-all"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-backlog"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toHaveCount(0);
    });

    test('le bouton de reset total est aussi visible pour un Admin, à côté des 2 boutons ciblés', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await openSettingsTab(page, 'advanced');
      await expect(page.locator('[data-testid="btn-reset-all"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-backlog"]')).toBeVisible();
      await expect(page.locator('[data-testid="btn-reset-clients"]')).toBeVisible();
    });

    test('ouvrir la modal affiche le récapitulatif, le bouton de confirmation reste désactivé tant que le mot-clé n\'est pas exact', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await openSettingsTab(page, 'advanced');
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
      await openSettingsTab(page, 'advanced');
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

      await openSettingsTab(page, 'advanced');
      await page.locator('[data-testid="btn-reset-all"]').click();
      await page.locator('[data-testid="reset-all-keyword-input"]').fill('SUPPRIMER');
      await page.locator('[data-testid="reset-all-confirm-btn"]').click();

      await expect(page.locator('[data-testid="reset-all-modal"]')).not.toBeVisible();
      await expect(page.getByRole('status')).toContainText('réinitialisées');
      await expect(page.locator('[data-testid="reset-backlog-count"]')).toContainText('0 item(s), 0 Epic(s)/Initiative(s)');
      await expect(page.locator('[data-testid="reset-clients-count"]')).toHaveText('0 client(s)');
      // Réglages préservés : mêmes colonnes Kanban qu'avant (settings/kanbanCols non touchés).
      await openSettingsTab(page, 'general');
      await expect(page.locator('[data-testid="color-picker-trigger"]')).toHaveCount(kanbanColsBefore);
    });

    test('confirmer vide aussi les fiches équipe (page Team), sans supprimer les comptes utilisateurs', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await openSettingsTab(page, 'advanced');
      await page.locator('[data-testid="btn-reset-all"]').click();
      await page.locator('[data-testid="reset-all-keyword-input"]').fill('SUPPRIMER');
      await page.locator('[data-testid="reset-all-confirm-btn"]').click();
      await expect(page.locator('[data-testid="reset-all-modal"]')).not.toBeVisible();

      // Les fiches équipe (TeamMember) disparaissent avec le reset ; les comptes applicatifs
      // (table `User`, hors du blob JSON réinitialisé ici) ne sont jamais touchés, vérifié par
      // lecture de code (voir docs/corrections.md), pas testable en E2E sans flux de connexion
      // dédié : cet Admin reste connecté juste après le reset, preuve indirecte que son propre
      // compte a bien survécu à l'opération.
      //
      // Navigation SPA (clic sur le lien de la Sidebar), pas `goTo('/team')` (2026-08-07, test
      // corrigé), `goTo` recharge une page complète et re-mocke `/api/**` à zéro (voir
      // helpers.js), donc `GET /api/state` renvoie de nouveau `{ data: null }` et l'app repart du
      // DEMO_STATE en mémoire : le reset qu'on vient de faire (jamais vraiment persisté par ce mock
      // générique) redeviendrait invisible. Un clic sur le lien reste dans la même page React
      // (React Router), donc dans le même state en mémoire déjà réinitialisé.
      await page.locator('a[href="/team"]').click();
      await expect(page.locator('.page-content')).toBeVisible();
      await expect(page.locator('[data-testid="member-card"]')).toHaveCount(0);
    });

  });

  // Export/Import Excel du Backlog (v0.97.8, 2026-08-07, Phase 5 roadmap v1), export scopé au
  // Product Backlog (items) + Epics/Initiatives, sur 2 feuilles distinctes ("Backlog" et "Epics &
  // Initiatives") ; import via une fenêtre de correspondance des colonnes plutôt qu'une
  // correspondance silencieuse (voir ImportExcelMappingModal.tsx / utils/excelBacklog.ts). Le
  // round-trip export -> réimport du même fichier, sans toucher aux suggestions par défaut, sert de
  // test de bout en bout : toutes les Clés déjà présentes dans le fichier doivent matcher les
  // éléments existants (0 ajout, uniquement des mises à jour). Section sous l'onglet "Import/
  // Export" (Phase 6bis, sous-chantier 1) : ouvrir cet onglet est un préalable commun.
  test.describe('Export/Import Excel du Backlog (v0.97.8)', () => {

    test('affiche les boutons Export/Import Excel', async ({ page }) => {
      await goTo(page, '/settings');
      await openSettingsTab(page, 'import-export');
      await expect(page.locator('[data-testid="btn-export-excel"]')).toBeVisible();
      await expect(page.locator('[data-testid="input-import-excel"]')).toBeAttached();
    });

    test('exporter Excel télécharge un fichier .xlsx nommé avec la date du jour', async ({ page }) => {
      await goTo(page, '/settings');
      await openSettingsTab(page, 'import-export');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('[data-testid="btn-export-excel"]').click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^cadence-backlog-\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    test('réimporter le fichier exporté ouvre la modal de mapping avec les 2 feuilles et des correspondances déjà suggérées', async ({ page }) => {
      await goTo(page, '/settings');
      await openSettingsTab(page, 'import-export');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('[data-testid="btn-export-excel"]').click(),
      ]);
      const filePath = await download.path();
      expect(filePath).toBeTruthy();

      await page.setInputFiles('[data-testid="input-import-excel"]', filePath);

      await expect(page.locator('[data-testid="import-excel-mapping-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="import-excel-sheet-0"]')).toContainText('Backlog');
      await expect(page.locator('[data-testid="import-excel-sheet-target-0"]')).toHaveValue('items');
      await expect(page.locator('[data-testid="import-excel-col-0-0"]')).toHaveValue('key');
      await expect(page.locator('[data-testid="import-excel-col-0-1"]')).toHaveValue('title');

      await expect(page.locator('[data-testid="import-excel-sheet-1"]')).toContainText('Epics & Initiatives');
      await expect(page.locator('[data-testid="import-excel-sheet-target-1"]')).toHaveValue('epics');
      await expect(page.locator('[data-testid="import-excel-col-1-0"]')).toHaveValue('key');
    });

    test('annuler la modal de mapping ne modifie rien', async ({ page }) => {
      await goTo(page, '/settings');
      await openSettingsTab(page, 'import-export');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('[data-testid="btn-export-excel"]').click(),
      ]);
      const filePath = await download.path();

      await page.setInputFiles('[data-testid="input-import-excel"]', filePath);
      const modal = page.locator('[data-testid="import-excel-mapping-modal"]');
      await expect(modal).toBeVisible();
      await modal.getByRole('button', { name: 'Annuler' }).click();

      await expect(modal).not.toBeVisible();
      await expect(page.getByRole('status')).toHaveCount(0);
    });

    test('confirmer sans modifier les suggestions ne crée aucun nouvel élément (les Clés matchent déjà)', async ({ page }) => {
      await goTo(page, '/settings');
      await openSettingsTab(page, 'import-export');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('[data-testid="btn-export-excel"]').click(),
      ]);
      const filePath = await download.path();

      await page.setInputFiles('[data-testid="input-import-excel"]', filePath);
      await expect(page.locator('[data-testid="import-excel-mapping-modal"]')).toBeVisible();
      await page.locator('[data-testid="import-excel-confirm-btn"]').click();

      await expect(page.locator('[data-testid="import-excel-mapping-modal"]')).not.toBeVisible();
      const toast = page.getByRole('status');
      await expect(toast).toContainText('0 item(s) ajouté');
      await expect(toast).toContainText('0 Epic(s)/Initiative(s) ajouté');
    });

  });

  // Jetons API personnels / MCP Claude (Cadence) (v0.97.9, 2026-08-08) : section personnelle, sans
  // gating de rôle (chaque utilisateur ne gère que ses propres jetons, le filtrage par propriétaire
  // est fait côté serveur). `GET /api/state` mocké par `goTo()` (voir helpers.js) ne couvre pas
  // `/api/api-tokens` : même stratégie que `presentation-mode.spec.js` pour
  // `/api/presentation-link`, un mock stateful enregistré APRÈS `goTo()` puis `page.reload()` pour
  // qu'il s'applique dès le premier rendu. Section sous l'onglet "Sécurité" (Phase 6bis,
  // sous-chantier 1) : l'onglet actif étant un simple `useState`, il est remis à "general" par
  // chaque `page.reload()`, d'où l'ouverture de l'onglet APRÈS le reload plutôt qu'avant.
  test.describe('Jetons API personnels (MCP) (v0.97.9)', () => {

    async function mockApiTokensApi(page, initialTokens = []) {
      let tokens = [...initialTokens];
      await page.route('**/api/api-tokens', async r => {
        if (r.request().method() === 'GET') {
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tokens }) });
        }
        if (r.request().method() === 'POST') {
          const body = r.request().postDataJSON();
          const apiToken = { id: `tok-${tokens.length + 1}`, name: body.name, createdAt: '2026-08-08T10:00:00.000Z', lastUsedAt: null };
          tokens = [apiToken, ...tokens];
          return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ token: 'cadence-pat-fake-token-value', apiToken }) });
        }
        return r.continue();
      });
      await page.route('**/api/api-tokens/*', async r => {
        if (r.request().method() === 'DELETE') {
          const id = r.request().url().split('/').pop();
          tokens = tokens.filter(t => t.id !== id);
          return r.fulfill({ status: 204 });
        }
        return r.continue();
      });
    }

    test('affiche la section avec l\'état vide', async ({ page }) => {
      await goTo(page, '/settings');
      await mockApiTokensApi(page, []);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'security');

      await expect(page.locator('[data-testid="api-tokens-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="api-token-row"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="api-token-create-btn"]')).toBeDisabled();
    });

    test('générer un jeton l\'affiche en clair une seule fois et l\'ajoute à la liste', async ({ page }) => {
      await goTo(page, '/settings');
      await mockApiTokensApi(page, []);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'security');

      await page.locator('[data-testid="api-token-name-input"]').fill('Claude Desktop');
      await page.locator('[data-testid="api-token-create-btn"]').click();

      const reveal = page.locator('[data-testid="api-token-reveal"]');
      await expect(reveal).toBeVisible();
      await expect(reveal.locator('input')).toHaveValue('cadence-pat-fake-token-value');

      await expect(page.locator('[data-testid="api-token-row"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="api-token-row"]')).toContainText('Claude Desktop');

      // Fermer la révélation ne fait disparaître que le bloc de rappel, pas la ligne dans la liste.
      await reveal.getByRole('button', { name: 'J\'ai copié le jeton' }).click();
      await expect(reveal).not.toBeVisible();
      await expect(page.locator('[data-testid="api-token-row"]')).toHaveCount(1);
    });

    test('révoquer un jeton le retire de la liste après confirmation', async ({ page }) => {
      await goTo(page, '/settings');
      await mockApiTokensApi(page, [
        { id: 'tok-1', name: 'Claude Desktop', createdAt: '2026-08-08T09:00:00.000Z', lastUsedAt: null },
      ]);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'security');

      await expect(page.locator('[data-testid="api-token-row"]')).toHaveCount(1);
      await page.locator('[data-testid="api-token-revoke"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-confirm"]').click();

      await expect(page.locator('[data-testid="api-token-row"]')).toHaveCount(0);
      await expect(page.getByRole('status')).toContainText('révoqué');
    });

    test('annuler la confirmation de révocation ne modifie pas la liste', async ({ page }) => {
      await goTo(page, '/settings');
      await mockApiTokensApi(page, [
        { id: 'tok-1', name: 'Claude Desktop', createdAt: '2026-08-08T09:00:00.000Z', lastUsedAt: null },
      ]);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'security');

      await page.locator('[data-testid="api-token-revoke"]').click();
      await page.locator('[data-testid="dialog-cancel"]').click();

      await expect(page.locator('[data-testid="api-token-row"]')).toHaveCount(1);
    });

  });

  // Intégration GitHub (v0.97.11, 2026-08-08, Phase 5 roadmap v1) : réservée Admin (secret
  // d'organisation, contrairement aux jetons API MCP personnels ci-dessus). `GET /api/github-config`
  // mocké par `goTo()` (voir helpers.js) ne couvre pas `/api/github-config` : même stratégie que les
  // 2 blocs précédents, mock stateful enregistré APRÈS `goTo()` puis `page.reload()`. Section sous
  // l'onglet "Intégrations", lui-même absent pour un rôle non Admin (Phase 6bis, sous-chantier 1) :
  // le test "rôle non Admin" ci-dessous n'a donc rien à ouvrir, la section reste absente quel que
  // soit l'onglet actif.
  test.describe('Intégration GitHub (v0.97.11)', () => {

    async function mockGitHubConfigApi(page, initialConfig = null) {
      let config = initialConfig;
      await page.route('**/api/github-config', async r => {
        const method = r.request().method();
        if (method === 'GET') {
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config }) });
        }
        if (method === 'PUT') {
          const body = r.request().postDataJSON();
          if (body.owner === 'introuvable') {
            return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Dépôt introuvable ou jeton sans accès' }) });
          }
          config = { owner: body.owner, repo: body.repo, tokenPreview: '••••fake', updatedAt: '2026-08-08T10:00:00.000Z' };
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config }) });
        }
        if (method === 'DELETE') {
          config = null;
          return r.fulfill({ status: 204 });
        }
        return r.continue();
      });
    }

    test('la section est absente pour un rôle non Admin (PO)', async ({ page }) => {
      await goTo(page, '/settings', { role: 'PO' });
      await expect(page.locator('[data-testid="settings-tab-integrations"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="github-section"]')).toHaveCount(0);
    });

    test('affiche le bouton de connexion quand aucun dépôt n\'est configuré', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockGitHubConfigApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await expect(page.locator('[data-testid="github-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="github-connect-btn"]')).toBeVisible();
    });

    test('connecter un dépôt affiche l\'état connecté avec l\'aperçu du jeton', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockGitHubConfigApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="github-connect-btn"]').click();
      await page.locator('[data-testid="github-owner-input"]').fill('juloclavel');
      await page.locator('[data-testid="github-repo-input"]').fill('cadence-test');
      await page.locator('[data-testid="github-token-input"]').fill('ghp_fake');
      await page.locator('[data-testid="github-save-btn"]').click();

      const connected = page.locator('[data-testid="github-config-connected"]');
      await expect(connected).toBeVisible();
      await expect(connected).toContainText('juloclavel/cadence-test');
      await expect(connected).toContainText('••••fake');
    });

    test('une erreur de connexion affiche le message renvoyé par le serveur', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockGitHubConfigApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="github-connect-btn"]').click();
      await page.locator('[data-testid="github-owner-input"]').fill('introuvable');
      await page.locator('[data-testid="github-repo-input"]').fill('cadence-test');
      await page.locator('[data-testid="github-token-input"]').fill('ghp_fake');
      await page.locator('[data-testid="github-save-btn"]').click();

      await expect(page.locator('[data-testid="github-save-error"]')).toContainText('Dépôt introuvable ou jeton sans accès');
      await expect(page.locator('[data-testid="github-config-connected"]')).not.toBeVisible();
    });

    test('déconnecter retire la configuration après confirmation', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockGitHubConfigApi(page, { owner: 'juloclavel', repo: 'cadence-test', tokenPreview: '••••fake', updatedAt: '2026-08-08T09:00:00.000Z' });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await expect(page.locator('[data-testid="github-config-connected"]')).toBeVisible();
      await page.locator('[data-testid="github-disconnect-btn"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-confirm"]').click();

      await expect(page.locator('[data-testid="github-config-connected"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="github-connect-btn"]')).toBeVisible();
    });

  });

  // Intégration Slack (v0.97.12, 2026-08-08, Phase 5 roadmap v1) : réservée Admin, comme
  // l'intégration GitHub. Flux en 2 temps (voir SlackSection.tsx) : "Vérifier le jeton" (ne
  // persiste rien, sert à peupler le sélecteur de canaux avant le tout 1er enregistrement) puis
  // "Enregistrer". `GET /api/slack-config` mocké par `goTo()` (voir helpers.js) ne couvre pas
  // `/api/slack-config` : même stratégie que les blocs précédents, mock stateful enregistré APRÈS
  // `goTo()` puis `page.reload()`. Section sous l'onglet "Intégrations" (Phase 6bis, sous-chantier 1).
  test.describe('Intégration Slack (v0.97.12)', () => {

    const FAKE_CHANNELS = [{ id: 'C1', name: 'general' }, { id: 'C2', name: 'dev-alerts' }];

    async function mockSlackApi(page, initialConfig = null) {
      let config = initialConfig;
      await page.route('**/api/slack-config', async r => {
        const method = r.request().method();
        if (method === 'GET') {
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config }) });
        }
        if (method === 'PUT') {
          const body = r.request().postDataJSON();
          const toRow = (row) => ({ channelId: row?.channelId || null, channelName: row?.channelName || null, enabled: !!row?.enabled });
          config = {
            teamName: 'Cadence Test',
            tokenPreview: '••••fake',
            updatedAt: '2026-08-08T10:00:00.000Z',
            sprintClose: toRow(body.sprintClose),
            blocked: toRow(body.blocked),
            daily: toRow(body.daily),
          };
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config }) });
        }
        if (method === 'DELETE') { config = null; return r.fulfill({ status: 204 }); }
        return r.continue();
      });
      await page.route('**/api/slack-config/verify', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ team: 'Cadence Test', channels: FAKE_CHANNELS }) })
      );
      await page.route('**/api/slack-config/channels', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ channels: FAKE_CHANNELS }) })
      );
    }

    test('la section est absente pour un rôle non Admin (PO)', async ({ page }) => {
      await goTo(page, '/settings', { role: 'PO' });
      await expect(page.locator('[data-testid="slack-section"]')).toHaveCount(0);
    });

    test('affiche le bouton de connexion quand aucun workspace n\'est configuré', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockSlackApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await expect(page.locator('[data-testid="slack-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="slack-connect-btn"]')).toBeVisible();
    });

    test('vérifier le jeton révèle le nom du workspace et les 3 lignes de notification', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockSlackApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="slack-connect-btn"]').click();
      await page.locator('[data-testid="slack-token-input"]').fill('xoxb-fake');
      await page.locator('[data-testid="slack-verify-btn"]').click();

      await expect(page.getByText('Cadence Test')).toBeVisible();
      await expect(page.locator('[data-testid="slack-row-sprintClose-enabled"]')).toBeVisible();
      await expect(page.locator('[data-testid="slack-row-blocked-enabled"]')).toBeVisible();
      await expect(page.locator('[data-testid="slack-row-daily-enabled"]')).toBeVisible();
    });

    test('une erreur de vérification affiche le message renvoyé par le serveur', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockSlackApi(page, null);
      await page.route('**/api/slack-config/verify', r =>
        r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Jeton Slack invalide ou révoqué' }) })
      );
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="slack-connect-btn"]').click();
      await page.locator('[data-testid="slack-token-input"]').fill('xoxb-bad');
      await page.locator('[data-testid="slack-verify-btn"]').click();

      await expect(page.locator('[data-testid="slack-verify-error"]')).toContainText('Jeton Slack invalide ou révoqué');
      await expect(page.locator('[data-testid="slack-row-sprintClose-enabled"]')).toHaveCount(0);
    });

    test('activer une notification avec un canal puis enregistrer affiche l\'état connecté', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockSlackApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="slack-connect-btn"]').click();
      await page.locator('[data-testid="slack-token-input"]').fill('xoxb-fake');
      await page.locator('[data-testid="slack-verify-btn"]').click();
      await expect(page.locator('[data-testid="slack-row-blocked-enabled"]')).toBeVisible();

      await page.locator('[data-testid="slack-row-blocked-enabled"]').check();
      await page.locator('[data-testid="slack-row-blocked-channel"]').selectOption('C2');
      await page.locator('[data-testid="slack-save-btn"]').click();

      const connected = page.locator('[data-testid="slack-config-connected"]');
      await expect(connected).toBeVisible();
      await expect(connected).toContainText('Cadence Test');
      await expect(connected).toContainText('dev-alerts');
    });

    test('déconnecter retire la configuration après confirmation', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockSlackApi(page, {
        teamName: 'Cadence Test', tokenPreview: '••••fake', updatedAt: '2026-08-08T09:00:00.000Z',
        sprintClose: { channelId: null, channelName: null, enabled: false },
        blocked: { channelId: 'C2', channelName: 'dev-alerts', enabled: true },
        daily: { channelId: null, channelName: null, enabled: false },
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await expect(page.locator('[data-testid="slack-config-connected"]')).toBeVisible();
      await page.locator('[data-testid="slack-disconnect-btn"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-confirm"]').click();

      await expect(page.locator('[data-testid="slack-config-connected"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="slack-connect-btn"]')).toBeVisible();
    });

  });

  // Intégration Jira (v0.97.13, 2026-08-08, Phase 5 roadmap v1) : réservée Admin, comme GitHub et
  // Slack. Flux en 2 temps (voir JiraSection.tsx) : "Vérifier la connexion" (ne persiste rien, sert
  // à peupler le sélecteur de projet avant le tout 1er enregistrement) puis choix du projet + du
  // Client Cadence (obligatoire, voir routes/jira.ts) puis "Enregistrer". `GET /api/jira-config`
  // mocké par `goTo()` (voir helpers.js) ne couvre pas `/api/jira-config` : même stratégie que les
  // 2 blocs précédents, mock stateful enregistré APRÈS `goTo()` puis `page.reload()`. Section sous
  // l'onglet "Intégrations" (Phase 6bis, sous-chantier 1).
  test.describe('Intégration Jira (v0.97.13)', () => {

    const FAKE_PROJECTS = [{ key: 'PME2', name: 'PME2 Test' }, { key: 'AGA', name: 'AGANOR' }];

    async function mockJiraApi(page, initialConfig = null) {
      let config = initialConfig;
      await page.route('**/api/jira-config', async r => {
        const method = r.request().method();
        if (method === 'GET') {
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config }) });
        }
        if (method === 'PUT') {
          const body = r.request().postDataJSON();
          config = {
            siteUrl: body.siteUrl, email: body.email, tokenPreview: '••••fake',
            projectKey: body.projectKey, projectName: body.projectName,
            storyPointsFieldId: null, epicLinkFieldId: null,
            cadenceClientId: body.cadenceClientId, updatedAt: '2026-08-08T10:00:00.000Z',
          };
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config }) });
        }
        if (method === 'DELETE') { config = null; return r.fulfill({ status: 204 }); }
        return r.continue();
      });
      await page.route('**/api/jira-config/projects', async r => {
        const body = r.request().postDataJSON();
        if (body.apiToken === 'bad-token') {
          return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Email ou jeton API Jira invalide' }) });
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: FAKE_PROJECTS }) });
      });
      await page.route('**/api/jira-config/import', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          issues: [
            { key: 'PME2-1', type: 'Epic', title: 'Epic importé', status: 'To Do', priority: 'Medium', storyPoints: null, parentKey: null },
            { key: 'PME2-2', type: 'Story', title: 'Issue importée', status: 'In Progress', priority: 'High', storyPoints: 5, parentKey: 'PME2-1' },
          ],
          cadenceClientId: 'cl5',
        }) })
      );
    }

    test('la section est absente pour un rôle non Admin (PO)', async ({ page }) => {
      await goTo(page, '/settings', { role: 'PO' });
      await expect(page.locator('[data-testid="jira-section"]')).toHaveCount(0);
    });

    test('affiche le bouton de connexion quand aucun projet n\'est configuré', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockJiraApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await expect(page.locator('[data-testid="jira-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="jira-connect-btn"]')).toBeVisible();
    });

    test('vérifier la connexion révèle la liste des projets', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockJiraApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="jira-connect-btn"]').click();
      await page.locator('[data-testid="jira-site-input"]').fill('cadence-test.atlassian.net');
      await page.locator('[data-testid="jira-email-input"]').fill('julien@example.com');
      await page.locator('[data-testid="jira-token-input"]').fill('fake-token');
      await page.locator('[data-testid="jira-verify-btn"]').click();

      await expect(page.locator('[data-testid="jira-project-select"]')).toBeVisible();
      await expect(page.locator('[data-testid="jira-project-select"] option')).toHaveCount(3); // placeholder + 2 projets
    });

    test('une erreur de vérification affiche le message renvoyé par le serveur', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockJiraApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="jira-connect-btn"]').click();
      await page.locator('[data-testid="jira-site-input"]').fill('cadence-test.atlassian.net');
      await page.locator('[data-testid="jira-email-input"]').fill('julien@example.com');
      await page.locator('[data-testid="jira-token-input"]').fill('bad-token');
      await page.locator('[data-testid="jira-verify-btn"]').click();

      await expect(page.locator('[data-testid="jira-verify-error"]')).toContainText('Email ou jeton API Jira invalide');
      await expect(page.locator('[data-testid="jira-project-select"]')).toHaveCount(0);
    });

    // Client Cadence obligatoire (retour utilisateur, 2026-08-08) : un projet choisi sans Client
    // associé doit bloquer l'enregistrement plutôt que de rattacher silencieusement les items
    // importés au 1er Client de la liste, voir JiraSection.tsx/routes/jira.ts. Le bouton
    // "Enregistrer" est désactivé tant que les deux ne sont pas choisis, plutôt qu'un message
    // d'erreur après coup.
    test('le bouton Enregistrer reste désactivé tant qu\'aucun Client n\'est choisi', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockJiraApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="jira-connect-btn"]').click();
      await page.locator('[data-testid="jira-site-input"]').fill('cadence-test.atlassian.net');
      await page.locator('[data-testid="jira-email-input"]').fill('julien@example.com');
      await page.locator('[data-testid="jira-token-input"]').fill('fake-token');
      await page.locator('[data-testid="jira-verify-btn"]').click();
      await page.locator('[data-testid="jira-project-select"]').selectOption('PME2');

      await expect(page.locator('[data-testid="jira-save-btn"]')).toBeDisabled();
      await page.locator('[data-testid="jira-client-select"]').selectOption('cl5');
      await expect(page.locator('[data-testid="jira-save-btn"]')).toBeEnabled();
    });

    test('choisir un projet et un Client puis enregistrer affiche l\'état connecté', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockJiraApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="jira-connect-btn"]').click();
      await page.locator('[data-testid="jira-site-input"]').fill('cadence-test.atlassian.net');
      await page.locator('[data-testid="jira-email-input"]').fill('julien@example.com');
      await page.locator('[data-testid="jira-token-input"]').fill('fake-token');
      await page.locator('[data-testid="jira-verify-btn"]').click();
      await page.locator('[data-testid="jira-project-select"]').selectOption('PME2');
      await page.locator('[data-testid="jira-client-select"]').selectOption('cl5');
      await page.locator('[data-testid="jira-save-btn"]').click();

      const connected = page.locator('[data-testid="jira-config-connected"]');
      await expect(connected).toBeVisible();
      await expect(connected).toContainText('PME2 Test');
      await expect(connected).toContainText('••••fake');
    });

    test('importer depuis Jira affiche un résumé et le bouton "Importer" reste disponible', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockJiraApi(page, {
        siteUrl: 'https://cadence-test.atlassian.net', email: 'julien@example.com', tokenPreview: '••••fake',
        projectKey: 'PME2', projectName: 'PME2 Test', storyPointsFieldId: null, epicLinkFieldId: null,
        cadenceClientId: 'cl5', updatedAt: '2026-08-08T09:00:00.000Z',
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await expect(page.locator('[data-testid="jira-config-connected"]')).toBeVisible();
      await page.locator('[data-testid="jira-import-btn"]').click();

      await expect(page.getByRole('status')).toContainText('Import Jira');
      await expect(page.locator('[data-testid="jira-import-btn"]')).toBeVisible();
    });

    test('déconnecter retire la configuration après confirmation', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockJiraApi(page, {
        siteUrl: 'https://cadence-test.atlassian.net', email: 'julien@example.com', tokenPreview: '••••fake',
        projectKey: 'PME2', projectName: 'PME2 Test', storyPointsFieldId: null, epicLinkFieldId: null,
        cadenceClientId: 'cl5', updatedAt: '2026-08-08T09:00:00.000Z',
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await expect(page.locator('[data-testid="jira-config-connected"]')).toBeVisible();
      await page.locator('[data-testid="jira-disconnect-btn"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-confirm"]').click();

      await expect(page.locator('[data-testid="jira-config-connected"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="jira-connect-btn"]')).toBeVisible();
    });

  });

  // Phase 6 (roadmap v1), Compagnon IA, sous-chantier 1, v0.98 : configuration singleton de
  // l'assistant (AiSection.tsx), même mock à 1 étape que Intégration GitHub ci-dessus (une clé
  // collée, vérifiée par un appel réel avant enregistrement, pas de sélection intermédiaire comme
  // Slack/Jira). Section sous l'onglet "Intégrations" (Phase 6bis, sous-chantier 1).
  test.describe('Compagnon IA (v0.98)', () => {

    async function mockAiConfigApi(page, initialConfig = null) {
      let config = initialConfig;
      await page.route('**/api/ai-config', async r => {
        const method = r.request().method();
        if (method === 'GET') {
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config }) });
        }
        if (method === 'PUT') {
          const body = r.request().postDataJSON();
          if (body.apiKey === 'bad-key') {
            return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Clé API Anthropic invalide ou révoquée' }) });
          }
          config = { model: body.model, tokenPreview: '••••fake', updatedAt: '2026-08-08T10:00:00.000Z' };
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config }) });
        }
        if (method === 'DELETE') {
          config = null;
          return r.fulfill({ status: 204 });
        }
        return r.continue();
      });
    }

    test('la section est absente pour un rôle non Admin (PO)', async ({ page }) => {
      await goTo(page, '/settings', { role: 'PO' });
      await expect(page.locator('[data-testid="ai-section"]')).toHaveCount(0);
    });

    test('affiche le bouton de connexion quand aucun assistant n\'est configuré', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockAiConfigApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await expect(page.locator('[data-testid="ai-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="ai-connect-btn"]')).toBeVisible();
    });

    test('connecter une clé affiche l\'état connecté avec le modèle et l\'aperçu de la clé', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockAiConfigApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="ai-connect-btn"]').click();
      await page.locator('[data-testid="ai-model-input"]').fill('claude-sonnet-5');
      await page.locator('[data-testid="ai-key-input"]').fill('sk-ant-fake');
      await page.locator('[data-testid="ai-save-btn"]').click();

      const connected = page.locator('[data-testid="ai-config-connected"]');
      await expect(connected).toBeVisible();
      await expect(connected).toContainText('claude-sonnet-5');
      await expect(connected).toContainText('••••fake');
    });

    test('une erreur de connexion affiche le message renvoyé par le serveur', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockAiConfigApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await page.locator('[data-testid="ai-connect-btn"]').click();
      await page.locator('[data-testid="ai-model-input"]').fill('claude-sonnet-5');
      await page.locator('[data-testid="ai-key-input"]').fill('bad-key');
      await page.locator('[data-testid="ai-save-btn"]').click();

      await expect(page.locator('[data-testid="ai-save-error"]')).toContainText('Clé API Anthropic invalide ou révoquée');
      await expect(page.locator('[data-testid="ai-config-connected"]')).not.toBeVisible();
    });

    test('déconnecter retire la configuration après confirmation', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockAiConfigApi(page, { model: 'claude-sonnet-5', tokenPreview: '••••fake', updatedAt: '2026-08-08T09:00:00.000Z' });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await openSettingsTab(page, 'integrations');

      await expect(page.locator('[data-testid="ai-config-connected"]')).toBeVisible();
      await page.locator('[data-testid="ai-disconnect-btn"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-confirm"]').click();

      await expect(page.locator('[data-testid="ai-config-connected"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="ai-connect-btn"]')).toBeVisible();
    });

  });

});
