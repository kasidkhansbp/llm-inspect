const http = require('http');
const https = require('https');
const { estimateCost } = require('../lib/pricing');
const { extractMessages, applyResponse } = require('../lib/tokens');
const { broadcast, addRequest, createEntry } = require('../lib/store');
const { PROVIDERS, PROXY_PORT, PROXY_ALLOWED_HOSTS } = require('../constants');
const { version } = require('../package.json');

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
  const name = Object.keys(PROVIDERS).find(p => PROVIDERS[p].match(url));
  return name || null;
}

function upstreamOptions(req, provider, bodyBuf) {
  const { host, rewritePath } = PROVIDERS[provider];
  const path = rewritePath(req.url);

  const headers = { ...req.headers, host, 'content-length': bodyBuf.length };
  delete headers['accept-encoding'];

  return { host, port: 443, path, method: req.method, headers };
}

function rejectUnsupported(req, res) {
  const supported = Object.keys(PROVIDERS).join(', ');
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Unsupported LLM client',
    detail: `No provider matches "${req.url}". This proxy supports: ${supported}. Add one PROVIDERS entry in constants.js to extend it (see the deepseek example).`,
  }));
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
  entry.statusCode = upstreamRes.statusCode;
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
  if (!provider) return rejectUnsupported(req, res);

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
    const body = { error: 'Upstream request failed', detail: err.message };
    res.writeHead(502);
    res.end(JSON.stringify(body));
    // Record what the client was told, so the dashboard can show it too.
    entry.statusCode = 502;
    entry.responseRaw = body;
    finalize(entry, startMs, 'error');
  });

  upstream.write(bodyBuf);
  upstream.end();
}

// DNS-rebinding guard — see PROXY_ALLOWED_HOSTS in constants.js.
function isLoopbackHost(req) {
  const host = (req.headers.host || '').toLowerCase();
  return PROXY_ALLOWED_HOSTS.has(host);
}

const server = http.createServer((req, res) => {
  res.on('error', () => {});
  // Reject rebound hostnames before routing — a browser reaching this port
  // through an attacker's domain must not inject or observe LLM traffic.
  if (!isLoopbackHost(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden: llm-inspect only serves loopback hosts' }));
    return;
  }
  if (req.url === '/health') return handleHealth(res);
  handleRequest(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

function start() {
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
