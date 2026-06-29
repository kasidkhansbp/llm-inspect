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
  try { json = JSON.parse(Buffer.concat(chunks).toString()); } catch { return; }
  if (!json.usage) return;

  if (provider === 'anthropic') {
    entry.inputTokens = json.usage.input_tokens || entry.inputTokens;
    entry.outputTokens = json.usage.output_tokens || 0;
    entry.responseText = (json.content || [])
      .filter(b => b.type === 'text').map(b => b.text).join('\n') || null;
  } else if (provider === 'openai') {
    entry.inputTokens = json.usage.prompt_tokens || entry.inputTokens;
    entry.outputTokens = json.usage.completion_tokens || 0;
    entry.responseText = json.choices?.[0]?.message?.content || null;
  }
  entry.responseRaw = json;
}

module.exports = { extractMessages, parseStreamingTokens, extractStreamingText, applyResponse };
