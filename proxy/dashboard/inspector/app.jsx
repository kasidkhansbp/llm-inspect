/* global React, ReactDOM, Icon, CallEntry, contentToText, SAMPLE_CALLS,
   formatTime, formatDate, formatLatency,
   useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakRadio */
const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "reading": 16,
  "measure": "full",
  "lineHeight": 1.62,
  "rawDefault": false,
  "showList": true
}/*EDITMODE-END*/;

const MEASURE_MAP = { narrow: "64ch", comfortable: "78ch", wide: "110ch", full: "100%" };
const SIZE_STEPS = [13, 14, 15, 16, 17, 18, 20, 22, 24];

/* ---------- right-hand request list ---------- */
function SideList({ items, calls, activeIdx, onSelect }) {
  const totalTokens = calls.reduce((s, c) => s + (c.response ? c.response.usage.input_tokens + c.response.usage.output_tokens : 0), 0);
  return (
    <aside className="sidelist">
      <div className="sidelist__head">
        <div className="sl-stat"><span className="sl-stat__l">Requests</span><span className="sl-stat__v">{calls.length}</span></div>
        <div className="sl-stat"><span className="sl-stat__l">Total tokens</span><span className="sl-stat__v">{totalTokens.toLocaleString()}</span></div>
      </div>
      <div className="sidelist__scroll">
        {items.length === 0 && <div className="sl-empty">No matches</div>}
        {items.map(({ c, i }) => {
          const isErr = !!c.error;
          const u = c.response ? c.response.usage : null;
          return (
            <button key={i} className={"slrow" + (i === activeIdx ? " slrow--active" : "")} onClick={() => onSelect(i)}>
              <span className={"sl-dot" + (isErr ? " sl-dot--err" : "")} />
              <span className="slrow__main">
                <span className="slrow__top">
                  <span className="slrow__idx">#{String(i + 1).padStart(2, "0")}</span>
                  <span className="slrow__model">{c.request.body.model}</span>
                </span>
                <span className="slrow__sub">
                  <span>{formatTime(c.timestamp)}</span>
                  {isErr
                    ? <span className="slrow__err">HTTP {c.error.status}</span>
                    : <span className="slrow__tok">{u.input_tokens}↑ {u.output_tokens}↓</span>}
                  {c.latency_ms != null && <span className="slrow__lat">{formatLatency(c.latency_ms)}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [query, setQuery] = useState("");
  const [showTop, setShowTop] = useState(false);
  const [openMap, setOpenMap] = useState({});   // index -> bool (default open)
  const [activeIdx, setActiveIdx] = useState(null);

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.dark ? "dark" : "light");
    r.style.setProperty("--reading", t.reading + "px");
    r.style.setProperty("--reading-line", String(t.lineHeight));
    r.style.setProperty("--measure", MEASURE_MAP[t.measure] || MEASURE_MAP.comfortable);
  }, [t.dark, t.reading, t.lineHeight, t.measure]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const calls = SAMPLE_CALLS;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = calls.map((c, i) => ({ c, i }));
    if (!q) return list;
    return list.filter(({ c }) => {
      const b = c.request.body;
      const hay = [
        b.model, b.system || "",
        ...(b.messages || []).map((m) => contentToText(m.content)),
        c.response ? contentToText(c.response.content) : "",
        c.error ? JSON.stringify(c.error.body) : "",
      ].join(" \n ").toLowerCase();
      return hay.includes(q);
    });
  }, [calls, query]);

  const isOpen = (i) => openMap[i] !== false;
  const toggleOpen = (i) => setOpenMap((m) => ({ ...m, [i]: m[i] === false ? true : false }));

  // select from the side list: expand + scroll + highlight
  const selectCall = (i) => {
    setOpenMap((m) => ({ ...m, [i]: true }));
    setActiveIdx(i);
    requestAnimationFrame(() => {
      const el = document.getElementById("call-" + i);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    });
  };

  // font size stepper
  const sizeIdx = SIZE_STEPS.indexOf(t.reading);
  const curIdx = sizeIdx === -1 ? 3 : sizeIdx;
  const dec = () => setTweak("reading", SIZE_STEPS[Math.max(0, curIdx - 1)]);
  const inc = () => setTweak("reading", SIZE_STEPS[Math.min(SIZE_STEPS.length - 1, curIdx + 1)]);

  return (
    <>
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__title">Claude API Inspector</span>
          <span className="topbar__count">
            {query ? `${filtered.length} of ${calls.length}` : `${calls.length} calls`}
          </span>
        </div>
        <span className="topbar__spacer" />

        <label className="search">
          <Icon.search />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts & responses…" spellCheck={false} />
          {query && <button className="search__clear" onClick={() => setQuery("")} aria-label="Clear"><Icon.x /></button>}
        </label>

        <div className="ctrls">
          <button className="themebtn" onClick={() => setTweak("dark", !t.dark)}
            aria-label="Toggle theme" title={t.dark ? "Switch to light" : "Switch to dark"}>
            {t.dark ? <Icon.sun /> : <Icon.moon />}
          </button>
          <div className="fontctl" title="Reading size">
            <button className="iconbtn" onClick={dec} disabled={curIdx === 0} aria-label="Smaller text">
              <span style={{ fontSize: 12, fontWeight: 600 }}>A</span>
            </button>
            <span className="fontctl__val">{t.reading}px</span>
            <button className="iconbtn" onClick={inc} disabled={curIdx === SIZE_STEPS.length - 1} aria-label="Larger text">
              <span style={{ fontSize: 16, fontWeight: 600 }}>A</span>
            </button>
          </div>
        </div>
      </header>

      <div className={"layout" + (t.showList ? "" : " layout--nolist")}>
        <main className="feed">
          {filtered.length === 0 ? (
            <div className="empty">No calls match “{query}”.</div>
          ) : (
            filtered.map(({ c, i }) => (
              <CallEntry key={i} call={c} index={i} rawDefault={t.rawDefault}
                open={isOpen(i)} onToggle={toggleOpen} active={i === activeIdx} />
            ))
          )}
        </main>

        {t.showList && (
          <SideList items={filtered} calls={calls} activeIdx={activeIdx} onSelect={selectCall} />
        )}
      </div>

      <button className={"totop" + (showTop ? " totop--show" : "")}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
        <Icon.arrowUp />
      </button>

      <TweaksPanel>
        <TweakSection label="Reading" />
        <TweakSlider label="Reading size" value={t.reading} min={13} max={24} step={1} unit="px"
          onChange={(v) => setTweak("reading", v)} />
        <TweakRadio label="Line width" value={t.measure}
          options={["narrow", "comfortable", "wide", "full"]}
          onChange={(v) => setTweak("measure", v)} />
        <TweakSlider label="Line spacing" value={t.lineHeight} min={1.3} max={2} step={0.02}
          onChange={(v) => setTweak("lineHeight", v)} />
        <TweakSection label="Display" />
        <TweakToggle label="Dark mode" value={t.dark} onChange={(v) => setTweak("dark", v)} />
        <TweakToggle label="Request list" value={t.showList} onChange={(v) => setTweak("showList", v)} />
        <TweakToggle label="Show raw JSON by default" value={t.rawDefault} onChange={(v) => setTweak("rawDefault", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
