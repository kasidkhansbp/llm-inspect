// Provider registry — the single place to configure an LLM client.
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
    rewritePath: (path) => path.replace(/^\/openai/, '') || '/',
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

module.exports = { PROVIDERS };
