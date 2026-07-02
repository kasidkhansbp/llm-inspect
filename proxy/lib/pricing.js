// Prices per million tokens. cacheRead / cacheWrite are the provider's
// published discounted rates, kept as explicit dollar amounts (not multipliers)
// so each number can be checked against the provider's pricing page directly.
//
// All rates verified against the providers' pricing pages on PRICING_AS_OF.
// There is no official pricing API, so the table is maintained by hand: when
// re-verifying rates, update the rows AND bump PRICING_AS_OF — the dashboard
// shows that date under every cost estimate.
const PRICING_AS_OF = '2026-07-02';

// Anthropic (https://platform.claude.com/docs/en/about-claude/pricing):
// cacheRead = 0.1× input, cacheWrite = 1.25× input. The write rate is for the
// default 5-minute cache TTL; 1-hour-TTL writes bill at 2× and are NOT
// modeled — the entry's cost is an underestimate for that rare case.
//
// OpenAI: cacheRead = 0.5× input; caching is automatic with no write charge,
// so cacheWrite is omitted. Models without prompt caching have no cacheRead.
const MODEL_PRICING = {
  // Anthropic — input / output / cacheRead / cacheWrite
  'claude-fable-5':    { input: 10.00, output: 50.00, cacheRead: 1.00, cacheWrite: 12.50 },
  'claude-mythos-5':   { input: 10.00, output: 50.00, cacheRead: 1.00, cacheWrite: 12.50 },
  'claude-opus-4-8':   { input: 5.00,  output: 25.00, cacheRead: 0.50, cacheWrite: 6.25  },
  'claude-opus-4-7':   { input: 5.00,  output: 25.00, cacheRead: 0.50, cacheWrite: 6.25  },
  'claude-opus-4-6':   { input: 5.00,  output: 25.00, cacheRead: 0.50, cacheWrite: 6.25  },
  'claude-opus-4-5':   { input: 5.00,  output: 25.00, cacheRead: 0.50, cacheWrite: 6.25  },
  'claude-opus-4-1':   { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  // Sonnet 5 introductory pricing through 2026-08-31; becomes 3/15 (0.30/3.75)
  // on 2026-09-01 — update this row then.
  'claude-sonnet-5':   { input: 2.00,  output: 10.00, cacheRead: 0.20, cacheWrite: 2.50  },
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75  },
  'claude-sonnet-4-5': { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75  },
  'claude-haiku-4-5':  { input: 1.00,  output: 5.00,  cacheRead: 0.10, cacheWrite: 1.25  },
  // Retired first-party models — kept so entries from Bedrock/Vertex-era logs
  // or replayed traffic still price rather than showing "no pricing data".
  'claude-3-5-sonnet': { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75  },
  'claude-3-5-haiku':  { input: 0.80,  output: 4.00,  cacheRead: 0.08, cacheWrite: 1.00  },
  'claude-3-opus':     { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-3-sonnet':   { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75  },
  'claude-3-haiku':    { input: 0.25,  output: 1.25,  cacheRead: 0.03, cacheWrite: 0.30  },
  // OpenAI
  'gpt-4o':            { input: 2.50,  output: 10.00, cacheRead: 1.25  },
  'gpt-4o-mini':       { input: 0.15,  output: 0.60,  cacheRead: 0.075 },
  'gpt-4-turbo':       { input: 10.00, output: 30.00 },
  'gpt-4':             { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo':     { input: 0.50,  output: 1.50  },
  'o1':                { input: 15.00, output: 60.00, cacheRead: 7.50  },
  'o1-mini':           { input: 3.00,  output: 12.00, cacheRead: 1.50  },
  'o3-mini':           { input: 1.10,  output: 4.40,  cacheRead: 0.55  },
};

function pricingForModel(model) {
  if (!model) return null;
  // Longest matching prefix wins: gpt-4o-mini must hit its own entry, not
  // gpt-4o's — first-match would price it 17x too high.
  let best = null;
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(key) && (best === null || key.length > best.length)) best = key;
  }
  return best ? MODEL_PRICING[best] : null;
}

function costOf(tokens, ratePerM) {
  return ((tokens || 0) / 1_000_000) * (ratePerM || 0);
}

// usage is the normalized shape from the entry / normalizeUsage:
// { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens }.
// Returns the per-line arithmetic behind the total so the dashboard can show
// how the cost was computed. Null for unknown models, like estimateCost.
function costBreakdown(model, usage) {
  const p = pricingForModel(model);
  if (!p) return null;
  const lines = [
    { label: 'Input',       tokens: usage.inputTokens || 0,         rate: p.input || 0 },
    { label: 'Output',      tokens: usage.outputTokens || 0,        rate: p.output || 0 },
    { label: 'Cache Read',  tokens: usage.cacheReadTokens || 0,     rate: p.cacheRead || 0 },
    { label: 'Cache Write', tokens: usage.cacheCreationTokens || 0, rate: p.cacheWrite || 0 },
  ].map(l => ({ ...l, cost: costOf(l.tokens, l.rate) }));
  return { lines, total: lines.reduce((s, l) => s + l.cost, 0), asOf: PRICING_AS_OF };
}

function estimateCost(model, usage) {
  const breakdown = costBreakdown(model, usage);
  return breakdown ? breakdown.total : null;
}

module.exports = { estimateCost, costBreakdown };
