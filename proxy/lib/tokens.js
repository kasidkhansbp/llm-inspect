function countTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function extractMessages(body, provider) {
  const messages = [];

  if (provider === 'anthropic') {
    if (body.system) {
      const text = typeof body.system === 'string'
        ? body.system
        : body.system.map(b => b.text || '').join('');
      messages.push({ role: 'system', tokens: countTokens(text), preview: text.slice(0, 200) });
    }
    for (const msg of (body.messages || [])) {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content || []).map(b => b.text || '').join('');
      messages.push({ role: msg.role, tokens: countTokens(text), preview: text.slice(0, 200) });
    }
  } else {
    for (const msg of (body.messages || [])) {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content || []).map(b => typeof b === 'string' ? b : (b.text || '')).join('');
      messages.push({ role: msg.role, tokens: countTokens(text), preview: text.slice(0, 200) });
    }
  }

  return messages;
}

function parseStreamingTokens(chunks, provider) {
  const text = Buffer.concat(chunks).toString();
  let inputTokens = 0, outputTokens = 0;

  if (provider === 'anthropic') {
    const match = text.match(/"usage"\s*:\s*\{[^}]*"input_tokens"\s*:\s*(\d+)[^}]*"output_tokens"\s*:\s*(\d+)/);
    if (match) { inputTokens = parseInt(match[1]); outputTokens = parseInt(match[2]); }
    const deltaMatch = text.match(/"usage"\s*:\s*\{[^}]*"output_tokens"\s*:\s*(\d+)/g);
    if (deltaMatch) {
      const last = deltaMatch[deltaMatch.length - 1];
      const m = last.match(/"output_tokens"\s*:\s*(\d+)/);
      if (m) outputTokens = Math.max(outputTokens, parseInt(m[1]));
    }
  } else {
    const match = text.match(/"usage"\s*:\s*\{[^}]*"prompt_tokens"\s*:\s*(\d+)[^}]*"completion_tokens"\s*:\s*(\d+)/);
    if (match) { inputTokens = parseInt(match[1]); outputTokens = parseInt(match[2]); }
  }

  return { inputTokens, outputTokens };
}

module.exports = { extractMessages, parseStreamingTokens };
