/**
 * Suite : Dashboard
 * - Widgets Stats Sprint
 * - Propagation des statuts (done/delivered reconnus comme termines)
 * - SP livres dans Stats Globales
 */
const { test, expect } = require('@playwright/test');
const { loadWithState, goToTab } = require('./helpers');
const { BASE_STATE } = require('./fixtures');

// Helper pour creer un item minimal avec le bon modele de donnees
function makeItem(overrides) {
  return {
    id: 'i1', key: 'T-1', desc: 'Test item', type: 'story',
    priority: 3, sp: 5, status: 'todo',
    assignees: [], client: '',
    us: { role: '', want: '', goal: '' },
    criteria: [], deps: [],
    scoring: { val: 0, eff: 0, risk: 0, time: 0 },
    deadline: { date: '', type: 'none' },
    dodChecks: { dor: [], dod: [] },
    createdAt: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

test.describe('Dashboard', () => {

  test('se charge sans erreur JS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await loadWithState(page);
    await goToTab(page, 'dashboard');
    await page.waitForTimeout(300);

    expect(errors).toHaveLength(0);
  });

  test('affiche les widgets du sprint actif', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'dashboard');

    await expect(page.locator('.widget-card, [class*="widget"]').first()).toBeVisible();
  });

  test('Stats Sprint comptent les SP des items termines (status=done)', async ({ page }) => {
    await loadWithState(page);
    await goToTab(page, 'dashboard');

    // AUT-3 a status=done et sp=8 dans BASE_STATE -> "8" doit apparaitre
    const dashText = await page.locator('#tab-dashboard').innerText();
    expect(dashText).toContain('8');
  });

  test('status=done compte comme termine', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const state = {
      ...BASE_STATE,
      sprints: [{
        id: 's1', name: 'Sprint 1', number: 1, goal: '', status: 'active',
        startDate: '2026-06-01', endDate: '2026-06-14',
        items: [
          makeItem({ id: 'i1', key: 'T-1', desc: 'Item A', sp: 5, status: 'done', client: 'acm' }),
          makeItem({ id: 'i2', key: 'T-2', desc: 'Item B', sp: 3, status: 'done', client: 'acm' }),
          makeItem({ id: 'i3', key: 'T-3', desc: 'Item C', sp: 2, status: 'doing', client: 'acm' }),
        ],
      }],
      activeSprintId: 's1',
      kanbanSprintId: 's1',
    };

    await loadWithState(page, state);
    await goToTab(page, 'dashboard');
    await page.waitForTimeout(300);

    expect(errors).toHaveLength(0);

    // 2 items done sur 3 total
    const dashText = await page.locator('#tab-dashboard').innerText();
    expect(dashText).toMatch(/2\/3|2 \/3/);
  });

  test('status=delivered est aussi reconnu comme termine', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const state = {
      ...BASE_STATE,
      kanbanColumns: [
        { id: 'todo',      name: 'A faire',   color: '#6b7280' },
        { id: 'doing',     name: 'En cours',  color: '#d97706' },
        { id: 'done',      name: 'Termine',   color: '#16a34a' },
        { id: 'delivered', name: 'Livre',     color: '#0d9488' },
      ],
      sprints: [{
        id: 's1', name: 'Sprint 1', number: 1, goal: '', status: 'active',
        startDate: '2026-06-01', endDate: '2026-06-14',
        items: [
          makeItem({ id: 'i1', key: 'T-1', desc: 'Livre en prod', sp: 13, status: 'delivered', client: 'acm' }),
        ],
      }],
      activeSprintId: 's1',
      kanbanSprintId: 's1',
    };

    await loadWithState(page, state);
    await goToTab(page, 'dashboard');
    await page.waitForTimeout(300);

    expect(errors).toHaveLength(0);
    const dashText = await page.locator('#tab-dashboard').innerText();
    expect(dashText).toContain('13');
  });

  test('Stats Globales se rend sans crash avec sprints termines', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const state = {
      ...BASE_STATE,
      sprints: [
        {
          id: 's1', name: 'Sprint Termine', number: 1, goal: '', status: 'closed',
          startDate: '2026-05-01', endDate: '2026-05-14',
          items: [
            makeItem({ id: 'i1', key: 'T-1', sp: 10, status: 'done', client: 'acm' }),
          ],
        },
        {
          id: 's2', name: 'Sprint Actif', number: 2, goal: '', status: 'active',
          startDate: '2026-06-01', endDate: '2026-06-14',
          items: [],
        },
      ],
      activeSprintId: 's2',
      kanbanSprintId: 's2',
    };

    await loadWithState(page, state);
    await goToTab(page, 'dashboard');
    await page.waitForTimeout(300);

    expect(errors).toHaveLength(0);
  });

  test('Daily Standup se rend sans crash', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await loadWithState(page);
    await goToTab(page, 'daily');
    await page.waitForTimeout(300);

    expect(errors).toHaveLength(0);
    await expect(page.locator('#tab-daily')).toBeVisible();
  });

});
