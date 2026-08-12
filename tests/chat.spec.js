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

  // v0.98.2 (2026-08-10) : les réponses de l'assistant contiennent souvent du markdown (tableaux,
  // gras...) produit naturellement par Claude, affiché jusque-là en texte brut (pipes/astérisques
  // littéraux). Rendu via react-markdown + remark-gfm, uniquement pour les bulles ASSISTANT (une
  // bulle utilisateur reste le texte brut tel que tapé, voir ChatPanel.tsx). Le texte fixe "Le
  // Compagnon IA rédige..." affiché pendant l'attente devient un indicateur animé.

  test('un tableau markdown dans la réponse de l\'assistant est rendu comme un vrai tableau', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockAiChatApi(page, () => ({
      reply: '| Item | SP |\n| --- | --- |\n| FAX-038 | 5 |\n| FAX-039 | 8 |\n\n**Total : 13 SP**',
    }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Résume les SP');
    await page.locator('[data-testid="chat-send-btn"]').click();

    const bubble = page.locator('[data-testid="chat-message-assistant"]');
    await expect(bubble.locator('table')).toBeVisible();
    await expect(bubble.locator('table')).not.toContainText('---');
    await expect(bubble.locator('td').first()).toContainText('FAX-038');
    await expect(bubble.locator('strong')).toContainText('Total : 13 SP');
  });

  test('un message utilisateur contenant des caractères markdown reste affiché tel quel', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockAiChatApi(page, () => ({ reply: 'Reçu.' }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Le champ *sp* et le tag **urgent**');
    await page.locator('[data-testid="chat-send-btn"]').click();

    await expect(page.locator('[data-testid="chat-message-user"]')).toContainText('Le champ *sp* et le tag **urgent**');
    await expect(page.locator('[data-testid="chat-message-user"] strong')).toHaveCount(0);
  });

  test('un indicateur de saisie animé s\'affiche pendant que l\'assistant répond, puis disparaît', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.route('**/api/ai-chat', async r => {
      await new Promise(res => setTimeout(res, 400));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Voilà.', toolCalls: [] }) });
    });

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Bonjour');
    await page.locator('[data-testid="chat-send-btn"]').click();

    await expect(page.locator('[data-testid="chat-typing-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Voilà.');
    await expect(page.locator('[data-testid="chat-typing-indicator"]')).toHaveCount(0);
  });

  // v0.98.3 (2026-08-10) : sous-chantier 3 (détection d'anomalies) - 12 commandes slash (données
  // dans data/chatCommands.ts, expansion purement côté client, voir ChatContext.tsx), popover d'aide
  // et infobulle rotative dans le panneau (ChatPanel.tsx). Voir aussi CHANGELOG et
  // docs/roadmap-v1.md, Phase 6.

  test('une commande slash affiche la commande courte dans la bulle mais envoie le prompt complet à l\'API', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    let sentBody;
    await page.route('**/api/ai-chat', async r => {
      sentBody = r.request().postDataJSON();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Aucun item concerné.', toolCalls: [] }) });
    });

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('/points');
    await page.locator('[data-testid="chat-send-btn"]').click();

    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveText('/points');
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Aucun item concerné.');

    const lastSent = sentBody.messages[sentBody.messages.length - 1].content;
    expect(lastSent).not.toBe('/points');
    expect(lastSent).toContain('Story Points');
  });

  test('/audit envoie un prompt qui couvre toutes les catégories d\'anomalies', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    let sentBody;
    await page.route('**/api/ai-chat', async r => {
      sentBody = r.request().postDataJSON();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: '## Sans Story Points\n\nAucun item concerné.', toolCalls: [] }) });
    });

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('/audit');
    await page.locator('[data-testid="chat-send-btn"]').click();

    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveText('/audit');
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Sans Story Points');

    const lastSent = sentBody.messages[sentBody.messages.length - 1].content;
    expect(lastSent).toContain('Story Points');
    expect(lastSent).toContain('bloques');
    expect(lastSent).toContain('sprint en cours');
  });

  test('un texte qui ressemble à une commande sans correspondance exacte part tel quel', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    let sentBody;
    await page.route('**/api/ai-chat', async r => {
      sentBody = r.request().postDataJSON();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: 'Réponse.', toolCalls: [] }) });
    });

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('/points manquants sur le sprint 2');
    await page.locator('[data-testid="chat-send-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Réponse.');

    const lastSent = sentBody.messages[sentBody.messages.length - 1].content;
    expect(lastSent).toBe('/points manquants sur le sprint 2');
  });

  test('le bouton Aide affiche le popover des commandes rapides, un clic en dehors le referme', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.locator('[data-testid="chat-toggle-btn"]').click();

    const popover = page.locator('[data-testid="chat-commands-help"]');
    await expect(popover).not.toBeVisible();

    await page.locator('[data-testid="chat-help-btn"]').click();
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('/audit');
    await expect(popover).toContainText('/blocked');

    await page.mouse.click(10, 10);
    await expect(popover).not.toBeVisible();
  });

  test('cliquer sur l\'astuce insère une commande valide dans le champ de saisie', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.locator('[data-testid="chat-toggle-btn"]').click();

    // Ne pas comparer à un texte d'astuce lu séparément avant le clic : tipIndex peut changer entre
    // la lecture et le clic (re-render déclenché entre-temps), rendant une comparaison exacte
    // intrinsèquement instable. On vérifie plutôt que le clic insère bien UNE commande valide.
    const tip = page.locator('[data-testid="chat-tip"]');
    await expect(tip).toBeVisible();

    await tip.click();
    const value = await page.locator('[data-testid="chat-input"]').inputValue();
    expect(value).toMatch(/^\/[a-z]+$/);
  });

  // Bug applicatif trouvé et corrigé le 2026-08-10 (pas un test flaky) : ChatPanel est toujours
  // monté (App.tsx), même quand `open` vaut false, donc ses hooks tournent dès le chargement de
  // l'appli, avant tout clic sur le bouton Compagnon IA. L'effet de rotation se déclenchait une 1re
  // fois AU MONTAGE (avec `open` encore à false), pas seulement à la vraie ouverture - et en
  // StrictMode (mode dev, celui de `npm run dev` utilisé par les tests), React rejoue ce montage une
  // 2e fois. Corrigé dans ChatPanel.tsx (comparaison à la valeur précédente via refs, insensible au
  // nombre de fois où StrictMode rejoue l'effet au montage). Reproduit et confirmé avec un script
  // Playwright autonome (8 lancers : 2 dérives avec l'ancien code, 0 avec le correctif).
  //
  // Le test d'origine ajoutait en plus une assertion "l'astuce ne bouge pas pendant 9,5s d'inactivité
  // après l'ouverture" - retirée (retour Julien, 2026-08-10) : elle capturait `before` immédiatement
  // après l'ouverture, sans laisser le temps à LA SEULE rotation légitime (celle déclenchée par le
  // passage à `open: true`) de s'appliquer, ce qui pouvait capter une valeur transitoire puis la voir
  // "changer" un instant plus tard - un faux positif du test, pas un vrai comportement observable par
  // un utilisateur. L'assertion qui compte reste déterministe et suffisante : l'astuce change bien à
  // la réduction/agrandissement.
  test('l\'astuce change à la réduction/agrandissement du panneau', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await page.locator('[data-testid="chat-toggle-btn"]').click();

    const tip = page.locator('[data-testid="chat-tip"]');
    await expect(tip).toBeVisible();
    const before = await tip.textContent();

    await page.locator('[data-testid="chat-panel"] button[aria-label="Réduire"]').click();
    await page.locator('[data-testid="chat-panel-collapsed"]').click();

    const after = await page.locator('[data-testid="chat-tip"]').textContent();
    expect(after).not.toBe(before);
  });

  // v0.98.6 (2026-08-12), retour Julien : la conversation était persistée sous une clé localStorage
  // FIXE ('cadence.chat.messages'), partagée par TOUS les comptes connectés sur le même navigateur -
  // changer de compte affichait la conversation du compte précédent. Clé désormais scopée par
  // `userId` (ChatContext.tsx, storageKeyFor). `goTo()` recharge entièrement la page (repasse par
  // /login) à chaque appel : ce test vérifie donc la CLÉ DE STOCKAGE elle-même (la partie qui
  // fuyait), pas l'effet réactif de rechargement à chaud sans reload (`useEffect` sur `userId`,
  // nécessaire seulement parce que login()/logout() ne remontent pas ChatProvider dans l'app réelle
  // - voir commentaire dans ChatContext.tsx), qu'un test end-to-end sur un vrai rechargement de page
  // ne peut de toute façon pas distinguer d'un simple montage initial.
  test('la conversation est isolée par compte connecté, pas de fuite entre 2 comptes', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'ADMIN', userId: 'user-admin-e2e' });
    await mockAiChatApi(page, () => ({ reply: 'Réponse pour Admin.' }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Message envoyé par Admin');
    await page.locator('[data-testid="chat-send-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Réponse pour Admin.');

    // Bascule vers un autre compte (Dev) : la conversation d'Admin ne doit apparaître nulle part.
    await goTo(page, '/backlog', { role: 'DEV', userId: 'user-dev-e2e' });
    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-user"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toHaveCount(0);

    // Retour sur Admin : sa conversation est toujours là, intacte.
    await goTo(page, '/backlog', { role: 'ADMIN', userId: 'user-admin-e2e' });
    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await expect(page.locator('[data-testid="chat-message-user"]')).toContainText('Message envoyé par Admin');
    await expect(page.locator('[data-testid="chat-message-assistant"]')).toContainText('Réponse pour Admin.');
  });

  // v0.98.6 (2026-08-12), retour Julien : une réponse 529 ("Overloaded") de l'API Anthropic - une
  // surcharge temporaire côté serveur, sans lien avec Cadence - remontait le JSON brut de l'erreur
  // dans le chat. Le backend (routes/ai.ts) renvoie toute erreur Anthropic en 502 avec un champ
  // `error` explicite (lib/ai.ts, anthropicCall) : même mécanisme que le test existant "une erreur
  // serveur (ex. assistant non configuré) s'affiche comme une bulle d'erreur" ci-dessus, avec le
  // message dédié au cas 529.
  test('une surcharge temporaire de l\'API Anthropic (529) affiche un message clair, pas le JSON brut', async ({ page }) => {
    await goTo(page, '/backlog', { role: 'PO' });
    await mockAiChatApi(page, () => ({ status: 502, error: 'API Anthropic temporairement surchargee, reessayez dans quelques instants' }));

    await page.locator('[data-testid="chat-toggle-btn"]').click();
    await page.locator('[data-testid="chat-input"]').fill('Simule un plan pour les prochains sprints');
    await page.locator('[data-testid="chat-send-btn"]').click();

    const bubble = page.locator('[data-testid="chat-message-assistant"]');
    await expect(bubble).toContainText('temporairement surchargee');
    await expect(bubble).not.toContainText('overloaded_error');
  });

});
