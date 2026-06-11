const http = require('http');
const fs = require('fs');
const path = require('path');
const { requests, sseClients } = require('../lib/store');

const DASHBOARD_PORT = 8788;
const DASHBOARD_DIR = path.join(__dirname, '../dashboard');

function serveFile(res, filePath, contentType) {
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`event: init\ndata: ${JSON.stringify(requests)}\n\n`);
    sseClients.push(res);
    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx >= 0) sseClients.splice(idx, 1);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/shutdown') {
    res.writeHead(200);
    res.end();
    process.exit(0);
  }

  if (req.url === '/app.js') {
    serveFile(res, path.join(DASHBOARD_DIR, 'app.js'), 'application/javascript');
    return;
  }

  serveFile(res, path.join(DASHBOARD_DIR, 'index.html'), 'text/html');
});

function start() {
  // Loopback only: the dashboard exposes full request/response bodies
  server.listen(DASHBOARD_PORT, '127.0.0.1', () => {
    console.log(`llm-inspect dashboard at http://localhost:${DASHBOARD_PORT}`);
  });
}

module.exports = { start };
