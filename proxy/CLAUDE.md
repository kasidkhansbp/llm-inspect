# Proxy architecture — the **3P** standard

This proxy follows a house pattern called **3P: Pass · Parse · Publish**. It is the
proxy's equivalent of MVC. Use it to answer two questions on every change: *where does this
code go?* and *why is this a bug?*

The proxy is an **observability proxy**: its first duty is to relay LLM traffic faithfully,
while inspecting it on a side-channel. The architecture exists to protect that duty.

## The three stages

Data flows **Pass → Parse → Publish**. Each stage owns one layer and may only depend on the
stage to its right.

| Stage | Responsibility | Lives in | MVC analogue |
|---|---|---|---|
| **Pass** | Relay bytes upstream/downstream; orchestrate the flow. Touches `req`/`res`/sockets. | `server/` (`proxy.js`, `dashboard.js`) | Controller |
| **Parse** | Turn raw bytes into meaning — tokens, cost, text — and record the entry model. Pure, no I/O. | `lib/` (`tokens.js`, `pricing.js`, `store.js`) | Model |
| **Publish** | Emit recorded state to observers (SSE → dashboard). | `store.broadcast` → `dashboard/` | View |

It is verbs, not nouns, because a proxy is a pipeline, not a render tree.

## Law 1 — the Side-Channel Invariant (most important)

> **Parse and Publish must never be able to break Pass.** Observation is a side-channel; the
> proxy must relay traffic even when inspection fails.

How the code already enforces this — preserve these behaviors:
- `try { JSON.parse(body) } catch (err) { console.warn(...) }` — a malformed body is still proxied; the error is logged, never silently swallowed.
- `applyResponse` swallows parse errors and returns early — bad JSON loses *metrics*, not the *response*.
- `broadcast` drops dead SSE clients instead of throwing — a broken observer can't stall a request.
- the upstream-error handler returns a 502 to the client **first**, then records the failure.
- the top-level `handleRequest(...).catch()` keeps a client abort from crashing the proxy.

## Law 2 — the Dependency Rule

Stages depend rightward only: `server/` → `lib/`. **`lib/` must never import from `server/`
or know that HTTP exists.** (This is why `createEntry`/`applyResponse` live in `lib/`, not in
`proxy.js`.)

**One deliberate exception — the provider registry (`constants.js`).** Adding a client must
be a *single* edit, so all per-provider config lives in one `PROVIDERS` map in `constants.js`,
where each entry carries both its routing (`match`/`host`/`rewritePath`, a Pass concern) and
its parsing (`extractMessages`/`parseStreamingTokens`/`streamDelta`/`applyResponse`, a Parse
concern). `lib/tokens.js` imports this map, so Parse technically *sees* the upstream hostnames.
This is an accepted trade: single-source extensibility beats strict layering here. The rule is
still honored in spirit — `lib/` only *reads its parse fields and acts on them*; it never
touches `host`/`match` or performs HTTP. Keep it that way: don't make `lib/` consume a route
field, and don't scatter provider config back out into the consuming files.

## Law 3 — Single Responsibility (orchestrators vs. helpers)

Stages tell you *where* code lives; SRP tells you *how big* a function may get. Write
modular, readable code — never a long, monolithic function that mixes high-level
orchestration with low-level execution detail.

Before writing or refactoring a function, walk this thinking process and **state its result
in the change description** (which sub-tasks you found, and which helpers you are extracting):

1. **Identify the orchestrator.** Name the main function's one high-level goal
   (e.g. `handleRequest`: "record the call, relay it, record the outcome").
2. **Isolate the concerns.** Find the sub-tasks hiding inside — body parsing, entry
   recording, stream/event-listener wiring, error-handler setup, external I/O.
3. **Bound the scope.** Any block of low-level detail, data transformation, or a dense
   cluster of event listeners is flagged for extraction into its own helper.

Execution rules:
- **Orchestrators read like a table of contents.** The main function should be a short
  narrative of named steps that delegate the heavy lifting (see `handleRequest`'s
  numbered `recordRequest` / `handleUpstreamResponse` flow).
