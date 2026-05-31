const state = { requests: [], selected: null };

// ── Formatters ──────────────────────────────────────────────────────────────

function fmt(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function fmtCost(c) {
  return c == null ? '—' : '$' + c.toFixed(4);
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(ms) {
  if (ms == null) return '';
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
}

// ── Stats ────────────────────────────────────────────────────────────────────

function updateStats() {
  const done = state.requests.filter(r => r.status !== 'pending');
  document.getElementById('stat-count').textContent = state.requests.length;
  document.getElementById('stat-tokens').textContent = fmt(
    done.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0)
  );
  const totalCost = done.reduce((s, r) => s + (r.cost || 0), 0);
  document.getElementById('stat-cost').textContent = fmtCost(totalCost || null);
}

// ── Request list ─────────────────────────────────────────────────────────────

function renderList() {
  const el = document.getElementById('request-list');
  el.innerHTML = '';
  for (const r of state.requests) {
    const div = document.createElement('div');
    div.className = 'req-item' + (state.selected === r.id ? ' selected' : '');
    div.dataset.id = r.id;
    div.innerHTML = `
      <div class="req-top">
        <span class="provider-badge badge-${r.provider}">${r.provider}</span>
        <span class="req-model">${r.model}</span>
        <span class="req-status status-${r.status}"></span>
      </div>
      <div class="req-bottom">
        <span class="req-time">${fmtTime(r.timestamp)}</span>
        <span class="req-tokens">${fmt(r.inputTokens)}↑ ${fmt(r.outputTokens)}↓ tok</span>
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
    <span>${r.provider}</span>
    <span>${fmtTime(r.timestamp)}</span>
    ${r.durationMs != null ? `<span>${fmtDuration(r.durationMs)}</span>` : ''}
    <span class="req-status status-${r.status}" style="display:inline-block"></span>
  `;

  const totalTok = r.messages.reduce((s, m) => s + m.tokens, 0) || 1;
  const body = document.getElementById('detail-body');
  body.innerHTML = '';

  body.appendChild(renderSummaryCard(r));
  for (const msg of r.messages) {
    body.appendChild(renderMessageCard(msg, totalTok));
  }
  if (r.requestBody) body.appendChild(renderRawCard(r.requestBody));
  if (r.responseRaw) body.appendChild(renderResponseCard(r.responseRaw));
}

function renderSummaryCard(r) {
  const el = document.createElement('div');
  el.className = 'summary-card';
  el.innerHTML = `
    <div class="summary-stat"><span class="summary-label">Input</span><span class="summary-value">${fmt(r.inputTokens)}</span></div>
    <div class="summary-stat"><span class="summary-label">Output</span><span class="summary-value">${fmt(r.outputTokens)}</span></div>
    <div class="summary-stat"><span class="summary-label">Total</span><span class="summary-value">${fmt(r.inputTokens + r.outputTokens)}</span></div>
    <div class="summary-stat"><span class="summary-label">Cost</span><span class="summary-value" style="color:var(--green)">${fmtCost(r.cost)}</span></div>
  `;
  return el;
}

function renderMessageCard(msg, totalTok) {
  const pct = Math.round((msg.tokens / totalTok) * 100);
  const el = document.createElement('div');
  el.className = 'msg-card';
  el.innerHTML = `
    <div class="msg-header">
      <span class="role-tag role-${msg.role}">${msg.role}</span>
      <span class="msg-tokens">${fmt(msg.tokens)} tokens (${pct}%)</span>
    </div>
    <div style="padding:4px 12px">
      <div class="token-bar-wrap"><div class="token-bar bar-${msg.role}" style="width:${pct}%"></div></div>
    </div>
    ${msg.preview ? `<div class="msg-preview">${escHtml(msg.preview)}${msg.preview.length >= 200 ? '…' : ''}</div>` : ''}
  `;
  return el;
}

// ── SSE connection ───────────────────────────────────────────────────────────

function connect() {
  const es = new EventSource('/events');

  es.addEventListener('init', e => {
    state.requests = JSON.parse(e.data);
    renderList();
    updateStats();
  });

  es.addEventListener('request', e => {
    upsert(JSON.parse(e.data));
    renderList();
    updateStats();
    if (!state.selected) selectRequest(state.requests[0]?.id);
  });

  es.addEventListener('update', e => {
    const req = JSON.parse(e.data);
    upsert(req);
    renderList();
    updateStats();
    if (state.selected === req.id) renderDetail();
  });

  es.onerror = () => setTimeout(connect, 2000);
}

connect();
