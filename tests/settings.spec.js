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
  // les comptes utilisateurs") pour accueillir le reset total, voir describe ci-dessous. Les 2
  // boutons ciblés (Product Backlog, Clients) restent réservés Admin, gating individuel inchangé.
  test.describe('Réinitialisation (Admin)', () => {

    // Rôle corrigé : PO -> DEV (2026-08-07), depuis l'élargissement de la section à Admin + PO
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
  // comptes utilisateurs"), réservé Admin + PO (décision Julien, AskUserQuestion), confirmation
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
  // éléments existants (0 ajout, uniquement des mises à jour).
  test.describe('Export/Import Excel du Backlog (v0.97.8)', () => {

    test('affiche les boutons Export/Import Excel', async ({ page }) => {
      await goTo(page, '/settings');
      await expect(page.locator('[data-testid="btn-export-excel"]')).toBeVisible();
      await expect(page.locator('[data-testid="input-import-excel"]')).toBeAttached();
    });

    test('exporter Excel télécharge un fichier .xlsx nommé avec la date du jour', async ({ page }) => {
      await goTo(page, '/settings');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('[data-testid="btn-export-excel"]').click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^cadence-backlog-\d{4}-\d{2}-\d{2}\.xlsx$/);
    });

    test('réimporter le fichier exporté ouvre la modal de mapping avec les 2 feuilles et des correspondances déjà suggérées', async ({ page }) => {
      await goTo(page, '/settings');
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
  // qu'il s'applique dès le premier rendu.
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

      await expect(page.locator('[data-testid="api-tokens-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="api-token-row"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="api-token-create-btn"]')).toBeDisabled();
    });

    test('générer un jeton l\'affiche en clair une seule fois et l\'ajoute à la liste', async ({ page }) => {
      await goTo(page, '/settings');
      await mockApiTokensApi(page, []);
      await page.reload();
      await page.waitForLoadState('networkidle');

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

      await page.locator('[data-testid="api-token-revoke"]').click();
      await page.locator('[data-testid="dialog-cancel"]').click();

      await expect(page.locator('[data-testid="api-token-row"]')).toHaveCount(1);
    });

  });

  // Intégration GitHub (v0.97.11, 2026-08-08, Phase 5 roadmap v1) : réservée Admin (secret
  // d'organisation, contrairement aux jetons API MCP personnels ci-dessus). `GET /api/github-config`
  // mocké par `goTo()` (voir helpers.js) ne couvre pas `/api/github-config` : même stratégie que les
  // 2 blocs précédents, mock stateful enregistré APRÈS `goTo()` puis `page.reload()`.
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
      await expect(page.locator('[data-testid="github-section"]')).toHaveCount(0);
    });

    test('affiche le bouton de connexion quand aucun dépôt n\'est configuré', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockGitHubConfigApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');

      await expect(page.locator('[data-testid="github-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="github-connect-btn"]')).toBeVisible();
    });

    test('connecter un dépôt affiche l\'état connecté avec l\'aperçu du jeton', async ({ page }) => {
      await goTo(page, '/settings', { role: 'ADMIN' });
      await mockGitHubConfigApi(page, null);
      await page.reload();
      await page.waitForLoadState('networkidle');

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

      await expect(page.locator('[data-testid="github-config-connected"]')).toBeVisible();
      await page.locator('[data-testid="github-disconnect-btn"]').click();
      await expect(page.locator('[data-testid="dialog-overlay"]')).toBeVisible();
      await page.locator('[data-testid="dialog-confirm"]').click();

      await expect(page.locator('[data-testid="github-config-connected"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="github-connect-btn"]')).toBeVisible();
    });

  });

});
