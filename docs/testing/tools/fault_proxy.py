#!/usr/bin/env python3
"""A reverse proxy that makes an LLM provider fail on demand.

A local Ollama or LM Studio cannot produce a 401, a 429 with Retry-After, a 500, or an empty
completion when you ask it to. Those four are exactly the paths GoMarkEdit's error classification
exists for, and without this they ship only ever having been exercised by unit tests -- which is the
level at which a reviewed reference application's "every provider failure looks identical to the user"
bug was invisible.

Standard library only. No dependencies, nothing to install.

    python3 fault_proxy.py --upstream http://127.0.0.1:11434 --port 8900

Point GoMarkEdit's provider Base URL at http://127.0.0.1:8900 and switch modes while it runs:

    curl -X POST localhost:8900/__fault/auth401
    curl -X POST localhost:8900/__fault/passthrough
    curl localhost:8900/__fault           # current mode

Modes
    passthrough        forward to the upstream unchanged (default)
    auth401            401 + an OpenAI-shaped invalid_api_key body   -> missing_credential / auth
    ratelimited429     429 + Retry-After: 2                          -> rate_limited, and the delay
                                                                        must reach the user
    upstream500        500 + an opaque body                          -> upstream
    empty_completion   200 + choices[0].message.content == ""        -> empty_completion, and it must
                                                                        NOT be retried
    context_window     400 + "n_keep: 8530 >= n_ctx: 2048"           -> context_window, and the limit
                                                                        extracted must be 2048, not 8530
    tools_unsupported  400 + "does not support tools"                -> tools_unsupported, and the
                                                                        assistant must fall back to
                                                                        single-shot, not retry
    slow               forward, but stall --slow-seconds first       -> timeout, and exactly
                                                                        1 + maxRetries attempts

What to assert, beyond "an error appeared"
    * each mode produces a DIFFERENT, actionable message -- not one generic failure
    * ratelimited429's delay is shown to the user, not just used internally for backoff
    * empty_completion is not retried (count the requests that reach this proxy)
    * slow produces exactly 1 + maxRetries requests here, and no more
"""

import argparse
import json
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODES = (
    "passthrough",
    "auth401",
    "ratelimited429",
    "upstream500",
    "empty_completion",
    "context_window",
    "tools_unsupported",
    "slow",
)

state = {"mode": "passthrough", "requests": 0}


def _err(code, etype, message):
    return code, {"error": {"message": message, "type": etype, "code": etype}}, {}


def canned(mode):
    """Return (status, body, extra_headers) for a fault mode, or None to pass through."""
    if mode == "auth401":
        return _err(401, "invalid_api_key", "Incorrect API key provided.")
    if mode == "ratelimited429":
        status, body, _ = _err(429, "rate_limit_exceeded", "Rate limit reached. Try again shortly.")
        return status, body, {"Retry-After": "2"}
    if mode == "upstream500":
        return _err(500, "server_error", "The server had an error processing your request.")
    if mode == "context_window":
        return _err(
            400,
            "context_length_exceeded",
            "the request exceeds the available context size "
            "(n_keep: 8530 >= n_ctx: 2048) -- reduce the prompt",
        )
    if mode == "tools_unsupported":
        return _err(400, "invalid_request_error", "registry.ollama.ai/library/gemma2:2b does not support tools")
    if mode == "empty_completion":
        return 200, {
            "id": "chatcmpl-fault",
            "object": "chat.completion",
            "model": "fault-proxy",
            "choices": [
                {"index": 0, "message": {"role": "assistant", "content": ""}, "finish_reason": "stop"}
            ],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }, {}
    return None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    upstream = "http://127.0.0.1:11434"
    slow_seconds = 90.0

    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {state['mode']:<18} {fmt % args}")

    # -- control plane -------------------------------------------------------

    def _control(self):
        if not self.path.startswith("/__fault"):
            return False
        parts = self.path.strip("/").split("/")
        if len(parts) == 2 and self.command == "POST":
            mode = parts[1]
            if mode not in MODES:
                self._send(400, {"error": f"unknown mode {mode!r}", "modes": list(MODES)})
            else:
                state["mode"], state["requests"] = mode, 0
                self._send(200, {"mode": mode, "requests": 0})
        else:
            self._send(200, {"mode": state["mode"], "requests": state["requests"], "modes": list(MODES)})
        return True

    # -- proxy ---------------------------------------------------------------

    def _handle(self):
        if self._control():
            return
        state["requests"] += 1
        mode = state["mode"]

        if mode == "slow":
            time.sleep(self.slow_seconds)
            mode = "passthrough"

        fault = canned(mode)
        if fault is not None:
            status, body, extra = fault
            self._send(status, body, extra)
            return

        length = int(self.headers.get("Content-Length") or 0)
        payload = self.rfile.read(length) if length else None
        req = urllib.request.Request(
            self.upstream.rstrip("/") + self.path,
            data=payload,
            method=self.command,
            headers={k: v for k, v in self.headers.items() if k.lower() != "host"},
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as up:
                raw, status, headers = up.read(), up.status, dict(up.headers)
        except urllib.error.HTTPError as e:          # forward upstream errors verbatim
            raw, status, headers = e.read(), e.code, dict(e.headers)
        except Exception as e:                        # upstream unreachable
            self._send(502, {"error": {"message": f"fault_proxy: upstream unreachable: {e}"}})
            return

        headers.pop("Transfer-Encoding", None)
        headers.pop("Content-Length", None)
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    do_GET = do_POST = do_PUT = do_DELETE = _handle

    def _send(self, status, obj, extra=None):
        raw = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--upstream", default="http://127.0.0.1:11434")
    ap.add_argument("--port", type=int, default=8900)
    ap.add_argument("--mode", default="passthrough", choices=MODES)
    ap.add_argument("--slow-seconds", type=float, default=90.0)
    args = ap.parse_args()

    Handler.upstream = args.upstream
    Handler.slow_seconds = args.slow_seconds
    state["mode"] = args.mode

    print(f"fault_proxy  ->  {args.upstream}")
    print(f"listening    :   http://127.0.0.1:{args.port}   (mode: {args.mode})")
    print(f"switch mode  :   curl -X POST localhost:{args.port}/__fault/<mode>")
    print(f"modes        :   {', '.join(MODES)}")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
