/* global React */
const { useState, useRef, useEffect, useCallback, useLayoutEffect } = React;

/* ---------- tiny inline icons ---------- */
const Icon = {
  search: (p) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>,
  x: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  sun: (p) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
  moon: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>,
  copy: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>,
  check: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 6 9 17l-5-5"/></svg>,
  chevron: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6"/></svg>,
  down: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12l7 7 7-7"/></svg>,
  up: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
  arrowUp: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
  clock: (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  bolt: (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>,
};

/* ---------- JSON syntax highlighter ---------- */
function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
// Tokenize pretty-printed JSON into colored spans.
function highlightJSON(value) {
  const json = JSON.stringify(value, null, 2);
  const out = [];
  let i = 0;
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],])/g;
  let m, last = 0, key = 0;
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) out.push(<span key={key++}>{json.slice(last, m.index)}</span>);
    if (m[1] !== undefined) {
      // string — is it a key (followed by colon)?
      if (m[2]) {
        out.push(<span key={key++} className="tok-key">{m[1]}</span>);
        out.push(<span key={key++} className="tok-punct">{m[2]}</span>);
      } else {
        out.push(<span key={key++} className="tok-string">{m[1]}</span>);
      }
    } else if (m[3] !== undefined) {
      out.push(<span key={key++} className="tok-bool">{m[3]}</span>);
    } else if (m[0] === "null") {
      out.push(<span key={key++} className="tok-null">null</span>);
    } else if (m[4] !== undefined) {
      out.push(<span key={key++} className="tok-number">{m[4]}</span>);
    } else if (m[5] !== undefined) {
      out.push(<span key={key++} className="tok-punct">{m[5]}</span>);
    }
    last = re.lastIndex;
  }
  if (last < json.length) out.push(<span key={key++}>{json.slice(last)}</span>);
  return out;
}

/* ---------- copy to clipboard ---------- */
function CopyBtn({ getText, label = "Copy", onCopied }) {
  const [done, setDone] = useState(false);
  const doCopy = useCallback(() => {
    const text = typeof getText === "function" ? getText() : getText;
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
    };
    const finish = () => { setDone(true); onCopied && onCopied(); setTimeout(() => setDone(false), 1300); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(finish).catch(() => { fallback(); finish(); });
    } else { fallback(); finish(); }
  }, [getText, onCopied]);
  return (
    <button className={"copy" + (done ? " copy--done" : "")} onClick={doCopy} title={label}>
      {done ? <Icon.check /> : <Icon.copy />}
      {done ? "Copied" : label}
    </button>
  );
}

/* ---------- raw json view ---------- */
function RawJSON({ value }) {
  return <div className="raw"><pre>{highlightJSON(value)}</pre></div>;
}

/* ---------- collapsible long prose ---------- */
function Prose({ text, mono }) {
  const [open, setOpen] = useState(false);
  const [tall, setTall] = useState(false);
  const ref = useRef(null);
  const LIMIT = 360; // px before we offer to collapse
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // scrollHeight reports full content height even while clipped
    setTall(el.scrollHeight > LIMIT + 8);
  }, [text]);
  const clamp = tall && !open;
  const cls = "prose" + (mono ? " prose--mono" : "") + (clamp ? " clamp" : "");
  return (
    <div>
      <div ref={ref} className={cls}>{text}</div>
      {tall && (
        <button className="showmore" onClick={() => setOpen(!open)}>
          {open ? <><Icon.up /> Show less</> : <><Icon.down /> Show full text</>}
        </button>
      )}
    </div>
  );
}

/* ---------- disclosure (headers) ---------- */
function Disclosure({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="disc">
      <button className="disc__btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon.chevron /> {label}
      </button>
      {open && children}
    </div>
  );
}

/* ---------- formatting helpers ---------- */
function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}
function formatLatency(ms) {
  if (ms == null) return "";
  return ms >= 1000 ? (ms / 1000).toFixed(2) + "s" : ms + "ms";
}

Object.assign(window, {
  Icon, highlightJSON, escapeHtml, CopyBtn, RawJSON, Prose, Disclosure,
  formatTime, formatDate, formatLatency,
  useState, useRef, useEffect, useCallback,
});
