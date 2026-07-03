const { defineConfig } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 4321;
const BASE_URL = 'http://localhost:' + PORT;

const OPERA_PATHS = {
  win32: [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Opera', 'opera.exe'),
    'C:\\Program Files\\Opera\\opera.exe',
    'C:\\Program Files (x86)\\Opera\\opera.exe',
  ],
  darwin: ['/Applications/Opera.app/Contents/MacOS/Opera'],
  linux:  ['/usr/bin/opera'],
};

function findOpera() {
  const candidates = OPERA_PATHS[process.platform] || [];
  return candidates.find(p => { try { fs.accessSync(p); return true; } catch { return false; } });
}

const operaPath = findOpera();

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
  // En local : Opera si dispo, sinon Chrome
  projects: process.env.CI
    ? [{ name: 'chromium', use: { browserName: 'chromium' } }]
    : [
        operaPath
          ? { name: 'opera', use: { browserName: 'chromium', executablePath: operaPath } }
          : { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' }
      },
    ],
});
