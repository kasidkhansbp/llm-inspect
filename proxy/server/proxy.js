const http = require('http');
const https = require('https');
const { estimateCost } = require('../lib/pricing');
const { extractMessages, applyResponse } = require('../lib/tokens');
const { broadcast, addRequest, createEntry } = require('../lib/store');
const { version } = require('../package.json');

const PROXY_PORT = 8787;

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function detectProvider(req) {
  const url = req.url || '';
  if (url.startsWith('/openai') || url.startsWith('/v1/chat')) return 'openai';
  return 'anthropic';
}

function upstreamOptions(req, provider, bodyBuf) {
  let path = req.url;
  let host;

  if (provider === 'anthropic') {
    host = 'api.anthropic.com';
  } else {
    host = 'api.openai.com';
    path = path.replace(/^\/openai/, '') || '/';
  }

  const headers = { ...req.headers, host, 'content-length': bodyBuf.length };
  delete headers['accept-encoding'];

  return { host, port: 443, path, method: req.method, headers };
}

function handleHealth(res) {
  // Self-identify: wrappers must not mistake a foreign server on this
  // port for the proxy and route LLM traffic into it
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'llm-inspect', version }));
}

function finalize(entry, startMs, status) {
  entry.status = status;
  entry.durationMs = Date.now() - startMs;
  broadcast('update', entry);
}

// Parse the incoming body and record the request entry (store + broadcast).
// Stays in Pass: delegates meaning-making to lib/ and never throws — a malformed
// body still proceeds with an empty parsedBody so the request is proxied.
function recordRequest(provider, bodyBuf) {
  let parsedBody = {};
  try {
    parsedBody = JSON.parse(bodyBuf.toString());
  } catch (err) {
    // Side-Channel Invariant: a malformed body is still proxied; we only lose metrics.
    console.warn(`[proxy] could not parse ${provider} request body as JSON: ${err.message}`);
  }

  const entry = createEntry(provider, parsedBody, extractMessages(parsedBody, provider));
  addRequest(entry);
  broadcast('request', entry);
  return { entry, isStreaming: parsedBody.stream === true };
}

// Relay the upstream response to the client while tee-ing a copy for metrics.
function handleUpstreamResponse(upstreamRes, res, entry, isStreaming, startMs) {
  res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
  const chunks = [];

  upstreamRes.on('data', (chunk) => {
    res.write(chunk);
    chunks.push(chunk);
  });

  upstreamRes.on('end', () => {
    res.end();
    applyResponse(entry, chunks, isStreaming);
    entry.cost = estimateCost(entry.model, entry.inputTokens, entry.outputTokens);
    finalize(entry, startMs, upstreamRes.statusCode < 400 ? 'success' : 'error');
  });

  upstreamRes.on('error', () => {
    res.end();
    finalize(entry, startMs, 'error');
  });
}

async function handleRequest(req, res) {
  const provider = detectProvider(req);
  const bodyBuf = await collectBody(req);

  // 1. Record the incoming request
  const { entry, isStreaming } = recordRequest(provider, bodyBuf);

  // 2. Forward to upstream and relay the response back
  const startMs = Date.now();
  const upstream = https.request(upstreamOptions(req, provider, bodyBuf), (upstreamRes) => {
    handleUpstreamResponse(upstreamRes, res, entry, isStreaming, startMs);
  });

  // 3. Handle upstream connection failures (couldn't reach the API at all)
  upstream.on('error', (err) => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: 'Upstream request failed', detail: err.message }));
    finalize(entry, startMs, 'error');
  });

  upstream.write(bodyBuf);
  upstream.end();
}

const server = http.createServer((req, res) => {
  res.on('error', () => {});
  if (req.url === '/health') return handleHealth(res);
  handleRequest(req, res).catch(() => {
    // A client abort mid-body rejects collectBody(); unhandled, that
    // rejection would crash the proxy and kill every in-flight call.
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

function start() {
  // A bind failure must exit (not linger half-started) so the SDK
  // wrappers detect the dead proxy and fail open.
  server.on('error', (err) => {
    console.error(`[llm-inspect] failed to bind :${PROXY_PORT}: ${err.message}`);
    process.exit(1);
  });
  // Loopback only: this proxy carries prompts/responses and must not be LAN-reachable
  server.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`llm-inspect proxy listening on 127.0.0.1:${PROXY_PORT}`);
  });
}

module.exports = { start };
