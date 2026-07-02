const MODEL_PRICING = {
  // Anthropic — prices per million tokens (input / output)
  'claude-opus-4-8':   { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 0.80,  output: 4.00  },
  'claude-3-5-sonnet': { input: 3.00,  output: 15.00 },
  'claude-3-5-haiku':  { input: 0.80,  output: 4.00  },
  'claude-3-opus':     { input: 15.00, output: 75.00 },
  'claude-3-sonnet':   { input: 3.00,  output: 15.00 },
  'claude-3-haiku':    { input: 0.25,  output: 1.25  },
  // OpenAI
  'gpt-4o':            { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':       { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':       { input: 10.00, output: 30.00 },
  'gpt-4':             { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo':     { input: 0.50,  output: 1.50  },
  'o1':                { input: 15.00, output: 60.00 },
  'o1-mini':           { input: 3.00,  output: 12.00 },
  'o3-mini':           { input: 1.10,  output: 4.40  },
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

function estimateCost(model, inputTokens, outputTokens) {
  const p = pricingForModel(model);
  if (!p) return null;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

module.exports = { estimateCost };
