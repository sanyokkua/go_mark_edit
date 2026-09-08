# Startup failure and native close investigation

Read-only source/history/test review of `883fd053b9b30911248a304cf5f57d8cebe81795` for the owner-reported sequence: click a file link in Markdown preview → apparent hang → full-window “could not initialize its local settings” / Retry → ordinary/native close reportedly ineffective → process killed with htop. No repository edits, UI operations, builds or tests were performed in this investigation. Parent separately owns navigation/native-option tracing and a disposable coordinator probe. References are relative to `/Users/ok/Development/GitHub/go_mark_edit` unless stated otherwise.

Evidence grades: **S** = direct source fact/consequence under the stated condition; **H** = plausible incident hypothesis needing native evidence. None of the findings below proves the owner’s exact navigation chain, a Go deadlock, or failure of macOS force termination.

## Main conclusion

There is a source-confirmed ordinary-close trap independent of the precise link failure: native close requires a renderer acknowledgment, but the renderer subscribes only after startup succeeds. A first request made during loading/failure is vetoed and can be lost permanently. Retry does not clear that native pending request. The settings-specific error message does not identify the actual failing subsystem; several unrelated bootstrap failures produce it. A separate cached-rejection bug prevents Retry from recovering an isolated settings hydration failure.

## Findings suitable for §5.3, retaining Revision 2 structure

### SC-1 — Native close can remain vetoed after a lost renderer request (P1, S/high confidence)

Production always installs `CloseCoordinator` (`main.go:157–159`), emits the native request through `runtime.EventsEmit` (`main.go:29–34`), and passes every `OnBeforeClose` callback into the holder (`main.go:197–198`). The holder delegates without testing startup or frontend readiness (`internal/application/application_context_holder.go:229–236`).

`CloseCoordinator.BeforeClose` sets `pending=true`, emits once, and returns `true` to veto; every subsequent native request while pending returns `true` without emitting again (`internal/application/close_coordinator.go:37–55`). Only `Cancel` or `Authorize` clears pending (`:61–84`). There is no acknowledgment, request generation, timeout, delivery check, replay or renderer-reconnected transition.

The only application close-event subscription is guarded by `bootstrapStatus === 'ready'` (`frontend/src/App.tsx:1962–1969`). Loading and `StartupFailure` have no subscriber. Wails’ event receiver looks up the current listeners and otherwise iterates an empty snapshot; it retains no event for a later listener (`/Users/ok/go/pkg/mod/github.com/wailsapp/wails/v2@v2.15.0/internal/frontend/runtime/desktop/events.js:46,57–73,88–95,125`). Thus this chain follows directly from source:

1. Native close during loading/failure sets Go pending and vetoes the close.
2. No subscribed renderer consumes the request.
3. Further native close calls are vetoed without another event.
4. Even if Retry later reaches ready and subscribes, there is no replay.

`RetryStartup` only calls `Init` then `RestoreNativeWindow` (`application_context_holder.go:187–192`). It neither reinstalls nor resets the coordinator; the sole production installation remains `main.go:159`. `Init` returns early if the DB already exists (`:115–118`). The failure view offers only Retry (`frontend/src/ui/widgets/StartupFailure.tsx:5–8,24–33`); menubar controls are hidden (`App.tsx:1986–1987`). The ready-state recovery quit flow is a different surface and does not make StartupFailure closable.

This explains how ordinary close requests routed through the hook can become ineffective. It does **not** show a locked coordinator: it releases its mutex before emitting and before requesting Quit. It does not establish that an OS force-kill request was delivered to the correct process or could be vetoed by this hook.

### SC-2 — Startup failure is wrongly attributed to local settings (P2, S/high confidence)

`startAppModelBootstrap` combines adapter import, optional backend RetryStartup, model projection bootstrap, settings projection bootstrap, and frontend WindowReady notification, then converts any rejection to `{status:'failed'}` (`frontend/src/App.tsx:159–185`). Model bootstrap independently collapses subscription errors, GetState errors and invalid application-version data into the same failed result (`frontend/src/logic/store/appModelProjection.ts:55–100`). No stage/error survives in `AppModelBootstrapResult` (`:13–20`).

Every such result renders the same failure view (`App.tsx:1890–1913,1995–2001`) and the same settings-specific copy (`frontend/src/ui/widgets/StartupFailure.tsx:17–22`; `frontend/src/i18n/locales/en.json:68–70`). A broken/missing generated binding, failed model hydration, or failed WindowReady acknowledgment can therefore be reported as a settings initialization problem without evidence of a settings failure.

