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
    try:
        with urllib.request.urlopen(f"http://localhost:{PROXY_PORT}/health", timeout=0.5):
            return True
    except Exception:
        return False


def init() -> None:
    if not _is_proxy_running():
        node = _find_node()
        subprocess.Popen(
            [node, str(_PROXY_JS)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        time.sleep(0.5)

    os.environ["ANTHROPIC_BASE_URL"] = f"http://localhost:{PROXY_PORT}"
    os.environ["OPENAI_BASE_URL"] = f"http://localhost:{PROXY_PORT}/openai"


def _find_node() -> str:
    import shutil
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("Node.js not found. Install it from https://nodejs.org")
    return node
