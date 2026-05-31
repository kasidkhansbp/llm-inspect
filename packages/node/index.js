const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PROXY_PORT = 8787;
const PROXY_PATH = path.resolve(__dirname, 'proxy/main.js');

function isProxyRunning() {
  return new Promise((resolve) => {
    const req = http.request({ host: 'localhost', port: PROXY_PORT, path: '/health', method: 'GET' }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function init() {
  const running = await isProxyRunning();
  if (!running) {
    const child = spawn(process.execPath, [PROXY_PATH], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  process.env.ANTHROPIC_BASE_URL = `http://localhost:${PROXY_PORT}`;
  process.env.OPENAI_BASE_URL = `http://localhost:${PROXY_PORT}/openai`;
}

module.exports = { init };