After a previously ready application, normal command failures do not directly set bootstrap failed. `runBootstrap` is called on mount and by Retry (`App.tsx:1920–1932,1998–1999`); failed is assigned at `:1913`. Seeing this page after a preview click therefore suggests a new App bootstrap/remount/reload or another externally caused bootstrap sequence. That is an **H**, useful for capturing navigation evidence, not proof that clicking the link corrupted SQLite.

`main.go:176–187` logs actual native Init/Restore failures before showing the recovery window; renderer bootstrap errors are not retained in this display. Preserve the actual Go logs when diagnosing instead of treating the display text as the root cause.

### SC-3 — Retry reuses an isolated settings rejection (P2, S/high confidence)

`bootstrapSettingsProjection` caches `settingsAdapter.getSettings().then(...)` and only clears that promise in `disposeSettingsProjection` (`frontend/src/logic/store/settingsProjection.ts:5–20`). There is no rejection reset. That disposer is called by model projection `resetAttempt` (`appModelProjection.ts:104–118`), which runs on model bootstrap failure or explicit model disposal (`:40–44,98–100`). Ordinary App Retry does not dispose either projection; after RetryStartup it calls their cached bootstrappers again (`App.tsx:173–179`).

If **model bootstrap succeeds but the settings promise rejects**, the successful model promise and rejected settings promise both persist. Retry can call backend RetryStartup successfully but never issues a fresh settings read; the same rejected promise produces failure again. If model bootstrap fails as well, its reset clears settings and this particular trap does not apply. A complete renderer reload also creates a fresh module realm; the bug concerns Retry within the existing realm.

### SC-4 — No application deadline or reconciliation for lost bridge calls (P1/P2, S conditionally; incident cause H)

The adapters await generated bindings directly (`frontend/src/logic/adapter/index.ts:458–467`; `windowAdapter.ts:56–57`); `unwrapPromise` waits for resolution/rejection rather than providing a deadline (`frontend/src/logic/adapter/envelope.ts`). Wails v2.15.0 is pinned by `go.mod:8`. Its generated runtime bindings select timeout zero (`/Users/ok/go/pkg/mod/github.com/wailsapp/wails/v2@v2.15.0/internal/frontend/runtime/desktop/bindings.js:41–59`); runtime `Call` explicitly defaults to an infinite timeout (`calls.js:57–79`). If `window.WailsInvoke` throws, its catch only logs and leaves that promise unsettled (`calls.js:88–101`). A missing `window.go` can instead throw earlier through the generated wrapper and become the generic bootstrap failure above.

Consequences if a call never settles:

- Initial bootstrap never completes; `Promise.all` waits even if the other bootstrap leg has already returned failed (`App.tsx:176–185`).
- A Retry remains single-flight and `isRetrying` stays true; `activeRetry` resets only in `finally`, and the sole Retry button is disabled (`App.tsx:162–164,190–194,1894–1905`; `StartupFailure.tsx:26`). Generation cleanup ignores stale results but does not cancel work (`App.tsx:1928–1931`).
- Ready-state native close sets frontend pending and awaits GetState, session flush, prepare/execute/reconcile/authorize steps. Catches only help calls that reject; they cannot release a never-settling operation (`App.tsx:1029–1067,848–908`). Go continues vetoing repeated native requests.
- `cancelNativeClose` clears the frontend pending flag **before** awaiting CancelQuit (`App.tsx:833–840`). If the bridge fails before Go handles cancellation, the frontend believes cancellation finished while Go remains pending; only an error notification is issued, with no latch reconciliation.

These are liveness/protocol gaps. Adding a JavaScript timeout alone would not cancel an already executing Go mutation and could let a late authorization act on an obsolete request. Any repair needs request identity and state reconciliation, with a specified policy for a renderer that cannot recover.

### SC-5 — Synchronous shutdown/startup waits need observability; no deadlock demonstrated (S risk boundary)

`Init` holds `holder.mu` across path resolution, DB open/migrations, repository wiring and two settings reads (`application_context_holder.go:111–148,158–178`). Handler context providers acquire the same mutex (`:103–107`) and BeforeClose acquires it (`:229–232`), so close can wait behind initialization. This is the concrete consequence behind existing BE-4; avoid filing the same lock observation as a second independent defect.

