# Bounded lifecycle diagnostic probes

Both probes **exited 0**, completed inside the 30-second external deadline, and reproduced the stated isolated consequences with positive controls. These are diagnostic assertions of existing behavior, not claims that the defects are fixed.

Audited source commit: `883fd053b9b30911248a304cf5f57d8cebe81795`. Both working source files were byte-compared with `git show` from that commit before being copied unchanged. Everything created or executed for these probes lives under `/tmp/gomark-lifecycle-probes-t1_oan_z`. No app process, user profile, repository test suite or repository file was modified. No dependencies were installed.

## Results

| Probe | Exit | Elapsed | Demonstrated consequence | Positive control |
| --- | ---: | ---: | --- | --- |
| Exact Go CloseCoordinator, stdlib-only temporary module | 0 | 3.632 s | First close without a receiver emits once and vetoes. Registering a receiver then closing again still vetoes with zero deliveries and no second emission. | Cancel permits a fresh request to be emitted/delivered; Authorize requests one Quit and the simulated native callback consumes its permit without veto. |
| Exact settingsProjection.ts, TypeScript 5.9.3 transpilation in Node v24.19.0 | 0 | 0.178 s | First settings read rejects; after the adapter recovers, Retry returns the identical rejected Promise, with getSettings call count still 1. | Explicit dispose resets the cache; next bootstrap resolves, calls become 2, reset then hydrate are dispatched. |

## Exact execution and preserved evidence

The outer commands executed from the repository were:

```sh
rtk proxy python3 /tmp/gomark-lifecycle-probes-t1_oan_z/run_probe.py go
rtk proxy python3 /tmp/gomark-lifecycle-probes-t1_oan_z/run_probe.py node
```

The preserved Python runner invokes `rtk proxy go test -v -count=1 -timeout=10s .` in the temporary Go directory and `rtk proxy node projection_probe.cjs` in the temporary Node directory. It captures raw stdout/stderr, child exit code, UTC start, elapsed time, cwd, exact argv and environment overrides, and imposes `subprocess.run(..., timeout=30)` on each. Go used the installed `go1.27.1 darwin/arm64`, `GOTOOLCHAIN=local`, `GOWORK=off`, `GOPROXY=off`, `GOSUMDB=off`, and fresh GOCACHE/GOMODCACHE directories under this temporary tree. The Node probe also limits VM evaluation to 1 second.

The artifact directory contains:

- `go/close_coordinator.go`: unchanged audited source; `go/close_coordinator_probe_test.go`: complete diagnostic assertions; `go/go.mod`: dependency-free module.
- `node/settingsProjection.ts`: unchanged audited source; `node/settingsProjection.transpiled.cjs`: emitted JavaScript; `node/projection_probe.cjs`: complete runner/assertions. Transpilation had zero error diagnostics. Only the runtime imports `./index` (store.dispatch) and `./settingsSlice` (action creators) were substituted; the type-only SettingsAdapter import was erased by normal TypeScript transpilation. Every unexpected runtime import throws.
- `run_probe.py`, `manifest.json`, `go-command.txt`, `node-command.txt`: exact provenance and reproduction inputs.
- `go-result.json`, `node-result.json`, `go-stdout.log`, `node-stdout.log`, `go-stderr.log`, `node-stderr.log`: raw results. Both stderr files are empty.
- `SHA256SUMS`: checksums of all 16 source/probe/provenance/result artifacts above. Cache directories are disposable and excluded.

`/tmp` is macOS’s alias of `/private/tmp`; result metadata records the canonical `/private/tmp/...` cwd and cache paths.

## Source SHA-256

| Audited file | SHA-256 |
| --- | --- |
| `internal/application/close_coordinator.go` | `3882b4ca93e6c044971aed6f42d6a402b866221bc661c70277b0452bf5fb1806` |
| `frontend/src/logic/store/settingsProjection.ts` | `c590c769bdb29c172161d1248706b49a65cba15fdb93a199522d02364831ca40` |

## Raw Go stdout

```text
=== RUN   TestLostCloseRequestRequiresExplicitReset
    close_coordinator_probe_test.go:23: no responder: veto=true emissions=1 deliveries=0 quitCalls=0
    close_coordinator_probe_test.go:30: receiver restored, repeat close: veto=true emissions=1 deliveries=0 quitCalls=0
    close_coordinator_probe_test.go:37: Cancel then close: veto=true emissions=2 deliveries=1 quitCalls=0
    close_coordinator_probe_test.go:43: Authorize: native callback veto=false emissions=2 deliveries=1 quitCalls=1
--- PASS: TestLostCloseRequestRequiresExplicitReset (0.00s)
PASS
ok  	example.invalid/gomark-close-probe	0.476s
```

Go child exit: **0**. No timeout. Raw stderr: empty.

## Raw Node stdout

```text
node=v24.19.0 typescript=5.9.3
source_sha256=c590c769bdb29c172161d1248706b49a65cba15fdb93a199522d02364831ca40
substituted_runtime_imports=["./index","./settingsSlice"]
first read: rejected=true calls=1 dispatches=0
adapter recovered, retry: rejected=true samePromise=true calls=1 dispatches=0
dispose then retry: resolved=true samePromise=false calls=2 actionTypes=["settings/reset","settings/hydrate"]
PASS: isolated cached-rejection consequence and disposer positive control
```

Node child exit: **0**. No timeout. Raw stderr: empty.

## Evidentiary limits

The Go probe executes the exact coordinator but substitutes an in-process emit receiver and Quit callback. It proves coordinator state transitions and missing redelivery after a previously absent receiver. It does not execute Wails, the application holder, frontend startup subscription gating, native window menus, file links, WebKit, macOS force quit or a deadlock. Those connections remain source-confirmed or incident hypotheses as separately labeled in `/tmp/gomark-startup-close-investigation.md`.

The Node probe executes the exact projection module with inert store/action boundaries. It proves cached settings rejection and explicit-disposal recovery in that module. It does not execute React App, the concurrent model projection, RetryStartup, Redux reducers, the native bridge or actual settings I/O. The full App consequence requires the stated condition that model bootstrap succeeds while settings hydration alone rejects; this probe does not pretend to test that composition.

The assertions deliberately expect the defective behavior and therefore pass on the audited source. A future regression test for intended behavior should assert eventual request delivery/recovery and a fresh settings read; these probe passes do not certify production correctness.
