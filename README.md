# llm-inspect

Zero-config LLM API inspector. One import, one call — intercepts all Anthropic and OpenAI calls and shows a real-time dashboard with token breakdown and cost estimates.

https://github.com/user-attachments/assets/5ee0db9d-d567-4913-b773-133637284743

---

## How it works

`init()` starts a lightweight local proxy on `:8787` (if not already running) and sets `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` so all SDK calls route through it automatically. The dashboard at `:8788` receives live updates via SSE. No config files, no CA certificates, no accounts — everything resets when the proxy stops.

```
your app  →  :8787 (proxy)  →  api.anthropic.com / api.openai.com
                  ↓
          :8788 (dashboard)
```

---

## Installation

**Python**
```bash
pip install llm-inspect
```

**Node.js**
```bash
npm install llm-inspect
```

**Requirements:** Node.js ≥ 18 must be installed (the proxy is a Node.js process; the Python package bundles it but still needs `node` on PATH).

---

## Usage

### Python

Add `init()` at your app entry point, before importing any LLM SDK:

```python
import llm_inspect
llm_inspect.init()

import anthropic
client = anthropic.Anthropic()  # calls now route through the inspector

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
```

OpenAI works the same way — just import `openai` after `init()`:

```python
import llm_inspect
llm_inspect.init()

import openai
client = openai.OpenAI()
```

### Node.js

```js
const llmInspect = require('llm-inspect');
await llmInspect.init();

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic();  // calls now route through the inspector
```

```js
// OpenAI
const llmInspect = require('llm-inspect');
await llmInspect.init();

const OpenAI = require('openai');
const client = new OpenAI();
```

### Dashboard

Open **http://localhost:8788** in your browser. The dashboard shows live requests with:

- Provider and model name
- Input / output token counts (actual usage fields from the API response; falls back to ~4 chars/token estimate before the response arrives)
- Prompt-cache usage (cache reads and writes, shown only when a call used caching — marked ⚡ in the request list). Counts are normalized across providers: **Input always means uncached tokens only**, so for OpenAI the reported `prompt_tokens` is split into its cached and uncached parts
- Estimated cost in USD, including discounted cache-read/write rates
- Message structure (role, token count, content preview)
- Response text and raw JSON
- Request duration

---

## Supported models and providers

| Provider  | Route                        | Example models                                      |
|-----------|------------------------------|-----------------------------------------------------|
| Anthropic | `POST /v1/messages`          | claude-opus-4, claude-sonnet-4-6, claude-haiku-4-5  |
| OpenAI    | `POST /openai/v1/chat/completions` | gpt-4o, gpt-4o-mini, o1, o3-mini               |

Both streaming and non-streaming requests are supported.

---

## Ports

| Port | Service               |
|------|-----------------------|
| 8787 | Proxy (LLM traffic)   |
| 8788 | Dashboard (browser UI)|

The proxy performs a `/health` check on startup — if port 8787 is already responding, a second proxy process is not spawned.

---

## Project structure

```
proxy/
  main.js              # entry point — starts proxy + dashboard
  server/
    proxy.js           # HTTP proxy, intercepts /v1/messages and /openai/*
    dashboard.js       # serves the UI and SSE /events endpoint
  lib/
    store.js           # in-memory request log, SSE broadcast
    tokens.js          # message extraction, streaming token parsing
    pricing.js         # per-model cost table ($/M tokens)
  dashboard/
    index.html
    app.js
packages/
  node/                # npm package (llm-inspect)
  python/              # PyPI package (llm-inspect)
```

---

## Development

```bash
# Run the proxy directly
node proxy/main.js

# Run tests
cd test && npm test
```

To publish a new release, push a `v*` tag — the GitHub Actions workflow publishes to both npm and PyPI automatically. You'll need `NPM_TOKEN` and `PYPI_TOKEN` set as repository secrets.

---

## Limitations

- **In-memory only** — the request log resets when the proxy stops. There is no persistence.
- **Local dev only** — designed for development machines, not production deployments.
- **Pricing table is static** — cost estimates are based on hardcoded rates in `proxy/lib/pricing.js` (including cache read/write rates) and may drift from actual billing. Anthropic cache writes are priced at the default 5-minute-TTL rate (1.25× input); 1-hour-TTL writes bill at 2× and are not modeled, so those calls are underestimated.
