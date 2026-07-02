// Keep in sync with MAX_REQUESTS in proxy/lib/store.js
const MAX_REQUESTS = 200;
const state = { requests: [], selected: null, filter: 'all' };

// Requests matching the active provider filter ('all' shows everything).
function filteredRequests() {
  return state.filter === 'all'
    ? state.requests
    : state.requests.filter(r => r.provider === state.filter);
}

// ── Formatters ──────────────────────────────────────────────────────────────

function fmt(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

// Entries recorded by an older proxy predate the cache fields — treat missing
// as 0 rather than propagating NaN into sums and labels.
function cacheTokens(r) {
  return (r.cacheReadTokens || 0) + (r.cacheCreationTokens || 0);
}

// 6 decimals to match the Cost Calculation card's line items exactly.
function fmtCost(c) {
  return c == null ? '—' : '$' + c.toFixed(6);
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(ms) {
  if (ms == null) return '';
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// For interpolation into class="..." — request-derived values must not be
// able to close the attribute and inject handlers
function cssSafe(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '');
}

function highlightJSON(json) {
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (m) => {
    if (/^"/.test(m)) return /:$/.test(m) ? `<span class="json-key">${m}</span>` : `<span class="json-string">${m}</span>`;
    if (/true|false/.test(m)) return `<span class="json-bool">${m}</span>`;
    if (/null/.test(m)) return `<span class="json-null">${m}</span>`;
    return `<span class="json-number">${m}</span>`;
  });
}

function makeCopyBtn(getText) {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.textContent = 'Copy';
  btn.addEventListener('click', () => {
    const text = typeof getText === 'function' ? getText() : getText;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copy-btn--done');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copy-btn--done'); }, 1500);
    });
  });
  return btn;
}

function makeCollapsibleCard(label, labelClass, json) {
  const el = document.createElement('div');
  el.className = 'section-card';
  let collapsed = false;

  const body = document.createElement('div');
  body.className = 'section-body section-body--raw';
  body.innerHTML = highlightJSON(escHtml(json));

  const toggle = document.createElement('span');
  toggle.className = 'section-toggle';
  toggle.textContent = '▾';

  const actions = document.createElement('div');
  actions.className = 'section-actions';
  actions.appendChild(makeCopyBtn(() => json));

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-label ${labelClass}">${label}</span>`;
  header.appendChild(actions);
  header.insertBefore(toggle, header.firstChild);

  header.addEventListener('click', (e) => {
    if (e.target.closest('.copy-btn')) return;
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : '';
    toggle.classList.toggle('section-toggle--collapsed', collapsed);
  });

  el.appendChild(header);
  el.appendChild(body);
  return el;
}

function renderRawCard(requestBody) {
  return makeCollapsibleCard('Raw Request', 'label-raw', JSON.stringify(requestBody, null, 2));
}

function renderResponseCard(responseRaw) {
  return makeCollapsibleCard('Raw Response', 'label-response', JSON.stringify(responseRaw, null, 2));
}

// ── Store helpers ────────────────────────────────────────────────────────────

function upsert(req) {
  const idx = state.requests.findIndex(r => r.id === req.id);
  if (idx >= 0) state.requests[idx] = req;
  else state.requests.unshift(req);
  if (state.requests.length > MAX_REQUESTS) state.requests.length = MAX_REQUESTS;
}

// ── Stats ────────────────────────────────────────────────────────────────────

function updateStats() {
  const visible = filteredRequests();
  const done = visible.filter(r => r.status !== 'pending');
  document.getElementById('stat-count').textContent = visible.length;
  document.getElementById('stat-tokens').textContent = fmt(
    done.reduce((s, r) => s + r.inputTokens + r.outputTokens + cacheTokens(r), 0)
  );
  const totalCost = done.reduce((s, r) => s + (r.cost || 0), 0);
  document.getElementById('stat-cost').textContent = fmtCost(totalCost || null);
}

// ── Provider filter ──────────────────────────────────────────────────────────

// Build tabs from the providers actually present, so a new provider added in
// constants.js surfaces here with no dashboard change.
function renderFilters() {
  const counts = {};
  for (const r of state.requests) counts[r.provider] = (counts[r.provider] || 0) + 1;
  const providers = Object.keys(counts).sort();

  // Selected provider no longer present (e.g. evicted) — fall back to All.
  if (state.filter !== 'all' && !counts[state.filter]) state.filter = 'all';

  const tabs = [['all', 'All', state.requests.length]];
  for (const p of providers) tabs.push([p, p, counts[p]]);

  const el = document.getElementById('filters');
  el.innerHTML = '';
  for (const [value, label, count] of tabs) {
    const btn = document.createElement('button');
    btn.className = 'filter-tab' + (state.filter === value ? ' active' : '');
    btn.innerHTML = `${escHtml(label)}<span class="filter-count">${count}</span>`;
    btn.addEventListener('click', () => {
      state.filter = value;
      renderFilters();
      renderList();
      updateStats();
    });
    el.appendChild(btn);
  }
}

