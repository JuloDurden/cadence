const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

// Phase 6 (roadmap v1), Compagnon IA, sous-chantier 1 (aide à la rédaction/création d'items), v0.98
// (2026-08-08) : panneau de chat global (ChatContext.tsx/ChatPanel.tsx), ouvert depuis un bouton
// dédié dans le Header, visible pour tous les rôles connectés (contrairement à la section Réglages
// qui configure la clé API, réservée Admin, voir tests/settings.spec.js, describe "Compagnon IA").
// POST /api/ai-chat est sans état côté serveur : chaque test mocke une réponse `{ reply, toolCalls }`
// directement, sans dépendre d'une vraie clé Anthropic.
test.describe('Compagnon IA - panneau de chat (v0.98)', () => {

  async function mockAiChatApi(page, respond) {
    await page.route('**/api/ai-chat', async r => {
      const body = r.request().postDataJSON();
      const result = respond(body);
      if (result.status) {
        return r.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify({ error: result.error }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: result.reply, toolCalls: result.toolCalls ?? [] }) });
    });
  }

  test('le bouton Compagnon IA est visible pour tous les rôles connectés (ex. Dev)', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'DEV' });
    await expect(page.locator('[data-testid="chat-toggle-btn"]')).toBeVisible();
  });

  test('ouvrir le panneau affiche l\'état vide, fermer via le bouton "Fermer" le masque', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.locator('[data-testid="chat-toggle-btn"]').click();

    const panel = page.locator('[data-testid="chat-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Demandez-moi de rédiger');

    await panel.locator('button[aria-label="Fermer"]').click();
    await expect(panel).not.toBeVisible();
  });

  test('Echap ferme le panneau', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="chat-panel"]')).not.toBeVisible();
  });

  test('envoyer un message affiche la question puis la réponse de l\'assistant', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockAiChatApi(page, () => ({ reply: 'Voici un brouillon de User Story.' }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Rédige une US pour le login');
    await page.locator('[data-testid="chat-send-btn"]').click();

    await expect(page.locator('[data-testid="chat-message-user"]')).toContainText('Rédige une US pour le login');
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Voici un brouillon de User Story.');
  });

  test('un item créé par le chat affiche un résumé dans la bulle assistant', async ({ page }) => {
    await goTo(page, '/dashboard', { role: 'PO' });
    await mockAiChatApi(page, () => ({
      reply: 'Item créé.',
      toolCalls: [{
        kind: 'item_created',
        item: {
          id: 'chat-item-1', key: 'FAX-099', desc: 'Connexion via SSO', sp: 3, status: 'todo',
          clientId: 'cl5', sprintId: null, priority: 'medium', assignees: [], tags: [], type: 'story',
          epicId: null, createdAt: '2026-08-08T10:00:00.000Z',
        },
        keyCounters: { FAX: 99 },
      }],
    }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Crée un item pour la connexion SSO');
    await page.locator('[data-testid="chat-send-btn"]').click();

    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Item créé : FAX-099');
  });

  test('une erreur serveur (ex. assistant non configuré) s\'affiche comme une bulle d\'erreur', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockAiChatApi(page, () => ({ status: 400, error: 'Aucun assistant IA configuré. Un Admin doit d\'abord renseigner une clé API Anthropic en Réglages.' }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Bonjour');
    await page.locator('[data-testid="chat-send-btn"]').click();

    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Aucun assistant IA configuré');
  });

  test('"Effacer" retire tous les messages de la conversation', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockAiChatApi(page, () => ({ reply: 'Réponse.' }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Bonjour');
    await page.locator('[data-testid="chat-send-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toBeVisible();

    await page.locator('[data-testid="chat-clear-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toHaveCount(0);
  });

  // v0.98.1 (2026-08-09) : lecture du Backlog, correctifs "Réponse vide", et panneau retravaillé
  // (copier/éditer un message, redimensionnement/détachement/réduction, persistance) - voir
  // CHANGELOG.

  test('copier un message copie son contenu dans le presse-papier', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await goTo(page, '/backlog', { role: 'PO' });
    await mockAiChatApi(page, () => ({ reply: 'Voici la réponse à copier.' }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Bonjour');
    await page.locator('[data-testid="chat-send-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toBeVisible();

    await page.locator('[data-testid="chat-message-assistant"] button[aria-label="Copier"]').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe('Voici la réponse à copier.');
  });

  test('modifier un message envoyé tronque la conversation et la relance depuis ce point', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    let call = 0;
    await mockAiChatApi(page, () => {
      call++;
      return { reply: call === 1 ? 'Première réponse.' : 'Deuxième réponse.' };
    });

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Version initiale');
    await page.locator('[data-testid="chat-send-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Première réponse.');

    await page.locator('[data-testid="chat-message-user"] button[aria-label="Modifier"]').click();
    await page.locator('[data-testid="chat-edit-input"]').fill('Version corrigée');
    await page.locator('[data-testid="chat-edit-save-btn"]').click();

    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="chat-message-user"]')).toContainText('Version corrigée');
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Deuxième réponse.');
  });

  test('la poignée de redimensionnement agrandit le panneau ancré', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.locator('[data-testid="chat-toggle-btn"]').click();

    const panel = page.locator('[data-testid="chat-panel"]');
    const before = await panel.boundingBox();
    const handle = page.locator('[data-testid="chat-panel-resize-handle"]');
    const handleBox = await handle.boundingBox();

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 100);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 120, handleBox.y + 100);
    await page.mouse.up();

    const after = await panel.boundingBox();
    expect(after.width).toBeGreaterThan(before.width + 60);
  });

  test('détacher passe en fenêtre flottante, réduire masque le panneau sans perdre la conversation', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockAiChatApi(page, () => ({ reply: 'Réponse.' }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Bonjour');
    await page.locator('[data-testid="chat-send-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toBeVisible();

    await page.locator('[data-testid="chat-panel"] button[aria-label="Détacher"]').click();
    await expect(page.locator('[data-testid="chat-panel-float-resize-handle"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-panel"] button[aria-label="Ancrer"]')).toBeVisible();

    await page.locator('[data-testid="chat-panel"] button[aria-label="Réduire"]').click();
    await expect(page.locator('[data-testid="chat-panel"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="chat-panel-collapsed"]')).toBeVisible();

    await page.locator('[data-testid="chat-panel-collapsed"]').click();
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Réponse.');
  });

  test('la conversation et les préférences du panneau survivent à un rechargement de page', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockAiChatApi(page, () => ({ reply: 'Réponse persistée.' }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Message à retrouver');
    await page.locator('[data-testid="chat-send-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Réponse persistée.');
    await page.locator('[data-testid="chat-panel"] button[aria-label="Détacher"]').click();

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('[data-testid="chat-toggle-btn"]').click();

    await expect(page.locator('[data-testid="chat-message-user"]')).toContainText('Message à retrouver');
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Réponse persistée.');
    await expect(page.locator('[data-testid="chat-panel-float-resize-handle"]')).toBeVisible();
  });

});
