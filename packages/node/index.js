const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PROXY_PORT = 8787;
const PROXY_PATH = path.resolve(__dirname, 'proxy/main.js');

function isProxyRunning() {
  return new Promise((resolve) => {
    // 127.0.0.1, not localhost: the proxy binds IPv4 loopback only, and
    // localhost resolves to ::1 first on some systems (e.g. Windows)
    const req = http.request({ host: '127.0.0.1', port: PROXY_PORT, path: '/health', method: 'GET' }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(false); return; }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        // Anything on this port that isn't our proxy must not receive traffic
        try { resolve(JSON.parse(body).service === 'llm-inspect'); }
        catch { resolve(false); }
      });
      res.on('error', () => resolve(false));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function waitForProxy(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isProxyRunning()) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function init() {
  let running = await isProxyRunning();
  if (!running) {
    const child = spawn(process.execPath, [PROXY_PATH], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {});
    child.unref();
    running = await waitForProxy(5000);
  }

  if (!running) {
    // Fail open: never break the host app's LLM calls. Leave base URLs
    // untouched so requests go directly to the provider.
    console.error(
      `[llm-inspect] proxy failed to start on :${PROXY_PORT} - ` +
      'inspection disabled, LLM calls will go directly to the provider. ' +
      `Is port ${PROXY_PORT} already in use?`
    );
    return;
  }

  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${PROXY_PORT}`;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${PROXY_PORT}/openai`;
}

module.exports = { init };
