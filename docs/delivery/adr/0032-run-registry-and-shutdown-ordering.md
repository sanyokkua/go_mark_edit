# ADR-0032 — A cancellable-run registry, an `OnBeforeClose` veto, and one deterministic shutdown order

**Status:** accepted
**Date:** 2026-07-25
**Deciders:** project owner, architect

## Context and problem statement

Three separate parts of the specification require something the specification never builds.

**Cancellation is required and has no mechanism.** `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`
says an in-flight gated operation is cancelled on shutdown; DD-47 says the agent loop checks
cancellation each iteration; `CodeCancelled` exists in the error catalog. There is no run registry, no
bound `Cancel` method, and no statement that the `OnStartup` context is the parent of every derived
context. `PHASE_12_ASSISTANT_REWRITES.md` lists this as unsettled in as many words: *"nothing defines
the bound method, the run registry, what happens when cancel and completion race, or which of the two
produces the terminal result."*

**A cancellable quit is required and cannot be built where the specification puts it.**
`PHASE_05_REAL_FILES.md` requires that closing the window with dirty tabs asks Save / Discard / Cancel,
with Cancel being a clean no-op that writes nothing. `OnBeforeClose` appears nowhere in the
specification — it is not in `04_WAILS_INTEGRATION.md`, not in `02_BACKEND_GO.md`, not in any phase.
You cannot implement a vetoable quit in `OnShutdown`; by then the window is going away.

**Shutdown order is specified three times, in three documents, and never as a sequence.** DD-60 says
window geometry is debounced and flushed on close. `07_LARGE_FILES_AND_CONCURRENCY.md` says in-flight
gated operations are cancelled and the gate released. `02_BACKEND_GO.md` says the database and the
logger are closed. Nothing orders them — and if the database closes before the debounced geometry write
flushes, the user's window size is silently lost on every single quit.

**Panics are handled in one place out of many.** Every bound handler recovers into `CodeInternal`.
Nothing covers a panic on any other goroutine — the export worker, the autosave timer, the agent loop,
an event callback. In Go a panic on any goroutine takes the process down with no dialog, no envelope
and no log line.

## Decision drivers

- Cancel must mean the same thing for a large format, a PDF export and an assistant run. There is one
  gate; there should be one cancellation story.
- A run must produce exactly one terminal outcome, even when the user cancels at the moment it finishes.
- Quitting must never write anything the user did not confirm, and must never lose state they expected
  to be kept.
- The failure of a diagnostic (a log write) must never be more severe than the failure of the feature.

## Considered options

- **A.** Handle cancellation per feature: the exporter owns its own, the agent owns its own.
- **B.** One registry in the composition root, one bound `Cancel(runId)`, one shutdown sequence.
- **C.** No cancellation; bound every long operation by a timeout instead.

## Decision outcome

Chosen: **B**.

**The run registry.** One mutex-guarded `map[runID]context.CancelFunc` owned by the composition root.
Every long-running operation — gated or not — derives its context from the `OnStartup` context, registers
its cancel function on entry, and `defer`s both `delete` and `cancel` on exit. `context.Background()`
appears in no request path. One bound `CancelRun(runId)` serves every feature; cancelling an unknown or
already-finished id is a **success no-op**, not an error, because the caller cannot know which it is.

**Exactly one terminal outcome.** A run that is cancelled while an operation is in flight surfaces as
`CodeCancelled` and is normalized into the *same* result, log and event shape as a run cancelled between
steps. The race between cancel-arrives and work-completes is resolved once, at one point in the code,
rather than at each call site. A user-facing message reports what actually **completed**, never the loop
index — "cancelled after step 1" when step 1 never finished is a message that lies.

**The quit sequence.** In order, and this order is normative:

1. `OnBeforeClose` asks the frontend whether it may close. If any document is dirty the frontend shows
   **one** dialog listing all of them, with Save all / Discard all / Cancel. Until the answer arrives the
   close is vetoed. Cancel is a clean no-op: nothing has been written.
2. Cancel every in-flight run through the registry and release the gate.
3. Flush every pending debounced write — window geometry, the editor buffer, autosave.
4. Close the database.
5. Flush and close the logger.

Steps 3 and 4 are in that order for one reason and it is worth stating: reversed, the app loses the
user's window size every time it quits, silently, forever.

**Panic containment everywhere.** Every `go func()` in `internal/**` goes through one helper that
recovers, classifies as `CodeInternal`, and logs with the owning component and operation. A panic on a
background goroutine becomes a logged error and, where a user is waiting on it, a failed result — never
a process death.

**Degraded rather than fatal, where the feature is not the point.** Startup steps are classified: a
failure that prevents the app from functioning shows a dialog naming the cause and exits; a failure that
only degrades a diagnostic warns and continues. Specifically, **failing to create the log directory must
not prevent the editor from opening** — it currently does, and a read-only or full configuration
directory should cost you your logs, not your text editor.

### Consequences

- Positive: `PHASE_12`'s open question is closed before its stories are written.
- Positive: one cancel path means the assistant, the exporter and the formatter cannot diverge.
- Positive: the shutdown order stops being three documents' worth of independent assertions.
- Negative: every long operation now has bookkeeping it did not have — register, defer, delete. This is
  the cost of the guarantee and it is small.
- Negative: `OnBeforeClose` requires an asynchronous round-trip to the webview (veto, ask, then either
  allow or re-veto). It is genuinely fiddly and it is the reason this is an ADR and not a paragraph.
- Neutral: `CodeCancelled` becomes a normal outcome rather than an error, and the UI must present it as
  one.

## Pros and cons of the options

### Option A — cancellation per feature
- Good: each feature owns exactly what it needs.
- Bad: three implementations of the cancel/complete race, and the shutdown path has to know about all
  of them. The gate is already shared; the cancellation should be too.

### Option B — one registry, one sequence *(chosen)*
- Good: one place to reason about, one place to test the race, one order to state.
- Bad: a small amount of ceremony at every call site.

### Option C — timeouts instead of cancellation
- Good: nothing to register.
- Bad: the user cannot stop a 2-minute local inference they started by mistake, and quitting cannot be
  clean. Timeouts are a backstop, not a cancel button.

## Links

- Design decisions: DD-47, DD-60, DD-61; new DD-70 (limits)
- Spec clauses: `specification/02_Architecture/04_WAILS_INTEGRATION.md#lifecycle`,
  `specification/02_Architecture/02_BACKEND_GO.md`,
  `specification/02_Architecture/06_ERROR_HANDLING.md`,
  `specification/02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`
- Phases: `specification/07_Phases/PHASE_05_REAL_FILES.md` (the quit prompt),
  `specification/07_Phases/PHASE_10_TIDY_AND_SHARE.md` (export),
  `specification/07_Phases/PHASE_12_ASSISTANT_REWRITES.md` (closes its open question)
- Stories: not yet written.
