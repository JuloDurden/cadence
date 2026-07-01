/**
 * Serveur HTTP minimal pour servir cadence.html pendant les tests.
 * Playwright le lance automatiquement via webServer dans playwright.config.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4321;
const ROOT = path.resolve(__dirname, '..');

const server = http.createServer((req, res) => {
  const filePath = path.join(ROOT, req.url === '/' ? 'cadence.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => console.log('Test server running on http://localhost:' + PORT));
