// Unit tests for the pure Parse-layer seams: per-provider usage normalization
// (normalizeUsage), the streaming accumulator (parseStream), and cost math
// (estimateCost). No server, no network — payloads below are recorded provider
// response shapes.

const assert = require('assert');
const { PROVIDERS } = require('../proxy/constants');
const { parseStream } = require('../proxy/lib/tokens');
const { estimateCost } = require('../proxy/lib/pricing');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function assertClose(actual, expected, name) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${name}: expected ${expected}, got ${actual}`);
}

// SSE frames as the proxy tees them: an array of Buffers.
function sseChunks(events) {
  return [Buffer.from(events.map(e => `data: ${e}\n`).join('\n'))];
}

// ── normalizeUsage: Anthropic ───────────────────────────────────────────────

check('anthropic: cache fields map straight through', () => {
  const n = PROVIDERS.anthropic.normalizeUsage({
    input_tokens: 900, output_tokens: 250,
    cache_read_input_tokens: 5000, cache_creation_input_tokens: 1200,
  });
  assert.deepStrictEqual(n, {
    inputTokens: 900, outputTokens: 250, cacheReadTokens: 5000, cacheCreationTokens: 1200,
  });
});

check('anthropic: uncached response has zero cache fields', () => {
  const n = PROVIDERS.anthropic.normalizeUsage({ input_tokens: 42, output_tokens: 7 });
  assert.deepStrictEqual(n, {
    inputTokens: 42, outputTokens: 7, cacheReadTokens: 0, cacheCreationTokens: 0,
  });
});

// ── normalizeUsage: OpenAI ──────────────────────────────────────────────────

check('openai: inputTokens is the uncached remainder (prompt − cached)', () => {
  const n = PROVIDERS.openai.normalizeUsage({
    prompt_tokens: 5900, completion_tokens: 250,
    prompt_tokens_details: { cached_tokens: 5000 },
  });
  assert.deepStrictEqual(n, {
    inputTokens: 900, outputTokens: 250, cacheReadTokens: 5000, cacheCreationTokens: 0,
  });
});

check('openai: no cached-token detail means full prompt is input', () => {
  const n = PROVIDERS.openai.normalizeUsage({ prompt_tokens: 800, completion_tokens: 60 });
  assert.deepStrictEqual(n, {
    inputTokens: 800, outputTokens: 60, cacheReadTokens: 0, cacheCreationTokens: 0,
  });
});

check('openai: fully-cached prompt yields zero uncached input', () => {
  const n = PROVIDERS.openai.normalizeUsage({
    prompt_tokens: 5000, completion_tokens: 10,
    prompt_tokens_details: { cached_tokens: 5000 },
  });
  assert.strictEqual(n.inputTokens, 0);
  assert.strictEqual(n.cacheReadTokens, 5000);
});

check('openai: cached > prompt (malformed) clamps input at 0, never negative', () => {
  const n = PROVIDERS.openai.normalizeUsage({
    prompt_tokens: 100, completion_tokens: 5,
    prompt_tokens_details: { cached_tokens: 999 },
  });
  assert.strictEqual(n.inputTokens, 0);
});

// ── parseStream: usage accumulates across SSE events ────────────────────────

check('anthropic stream: message_delta output does not clobber message_start cache fields', () => {
  const usage = parseStream(sseChunks([
    '{"type":"message_start","message":{"usage":{"input_tokens":3,"cache_read_input_tokens":5000,"cache_creation_input_tokens":1200,"output_tokens":1}}}',
    '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
    '{"type":"message_delta","usage":{"output_tokens":250}}',
  ]), 'anthropic');
  assert.strictEqual(usage.inputTokens, 3);
  assert.strictEqual(usage.cacheReadTokens, 5000);
  assert.strictEqual(usage.cacheCreationTokens, 1200);
  assert.strictEqual(usage.outputTokens, 250);
  assert.strictEqual(usage.responseText, 'Hello');
});

check('openai stream: final chunk carries normalized usage', () => {
  const usage = parseStream(sseChunks([
    '{"choices":[{"delta":{"content":"Hi"}}]}',
    '{"choices":[],"usage":{"prompt_tokens":5900,"completion_tokens":250,"prompt_tokens_details":{"cached_tokens":5000}}}',
    '[DONE]',
  ]), 'openai');
  assert.strictEqual(usage.inputTokens, 900);
  assert.strictEqual(usage.cacheReadTokens, 5000);
  assert.strictEqual(usage.outputTokens, 250);
  assert.strictEqual(usage.responseText, 'Hi');
});

// ── estimateCost ────────────────────────────────────────────────────────────

check('cost: anthropic cache read (0.1×) and write (1.25×) rates apply', () => {
  const cost = estimateCost('claude-sonnet-4-6', {
    inputTokens: 900, outputTokens: 250, cacheReadTokens: 5000, cacheCreationTokens: 1200,
  });
  // 900×$3 + 250×$15 + 5000×$0.30 + 1200×$3.75 (per M)
  assertClose(cost, 0.0027 + 0.00375 + 0.0015 + 0.0045, 'anthropic cost');
});

check('cost: openai cached tokens bill at half the input rate', () => {
  const cost = estimateCost('gpt-4o', {
    inputTokens: 900, outputTokens: 250, cacheReadTokens: 5000, cacheCreationTokens: 0,
  });
  // 900×$2.50 + 250×$10 + 5000×$1.25 (per M)
  assertClose(cost, 0.00225 + 0.0025 + 0.00625, 'openai cost');
});

check('cost: entries without cache fields (older proxy) still price', () => {
  const cost = estimateCost('gpt-4o', { inputTokens: 1000, outputTokens: 100 });
  assertClose(cost, 0.0025 + 0.001, 'legacy entry cost');
});

check('cost: haiku 4.5 dated model id prices at $1/$5 per M', () => {
  const cost = estimateCost('claude-haiku-4-5-20251001', { inputTokens: 19, outputTokens: 16 });
  // 19×$1 + 16×$5 (per M)
  assertClose(cost, 0.000019 + 0.00008, 'haiku 4.5 cost');
});

check('cost: unknown model returns null', () => {
  assert.strictEqual(estimateCost('some-new-model', { inputTokens: 1, outputTokens: 1 }), null);
});

console.log(`\n✓ PASS - ${passed} unit checks`);
