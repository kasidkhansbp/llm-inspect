const http = require('http');
const fs = require('fs');
const path = require('path');
const { requests, sseClients } = require('../lib/store');
const { DASHBOARD_PORT, ALLOWED_ORIGINS, DASHBOARD_ALLOWED_HOSTS } = require('../constants');

const DASHBOARD_DIR = path.join(__dirname, '../dashboard');

// CSRF guard — see ALLOWED_ORIGINS in constants.js for the threat model.
function isSameOrigin(req) {
  const origin = req.headers.origin;
  return origin === undefined || ALLOWED_ORIGINS.has(origin);
}

// DNS-rebinding guard — see DASHBOARD_ALLOWED_HOSTS in constants.js.
function isLoopbackHost(req) {
  const host = (req.headers.host || '').toLowerCase();
  return DASHBOARD_ALLOWED_HOSTS.has(host);
}

function serveFile(res, filePath, contentType) {
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      // Backstop against markup injection from intercepted payloads:
      // no inline/external scripts beyond our own origin
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  // DNS-rebinding guard: a malicious site whose domain re-resolves to
  // 127.0.0.1 can request this server from the browser (same-origin policy
  // never applies), but its domain — not a loopback name — shows up in Host.
  // Checked before all routes as /events alone exposes every prompt/response.
  if (!isLoopbackHost(req)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

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
    if (!isSameOrigin(req)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    res.writeHead(200);
    res.end('', () => process.exit(0));
    return;
  }

  if (req.url === '/app.js') {
    serveFile(res, path.join(DASHBOARD_DIR, 'app.js'), 'application/javascript');
    return;
  }

  serveFile(res, path.join(DASHBOARD_DIR, 'index.html'), 'text/html');
});

function start() {
  // A bind failure must exit (not linger half-started) so the SDK
  // wrappers detect the dead proxy and fail open.
  server.on('error', (err) => {
    console.error(`[llm-inspect] failed to bind :${DASHBOARD_PORT}: ${err.message}`);
    process.exit(1);
  });
  // Loopback only: the dashboard exposes full request/response bodies
  server.listen(DASHBOARD_PORT, '127.0.0.1', () => {
    console.log(`llm-inspect dashboard at http://127.0.0.1:${DASHBOARD_PORT}`);
  });
}

module.exports = { start };