- **Helpers do exactly one thing** and stay short. One function, one abstraction level —
  never mix high-level flow with low-level socket/stream handling in the same block.
- **Name in verb-noun form so the code self-documents** (`recordRequest`,
  `handleUpstreamResponse`, `applyResponse`). A name with "And" in it (e.g.
  `parseAndCreateEntry`) is a smell that the function owns two jobs — rename to the single
  goal it actually serves, or split it.
- This is the Dependency Rule's partner: extraction must not drag Parse logic up into Pass
  or vice versa. A `server/` helper still delegates meaning-making to `lib/`.

## Litmus tests (make the call without asking)

1. **"Could this throw and break a proxied request?"** If yes and it isn't in Pass, you've
   violated the Side-Channel Invariant — wrap it or move it.
2. **"Can I unit-test this with no server running?"** If no, transport has leaked into Parse.
3. **"Which verb is this?"** Relaying bytes → Pass. Computing meaning → Parse. Telling
   observers → Publish. If a function does two, split it (Law 3).

## Where things live (current map)
- Configuring an LLM client (routing **and** parsing) → `constants.js` (`PROVIDERS`). This is
  the single extension point: to support a new client, add one entry (copy the commented
  `deepseek` template) — no other file changes. `server/proxy.js` reads its route fields
  (`detectProvider`/`upstreamOptions`); `lib/tokens.js` reads its parse fields (`providerFor`).
  An unmatched route is rejected (404), and an unparseable provider degrades to no metrics —
  never a guessed default. See the Dependency Rule exception above.
- Constructing the request-log entry model → `lib/store.js` (`createEntry`). The store owns
  the entry shape and its id counter; keep the factory next to `addRequest` so the entry
  lifecycle (create → store → cap) stays in one module.
- Parsing responses / counting tokens (streaming + non-streaming) → `lib/tokens.js`
  (`extractMessages`, `parseStreamingTokens`, `extractStreamingText`, `applyResponse`). These
  are thin orchestrators: they dispatch to the per-provider strategy via `providerFor`, falling
  back to a no-op `UNSUPPORTED` handler. The provider-specific logic itself lives in
  `constants.js` (`PROVIDERS`), not here.
- Pure orchestration glue (e.g. `finalize`) may stay in `server/proxy.js` — it's part of the
  HTTP flow. Watch this seam: if `finalize` grows, the state-mutation half belongs in `store.js`.

## Known drift to keep in mind
- `finalize` is a Pass/Publish hybrid (mutates model state **and** broadcasts). Acceptable
  today; split if it grows.
- `dashboard.js` is a second, independent Pass→Publish path (serving the UI). Legitimate, but
  keep it separate from the proxy's Pass path.
- The entry is a plain mutable object with placeholder fields (`status: 'pending'`, nulls)
  filled in later by `applyResponse` / `finalize`. There is no enforced schema; if validation
  is ever needed, add it in `store.js`, which owns the model.

## Running a manual smoke test
End-to-end check that the proxy relays a real call and captures it on the dashboard. Two
terminals, run in order:

1. **Start the proxy + dashboard** (leave running):
   ```powershell
   cd C:\Users\kasid\workspace\llm-inspect\proxy
   node main.js
   ```
   Proxy → http://127.0.0.1:8787 · Dashboard → http://127.0.0.1:8788

2. **Send a request through the proxy** (new terminal):
   ```powershell
   cd C:\Users\kasid\workspace\llm-inspect\test
   $env:ANTHROPIC_API_KEY = "sk-ant-..."   # required — see note
   node .\test.js
   ```

Then watch the request/response appear on the dashboard.

**Important:** `ANTHROPIC_API_KEY` must be set in the *same terminal* as step 2. Without it the
Anthropic SDK aborts before sending, so the request never reaches the proxy and the dashboard
stays empty — it looks broken but isn't. `$env:` only lasts for that terminal session, so set
it again in any fresh terminal. It makes a real, billable API call.

## Other conventions
- Don't export a helper that's only an internal detail of one factory (e.g. the id counter
  lives inside `createEntry`, not on the store's public API).
