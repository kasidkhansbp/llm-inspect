import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

PROXY_PORT = 8787
_PROXY_JS = Path(__file__).parent / "proxy" / "main.js"


def _is_proxy_running() -> bool:
    # 127.0.0.1, not localhost: the proxy binds IPv4 loopback only, and
    # localhost resolves to ::1 first on some systems (e.g. Windows)
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PROXY_PORT}/health", timeout=0.5):
            return True
    except Exception:
        return False


def _wait_for_proxy(timeout: float) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _is_proxy_running():
            return True
        time.sleep(0.15)
    return False


def _warn_disabled(reason: str) -> None:
    # Fail open: never break the host app's LLM calls. Leave base URLs
    # untouched so requests go directly to the provider.
    # ASCII only: Windows consoles often use legacy codepages
    print(
        f"[llm-inspect] {reason} - inspection disabled, "
        "LLM calls will go directly to the provider.",
        file=sys.stderr,
    )


def init() -> None:
    running = _is_proxy_running()
    if not running:
        node = _find_node()
        if node is None:
            _warn_disabled("Node.js not found (install it from https://nodejs.org)")
            return
        try:
            subprocess.Popen(
                [node, str(_PROXY_JS)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except OSError as e:
            _warn_disabled(f"failed to spawn proxy ({e})")
            return
        running = _wait_for_proxy(timeout=5.0)

    if not running:
        _warn_disabled(
            f"proxy failed to start on :{PROXY_PORT} "
            f"(is port {PROXY_PORT} already in use?)"
        )
        return

    os.environ["ANTHROPIC_BASE_URL"] = f"http://127.0.0.1:{PROXY_PORT}"
    os.environ["OPENAI_BASE_URL"] = f"http://127.0.0.1:{PROXY_PORT}/openai"


def _find_node() -> "str | None":
    import shutil
    return shutil.which("node")
