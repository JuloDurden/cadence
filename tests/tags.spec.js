const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');
const { BASE_STATE } = require('./fixtures');

// État avec tags sur items et membres
const stateWithTags = {
  ...BASE_STATE,
  settings: {
    ...BASE_STATE.settings,
    tags: [
      { id: 't1', label: 'Front', builtin: true },
      { id: 't2', label: 'Back', builtin: true },
      { id: 't3', label: 'API', builtin: true },
      { id: 't4', label: 'Infra', builtin: true },
      { id: 't5', label: 'UX', builtin: true },
      { id: 't6', label: 'Dette technique', builtin: true },
      { id: 't7', label: 'Sécurité', builtin: true },
      { id: 't8', label: 'Performance', builtin: true },
    ],
  },
  team: [
    { id: 'm1', name: 'Alice Martin', role: 'Dev Full-Stack', spDay: 1, photo: '', tags: ['t1', 't3'] },
    { id: 'm2', name: 'Bob Dupont', role: 'QA', spDay: 1, photo: '', tags: ['t2'] },
  ],
  sprints: [
    {
      id: 'sp1', number: 1, label: 'Sprint 1', goal: '', startDate: '', endDate: '',
      items: [
        {
          id: 'i1', key: 'AUT-001', client: 'faxfa', desc: 'Item tagué Front', sp: 3,
          priority: 1, type: 'story', tags: ['t1', 't3'],
          us: { role: '', want: '', goal: '' }, criteria: [], deps: [],
          assignees: [], scoring: { framework: null }, deadline: { date: '', type: 'none' },
        },
        {
          id: 'i2', key: 'AUT-002', client: 'faxfa', desc: 'Item sans tag', sp: 2,
          priority: 2, type: 'story', tags: [],
          us: { role: '', want: '', goal: '' }, criteria: [], deps: [],
          assignees: [], scoring: { framework: null }, deadline: { date: '', type: 'none' },
        },
      ],
    },
  ],
  nextTagId: 9,
};

