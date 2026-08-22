const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

// Réforme du Changelog (2026-08-22, docs/corrections.md) : l'historique en dur (data/changelog.ts,
// 170 versions) est remplacé par la table changelog_entries (backend), servie par GET /api/changelog
// et publiée par POST /api/changelog (réservé Admin). La page fetch au montage - tests/helpers.js
// mocke cet appel via `opts.changelogEntries` (voir DEFAULT_CHANGELOG_ENTRIES), plutôt que de
// dépendre du contenu réel du fichier historique comme avant cette réforme.
test.describe('Changelog', () => {

  test('affiche la page Changelog', async ({ page }) => {
    await goTo(page, '/changelog');
    await expect(page.locator('.page-content')).toBeVisible();
  });

  test('affiche la version courante en tête de liste avec le badge "En cours"', async ({ page }) => {
    await goTo(page, '/changelog');
    await expect(page.locator('.cl-card.current')).toBeVisible();
    await expect(page.locator('.cl-card.current')).toContainText('v0.98.20');
    await expect(page.locator('.cl-card-badge')).toContainText('En cours');
  });

  test('affiche un état de chargement puis une erreur si l\'API échoue', async ({ page }) => {
    await page.route('**/api/**', r => {
      if (r.request().url().includes('/api/changelog')) return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Erreur serveur' }) });
      // Même garde-fou que tests/helpers.js (goTo) : sans ce cas particulier, `{ data: null }`
      // ferait lire "compte neuf" et ouvrirait le panneau Onboarding par-dessus la page, sans
      // rapport avec ce test.
      if (r.request().url().includes('/api/onboarding')) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ onboardingSeenAt: '2026-01-01T00:00:00.000Z', onboardingCompletedItems: [] }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) });
    });
    await page.goto('http://localhost:4321/login');
    await page.evaluate(() => localStorage.setItem('cadence_token', 'test-token-e2e'));
    await page.goto('http://localhost:4321/changelog');
    await expect(page.getByText('Impossible de charger le changelog.')).toBeVisible();
  });

  test('la heatmap affiche les 4 boutons de fenêtre temporelle', async ({ page }) => {
    await goTo(page, '/changelog');
    await expect(page.getByRole('button', { name: '1 mois' })).toBeVisible();
    await expect(page.getByRole('button', { name: '3 mois' })).toBeVisible();
    await expect(page.getByRole('button', { name: '6 mois' })).toBeVisible();
    await expect(page.getByRole('button', { name: '1 an' })).toBeVisible();
  });

  test('la heatmap affiche "3 mois" sélectionné par défaut', async ({ page }) => {
    await goTo(page, '/changelog');
    await expect(page.locator('.cl-heatmap-meta')).toContainText('90 derniers jours');
  });

  test('cliquer sur "1 mois" met à jour le label de la heatmap', async ({ page }) => {
    await goTo(page, '/changelog');
    await page.getByRole('button', { name: '1 mois' }).click();
    await expect(page.locator('.cl-heatmap-meta')).toContainText('30 derniers jours');
  });

  test('la recherche filtre les versions', async ({ page }) => {
    await goTo(page, '/changelog');
    await page.locator('.form-input').fill('Jalon de test');
    await expect(page.getByText('v0.90').first()).toBeVisible();
    await expect(page.locator('.cl-card.current')).toHaveCount(0);
  });

  test('une recherche sans résultat affiche un message clair', async ({ page }) => {
    await goTo(page, '/changelog');
    await page.locator('.form-input').fill('zzz introuvable zzz');
    await expect(page.getByText('Aucun resultat pour')).toBeVisible();
  });

  test('la navigation latérale liste les versions', async ({ page }) => {
    await goTo(page, '/changelog');
    await expect(page.locator('.cl-nav')).toBeVisible();
    await expect(page.locator('.cl-nav-item')).not.toHaveCount(0);
  });

  // Réforme du Changelog : les versions "mineures" consécutives d'un même préfixe (v0.X.1, v0.X.2...)
  // se replient en un seul groupe cliquable dans la nav ET dans la liste, plutôt que d'occuper chacune
  // leur propre carte - c'est ce qui rend une longue liste praticable (voir ChangelogPage.tsx,
  // buildGroups). Ce test simule un cluster de 3 versions mineures consécutives du même préfixe.
  test('des versions mineures consécutives se replient en un groupe, dépliable au clic', async ({ page }) => {
    const entries = [
      { version: 'v0.98.20', date: '22 Août 2026', dateISO: '2026-08-22', title: 'Version courante', current: true, changes: [{ tag: 'feat', text: 'X' }] },
      { version: 'v0.98.3', date: '21 Août 2026', dateISO: '2026-08-21', title: 'Patch 3', current: false, changes: [{ tag: 'fix', text: 'A' }] },
      { version: 'v0.98.2', date: '20 Août 2026', dateISO: '2026-08-20', title: 'Patch 2', current: false, changes: [{ tag: 'fix', text: 'B' }] },
      { version: 'v0.98.1', date: '19 Août 2026', dateISO: '2026-08-19', title: 'Patch 1', current: false, changes: [{ tag: 'fix', text: 'C' }] },
    ];
    await goTo(page, '/changelog', { changelogEntries: entries });

    const groupHeader = page.locator('[data-testid="cl-group-header"]');
    await expect(groupHeader).toBeVisible();
    await expect(groupHeader).toContainText('3 versions');
    await expect(page.getByText('Patch 3')).not.toBeVisible();

    await groupHeader.click();
    await expect(page.getByText('Patch 3')).toBeVisible();
    await expect(page.getByText('Patch 1')).toBeVisible();
  });

  // Réforme du Changelog : au-delà de GROUPS_PAGE_SIZE (12) groupes, un bouton "Charger les versions
  // précédentes" révèle la suite plutôt que de tout charger d'un coup - voir ChangelogPage.tsx.
  test('un bouton "Charger les versions précédentes" apparaît au-delà de la première page', async ({ page }) => {
    // `v{i}.0` (minor=0) plutôt que `v0.{i}` : reste hors du regroupement par version mineure
    // (isNavMinor, ChangelogPage.tsx) pour tester la pagination isolément - le regroupement lui-même
    // est déjà couvert par le test dédié ci-dessus.
    const entries = [{ version: 'v0.98.20', date: '22 Août 2026', dateISO: '2026-08-22', title: 'Courante', current: true, changes: [{ tag: 'feat', text: 'X' }] }];
    for (let i = 20; i >= 1; i--) {
      entries.push({ version: `v${i}.0`, date: `${i} Juin 2026`, dateISO: `2026-06-${String(i).padStart(2, '0')}`, title: `Jalon ${i}`, current: false, changes: [{ tag: 'feat', text: 'Y' }] });
    }
    await goTo(page, '/changelog', { changelogEntries: entries });

    await expect(page.locator('[data-testid="cl-load-more-btn"]')).toBeVisible();
    await expect(page.locator('.cl-card')).toHaveCount(12);

    await page.locator('[data-testid="cl-load-more-btn"]').click();
    await expect(page.locator('.cl-card')).toHaveCount(21);
    await expect(page.locator('[data-testid="cl-load-more-btn"]')).toHaveCount(0);
  });

  // Réforme du Changelog : publication réservée Admin (décision Julien, AskUserQuestion) - le bouton
  // "+ Publier une version" ne doit apparaître pour aucun autre rôle.
  test('le bouton "Publier une version" n\'est visible que pour un compte Admin', async ({ page }) => {
    await goTo(page, '/changelog', { role: 'ADMIN' });
    await expect(page.locator('[data-testid="publish-changelog-btn"]')).toBeVisible();
  });

  test('le bouton "Publier une version" est absent pour un compte PO', async ({ page }) => {
    await goTo(page, '/changelog', { role: 'PO' });
    await expect(page.locator('[data-testid="publish-changelog-btn"]')).toHaveCount(0);
  });

  test('publier une version l\'ajoute en tête de liste comme version courante', async ({ page }) => {
    await goTo(page, '/changelog', { role: 'ADMIN' });

    await page.route('**/api/changelog', async r => {
      if (r.request().method() !== 'POST') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }) });
      const body = r.request().postDataJSON();
      return r.fulfill({
        status: 201, contentType: 'application/json',
        body: JSON.stringify({ entry: { ...body, current: true } }),
      });
    });

    await page.locator('[data-testid="publish-changelog-btn"]').click();
    await expect(page.locator('[data-testid="publish-changelog-modal"]')).toBeVisible();

    await page.locator('[data-testid="publish-version-input"]').fill('v0.98.21');
    await page.locator('[data-testid="publish-title-input"]').fill('Nouvelle version de test');
    await page.locator('[data-testid="publish-change-text-input"]').fill('Un changement de test');
    await page.locator('[data-testid="publish-submit-btn"]').click();

    await expect(page.locator('[data-testid="publish-changelog-modal"]')).toHaveCount(0);
    await expect(page.locator('.cl-card.current')).toContainText('v0.98.21');
    await expect(page.locator('.cl-card.current')).toContainText('Nouvelle version de test');
  });

  test('publier sans changement renseigné affiche une erreur et n\'appelle pas l\'API', async ({ page }) => {
    await goTo(page, '/changelog', { role: 'ADMIN' });
    let posted = false;
    await page.route('**/api/changelog', r => {
      if (r.request().method() === 'POST') posted = true;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [] }) });
    });

    await page.locator('[data-testid="publish-changelog-btn"]').click();
    await page.locator('[data-testid="publish-version-input"]').fill('v0.98.21');
    await page.locator('[data-testid="publish-title-input"]').fill('Titre');
    await page.locator('[data-testid="publish-submit-btn"]').click();

    await expect(page.getByText('Au moins un changement est requis')).toBeVisible();
    expect(posted).toBe(false);
  });

});
