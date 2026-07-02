// End-to-end test for llm-inspect. Runs identically on a dev machine and in CI.
//
// It exercises the package's public contract:
//   1. llmInspect.init() makes the proxy available and redirects the SDKs by
//      setting ANTHROPIC_BASE_URL / OPENAI_BASE_URL — no manual base URLs here.
//   2. A normal SDK call is intercepted and RECORDED by the proxy.
//
// The recording is the assertion. The proxy logs a request the moment it
// receives it, BEFORE forwarding upstream (see recordRequest in
// proxy/server/proxy.js), so no valid API key is ever needed — a placeholder
// still reaches the proxy and gets recorded. That is what makes this test
// CI-agnostic: it depends on neither real keys nor a successful upstream call.

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
// The local package under test.
const llmInspect = require('../packages/node');

const PROXY_PORT = 8787;
const DASHBOARD_PORT = 8788;
// The real proxy source. init() would spawn packages/node/proxy/main.js, but
// that dir is a gitignored pack artifact absent in CI — so the test launches the
// canonical proxy itself and lets init() reuse it.
const PROXY_MAIN = path.resolve(__dirname, '../proxy/main.js');

// Force placeholder keys so the test is deterministic, non-billable, and behaves
// the same locally and in CI. Any real key in the environment is overridden on
// purpose: we assert the proxy *records* the call, not that the LLM answered, so
// a real (billable) round-trip is neither needed nor wanted.
//process.env.ANTHROPIC_API_KEY = 'test-placeholder-key';
//process.env.OPENAI_API_KEY = 'test-placeholder-key';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isProxyRunning() {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: PROXY_PORT, path: '/health', method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(body).service === 'llm-inspect'); }
          catch { resolve(false); }
        });
      }
    );
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// Ensure a proxy is up. Reuse one already running (e.g. a dev machine) and leave
// it alone; otherwise start the canonical proxy and return the child so the
// caller can tear it down. Returns the child we started, or null if we reused.
async function ensureProxy() {
  if (await isProxyRunning()) return null;

  const child = spawn(process.execPath, [PROXY_MAIN], { stdio: 'ignore' });
  child.on('error', (err) => console.error('[test] proxy spawn error:', err.message));

  for (let waited = 0; waited < 5000; waited += 150) {
    if (await isProxyRunning()) return child;
    await sleep(150);
  }
  child.kill();
  throw new Error(`proxy at ${PROXY_MAIN} did not come up on :${PROXY_PORT}`);
}

// The SDKs resolve their base URL from the environment at construction time, so
// they must be built AFTER init() has set it — hence the lazy require.
// maxRetries: 0 keeps the (expected) auth failure fast and deterministic.
function makeClients() {
  const Anthropic = require('@anthropic-ai/sdk');
  const OpenAI = require('openai');
  return {
    anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 }),
    openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }),
  };
}

// Read the dashboard's SSE stream. On connect it emits a single `init` event
// whose data is the full recorded requests[] array — exactly what the UI shows.
function fetchRecordedRequests() {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port: DASHBOARD_PORT, path: '/events' },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => {
          buf += chunk.toString();
          const end = buf.indexOf('\n\n'); // one full SSE frame
          if (end === -1) return;
          req.destroy();
          const dataLine = buf
            .slice(0, end)
            .split('\n')
            .find((line) => line.startsWith('data: '));
          if (!dataLine) {
            reject(new Error('no data line in SSE init frame'));
            return;
          }
          try {
            resolve(JSON.parse(dataLine.slice('data: '.length)));
          } catch (err) {
            reject(new Error(`could not parse SSE init payload: ${err.message}`));
          }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error(`timed out reading dashboard /events on :${DASHBOARD_PORT}`));
    });
  });
}

function assertRecorded(requests, provider, model) {
  const hit = requests.find((r) => r.provider === provider && r.model === model);
  if (!hit) {
    const seen = requests.map((r) => `${r.provider}/${r.model}`).join(', ') || '(empty)';
    throw new Error(
      `expected a recorded ${provider} request for "${model}", found none. Store has: ${seen}`
    );
  }
  console.log(
    `  ✓ recorded ${provider} ${model} ` +
    `(status: ${hit.status}, input tokens: ${hit.inputTokens})`
  );
}

async function sendClaude(anthropic) {
  console.log('Sending Claude request through the llm-inspect proxy...');
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
    });
    console.log('Claude response:', response.content[0].text);
  } catch (err) {
    // The placeholder key makes the upstream reject the call, but the proxy has
    // already recorded it — the point of this test. Log and continue.
    console.warn('Claude call errored (still recorded by the proxy):', err.message);
  }
}

async function sendOpenAI(openai) {
  console.log('Sending OpenAI request through the llm-inspect proxy...');
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 100,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say hello in one sentence.' },
      ],
    });
    console.log('OpenAI response:', response.choices[0].message.content);
  } catch (err) {
    console.warn('OpenAI call errored (still recorded by the proxy):', err.message);
  }
}

async function main() {
  const proxyChild = await ensureProxy();
  try {
    // Starts (or, here, reuses) the proxy and redirects the SDKs.
    await llmInspect.init();

    // init() "fails open": if it can't reach the proxy it leaves the base URLs
    // untouched so calls go straight to the provider — which would bypass the
    // proxy and record nothing. Detect that and fail loudly.
    if (process.env.ANTHROPIC_BASE_URL !== `http://127.0.0.1:${PROXY_PORT}`) {
      throw new Error(
        `init() did not redirect the SDKs — the proxy is unavailable on :${PROXY_PORT}.`
      );
    }

    const { anthropic, openai } = makeClients();
    await sendClaude(anthropic);
    await sendOpenAI(openai);

    console.log('\nVerifying the calls were recorded on the dashboard...');
    const recorded = await fetchRecordedRequests();
    assertRecorded(recorded, 'anthropic', 'claude-haiku-4-5-20251001');
    assertRecorded(recorded, 'openai', 'gpt-4o-mini');

    console.log(
      `\n✓ PASS - both calls were intercepted and recorded (${recorded.length} in store).`
    );
  } finally {
    // Only tear down a proxy we started; leave a pre-existing dev proxy running.
    if (proxyChild) proxyChild.kill();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n✗ FAIL -', err.message);
    process.exit(1);
  });
