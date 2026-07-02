// Shared constants: server ports/origins and the provider registry — the
// single place to configure an LLM client.
//
// Each entry fully describes one client. To support a new one (e.g. deepseek),
// add ONE entry here; no other file needs to change. An entry has two groups:
//
//   route — used by server/proxy.js (Pass):
//     match(url)        claim a request by its path
//     host              upstream hostname to relay to
//     rewritePath(path) the path to send upstream
//
//   parse — used by lib/tokens.js (Parse):
//     extractMessages(body)      -> [{ role, tokens, preview }]
//     parseStreamingTokens(text) -> { inputTokens, outputTokens }
//     streamDelta(data)          -> text of one SSE event, or null
//     applyResponse(entry, json) -> mutate entry.inputTokens/outputTokens/responseText

// ── Server constants ────────────────────────────────────────────────────────

const PROXY_PORT = 8787;      // LLM traffic (loopback only)
const DASHBOARD_PORT = 8788;  // browser UI + SSE (loopback only)

// CSRF guard for state-changing dashboard endpoints: any web page can fire a
// cross-origin POST at this port (CORS blocks reading the response, not
// sending the request). Browsers always attach the page's Origin to such a
// POST, so only our own loopback origin — or a non-browser client, which
// sends no Origin at all — may pass.
const ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${DASHBOARD_PORT}`,
  `http://localhost:${DASHBOARD_PORT}`,
  `http://[::1]:${DASHBOARD_PORT}`,
]);

// ── Provider registry ───────────────────────────────────────────────────────

function countTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function toMessage(role, text) {
  return { role, tokens: countTokens(text), preview: text.slice(0, 200) };
}

const PROVIDERS = {
  anthropic: {
    // route
    match: (url) => url.startsWith('/v1/messages') || url.startsWith('/v1/complete'),
    host: 'api.anthropic.com',
    rewritePath: (path) => path,
    // parse
    extractMessages(body) {
      const messages = [];
      if (body.system) {
        const text = typeof body.system === 'string'
          ? body.system
          : body.system.map(b => b.text || '').join('');
        messages.push(toMessage('system', text));
      }
      for (const msg of (body.messages || [])) {
        const text = typeof msg.content === 'string'
          ? msg.content
          : (msg.content || []).map(b => b.text || '').join('');
        messages.push(toMessage(msg.role, text));
      }
      return messages;
    },
    parseStreamingTokens(text) {
      let inputTokens = 0, outputTokens = 0;
      const match = text.match(/"usage"\s*:\s*\{[^}]*"input_tokens"\s*:\s*(\d+)[^}]*"output_tokens"\s*:\s*(\d+)/);
      if (match) { inputTokens = parseInt(match[1]); outputTokens = parseInt(match[2]); }
      const deltaMatch = text.match(/"usage"\s*:\s*\{[^}]*"output_tokens"\s*:\s*(\d+)/g);
      if (deltaMatch) {
        const last = deltaMatch[deltaMatch.length - 1];
        const m = last.match(/"output_tokens"\s*:\s*(\d+)/);
        if (m) outputTokens = Math.max(outputTokens, parseInt(m[1]));
      }
      return { inputTokens, outputTokens };
    },
    streamDelta(data) {
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') return data.delta.text;
      return null;
    },
    applyResponse(entry, json) {
      entry.inputTokens = json.usage.input_tokens || entry.inputTokens;
      entry.outputTokens = json.usage.output_tokens || 0;
      entry.responseText = (json.content || [])
        .filter(b => b.type === 'text').map(b => b.text).join('\n') || null;
    },
  },

  openai: {
    // route
    match: (url) => url.startsWith('/openai') || url.startsWith('/v1/chat'),
    host: 'api.openai.com',
    // The /openai routing prefix maps to OpenAI's /v1 API. Clients point at
    // .../openai (SDK sends /openai/chat/completions); rewrite to /v1/chat/...
    // Direct /v1/chat/... callers have no prefix to strip and pass through.
    rewritePath: (path) => path.replace(/^\/openai/, '/v1'),
    // parse
    extractMessages(body) {
      const messages = [];
      for (const msg of (body.messages || [])) {
        const text = typeof msg.content === 'string'
          ? msg.content
          : (msg.content || []).map(b => typeof b === 'string' ? b : (b.text || '')).join('');
        messages.push(toMessage(msg.role, text));
      }
      return messages;
    },
    parseStreamingTokens(text) {
      let inputTokens = 0, outputTokens = 0;
      const match = text.match(/"usage"\s*:\s*\{[^}]*"prompt_tokens"\s*:\s*(\d+)[^}]*"completion_tokens"\s*:\s*(\d+)/);
      if (match) { inputTokens = parseInt(match[1]); outputTokens = parseInt(match[2]); }
      return { inputTokens, outputTokens };
    },
    streamDelta(data) {
      return data.choices?.[0]?.delta?.content || null;
    },
    applyResponse(entry, json) {
      entry.inputTokens = json.usage.prompt_tokens || entry.inputTokens;
      entry.outputTokens = json.usage.completion_tokens || 0;
      entry.responseText = json.choices?.[0]?.message?.content || null;
    },
  },

  // ── example: add a client by copying one block like this ──────────────────
  // DeepSeek speaks the OpenAI wire format, so its parse group mirrors openai's.
  //
  // deepseek: {
  //   // route
  //   match: (url) => url.startsWith('/deepseek'),
  //   host: 'api.deepseek.com',
  //   rewritePath: (path) => path.replace(/^\/deepseek/, '') || '/',
  //   // parse
  //   extractMessages(body)      { /* return [{ role, tokens, preview }] */ },
  //   parseStreamingTokens(text) { /* return { inputTokens, outputTokens } */ },
  //   streamDelta(data)          { /* return text of one SSE event, or null */ },
  //   applyResponse(entry, json) { /* mutate entry.inputTokens/outputTokens/responseText */ },
  // },
};

module.exports = { PROVIDERS, PROXY_PORT, DASHBOARD_PORT, ALLOWED_ORIGINS };
