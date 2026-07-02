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
//     pricingUrl        provider's pricing page, linked from the dashboard's
//                       cost card so the rates in lib/pricing.js can be audited
//
//   parse — used by lib/tokens.js (Parse):
//     extractMessages(body)      -> [{ role, tokens, preview }]
//     streamDelta(data)          -> text of one SSE event, or null
//     normalizeUsage(rawUsage)   -> { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }
//                                   translating the provider's wire format into the
//                                   shared meaning: inputTokens = UNCACHED input only
//     streamUsage(data, usage)   -> locate raw usage in one SSE event and merge its
//                                   normalized fields into the usage accumulator
//     applyResponse(entry, json) -> mutate entry usage fields/responseText

// ── Server constants ────────────────────────────────────────────────────────

const PROXY_PORT = 8787;      // LLM traffic (loopback only)
const DASHBOARD_PORT = 8788;  // browser UI + SSE (loopback only)

// The loopback names these servers answer to, shared by both guards below.
const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]'];

// CSRF guard: cross-origin POSTs carry the sending page's Origin, so only our
// own loopback origin (or a non-browser client, which sends none) may hit
// state-changing dashboard endpoints.
const ALLOWED_ORIGINS = new Set(
  LOOPBACK_HOSTNAMES.map(h => `http://${h}:${DASHBOARD_PORT}`)
);

const loopbackHosts = (port) => new Set(
  LOOPBACK_HOSTNAMES.map(h => `${h}:${port}`)
);
const PROXY_ALLOWED_HOSTS = loopbackHosts(PROXY_PORT);
const DASHBOARD_ALLOWED_HOSTS = loopbackHosts(DASHBOARD_PORT);

// ── Provider registry ───────────────────────────────────────────────────────

function countTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function toMessage(role, text) {
  return { role, tokens: countTokens(text), preview: text.slice(0, 200) };
}

// Copy normalized usage onto an entry. inputTokens keeps the pre-computed
// estimate when the response reported none (e.g. a stream with no usage events).
function applyUsageToEntry(entry, usage) {
  entry.inputTokens = usage.inputTokens || entry.inputTokens;
  entry.outputTokens = usage.outputTokens;
  entry.cacheReadTokens = usage.cacheReadTokens;
  entry.cacheCreationTokens = usage.cacheCreationTokens;
}

// Anthropic's input_tokens already excludes cached tokens; cache reads and
// writes arrive in their own fields, so this is a straight field mapping.
function normalizeAnthropicUsage(u) {
  return {
    inputTokens: u.input_tokens || 0,
    outputTokens: u.output_tokens || 0,
    cacheReadTokens: u.cache_read_input_tokens || 0,
    cacheCreationTokens: u.cache_creation_input_tokens || 0,
  };
}

// OpenAI's prompt_tokens INCLUDES cached tokens, so the uncached remainder is
// prompt − cached (clamped: a malformed payload must not go negative). OpenAI
// caching is automatic and free to write, so cacheCreationTokens is always 0.
function normalizeOpenAIUsage(u) {
  const cached = u.prompt_tokens_details?.cached_tokens || 0;
  return {
    inputTokens: Math.max((u.prompt_tokens || 0) - cached, 0),
    outputTokens: u.completion_tokens || 0,
    cacheReadTokens: cached,
    cacheCreationTokens: 0,
  };
}

const PROVIDERS = {
  anthropic: {
    // route
    match: (url) => url.startsWith('/v1/messages') || url.startsWith('/v1/complete'),
    host: 'api.anthropic.com',
    rewritePath: (path) => path,
    pricingUrl: 'https://docs.claude.com/en/docs/about-claude/pricing',
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
    streamDelta(data) {
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') return data.delta.text;
      return null;
    },
    normalizeUsage: normalizeAnthropicUsage,
    streamUsage(data, usage) {
      // message_start nests usage under message; message_delta events carry it
      // at the top level with a cumulative output_tokens (the last one wins).
      const u = data.type === 'message_start' ? data.message?.usage : data.usage;
      if (!u) return;
      // Merge, don't overwrite: message_delta events omit input/cache fields,
      // and zeroing them would discard what message_start reported.
      const n = normalizeAnthropicUsage(u);
      if (n.inputTokens) usage.inputTokens = n.inputTokens;
      if (n.cacheReadTokens) usage.cacheReadTokens = n.cacheReadTokens;
      if (n.cacheCreationTokens) usage.cacheCreationTokens = n.cacheCreationTokens;
      if (u.output_tokens != null) usage.outputTokens = n.outputTokens;
    },
    applyResponse(entry, json) {
      applyUsageToEntry(entry, normalizeAnthropicUsage(json.usage));
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
    pricingUrl: 'https://platform.openai.com/docs/pricing',
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
    streamDelta(data) {
      return data.choices?.[0]?.delta?.content || null;
    },
    normalizeUsage: normalizeOpenAIUsage,
    streamUsage(data, usage) {
      // Only the final chunk carries usage, and only when the client sent
      // stream_options: { include_usage: true }; otherwise counts stay 0.
      if (!data.usage) return;
      Object.assign(usage, normalizeOpenAIUsage(data.usage));
    },
    applyResponse(entry, json) {
      applyUsageToEntry(entry, normalizeOpenAIUsage(json.usage));
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
  //   pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
  //   // parse
  //   extractMessages(body)      { /* return [{ role, tokens, preview }] */ },
  //   streamDelta(data)          { /* return text of one SSE event, or null */ },
  //   normalizeUsage(rawUsage)   { /* return { inputTokens (uncached only), outputTokens,
  //                                   cacheReadTokens, cacheCreationTokens } */ },
  //   streamUsage(data, usage)   { /* locate raw usage in one SSE event, merge its
  //                                   normalized fields into the accumulator */ },
  //   applyResponse(entry, json) { /* applyUsageToEntry(entry, this.normalizeUsage(json.usage));
  //                                   set entry.responseText */ },
  // },
};

module.exports = {
  PROVIDERS,
  applyUsageToEntry,
  PROXY_PORT,
  DASHBOARD_PORT,
  ALLOWED_ORIGINS,
  PROXY_ALLOWED_HOSTS,
  DASHBOARD_ALLOWED_HOSTS,
};
