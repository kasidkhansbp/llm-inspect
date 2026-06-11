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

function getNextId() {
  return nextId++;
}

module.exports = { requests, sseClients, broadcast, addRequest, getNextId };
