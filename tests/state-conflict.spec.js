const { test, expect } = require('@playwright/test');
const { goTo } = require('./helpers');

// Contrôle de concurrence optimiste de PUT /api/state (2026-08-20, retour Julien, voir docs/
// corrections futures.md "Le PUT /api/state reste un écrasement complet du blob JSON..." et
// backend/src/routes/state.ts). Deux comportements à couvrir, aucun des deux déjà testable ailleurs
// dans ce repo :
//  1. Un conflit (409, la version envoyée par le client ne correspond plus à celle en base) doit
//     resynchroniser l'état local sur la version serveur ET prévenir l'utilisateur, sans jamais
//     réappliquer silencieusement le changement rejeté par-dessus (voir échange avec Julien : un
//     "réessai automatique" pourrait re-écraser ce qu'un autre utilisateur vient d'enregistrer,
//     puisque saveToServer envoie un état complet recomposé localement, pas un patch ciblé).
//  2. Un message `state_version` reçu par le canal de synchronisation temps réel (routes/
//     realtimeWs.ts, routes/state.ts, broadcastSync) doit mettre à jour la version connue LOCALEMENT
//     sans round-trip HTTP - sans ce mécanisme, tout client resterait en permanence sur une version
//     périmée dès qu'un collègue connecté sauvegarde quoi que ce soit, et se ferait rejeter à sa
//     propre sauvegarde suivante alors qu'il n'y a pas de vrai conflit (son contenu est déjà à jour
//     via la diffusion `state_action` existante).
//
// Le point 2 utilise `page.routeWebSocket()` (Playwright ≥ 1.48, ici 1.61) pour simuler un message
// serveur SANS connexion WebSocket réelle - nouveau dans ce repo (tests/realtime-sync.spec.js,
// jusqu'ici, ne vérifiait que la tentative de connexion et sa tolérance à l'échec, faute d'un vrai
// serveur WS démarré dans cet environnement, toujours vrai ici : seul le CONTENU d'un message reçu
// est simulé, la synchronisation effective entre 2 vraies sessions reste non vérifiable ici).
//
// Les deux tests réutilisent le flux "modifier un client, ajouter un contact, Enregistrer" déjà
// utilisé par tests/clients.spec.js (sélecteurs identiques), qui dispatch localement ET appelle
// saveToServer (ClientsPage.tsx, handleSave) - utile ici : la modification locale optimiste doit
// être visiblement écrasée par la resynchronisation en cas de conflit (test 1), preuve que
// SET_STATE a bien été dispatché avec les données renvoyées par le serveur plutôt qu'ignoré.
test.describe('PUT /api/state - contrôle de concurrence optimiste (2026-08-20)', () => {

  test('un conflit (409) resynchronise l\'état local, écrase le changement non sauvegardé et affiche un message', async ({ page }) => {
    await goTo(page, '/clients', { role: 'PO' });

    let capturedData = null;
    await page.route('**/api/state', async route => {
      if (route.request().method() !== 'PUT') return route.fallback();
      const body = route.request().postDataJSON();
      if (!capturedData) {
        // 1re sauvegarde : succès normal. On capture le blob complet envoyé par l'app elle-même
        // (donc structurellement valide, contrairement à un CadenceState fabriqué à la main dans ce
        // test) pour le réutiliser comme état "resynchronisé" renvoyé au conflit suivant.
        capturedData = body.data;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 2 }) });
      }
      // 2e sauvegarde : conflit. On renvoie l'état capturé (qui contient donc "Premiere modif"
      // ci-dessous, déjà sauvegardée) avec un client marqueur en plus, pour vérifier que l'UI
      // reflète bien les données renvoyées par le serveur après resynchronisation.
      const conflictData = {
        ...capturedData,
        clients: [...capturedData.clients, { id: 'conflict-marker', name: 'CONFLIT-RESYNC-TEST', tier: 'B', caAnnuel: 0, contacts: [] }],
      };
      return route.fulfill({
        status: 409, contentType: 'application/json',
        body: JSON.stringify({ error: 'conflict', data: conflictData, version: 99 }),
      });
    });

    // 1re modification : acceptée par le mock ci-dessus.
    await page.locator('[data-testid^="client-card-"] button[title="Modifier"]').first().click();
    await page.getByRole('button', { name: '+ Contact' }).click();
    await page.locator('input[placeholder="Nom"]').last().fill('Premiere modif');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    // 2e modification : rejetée (409) par le mock ci-dessus.
    await page.locator('[data-testid^="client-card-"] button[title="Modifier"]').first().click();
    await page.getByRole('button', { name: '+ Contact' }).click();
    await page.locator('input[placeholder="Nom"]').last().fill('Deuxieme modif rejetee');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    // Message de conflit affiché.
    await expect(page.locator('[role="status"]')).toContainText('n\'a pas été sauvegardé');

    // L'état affiché est bien celui renvoyé par le serveur (le marqueur du mock apparaît).
    await expect(page.locator('.page-content')).toContainText('CONFLIT-RESYNC-TEST');

    // La modification rejetée n'a pas été appliquée localement (jamais réessayée en silence) :
    // en rouvrant le 1er client, "Deuxieme modif rejetee" est absente, mais "Premiere modif"
    // (déjà réellement sauvegardée avant le conflit) est toujours là.
    await page.locator('[data-testid^="client-card-"] button[title="Modifier"]').first().click();
    // "Premiere modif" est la valeur d'un <input>, pas du texte affiché tel quel dans le DOM :
    // getByText() ne matche pas la valeur d'un champ de formulaire, seulement toHaveValue() sur le
    // bon input (erreur de test corrigée après le 1er lancement réel de Julien, pas un bug appli -
    // la valeur AVANT correctif de cette assertion était de toute façon la bonne d'après le point
    // précédent : un seul contact restant après resynchronisation, donc `.last()` cible déjà lui).
    await expect(page.locator('input[placeholder="Nom"]').last()).toHaveValue('Premiere modif');
  });

  test('un message state_version reçu par WebSocket évite un faux conflit à la sauvegarde suivante', async ({ page }) => {
    let wsRoute = null;
    let resolveWsReady;
    const wsReady = new Promise(res => { resolveWsReady = res; });
    // Pas de connectToServer() : la connexion est entièrement simulée, comme l'exemple "Mocking"
    // de la doc Playwright - aucun vrai serveur WebSocket n'est démarré dans cet environnement (voir
    // tests/realtime-sync.spec.js). Enregistré AVANT goTo() : la connexion WebSocket s'ouvre dès le
    // montage de la page (StateContext.tsx), il faut donc que la route existe déjà à ce moment-là.
    await page.routeWebSocket('**/api/ws/sync**', ws => { wsRoute = ws; resolveWsReady(); });

    await goTo(page, '/clients', { role: 'PO' });
    await wsReady;

    // `page.route()` (HTTP, contrairement à routeWebSocket ci-dessus) est LIFO : le handler le plus
    // récemment enregistré est prioritaire. goTo() enregistre déjà un mock générique `**/api/**` -
    // enregistrer celui-ci APRÈS goTo() (jamais avant, contrairement à ce qui avait été fait dans la
    // première version de ce test, cause du 2e échec du 1er lancement réel de Julien : le mock
    // générique de goTo() passait alors en premier et répondait à la place de celui-ci, laissant
    // `putVersions` vide) est ce qui lui donne la priorité, exactement comme `mockAiChatApi` dans
    // tests/chat.spec.js.
    const putVersions = [];
    await page.route('**/api/state', async route => {
      if (route.request().method() !== 'PUT') return route.fallback();
      const body = route.request().postDataJSON();
      putVersions.push(body.version);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: (body.version ?? 0) + 1 }) });
    });

    // Simule un collègue connecté qui vient de sauvegarder quelque chose : le serveur diffuse la
    // nouvelle version (routes/state.ts, broadcastSync) à tous les clients connectés, y compris
    // celui-ci, sans que CE client n'ait lui-même fait de PUT.
    await wsRoute.send(JSON.stringify({ type: 'state_version', version: 42 }));

    await page.locator('[data-testid^="client-card-"] button[title="Modifier"]').first().click();
    await page.getByRole('button', { name: '+ Contact' }).click();
    await page.locator('input[placeholder="Nom"]').last().fill('Apres message WS');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    // La sauvegarde qui suit le message state_version utilise bien la version reçue par WebSocket
    // (42), jamais renvoyée par un PUT de ce client - preuve que versionRef a été mis à jour par le
    // message, pas seulement par une réponse HTTP.
    await expect.poll(() => putVersions).toContain(42);
  });

});
