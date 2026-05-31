const requests = [];
let nextId = 1;
const sseClients = [];

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

function addRequest(entry) {
  requests.unshift(entry);
}

function getNextId() {
  return nextId++;
}

module.exports = { requests, sseClients, broadcast, addRequest, getNextId };