Authorization synchronously drains writes/layout before creating the permit (`application_context_holder.go:262–280`; `internal/appmodel/close_drain.go:41–50,75–83`). `waitForIdle` waits on the per-document write mutex held across the write executor (`internal/appmodel/write_coordinator.go:64–79,110–113`), with no independent cancel/deadline on that wait. This correctly protects write durability, but a stuck I/O operation can delay quit with no bounded native recovery path shown here. Preserve serialization/atomic replacement guarantees; do not implement timeout by silently abandoning a write or discarding dirty content.

Do not say the database has no timing guards: `internal/db/db.go:24–28,111–125,169–207` has a 5-second SQLite busy timeout, bounded fresh-open retry and migration retries with context-aware waits. There is no overall startup/close liveness deadline in this path. No stack capture proves a mutex cycle, filesystem stall or native main-thread deadlock in the reported incident.

## Why current tests do not cover this composition

- `internal/application/close_coordinator_test.go:16–80` proves repeated-request deduplication, Cancel and a one-shot permit by directly invoking the coordinator; it does not attach/detach a real renderer or require redelivery after a dropped request.
- The recovery test directly calls `holder.AuthorizeQuit` after setting model startup error (`:147–169`). This proves the backend drain can permit recovery quit, not that StartupFailure can reach that call.
- `frontend/src/App.test.tsx:583` tests native close after a mocked listener is registered; backend/native event delivery is mocked.
- Retry coverage at `App.test.tsx:2020–2055` fails **GetState**, which resets the settings promise as a side effect. It also expects the settings-specific message for a non-settings failure. It does not independently reject getSettings after successful model hydration.
- `App.test.tsx:2058–2082` manually resolves outstanding startup and checks shell suppression; it does not attempt native close while unresolved or test bounded recovery. The StrictMode retry case (`:2135–2181`) manually rejects its outstanding retry.
- `frontend/src/logic/store/settingsProjection.test.ts:12–43` proves successful single hydration/caching only. `internal/application/startup_retry_test.go:12` checks exported handler shape rather than recovery liveness.
- History places StartupFailure/Retry in STORY-027 (`ad9c657`) and the one-shot close coordinator in `fea08b7` (“protect native close with one-shot plans”). These separate additions support reviewing the missing cross-boundary scenario; commit history by itself does not prove the incident cause.

## Evidence to capture next, without changing the user’s files

Use a built app, disposable profile and temporary Markdown files. Capture the exact Markdown link text and resolved href, whether it is relative/absolute/file/fragment, current page URL before/after, navigation and runtime injection events, and whether a fresh App bootstrap occurs. Preserve frontend errors and Go startup logs with timestamps, bootstrap stage, close request id/state, event emission/receipt, RPC invocation/completion and cancellation acknowledgment. Do not log document bodies or unrelated paths.

At a hang, obtain Go/native/WebKit process identities and stack samples, thread wait states and recent logs before terminating anything. Record the exact ordinary-close and “force close” method, selected PID, signal if any and observed exit result. Distinguish one stuck window, a live Go host, a WebKit subprocess and an OS kill that was actually delivered. The source review cannot infer these facts from the report that htop eventually worked.

## Proposed additions to §6, without changing its organization

Append product requirements to Epic A and link them to new §5.3 findings (parent owns numbering):

1. A native close issued before readiness, after startup failure, or while renderer event handling is absent must have a specified recoverable outcome; restored frontend must discover an outstanding request, repeated close must not become permanently inert, and cancellation/authorization must be acknowledged against the same request identity. Verify the real host/renderer boundary, not only direct coordinator calls. Clean startup failure must be closable; dirty-document/renderer-loss behavior requires an explicit owner-approved recovery decision.
2. Startup failure preserves the failing stage and a safe diagnostic identity. Reject adapter import/bridge, GetState, settings read and WindowReady independently and assert accurate failure presentation; do not label all of them settings failures.
3. Retry makes a fresh attempt after each retryable stage failure. In particular, successful model hydration plus first settings-read rejection must call settings read again and recover without restarting the process. Repeated Retry remains single-flight; a never-settling leg reaches a specified bounded recovery state.

Extend Epic C’s lifecycle ownership with bounded request acknowledgment/reconciliation and diagnostic state across Go/native/renderer, including lost cancellation and late responses. Preserve the existing one-shot authorization and drain guarantees. Put real startup/renderer-loss/native-close scenarios under Epic D’s real-backend E2E requirement; prove accepted writes remain safe across a failed drain and late completion. Keep ordinary close, explicit destructive recovery and OS process termination as separately specified outcomes.

This supplements BE-4/BE-6 and Epic A/C/D. It requires no audit reorganization and does not justify a broad lifecycle framework, a silent native-stack change, or a claim that the reported macOS force-close failure was reproduced.
