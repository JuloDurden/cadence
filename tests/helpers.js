/**
 * Helpers communs pour tous les tests E2E.
 */
const { BASE_STATE } = require('./fixtures');

const BASE_URL = 'http://localhost:4321';

/**
 * Charge la page avec un etat de test injecte dans localStorage.
 * Strategie : goto -> evaluate (inject) -> reload -> wait
 */
async function loadWithState(page, stateOverride = {}) {
  const state = { ...BASE_STATE, ...stateOverride };

  // 1. Charger la page une premiere fois pour avoir acces a localStorage
  await page.goto(BASE_URL + '/cadence.html');
  await page.waitForLoadState('domcontentloaded');

  // 2. Injecter l'etat de test
  await page.evaluate((stateJson) => {
    localStorage.setItem('cadenceState_v1', JSON.stringify(stateJson));
    localStorage.removeItem('act_undo');
    localStorage.removeItem('act_redo');
    // Effacer le flag demo pour eviter l'ecrasement de l'etat
    localStorage.removeItem('cadenceDemo');
  }, state);

  // 3. Recharger pour que l'app lise le nouvel etat
  await page.reload();
  await page.waitForSelector('#main-content', { state: 'visible', timeout: 10000 });
}

/**
 * Navigue vers un onglet de la sidebar.
 */
async function goToTab(page, tabId) {
  await page.click(`[data-tab="${tabId}"], [onclick*="switchTab('${tabId}')"]`);
  await page.waitForTimeout(200);
}

module.exports = { BASE_URL, loadWithState, goToTab };
