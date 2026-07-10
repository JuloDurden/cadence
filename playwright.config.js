const { defineConfig } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 4321;
const BASE_URL = 'http://localhost:' + PORT;

const BROWSER_CANDIDATES = {
  win32: [
    // Vivaldi
    { name: 'vivaldi', path: path.join(os.homedir(), 'AppData', 'Local', 'Vivaldi', 'Application', 'vivaldi.exe') },
    { name: 'vivaldi', path: 'C:\\Program Files\\Vivaldi\\Application\\vivaldi.exe' },
    // Opera
    { name: 'opera',   path: path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Opera', 'opera.exe') },
    { name: 'opera',   path: 'C:\\Program Files\\Opera\\opera.exe' },
  ],
  darwin: [
    { name: 'vivaldi', path: '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi' },
    { name: 'opera',   path: '/Applications/Opera.app/Contents/MacOS/Opera' },
  ],
  linux: [
    { name: 'vivaldi', path: '/usr/bin/vivaldi' },
    { name: 'opera',   path: '/usr/bin/opera' },
  ],
};

function findBrowser() {
  const candidates = BROWSER_CANDIDATES[process.platform] || [];
  for (const c of candidates) {
    try { fs.accessSync(c.path); return c; } catch { /* not found */ }
  }
  return null;
}

const localBrowser = findBrowser();

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['**/tests/*.spec.js'],
  timeout: 30000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  // Lance le dev server Vite (React) sur le port 4321
  webServer: {
    command: 'cd frontend && npm run dev -- --port ' + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },

  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 8000,
  },

  // En CI : chromium headless
  // En local : Vivaldi si dispo, sinon Opera, sinon Chrome
  projects: process.env.CI
    ? [{ name: 'chromium', use: { browserName: 'chromium' } }]
    : [
        localBrowser
          ? { name: localBrowser.name, use: { browserName: 'chromium', executablePath: localBrowser.path } }
          : { name: 'chrome',          use: { browserName: 'chromium', channel: 'chrome' } },
      ],
});
