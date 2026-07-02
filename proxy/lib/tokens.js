const { PROVIDERS, applyUsageToEntry } = require('../constants');

// Default for any client not in PROVIDERS. Per the Side-Channel Invariant, an
// unsupported provider must never throw: we log once and skip metrics so the
// proxy still relays traffic faithfully. (Routing rejects unknown clients before
// they reach here — this is the defensive fallback and the worked example.)
const UNSUPPORTED = {
  extractMessages: () => [],
  streamDelta: () => null,
  streamUsage: () => {},
  applyResponse: () => {},
};

function providerFor(provider) {
  const handler = PROVIDERS[provider];
  if (!handler) {
    console.warn(`[tokens] LLM client "${provider}" is not supported — metrics skipped. Add it to PROVIDERS in constants.js (see the example block).`);
  }
  return handler || UNSUPPORTED;
}

function extractMessages(body, provider) {
  return providerFor(provider).extractMessages(body);
}

// One pass over the SSE buffer: each `data:` line is JSON-parsed once, and the
// provider pulls response text (streamDelta) and token usage (streamUsage)
// from the parsed event — no regexes over raw text, so nested fields in
// `usage` (e.g. Anthropic's cache_creation) can't break the counts.
function parseStream(chunks, provider) {
  const handler = providerFor(provider);
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  const parts = [];
  for (const line of Buffer.concat(chunks).toString().split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]') continue; // OpenAI's end-of-stream sentinel, not JSON
    try {
      const data = JSON.parse(payload);
      const piece = handler.streamDelta(data);
      if (piece) parts.push(piece);
      handler.streamUsage(data, usage);
    } catch (err) {
      console.error('parse failed for line:', JSON.stringify(line), err.message);
    }
  }
  return { ...usage, responseText: parts.length ? parts.join('') : null };
}

// Mutates entry with tokens/text parsed from the upstream response.
function applyResponse(entry, chunks, isStreaming) {
  const { provider } = entry;
  // A failed request gets a plain JSON error body even when it asked for a
  // stream — parse it as JSON below so the error is recorded, not lost.
  if (isStreaming && entry.statusCode < 400) {
    const { responseText, ...usage } = parseStream(chunks, provider);
    applyUsageToEntry(entry, usage);
    entry.responseText = responseText;
    return;
  }

  let json;
  try {
    json = JSON.parse(Buffer.concat(chunks).toString());
  } catch (err) {
    console.warn(`[tokens] could not parse ${provider} response body as JSON: ${err.message}`);
    return;
  }
  entry.responseRaw = json;
  if (!json.usage) return;

  providerFor(provider).applyResponse(entry, json);
}

module.exports = { extractMessages, parseStream, applyResponse };
