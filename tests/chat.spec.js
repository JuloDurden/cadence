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

});
