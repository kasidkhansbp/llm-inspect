// Sample Claude API call log. Each entry = one request/response pair.
// Shape mirrors a real POST /v1/messages call.
window.SAMPLE_CALLS = [
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        system: "You are a helpful assistant.",
        messages: [{ role: "user", content: "Say hello in one sentence." }]
      }
    },
    response: {
      id: "msg_01YY4iycM8pt13JYHZbg8khg", type: "message", role: "assistant",
      model: "claude-haiku-4-5-20251001",
      content: [{ type: "text", text: "Hello! I'm here to help you with whatever you need today." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 19, output_tokens: 16 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 512,
        system: "You are a senior support engineer for a payments API. Be concise, accurate, and never invent endpoints. If you are unsure, say so.",
        messages: [
          { role: "user", content: "A webhook for `charge.succeeded` fired twice for the same payment. Is that expected?" },
          { role: "assistant", content: "Yes — webhooks are delivered at-least-once, so duplicates can occur during retries. You should make your handler idempotent by deduplicating on the event `id`." },
          { role: "user", content: "How long should I keep those ids around to dedupe against?" }
        ]
      }
    },
    response: {
      id: "msg_01Qb9fE2kLm44Z8vNpTr5sWx", type: "message", role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [{ type: "text", text: "A rolling window of 24–72 hours is usually enough, since retries are exhausted well before then. Store each processed event `id` with a TTL (e.g. in Redis), and drop any event whose id you've already seen. If you need stronger guarantees, persist ids for the same window in your primary database alongside the affected resource." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 187, output_tokens: 84 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-opus-4-1-20250805",
        max_tokens: 1024,
        temperature: 0.2,
        system: "You are a meticulous research assistant. Read the supplied document and extract structured findings. Respond with a short prose summary followed by the key data points. Do not omit figures.",
        messages: [
          { role: "user", content: "Summarize the following quarterly note and pull out the headline numbers.\n\n--- BEGIN DOCUMENT ---\nNorthwind Components — Q3 FY26 Operating Review\n\nRevenue for the quarter reached $48.2M, up 14% year over year and 6% sequentially, driven primarily by the industrial sensors line (now 41% of total revenue) and a recovering aftermarket parts business. Gross margin expanded 220 basis points to 38.9% as the new Monterrey facility ramped to full utilization and freight costs normalized after two quarters of elevated air-shipment spend.\n\nOperating expenses grew 9% to $13.4M, below revenue growth, yielding operating income of $5.4M (11.2% operating margin) versus $3.1M in the prior-year period. The company added 47 net new logos, of which 12 were classified as strategic (>$250K ACV). Net revenue retention held at 112%.\n\nManagement flagged two risks: a single contract manufacturer in Penang represents 28% of board assembly capacity, and the design win pipeline for the next-gen LiDAR module slipped one quarter due to a customer re-spin. Cash and equivalents ended at $61.7M with no drawn debt. Free cash flow was $7.9M. Guidance for Q4 was raised to $50–52M in revenue.\n--- END DOCUMENT ---" }
        ]
      }
    },
    response: {
      id: "msg_01Rt7uVw3xYz66Aa2BbCc4Dd", type: "message", role: "assistant",
      model: "claude-opus-4-1-20250805",
      content: [{ type: "text", text: "Northwind Components posted a strong Q3 FY26: revenue grew double digits while margins expanded and operating income nearly doubled. Growth was led by industrial sensors and a recovering aftermarket business, and cash generation was healthy with no debt. Management raised Q4 guidance but flagged supplier concentration in Penang and a one-quarter slip in the LiDAR design-win pipeline.\n\nHeadline numbers:\n• Revenue: $48.2M (+14% YoY, +6% QoQ)\n• Gross margin: 38.9% (+220 bps)\n• Operating income: $5.4M (11.2% margin) vs. $3.1M prior year\n• Operating expenses: $13.4M (+9%)\n• Net new logos: 47 (12 strategic, >$250K ACV)\n• Net revenue retention: 112%\n• Cash & equivalents: $61.7M, no drawn debt\n• Free cash flow: $7.9M\n• Q4 guidance: $50–52M revenue (raised)\n\nKey risks: 28% of board-assembly capacity at a single Penang CM; next-gen LiDAR pipeline slipped one quarter on a customer re-spin." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 412, output_tokens: 268 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: "Extract structured data. Always reply with valid JSON only — no prose, no code fences.",
        messages: [{ role: "user", content: "Parse this address: 1600 Pennsylvania Ave NW, Washington, DC 20500" }]
      }
    },
    response: {
      id: "msg_01Kp5mNo8qRs11Tt9UuVv2Ww", type: "message", role: "assistant",
      model: "claude-haiku-4-5-20251001",
      content: [{ type: "text", text: "{\"street\":\"1600 Pennsylvania Ave NW\",\"city\":\"Washington\",\"state\":\"DC\",\"postal_code\":\"20500\",\"country\":\"US\"}" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 41, output_tokens: 39 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 800,
        system: "You are a careful code reviewer. Point out bugs and suggest minimal fixes. Use short code snippets.",
        messages: [{ role: "user", content: "Why does this return undefined sometimes?\n\nfunction findUser(users, id) {\n  users.forEach(u => {\n    if (u.id === id) return u;\n  });\n}" }]
      }
    },
    response: {
      id: "msg_01Bn3cDe6fGh77Ii8JjKk9Ll", type: "message", role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [{ type: "text", text: "`forEach` ignores return values, so the `return u` only exits the callback — `findUser` itself never returns anything, hence `undefined`. Use `find` instead:\n\n  function findUser(users, id) {\n    return users.find(u => u.id === id);\n  }\n\nThis returns the matching user, or `undefined` if none match — which you can then handle explicitly." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 96, output_tokens: 92 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-opus-4-1-20250805",
        max_tokens: 200,
        system: "You translate English to French. Preserve tone and formatting. Output only the translation.",
        messages: [{ role: "user", content: "Welcome aboard! Your account is ready. Click below to get started." }]
      }
    },
    response: {
      id: "msg_01Wq2rSt5uVw88Xx9YyZz0Aa", type: "message", role: "assistant",
      model: "claude-opus-4-1-20250805",
      content: [{ type: "text", text: "Bienvenue à bord ! Votre compte est prêt. Cliquez ci-dessous pour commencer." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 38, output_tokens: 27 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        temperature: 0.7,
        system: "You are a thoughtful writing partner. Help the user develop their ideas. Ask a clarifying question if the brief is thin, otherwise produce a first draft.",
        messages: [{ role: "user", content: "I need an internal memo announcing that we're moving from a 5-day in-office policy to a hybrid 3-day model starting next quarter. Audience is the whole company (~600 people). Tone: warm but clear, not corporate-jargony. Cover the why, the specifics (which days are anchor days), what stays the same, and where to ask questions. Keep it under 400 words." }]
      }
    },
    response: {
      id: "msg_01Dd4eFg7hIj99Kk0LlMm1Nn", type: "message", role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [{ type: "text", text: "Subject: A change to how we work together — moving to a 3-day hybrid model\n\nHi everyone,\n\nStarting next quarter, we're moving from five days in the office to a hybrid model: three anchor days together, two days wherever you do your best work.\n\nWhy now? Over the past year the strongest moments — fast decisions, new hires finding their footing, the hallway conversations that turn into projects — have happened when we're in the same room. The rest of the work, the deep focus kind, often happens better with fewer interruptions. This model tries to give both their proper place rather than forcing everything into one shape.\n\nThe specifics:\n• Anchor days are Tuesday, Wednesday, and Thursday. Please plan to be in the office on those days.\n• Monday and Friday are flexible — office or remote, your call.\n• Teams that need a different rhythm (support coverage, lab work, anything customer-facing on specific days) should set their own schedule with their manager. The three-day floor is a default, not a straitjacket.\n\nWhat stays the same: your role, your team, your benefits, and our expectations of each other. This isn't a productivity experiment with strings attached — it's a recognition that we've earned the trust to work like adults.\n\nA few practical notes: desks remain assigned, not hot-desked. Meeting-heavy work should cluster on anchor days so flexible days stay protected for focus. And if your commute or care situation makes the anchor days genuinely hard, talk to your manager — we'll work it out case by case.\n\nWhere to ask questions: we'll hold two open Q&A sessions next week (calendar invites coming), and you can drop questions anytime in #hybrid-questions. People Ops will keep a running FAQ updated as things come up.\n\nThanks for the flexibility you've shown getting us here. I think this will make our time together count for more.\n\n— Dana" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 142, output_tokens: 421 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        system: "Classify the sentiment of the message as positive, negative, or neutral. One word only.",
        messages: [{ role: "user", content: "The package arrived three days late and the box was crushed." }]
      }
    },
    response: {
      id: "msg_01Ee5fGh8iJk00Ll1MmNn2Oo", type: "message", role: "assistant",
      model: "claude-haiku-4-5-20251001",
      content: [{ type: "text", text: "negative" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 33, output_tokens: 3 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-opus-4-1-20250805",
        max_tokens: 1500,
        system: "You are a tutor. Explain step by step, then give the final answer clearly labeled.",
        messages: [{ role: "user", content: "A train leaves Station A at 9:00am traveling 60 mph. A second train leaves Station B, 210 miles away, at 9:30am traveling 75 mph toward A. When do they meet?" }]
      }
    },
    response: {
      id: "msg_01Ff6gHi9jKl11Mm2NnOo3Pp", type: "message", role: "assistant",
      model: "claude-opus-4-1-20250805",
      content: [{ type: "text", text: "Step 1 — Head start. The first train travels alone for 30 minutes (9:00–9:30) at 60 mph, covering 30 miles. Remaining gap at 9:30: 210 − 30 = 180 miles.\n\nStep 2 — Closing speed. After 9:30 both move toward each other: 60 + 75 = 135 mph.\n\nStep 3 — Time to close. 180 ÷ 135 = 1.333… hours = 1 hour 20 minutes.\n\nStep 4 — Clock time. 9:30am + 1:20 = 10:50am.\n\nFinal answer: They meet at 10:50am." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 78, output_tokens: 142 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 300,
        system: "You are a concise assistant.",
        messages: [{ role: "user", content: "Give me three short, punchy taglines for a sleep-tracking app called Driftwood." }]
      }
    },
    response: {
      id: "msg_01Gg7hIj0kLm22Nn3OoPp4Qq", type: "message", role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [{ type: "text", text: "1. Driftwood — drift off, wake up knowing.\n2. Your nights, finally legible.\n3. Sleep you can actually see." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 44, output_tokens: 41 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-opus-4-1-20250805",
        max_tokens: 50,
        system: "Reply with a single word.",
        messages: [{ role: "user", content: "What is the capital of Australia?" }]
      }
    },
    error: {
      status: 529,
      body: {
        type: "error",
        error: { type: "overloaded_error", message: "Overloaded. Please retry your request shortly." }
      }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-opus-4-1-20250805",
        max_tokens: 50,
        system: "Reply with a single word.",
        messages: [{ role: "user", content: "What is the capital of Australia?" }]
      }
    },
    response: {
      id: "msg_01Hh8iJk1lMn33Oo4PpQq5Rr", type: "message", role: "assistant",
      model: "claude-opus-4-1-20250805",
      content: [{ type: "text", text: "Canberra" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 22, output_tokens: 4 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        tools: [{ name: "get_weather", description: "Get current weather for a city", input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } }],
        system: "Use tools when they help. Otherwise answer directly.",
        messages: [{ role: "user", content: "What should I wear in Reykjavik today?" }]
      }
    },
    response: {
      id: "msg_01Ii9jKl2mNo44Pp5QqRr6Ss", type: "message", role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [
        { type: "text", text: "Let me check the current conditions there." },
        { type: "tool_use", id: "toolu_01Ab2Cd3Ef4Gh5Ij6Kl7Mn", name: "get_weather", input: { city: "Reykjavik" } }
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 134, output_tokens: 58 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: "You write friendly, plain-language error messages for end users. No jargon.",
        messages: [{ role: "user", content: "Rewrite this for users: 'ERR_CONN_TIMEOUT: upstream did not respond within 30000ms'." }]
      }
    },
    response: {
      id: "msg_01Jj0kLm3nOp55Qq6RrSs7Tt", type: "message", role: "assistant",
      model: "claude-haiku-4-5-20251001",
      content: [{ type: "text", text: "We couldn't reach the server in time. This is usually temporary — check your connection and try again in a moment. If it keeps happening, our status page has the latest." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 52, output_tokens: 47 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 700,
        system: "You are a SQL assistant. Return a single query and a one-line explanation.",
        messages: [{ role: "user", content: "Table `orders(id, customer_id, total, created_at)`. Give me the top 5 customers by total spend in the last 90 days." }]
      }
    },
    response: {
      id: "msg_01Kk1lMn4oPq66Rr7SsTt8Uu", type: "message", role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [{ type: "text", text: "SELECT customer_id, SUM(total) AS spend\nFROM orders\nWHERE created_at >= NOW() - INTERVAL '90 days'\nGROUP BY customer_id\nORDER BY spend DESC\nLIMIT 5;\n\nGroups orders from the last 90 days by customer, sums their spend, and returns the five highest." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 89, output_tokens: 76 }
    }
  },
  {
    request: {
      method: "POST", path: "/v1/messages",
      headers: { "x-api-key": "sk-ant-api03-Xy7...redacted", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        system: "You are a helpful assistant.",
        messages: [
          { role: "user", content: "Name a fruit." },
          { role: "assistant", content: "Mango." },
          { role: "user", content: "Now one that's a berry, botanically." }
        ]
      }
    },
    response: {
      id: "msg_01Ll2mNo5pQr77Ss8TtUu9Vv", type: "message", role: "assistant",
      model: "claude-haiku-4-5-20251001",
      content: [{ type: "text", text: "A banana — botanically, it's classified as a berry." }],
      stop_reason: "end_turn",
      usage: { input_tokens: 61, output_tokens: 18 }
    }
  }
];

// Deterministic timestamps + latency so the demo is stable across reloads.
(function () {
  let t = new Date("2026-05-31T09:12:04").getTime();
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 1000) / 1000; };
  window.SAMPLE_CALLS.forEach((c) => {
    t += 8000 + Math.floor(rnd() * 52000); // 8–60s between calls
    c.timestamp = t;
    const out = c.response ? c.response.usage.output_tokens : 0;
    c.latency_ms = c.error ? 380 + Math.floor(rnd() * 320) : 300 + out * 9 + Math.floor(rnd() * 240);
  });
})();