// ── Request list ─────────────────────────────────────────────────────────────

function renderList() {
  const el = document.getElementById('request-list');
  el.innerHTML = '';
  for (const r of filteredRequests()) {
    const div = document.createElement('div');
    div.className = 'req-item' + (state.selected === r.id ? ' selected' : '');
    div.dataset.id = r.id;
    div.innerHTML = `
      <div class="req-top">
        <span class="provider-badge badge-${cssSafe(r.provider)}">${escHtml(r.provider)}</span>
        <span class="req-model">${escHtml(r.model)}</span>
        <span class="req-status status-${cssSafe(r.status)}"></span>
      </div>
      <div class="req-bottom">
        <span class="req-time">${fmtTime(r.timestamp)}</span>
        <span class="req-tokens">${fmt(r.inputTokens)}↑ ${fmt(r.outputTokens)}↓${cacheTokens(r) ? ` ${fmt(cacheTokens(r))}⚡` : ''} tok</span>
        <span class="req-cost">${fmtCost(r.cost)}</span>
        ${r.durationMs != null ? `<span>${fmtDuration(r.durationMs)}</span>` : ''}
      </div>
    `;
    div.addEventListener('click', () => selectRequest(r.id));
    el.appendChild(div);
  }
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function selectRequest(id) {
  state.selected = id;
  renderList();
  renderDetail();
}

function renderDetail() {
  const r = state.requests.find(x => x.id === state.selected);
  document.getElementById('empty-state').style.display = r ? 'none' : 'flex';
  const content = document.getElementById('detail-content');
  if (!r) { content.style.display = 'none'; return; }
  content.style.display = 'flex';

  document.getElementById('detail-title').textContent = r.model;
  document.getElementById('detail-meta').innerHTML = `
    <span>${escHtml(r.provider)}</span>
    <span>${fmtTime(r.timestamp)}</span>
    ${r.durationMs != null ? `<span>${fmtDuration(r.durationMs)}</span>` : ''}
    ${r.statusCode != null ? `<span class="${r.statusCode < 400 ? '' : 'status-code-error'}">HTTP ${escHtml(r.statusCode)}</span>` : ''}
    <span class="req-status status-${cssSafe(r.status)}" style="display:inline-block"></span>
  `;

  const totalTok = r.messages.reduce((s, m) => s + m.tokens, 0) || 1;
  const body = document.getElementById('detail-body');
  body.innerHTML = '';

  body.appendChild(renderSummaryCard(r));
  // Cost isn't computed until the response lands, so no card while pending.
  if (r.status !== 'pending') body.appendChild(renderCostCard(r));
  // System/user rows are visible in Raw Request already; only the response
  // breakdown earns a card. Percentages stay relative to the whole call.
  for (const msg of r.messages.filter(m => m.role !== 'system' && m.role !== 'user')) {
    body.appendChild(renderMessageCard(msg, totalTok));
  }
  if (r.requestBody) body.appendChild(renderRawCard(r.requestBody));
  if (r.responseRaw) body.appendChild(renderResponseCard(r.responseRaw));
}

function summaryStat(label, value, style) {
  return `<div class="summary-stat"><span class="summary-label">${label}</span><span class="summary-value"${style ? ` style="${style}"` : ''}>${value}</span></div>`;
}

function renderSummaryCard(r) {
  const cacheRead = r.cacheReadTokens || 0;
  const cacheWrite = r.cacheCreationTokens || 0;
  const el = document.createElement('div');
  el.className = 'summary-card';
  el.innerHTML = [
    summaryStat('Input', fmt(r.inputTokens)),
    summaryStat('Output', fmt(r.outputTokens)),
    summaryStat('Cache Read', fmt(cacheRead)),
    summaryStat('Cache Write', fmt(cacheWrite)),
    summaryStat('Total', fmt(r.inputTokens + r.outputTokens + cacheRead + cacheWrite)),
    // The * matches the cost card's footnote: estimate based on dated pricing.
    summaryStat(r.cost != null ? 'Cost*' : 'Cost', fmtCost(r.cost), 'color:var(--green)'),
  ].join('');
  return el;
}

// Shows the arithmetic behind the entry's cost so the total can be audited
// against the provider's pricing page. Cache lines appear only when tokens
// were actually cached; unknown models get an explanatory note instead.
function renderCostCard(r) {
  const el = document.createElement('div');
  el.className = 'section-card';

  let rows;
  const bd = r.costBreakdown;
  if (!bd) {
    rows = `<div class="cost-row cost-row--muted">No pricing data for "${escHtml(r.model)}" — cost not estimated</div>`;
  } else {
    const lines = bd.lines.filter(l => l.tokens > 0 || l.label === 'Input' || l.label === 'Output');
    rows = lines.map(l => `
      <div class="cost-row">
        <span class="cost-label">${escHtml(l.label)}</span>
        <span class="cost-math">${l.tokens.toLocaleString()} tok × $${l.rate}/M</span>
        <span class="cost-value">$${l.cost.toFixed(6)}</span>
      </div>`).join('') + `
      <div class="cost-row cost-row--total">
        <span class="cost-label">Total*</span>
        <span class="cost-math"></span>
        <span class="cost-value">$${bd.total.toFixed(6)}</span>
      </div>
      <div class="cost-note">* Estimated — assumes published API prices as of ${escHtml(bd.asOf || 'the last table update')}; actual billing may differ.</div>`;
  }

  const pricingLink = r.pricingUrl
    ? `<a class="cost-link" href="${escHtml(r.pricingUrl)}" target="_blank" rel="noopener noreferrer">pricing page ↗</a>`
    : '';
  el.innerHTML = `
    <div class="section-header" style="cursor:default">
      <span class="section-label label-cost">Cost Calculation</span>
      ${pricingLink}
    </div>
    <div class="cost-body">${rows}</div>`;
  return el;
}

function renderMessageCard(msg, totalTok) {
  const pct = Math.round((msg.tokens / totalTok) * 100);
  const el = document.createElement('div');
  el.className = 'msg-card';
  el.innerHTML = `
    <div class="msg-header">
      <span class="role-tag role-${cssSafe(msg.role)}">${escHtml(msg.role)}</span>
      <span class="msg-tokens">${fmt(msg.tokens)} tokens (${pct}%)</span>
    </div>
    <div style="padding:4px 12px">
      <div class="token-bar-wrap"><div class="token-bar bar-${cssSafe(msg.role)}" style="width:${pct}%"></div></div>
    </div>
    ${msg.preview ? `<div class="msg-preview">${escHtml(msg.preview)}${msg.preview.length >= 200 ? '…' : ''}</div>` : ''}
  `;
  return el;
}

// ── SSE connection ───────────────────────────────────────────────────────────

let es = null;
let reconnectTimer = null;

function connect() {
  if (es) es.close();
  es = new EventSource('/events');

  es.addEventListener('init', e => {
    state.requests = JSON.parse(e.data);
    renderFilters();
    renderList();
    updateStats();
  });

  es.addEventListener('request', e => {
    upsert(JSON.parse(e.data));
    renderFilters();
    renderList();
    updateStats();
    if (!state.selected) selectRequest(state.requests[0]?.id);
  });

  es.addEventListener('update', e => {
    const req = JSON.parse(e.data);
    // Ignore updates for requests already evicted from the capped list
    if (!state.requests.some(r => r.id === req.id)) return;
    upsert(req);
    renderFilters();
    renderList();
    updateStats();
    if (state.selected === req.id) renderDetail();
  });

  es.onerror = () => {
    // EventSource retries on its own; close it so only our timer reconnects,
    // otherwise each error spawns an extra connection that is never released.
    es.close();
    if (serverStopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 2000);
  };
}

connect();

// ── Kill button ──────────────────────────────────────────────────────────────

let serverStopped = false;

function showStopped() {
  if (serverStopped) return;
  serverStopped = true;
  document.body.innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--muted);">
      <div style="width:10px;height:10px;border-radius:50%;background:var(--red);"></div>
      <span style="font-size:14px;color:var(--text);">Server stopped</span>
      <span style="font-size:12px;">Close this tab</span>
    </div>`;
}

(function () {
  const btn = document.getElementById('kill-btn');
  let confirmed = false;
  let resetTimer = null;

  btn.addEventListener('click', () => {
    if (!confirmed) {
      confirmed = true;
      btn.textContent = 'Sure?';
      btn.classList.add('confirm');
      resetTimer = setTimeout(() => {
        confirmed = false;
        btn.textContent = 'Stop';
        btn.classList.remove('confirm');
      }, 3000);
      return;
    }

    clearTimeout(resetTimer);
    btn.textContent = 'Stopping…';
    btn.disabled = true;
    fetch('/shutdown', { method: 'POST' }).then(showStopped).catch(showStopped);
  });
})();
