# ADR-0006 — Allow multiple app instances (no single-instance lock); shared settings DB via WAL

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

## Context and problem statement

GoMarkEdit must support **multiple app instances**, VS Code-style: opening a second file may open a new
window/instance, and there is **no single-instance lock** (DD-08). GoMarkEdit deliberately uses no
single-instance lock: the common alternative — enforcing a single instance via an OS advisory file lock
(`flock`) and showing an "Already running" dialog on a second launch — is explicitly **not** wanted here.
A user should be able to run several editor windows side by side.

The consequence is that the shared **settings/recent SQLite KV store** (ADR-0004, DD-10) can be opened
by several processes at once. We must decide the instance model **and** how those concurrent processes
share one database file without corruption or "database is locked" failures. Writes to that store
(settings, recent lists, window size) are infrequent and small. This ADR locks DD-08 and DD-13.

## Decision drivers

- Product requirement: multiple independent windows/instances, VS Code-style (DD-08).
- No artificial "already running" gate that blocks a legitimate second window (explicit anti-goal).
- The shared settings/recent SQLite DB (ADR-0004) must be safe under concurrent multi-process access
  (DD-13) — no corruption, no spurious lock errors on the rare writes.
- Writes are infrequent and tiny (settings/recent/window state), so a heavy coordination scheme is
  unwarranted; reads should never block on a concurrent read.
- Keep it CGO-free and simple — lean on SQLite's own concurrency primitives, not a custom IPC broker.

## Considered options

- **Multiple instances + WAL** — no lock; each process opens the shared KV DB with WAL journaling +
  `busy_timeout`.
- **Single instance + `flock`** — an OS advisory lock; second launch is refused or forwarded.
- **Single instance + IPC forwarding** — one primary process; later launches hand their file argument
  to it over IPC and exit.

## Decision outcome

Chosen: **allow multiple instances with no single-instance lock, and open the shared settings/recent
SQLite database in WAL mode with a `busy_timeout`** (mirroring the pragmas GoMarkEdit already uses for
`modernc.org/sqlite`). WAL lets many readers proceed concurrently with a single writer without readers
blocking, and `busy_timeout` makes the rare concurrent writer wait-and-retry briefly instead of
failing immediately with "database is locked" — which is entirely adequate given how infrequently
settings/recent are written. We deliberately **do not** adopt a `flock` single-instance lock: such a
lock makes sense only when an app owns a single stateful document database per process and wants
exactly one owner, whereas GoMarkEdit's documents are plain files (ADR-0004) and its only shared state is
the small KV store, which SQLite's own WAL concurrency handles cleanly. No IPC broker is introduced;
each instance is a fully independent process.

### Consequences

- Positive: Users get true multi-window / multi-instance behaviour (DD-08) — several editors open at
  once, no artificial gate.
- Positive: Concurrent instances share settings/recent safely; readers never block, and the infrequent
  writer retries within `busy_timeout` rather than erroring (DD-13).
- Positive: Simpler than a single-instance lock scheme — no lock file to acquire/release, no
  crash-cleanup concern for a stale lock, no "Already running" dialog path to build or test.
- Negative: **Last-writer-wins** on the shared store — if two instances change the same setting at
  nearly the same moment, one update silently overwrites the other. Acceptable given rare, mostly
  per-instance writes, but it is a real semantic the code must not assume away.
- Negative: WAL leaves side-car files (`-wal`, `-shm`) next to the DB; they are normal but must be kept
  with the DB when copying/backing it up.
- Negative: There is no coordination of *which* instance owns a given file — two windows can open the
  same file independently; with autosave (DD-12) this is a possible concurrent-write-to-same-file edge
  case that file-level handling (not this DB decision) must consider.
- Neutral: GoMarkEdit deliberately uses no single-instance lock; the choice is documented here so the
  absence of a `flock` gate is a decision, not an oversight.

## Pros and cons of the options

### Option A — Multiple instances + WAL + `busy_timeout` (chosen)

- Good: Directly delivers DD-08; concurrent-read-safe and concurrent-write-tolerant for the rare KV
  writes; no lock/IPC machinery; CGO-free; reuses SQLite's own proven concurrency.
- Bad: Last-writer-wins on simultaneous same-key writes; WAL side-car files; no built-in per-file
  ownership arbitration between windows.

### Option B — Single instance + `flock`

- Good: One owner of all shared state → no cross-process write contention at all; simple mental model;
  a well-established pattern.
- Bad: **Directly contradicts DD-08** — blocks the desired multiple-windows workflow; needs an
  "Already running" UX and argument-forwarding to be usable at all; stale-lock edge cases after a hard
  crash. Rejected as counter to the product requirement.

### Option C — Single instance + IPC forwarding

- Good: One process owns state (no DB contention) while still feeling multi-window if the primary opens
  extra windows; new-file launches route to the running app.
- Bad: Substantial complexity — an IPC channel, a primary/secondary handshake, lifecycle and
  crash-of-primary handling — all to *simulate* what DD-08 wants natively; still fundamentally
  single-process, so a true independent second instance is impossible. Over-engineered for the goal.

## Links

- Design decisions: DD-08 (support multiple app instances; no single-instance lock), DD-13 (settings DB
  opened with WAL + `busy_timeout` for safe concurrent-instance sharing). Related: DD-10 (SQLite KV
  store — ADR-0004), DD-12 (autosave existing files).
- Spec clauses: `00_Foundation/04_DESIGN_DECISIONS.md#2-documents-files--workspace`,
  `00_Foundation/04_DESIGN_DECISIONS.md#3-persistence--state`,
  `02_Architecture/05_STATE_AND_PERSISTENCE.md`, `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md`,
  `01_Product/03_FILES_TABS_WORKSPACE.md`.
- Stories: Phase 06 multi-instance / new-window story and the Phase 00 DB-open scaffold story, per
  `07_Phases/00_ROADMAP.md` (authored per phase; none `done` at ADR time).
