/* global React, Icon, CopyBtn, RawJSON, Prose, Disclosure */
const { useState: useStateE } = React;

/* render the content of a message (string, or array of content blocks) as plain text */
function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "tool_use") return `[tool_use: ${b.name}] ` + JSON.stringify(b.input);
      if (b.type === "tool_result") return `[tool_result] ` + (typeof b.content === "string" ? b.content : JSON.stringify(b.content));
      return JSON.stringify(b);
    }).join("\n\n");
  }
  return JSON.stringify(content);
}

/* a single labeled reading block: role badge + content + per-block copy */
function MsgBlock({ role, content, turn, mono }) {
  const text = contentToText(content);
  const roleClass = "role role--" + (role === "system" ? "system" : role === "assistant" ? "assistant" : role === "tool_use" ? "tool" : "user");
  const label = role === "tool_use" ? "tool use" : role === "user" ? "message" : role;
  return (
    <div className="block">
      <div className="block__head">
        <span className={roleClass}>{label}</span>
        {turn != null && <span className="turn">turn {turn}</span>}
        <span className="block__head-spacer" />
        <CopyBtn getText={() => text} label="Copy" />
      </div>
      <Prose text={text} mono={mono} />
    </div>
  );
}

/* tool_use blocks inside an assistant response get a raw view */
function ToolUseBlock({ block }) {
  return (
    <div className="block">
      <div className="block__head">
        <span className="role role--tool">tool use</span>
        <span className="model" style={{ fontSize: 12 }}>{block.name}</span>
        <span className="block__head-spacer" />
        <CopyBtn getText={() => JSON.stringify(block.input, null, 2)} label="Copy input" />
      </div>
      <RawJSON value={block.input} />
    </div>
  );
}

/* compact, explicitly-labeled token summary for the collapsed header */
function TokenChips({ usage }) {
  if (!usage) return null;
  return (
    <div className="tokens">
      <span className="tok tok--in" title="input tokens"><i>Input</i> <b>{usage.input_tokens}</b></span>
      <span className="tok tok--out" title="output tokens"><i>Output</i> <b>{usage.output_tokens}</b></span>
    </div>
  );
}

/* prominent INPUT / OUTPUT / TOTAL stat strip shown when a row is expanded */
function StatStrip({ usage }) {
  if (!usage) return null;
  const total = usage.input_tokens + usage.output_tokens;
  return (
    <div className="statstrip">
      <div className="stat stat--in">
        <span className="stat__l">Input</span>
        <span className="stat__v">{usage.input_tokens}</span>
        <span className="stat__u">tokens</span>
      </div>
      <div className="stat stat--out">
        <span className="stat__l">Output</span>
        <span className="stat__v">{usage.output_tokens}</span>
        <span className="stat__u">tokens</span>
      </div>
      <div className="stat stat--total">
        <span className="stat__l">Total</span>
        <span className="stat__v">{total}</span>
        <span className="stat__u">tokens</span>
      </div>
    </div>
  );
}

/* the request section */
function RequestSection({ body, headers, method, path, rawDefault }) {
  const [raw, setRaw] = useStateE(rawDefault);
  const messages = body.messages || [];
  return (
    <section className="sec sec--req">
      <div className="sec__bar">
        <span className="sec__dot" />
        <span className="sec__label">Request</span>
        <span className="sec__endpoint">{method} {path}</span>
        <span className="sec__bar-spacer" />
        <button className={"minibtn" + (raw ? " minibtn--on" : "")} onClick={() => setRaw(!raw)}>{raw ? "Rendered" : "Raw JSON"}</button>
        <CopyBtn getText={() => JSON.stringify(body, null, 2)} label="Copy body" />
      </div>

      {raw ? (
        <div className="sec__body"><RawJSON value={body} /></div>
      ) : (
        <>
          <div className="params">
            <span className="param">model <b>{body.model}</b></span>
            <span className="param">max_tokens <b>{body.max_tokens}</b></span>
            {body.temperature != null && <span className="param">temperature <b>{body.temperature}</b></span>}
            {body.tools && <span className="param">tools <b>{body.tools.length}</b></span>}
          </div>
          <div className="sec__body">
            {body.system && <MsgBlock role="system" content={body.system} />}
            {messages.map((m, i) => (
              <MsgBlock key={i} role={m.role} content={m.content}
                turn={messages.length > 1 ? i + 1 : null} />
            ))}
            {body.tools && (
              <Disclosure label={`Tools (${body.tools.length})`}>
                <RawJSON value={body.tools} />
              </Disclosure>
            )}
          </div>
          <Disclosure label="Headers">
            <RawJSON value={headers} />
          </Disclosure>
        </>
      )}
    </section>
  );
}

