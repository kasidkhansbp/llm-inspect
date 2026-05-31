# llm-inspect

Zero-config LLM API inspector. One import, one line — intercepts all Anthropic and OpenAI calls and shows a real-time dashboard with token breakdown and cost estimates.

## Install

```bash
pip install llm-inspect
```

## Usage

```python
import llm_inspect
llm_inspect.init()  # add at your app entry point, before other imports

# All LLM calls now route through the inspector
import anthropic
client = anthropic.Anthropic()
```

Dashboard opens automatically at **http://localhost:8788**

## How it works

`init()` starts a lightweight local proxy on `:8787` (if not already running) and sets `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL` so all SDK calls route through it. No config files, no CA certificates, no accounts.
