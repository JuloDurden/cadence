/**
 * Chantier "Vignettes au survol" (2026-08-02), suite retour Julien : les vignettes du panneau de
 * survol de la barre du mode présentation (voir PresentationThumbnails.tsx) affichaient jusqu'ici
 * une simple icône — Julien attendait une vraie image de la page. Ce script capture une vraie
 * capture d'écran de chacune des pages présentables (voir data/presentablePages.ts) et les
 * enregistre dans frontend/public/presentation-thumbs/<id>.png, servies telles quelles par Vite
 * (dossier public/, pas d'import JS nécessaire) et affichées par PresentationThumbnails.tsx
 * (fallback sur l'icône si le fichier est absent, via <img onError>).
 *
 * À lancer une fois (puis à relancer si une page change significativement d'apparence) :
 *   node scripts/generate-presentation-thumbnails.js
 *
 * Démarre lui-même le serveur de dev Vite (aucun serveur ne doit tourner sur le port 4321 au
 * moment du lancement), capture chaque page avec un compte ADMIN factice et les API mockées
 * (même principe que tests/helpers.js `goTo()` — DEMO_STATE s'affiche, pas besoin de vrai backend).
 */
const { chromium } = require('@playwright/test');
const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const OUT_DIR = path.join(FRONTEND_DIR, 'public', 'presentation-thumbs');

// Dupliqué depuis frontend/src/data/presentablePages.ts (ids + chemins) plutôt qu'importé : ce
// script Node tourne hors Vite/TypeScript. À tenir synchronisé si le catalogue change (ajout/
// retrait/renommage d'une page présentable).
const PAGES = [
  { id: 'dashboard',       path: '/dashboard' },
  { id: 'vision',          path: '/vision' },
  { id: 'nnl',             path: '/vision?view=nnl' },
  { id: 'backlog',         path: '/backlog' },
  { id: 'roadmap',         path: '/roadmap' },
  { id: 'planning',        path: '/planning' },
  { id: 'auto',            path: '/auto' },
  { id: 'sprint-planning', path: '/sprint-planning' },
  { id: 'kanban',          path: '/kanban' },
  { id: 'sprint-review',   path: '/sprint-review' },
];

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      http.get(url, res => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) return reject(new Error(`Serveur non prêt après ${timeoutMs}ms (${url})`));
          setTimeout(poll, 500);
        });
    })();
  });
}

// Retour Julien (2026-08-02, 2 essais) : `spawn('npm', ...)` échoue avec `ENOENT` sous Windows
// (`npm` y est un script `.cmd`, pas un exécutable), et `spawn('npm.cmd', ...)` échoue à son tour
// avec `EINVAL` sur du Node.js récent (durcissement contre CVE-2024-27980 : spawner un `.bat`/`.cmd`
// directement sans passer par un shell est maintenant refusé). `{ shell: true }` est la solution
// recommandée par Node lui-même dans ce cas — fonctionne aussi bien sous Linux/macOS.
function startDevServer() {
  return spawn('npm', ['run', 'dev', '--', '--port', String(PORT)], { cwd: FRONTEND_DIR, stdio: 'pipe', shell: true });
}

// Corollaire de `shell: true` sous Windows : le process lancé par `spawn` est le shell (cmd.exe),
// pas `npm`/`vite` directement — `server.kill()` ne tuerait alors QUE ce shell, laissant `npm` puis
// le vrai serveur Vite orphelins, toujours vivants et occupant le port 4321 (source probable de
// blocages `EPERM`/port déjà utilisé lors d'un lancement suivant). `taskkill /T` tue tout l'arbre de
// processus d'un coup.
function stopDevServer(server) {
  if (process.platform === 'win32' && server.pid) {
    try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }); } catch { /* déjà arrêté */ }
  } else {
    server.kill();
  }
}

async function mockApi(page) {
  await page.route('**/api/**', r => {
    if (r.request().url().includes('/api/onboarding')) {
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ onboardingSeenAt: '2026-01-01T00:00:00.000Z', onboardingCompletedItems: [] }),
      });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Démarrage du serveur de dev Vite...');
  const server = startDevServer();
  server.stderr.on('data', d => process.stderr.write(d));

  try {
    await waitForServer(BASE_URL);
    console.log('Serveur prêt, capture des pages...');

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });

    // Injecter l'auth via la page de login (même domaine requis pour localStorage), comme
    // tests/helpers.js `goTo()`.
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      localStorage.setItem('cadence_token', 'thumbnail-capture');
      localStorage.setItem('cadence_user_role', 'ADMIN');
    });
    await mockApi(page);

    for (const { id, path: routePath } of PAGES) {
      await page.goto(`${BASE_URL}${routePath}`);
      await page.waitForLoadState('networkidle');
      // Laisse le temps aux graphiques/animations de finir de se dessiner (Dashboard notamment).
      await page.waitForTimeout(500);
      const dest = path.join(OUT_DIR, `${id}.png`);
      await page.screenshot({ path: dest });
      console.log(`  ${id} -> ${path.relative(process.cwd(), dest)}`);
    }

    await browser.close();
    console.log(`Terminé : ${PAGES.length} vignettes dans ${path.relative(process.cwd(), OUT_DIR)}`);
  } finally {
    stopDevServer(server);
  }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