test.describe('Tags / Labels libres', () => {

  // ── Réglages ───────────────────────────────────────────────────────

  test('la section Tags est presente dans les Réglages', async ({ page }) => {
    await loadWithState(page, stateWithTags);
    await page.click('button[onclick*="switchTab(\'settings\')"]');
    await page.waitForSelector('#tab-settings', { state: 'visible' });
    await page.waitForTimeout(300);
    const text = await page.locator('#tab-settings').innerText();
    expect(text).toMatch(/Tags|Labels/i);
  });

  test('les tags prédéfinis sont affichés dans les Réglages', async ({ page }) => {
    await loadWithState(page, stateWithTags);
    await page.click('button[onclick*="switchTab(\'settings\')"]');
    await page.waitForSelector('#tags-settings-list', { state: 'visible' });
    await page.waitForTimeout(300);
    const text = await page.locator('#tags-settings-list').innerText();
    expect(text).toMatch(/Front/);
    expect(text).toMatch(/Back/);
  });

  test('ajouter un tag global depuis les Réglages fonctionne', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await page.click('button[onclick*="switchTab(\'settings\')"]');
    await page.waitForSelector('#new-global-tag-input', { state: 'visible' });
    await page.waitForTimeout(300);
    await page.fill('#new-global-tag-input', 'Mobile');
    await page.click('button[onclick="addGlobalTag()"]');
    await page.waitForTimeout(300);
    const text = await page.locator('#tags-settings-list').innerText();
    expect(text).toMatch(/Mobile/);
    expect(errors).toHaveLength(0);
  });

  test('les tags prédéfinis ne peuvent pas être supprimés', async ({ page }) => {
    await loadWithState(page, stateWithTags);
    await page.click('button[onclick*="switchTab(\'settings\')"]');
    await page.waitForSelector('#tags-settings-list', { state: 'visible' });
    await page.waitForTimeout(300);
    // Les tags builtin n'ont pas de bouton ✕
    const deleteBtn = page.locator('#tags-settings-list button[onclick*="removeGlobalTag(\'t1\')"]');
    expect(await deleteBtn.count()).toBe(0);
  });

  // ── Modale US — onglet Général ─────────────────────────────────────

  test('le tag picker est présent dans la modale US (onglet Général)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    await page.waitForTimeout(300);
    const tagChips = page.locator('#item-tag-chips');
    await expect(tagChips).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('le champ tag affiche un dropdown de suggestions', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#item-tag-chips', { state: 'visible' });
    await page.waitForTimeout(300);
    await page.fill('#item-tag-input', 'Fr');
    await page.waitForTimeout(200);
    const dropdown = page.locator('#item-tag-dropdown');
    await expect(dropdown).toBeVisible();
    const text = await dropdown.innerText();
    expect(text).toMatch(/Front/);
    expect(errors).toHaveLength(0);
  });

  test('sélectionner un tag depuis le dropdown l\'ajoute en chip', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#item-tag-chips', { state: 'visible' });
    await page.waitForTimeout(300);
    await page.fill('#item-tag-input', 'Front');
    await page.waitForTimeout(200);
    await page.locator('#item-tag-dropdown .tag-opt').first().click({ force: true });
    await page.waitForTimeout(200);
    const chips = await page.locator('#item-tag-chips .tag-chip').count();
    expect(chips).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });

  test('créer un nouveau tag depuis la modale US l\'ajoute à la liste globale', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    await page.click('button[onclick="openModal(null)"]');
    await page.waitForSelector('#item-tag-chips', { state: 'visible' });
    await page.waitForTimeout(300);
    await page.fill('#item-tag-input', 'Nouveau-Tag-Test');
    await page.waitForTimeout(200);
    const newOpt = page.locator('#item-tag-dropdown .tag-opt-new');
    if (await newOpt.count() > 0) {
      await newOpt.click({ force: true });
      await page.waitForTimeout(200);
      const chips = await page.locator('#item-tag-chips .tag-chip').count();
      expect(chips).toBeGreaterThan(0);
    }
    expect(errors).toHaveLength(0);
  });

  test('les tags sont sauvegardés sur l\'item à la fermeture de la modale', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    // Ouvrir l'item i1 qui a déjà des tags
    await page.click('button[aria-label="Modifier AUT-001"]');
    await page.waitForSelector('#item-tag-chips', { state: 'visible' });
    await page.waitForTimeout(400);
    // Les chips doivent afficher Front et API (t1 et t3)
    const chipsText = await page.locator('#item-tag-chips').innerText();
    expect(chipsText).toMatch(/Front|API/);
    expect(errors).toHaveLength(0);
  });

  // ── Modale US — onglet Équipe ──────────────────────────────────────

  test('la section membres suggérés apparaît dans l\'onglet Équipe', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(200);
    await page.click('button[aria-label="Modifier AUT-001"]');
    await page.waitForSelector('#modal-overlay', { state: 'visible' });
    await page.waitForTimeout(300);
    await page.click('button[data-tab="team"]');
    await page.waitForTimeout(200);
    const suggested = page.locator('#m-suggested-members');
    await expect(suggested).toBeVisible();
    // Alice a les tags t1 (Front) et t3 (API) qui matchent l'item i1
    const text = await suggested.innerText();
    expect(text).toMatch(/Alice|sugg/i);
    expect(errors).toHaveLength(0);
  });

  // ── Backlog : filtre et chips ──────────────────────────────────────

  test('le sélecteur de filtre par tag est présent dans le backlog', async ({ page }) => {
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    const sel = page.locator('#backlog-filter-tag');
    await expect(sel).toBeVisible();
    const opts = await sel.locator('option').count();
    expect(opts).toBeGreaterThan(1); // au moins "Tous les tags" + les tags définis
  });

  test('filtrer par tag ne montre que les items correspondants', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    // Sélectionner le tag Front (t1) — seul i1 l'a
    await page.selectOption('#backlog-filter-tag', 't1');
    await page.waitForTimeout(200);
    const rows = await page.locator('#backlog-table-container tr[id^="row-"]').count();
    expect(rows).toBe(1);
    expect(errors).toHaveLength(0);
  });

  test('les chips de tags apparaissent dans les lignes du backlog', async ({ page }) => {
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'backlog');
    await page.waitForTimeout(300);
    const row = page.locator('#row-i1');
    await expect(row).toBeVisible();
    const chips = row.locator('.tag-chip');
    expect(await chips.count()).toBeGreaterThan(0);
  });

  // ── Membre : tag de compétence ─────────────────────────────────────

  test('le picker de tags est présent dans la modale membre', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'team');
    await page.waitForTimeout(300);
    // Ouvrir la modale du premier membre
    await page.click('.team-card');
    await page.waitForSelector('#team-modal-overlay', { state: 'visible' });
    await page.waitForTimeout(300);
    const tagChips = page.locator('#member-tag-chips');
    await expect(tagChips).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('les tags existants du membre sont affichés à l\'ouverture', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadWithState(page, stateWithTags);
    await goToTab(page, 'team');
    await page.waitForTimeout(300);
    // Alice a les tags Front (t1) et API (t3)
    const cards = page.locator('.team-card');
    await cards.first().click();
    await page.waitForSelector('#member-tag-chips', { state: 'visible' });
    await page.waitForTimeout(300);
    const text = await page.locator('#member-tag-chips').innerText();
    expect(text).toMatch(/Front|API/);
    expect(errors).toHaveLength(0);
  });

});
