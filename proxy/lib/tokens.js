const { PROVIDERS } = require('../constants');

// Default for any client not in PROVIDERS. Per the Side-Channel Invariant, an
// unsupported provider must never throw: we log once and skip metrics so the
// proxy still relays traffic faithfully. (Routing rejects unknown clients before
// they reach here — this is the defensive fallback and the worked example.)
const UNSUPPORTED = {
  extractMessages: () => [],
  parseStreamingTokens: () => ({ inputTokens: 0, outputTokens: 0 }),
  streamDelta: () => null,
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

function parseStreamingTokens(chunks, provider) {
  const text = Buffer.concat(chunks).toString();
  return providerFor(provider).parseStreamingTokens(text);
}

function extractStreamingText(chunks, provider) {
  const text = Buffer.concat(chunks).toString();
  const handler = providerFor(provider);
  const parts = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const piece = handler.streamDelta(JSON.parse(line.slice(6)));
      if (piece) parts.push(piece);
    } catch(err) {
      console.error('parse failed for line:', JSON.stringify(line), err.message);
    }
  }
  return parts.length ? parts.join('') : null;
}

// Mutates entry with tokens/text parsed from the upstream response.
function applyResponse(entry, chunks, isStreaming) {
  const { provider } = entry;
  if (isStreaming) {
    const { inputTokens, outputTokens } = parseStreamingTokens(chunks, provider);
    if (inputTokens > 0) entry.inputTokens = inputTokens;
    entry.outputTokens = outputTokens;
    entry.responseText = extractStreamingText(chunks, provider);
    return;
  }

  let json;
  try {
    json = JSON.parse(Buffer.concat(chunks).toString());
  } catch (err) {
    // Malformed/incomplete response body: lose the metrics, not the proxied response.
    console.warn(`[tokens] could not parse ${provider} response body as JSON: ${err.message}`);
    return;
  }
  if (!json.usage) return;

  providerFor(provider).applyResponse(entry, json);
  entry.responseRaw = json;
}

module.exports = { extractMessages, parseStreamingTokens, extractStreamingText, applyResponse };
