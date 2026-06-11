const http = require('http');
const https = require('https');
const { estimateCost } = require('../lib/pricing');
const { extractMessages, parseStreamingTokens } = require('../lib/tokens');
const { broadcast, addRequest, getNextId } = require('../lib/store');

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

function extractStreamingText(chunks, provider) {
  const text = Buffer.concat(chunks).toString();
  const parts = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const data = JSON.parse(line.slice(6));
      if (provider === 'anthropic' && data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        parts.push(data.delta.text);
      } else if (provider === 'openai' && data.choices?.[0]?.delta?.content) {
        parts.push(data.choices[0].delta.content);
      }
    } catch {}
  }
  return parts.length ? parts.join('') : null;
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200); res.end('ok'); return;
  }

  const provider = detectProvider(req);
  const bodyBuf = await collectBody(req);
  let parsedBody = {};
  try { parsedBody = JSON.parse(bodyBuf.toString()); } catch {}

  const id = getNextId();
  const model = parsedBody.model || 'unknown';
  const messages = extractMessages(parsedBody, provider);
  const inputTokensEstimate = messages.reduce((s, m) => s + m.tokens, 0);
  const isStreaming = parsedBody.stream === true;

  const entry = {
    id,
    timestamp: new Date().toISOString(),
    provider,
    model,
    status: 'pending',
    inputTokens: inputTokensEstimate,
    outputTokens: 0,
    cost: null,
    messages,
    requestBody: parsedBody,
    responseText: null,
    responseRaw: null,
    durationMs: null,
  };
  addRequest(entry);
  broadcast('request', entry);

  const startMs = Date.now();
  const opts = upstreamOptions(req, provider, bodyBuf);

  const upstream = https.request(opts, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    const responseChunks = [];

    upstreamRes.on('data', (chunk) => {
      res.write(chunk);
      responseChunks.push(chunk);
    });

    upstreamRes.on('end', () => {
      res.end();
      entry.durationMs = Date.now() - startMs;

      if (isStreaming) {
        const { inputTokens, outputTokens } = parseStreamingTokens(responseChunks, provider);
        if (inputTokens > 0) entry.inputTokens = inputTokens;
        entry.outputTokens = outputTokens;
        entry.responseText = extractStreamingText(responseChunks, provider);
      } else {
        try {
          const json = JSON.parse(Buffer.concat(responseChunks).toString());
          if (provider === 'anthropic' && json.usage) {
            entry.inputTokens = json.usage.input_tokens || entry.inputTokens;
            entry.outputTokens = json.usage.output_tokens || 0;
            entry.responseText = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') || null;
            entry.responseRaw = json;
          } else if (provider === 'openai' && json.usage) {
            entry.inputTokens = json.usage.prompt_tokens || entry.inputTokens;
            entry.outputTokens = json.usage.completion_tokens || 0;
            entry.responseText = json.choices?.[0]?.message?.content || null;
            entry.responseRaw = json;
          }
        } catch {}
      }

      entry.status = upstreamRes.statusCode < 400 ? 'success' : 'error';
      entry.cost = estimateCost(model, entry.inputTokens, entry.outputTokens);
      broadcast('update', entry);
    });

    upstreamRes.on('error', () => {
      res.end();
      entry.status = 'error';
      entry.durationMs = Date.now() - startMs;
      broadcast('update', entry);
    });
  });

  upstream.on('error', (err) => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: 'Upstream request failed', detail: err.message }));
    entry.status = 'error';
    entry.durationMs = Date.now() - startMs;
    broadcast('update', entry);
  });

  upstream.write(bodyBuf);
  upstream.end();
});

function start() {
  // Loopback only: this proxy carries prompts/responses and must not be LAN-reachable
  server.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`llm-inspect proxy listening on 127.0.0.1:${PROXY_PORT}`);
  });
}

module.exports = { start };
