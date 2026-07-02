// Keep in sync with MAX_REQUESTS in proxy/dashboard/app.js
const MAX_REQUESTS = 200;

const requests = [];
let nextId = 1;
const sseClients = [];

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    if (client.destroyed || client.writableEnded) {
      sseClients.splice(i, 1);
      continue;
    }
    try {
      client.write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

function addRequest(entry) {
  requests.unshift(entry);
  if (requests.length > MAX_REQUESTS) requests.length = MAX_REQUESTS;
}

// Creates a request log entry at the start of a request. Fields the
// upstream response will fill in later (tokens, cost, text, duration)
// start as placeholders.
function createEntry(provider, parsedBody, messages) {
  return {
    id: nextId++,
    timestamp: new Date().toISOString(),
    provider,
    model: parsedBody.model || 'unknown',
    status: 'pending',
    statusCode: null,
    inputTokens: messages.reduce((s, m) => s + m.tokens, 0),
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cost: null,
    messages,
    requestBody: parsedBody,
    responseText: null,
    responseRaw: null,
    durationMs: null,
  };
}

module.exports = { requests, sseClients, broadcast, addRequest, createEntry };
