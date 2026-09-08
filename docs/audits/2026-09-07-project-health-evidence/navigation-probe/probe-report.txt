# Wails development navigation probe

**Confirmed at the HTTP pipeline:** a missing Markdown path returns the actual React app index without Wails runtime or IPC script tags. The normal root path includes both. This reproduces the proposed Vite/Wails fallback-and-injection mechanism; it does not reproduce the entire native failure or hang.

Run: 2026-09-08, 07:39:34–07:39:43 UTC. Source HEAD `883fd053b9b30911248a304cf5f57d8cebe81795`. Owner has confirmed the affected app was launched with `just dev` / `wails dev`.

| Request | Status/type | Actual React root and entry present | `/wails/runtime.js` included | `/wails/ipc.js` included |
| --- | --- | --- | --- | --- |
| Direct Vite `/` | 200, text/html | Yes | No | No |
| Actual Wails dev handler `/` | 200, text/html | Yes | Yes | Yes |
| Direct Vite `/audit-next.md` | 200, text/html | Yes | No | No |
| Actual Wails dev handler `/audit-next.md` | 200, text/html | Yes | No | No |

The Wails missing-path response is **byte-identical** to the direct Vite fallback response: 600 bytes, SHA256 `adb4faa571058124f45e3057beea7cd19fd9ce8ce6e95c4d4f3d56ebfd9d66ba`. It includes `<div id="root">` and `/src/main.tsx`, but neither Wails script. The Wails root response is 703 bytes, SHA256 `5c75746e0b67d632f20903160c02db89b12f7e0a9c9dd7c5c43bf93501d3e656`; it includes both Wails script tags and the normal dev spinner.

The probe also requested `/wails/runtime.js` and `/wails/ipc.js`: both returned 200 and SHA256-identical bytes to the pinned Wails dev-runtime/desktop-IPC files. Thus the missing tags are not caused by a dummy runtime or missing endpoints.

## Exact scope and method

The temporary Go program imports the **actual pinned Wails v2.15.0 public API**, constructing `NewExternalAssetsHandler` → `NewAssetHandler` → `NewDevAssetServer`. It uses `httptest.NewRecorder` only as the HTTP response sink; no replacement implementation of Wails's matching, proxy, or injection logic was written. Requests carry `Accept: text/html` and a `wails.io` user-agent, selecting Wails's desktop IPC branch.

Because Wails's internal runtime bundle is not publicly importable, the interface is supplied from the **exact pinned files** embedded by its dev build: `ipc.js`, `ipc_websocket.js`, and `runtime_debug_desktop.js`. App binding metadata is empty because no application services or native runtime were instantiated; this does not alter path matching or HTML injection. Native URL-scheme transport and JavaScript execution are outside this probe.

Vite 7.3.6 ran from the existing frontend npm script in `--mode wails` on task-owned `127.0.0.1:54173`. A temporary wrapper imports the repository's real Vite config and changes only root/cache location and the isolated host/port. `--configLoader runner` avoids config-bundle files in the repository. Go compiled with `-tags dev`, `GOFLAGS=-mod=readonly`, `GOPROXY=off`, and `GOSUMDB=off`; Go/npm/Vite caches were redirected under the task's `/tmp` directory. Go toolchain was 1.27.1 darwin/arm64, Node 24.19.0, npm 11.17.0.

The source mechanism remains `pkg/assetserver/assetserver.go:140–183,200–205,248–254` in the pinned Wails module: only an original request path ending in `/` or `/index.html` enters the injection branch. Vite's real fallback serves the application index for `/audit-next.md`, but Wails forwards that response without injecting scripts. The app's generated adapters require `window.runtime` and `window.go`, and `App.tsx:165–186` maps bootstrap failures to the generic StartupFailure screen. The probe confirms the missing-script precursor; the subsequent JavaScript failure and native close behavior remain source-supported analysis, not observations from this run.

## Exits, cleanup, and limitations

* Probe and supervisor exited **0**. All ten checks passed. The checks named `...missing-markdown-...injection` mean **expected absence matched**, not that missing-path injection occurred; the script arrays and raw HTTP responses are the primary evidence.
* First attempt exited 1 before probing because the sandbox denied the local listener (`EPERM`). That raw failure was preserved as `attempt1-*`. The bounded retry received automatic approval and succeeded.
* Cleanup sent SIGTERM only to the task-owned Vite process group; the supervisor reaped it with exit `-15`. Subsequent exact-group `pgrep` checks returned 1 with no output for both probe and server groups, and the exact-port `lsof` check returned 1 with no listener. Initial sandbox process-list checks failed and were preserved separately; the elevated checks confirmed cleanup.
* Tracked repository diff SHA256 was unchanged before and after: `f2e9e27126cb21cda07b4f0b9dc3bd9fdc6a574298acc06fcd5cc5b906c1cd2b`. The preexisting generated-runtime mode changes and untracked audit directory remain. No repository files, native app, user settings, or document profiles were changed. No gates or UI tests were run.
* This used a deliberately missing `/audit-next.md`, not the owner's exact link target. It establishes a concrete failing development-server path. It does not establish the incident's exact URL, execute React, show StartupFailure, prove unsaved-data loss, or explain macOS Force Quit. Packaged native asset handling remains a different case.

## Artifacts

Task directory: `/tmp/gomark-navigation-probe.Ig0rZh`.

**Copyable evidence directory (diagnostic filenames all `.txt`):** `/tmp/gomark-navigation-probe.Ig0rZh/evidence`. It contains the probe/config/supervisor source copies, all six raw HTTP responses and bodies, structured summary, exact commands/environment/exits/input SHA256s, server/compiler output, initial failed attempt, cleanup checks, this report, and an artifact SHA256 manifest. Do not copy its sibling cache directories.

Key files:

* `evidence/probe-summary.txt` — observations and checks.
* `evidence/wails-root.http.txt`, `evidence/wails-missing-markdown.http.txt` — the decisive raw responses.
* `evidence/probe-source.go.txt`, `evidence/vite-config-source.mjs.txt`, `evidence/supervisor-source.py.txt` — exact source copies.
* `evidence/run-metadata.txt` — baseline, commands, input hashes, exits, and unchanged tracked-diff evidence.
* `evidence/cleanup-verification-elevated.txt` — no remaining task-owned process groups or listener.
* `evidence/manifest.txt` — per-artifact bytes and SHA256.

Original executable source hashes: Go probe `31f7ff805126e5e26d0582954a1aa3e163d1893b0b37d13a05d30bc6ee382204`; Vite wrapper `862ed80a92f97d9fbe871b09ccd032fcaff3ca4c1745b139235786480eae8730`; supervisor `0f6005d3f6d4a1113e814947b47ae75287df87afd4b836caf2057b31f436dfa4`. They remain unchanged from the successful run.