/* the response section */
function ResponseSection({ response, error, rawDefault }) {
  const [raw, setRaw] = useStateE(rawDefault);

  if (error) {
    return (
      <section className="sec sec--err">
        <div className="sec__bar">
          <span className="sec__dot" />
          <span className="sec__label">Error</span>
          <span className="sec__endpoint">HTTP {error.status}</span>
          <span className="sec__bar-spacer" />
          <button className={"minibtn" + (raw ? " minibtn--on" : "")} onClick={() => setRaw(!raw)}>{raw ? "Rendered" : "Raw JSON"}</button>
          <CopyBtn getText={() => JSON.stringify(error.body, null, 2)} label="Copy" />
        </div>
        <div className="sec__body">
          {raw ? <RawJSON value={error.body} /> : (
            <div className="errbox">
              <span className="errbox__status">{error.body.error.type}</span>
              <span className="errbox__msg">{error.body.error.message}</span>
            </div>
          )}
        </div>
      </section>
    );
  }

  const textBlocks = (response.content || []).filter((b) => b.type === "text");
  const toolBlocks = (response.content || []).filter((b) => b.type === "tool_use");
  // heuristics: render mono if the whole text looks like JSON or code
  const joined = textBlocks.map((b) => b.text).join("\n");
  const looksMono = /^\s*[{\[]/.test(joined) || /\b(SELECT|function|const|=>)\b/.test(joined);

  return (
    <section className="sec sec--res">
      <div className="sec__bar">
        <span className="sec__dot" />
        <span className="sec__label">Response</span>
        <span className="sec__endpoint">{response.stop_reason}</span>
        <span className="sec__bar-spacer" />
        <button className={"minibtn" + (raw ? " minibtn--on" : "")} onClick={() => setRaw(!raw)}>{raw ? "Rendered" : "Raw JSON"}</button>
        <CopyBtn getText={() => JSON.stringify(response, null, 2)} label="Copy" />
      </div>
      {raw ? (
        <div className="sec__body"><RawJSON value={response} /></div>
      ) : (
        <div className="sec__body">
          {textBlocks.length > 0 && (
            <div className="block">
              <div className="block__head">
                <span className="role role--assistant">assistant</span>
                <span className="block__head-spacer" />
                <CopyBtn getText={() => joined} label="Copy" />
              </div>
              <Prose text={joined} mono={looksMono} />
            </div>
          )}
          {toolBlocks.map((b, i) => <ToolUseBlock key={i} block={b} />)}
        </div>
      )}
    </section>
  );
}

/* full call entry */
function CallEntry({ call, index, rawDefault, open, onToggle, active }) {
  const usage = call.response ? call.response.usage : null;
  const isErr = !!call.error;
  const fullCopy = () => JSON.stringify({ request: call.request, ...(call.response ? { response: call.response } : { error: call.error }) }, null, 2);
  return (
    <article className={"entry" + (open ? "" : " entry--collapsed") + (active ? " entry--active" : "")} id={"call-" + index} data-screen-label={"Call " + String(index + 1).padStart(2, "0")}>
      <header className="entry__head" onClick={() => onToggle(index)}>
        <button className="collapse" aria-expanded={open} aria-label={open ? "Collapse" : "Expand"}
          onClick={(e) => { e.stopPropagation(); onToggle(index); }}>
          <Icon.chevron />
        </button>
        <span className="idx">#{String(index + 1).padStart(2, "0")}</span>
        <span className="model">{call.request.body.model}</span>
        <span className="hmeta">
          <span className="hmeta__i"><Icon.clock /> {formatTime(call.timestamp)}</span>
          {call.latency_ms != null && <span className="hmeta__i"><Icon.bolt /> {formatLatency(call.latency_ms)}</span>}
        </span>
        <span className="head__spacer" />
        {isErr
          ? <span className="errpill">HTTP {call.error.status}</span>
          : <TokenChips usage={usage} />}
        <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
          <CopyBtn getText={fullCopy} label="" />
        </span>
      </header>
      {open && (
        <div className="entry__body">
          {!isErr && <StatStrip usage={usage} />}
          <RequestSection body={call.request.body} headers={call.request.headers}
            method={call.request.method} path={call.request.path} rawDefault={rawDefault} />
          <ResponseSection response={call.response} error={call.error} rawDefault={rawDefault} />
        </div>
      )}
    </article>
  );
}

Object.assign(window, { CallEntry, contentToText });
