# ADR-0004 — State: file-first documents + a small SQLite KV store for settings/recent

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

## Context and problem statement

GoMarkEdit edits real Markdown files on disk. Two kinds of state exist and must be handled differently:

1. **Document content** — the text the user edits. The **files are the source of truth**; nothing
   proprietary sits between the user and their `.md` files.
2. **App state that outlives a file** — recent files & folders, all settings, window size, and
   per-document view mode (DD-10).

We must decide where category (2) lives, and — deliberately — what we will **not** do: DD-11 states the
app opens **clean** with no automatic session restore, and there is **no crash recovery / swap files**.
Autosave applies only to already-saved files; never-saved buffers are never silently written (DD-12).
The store must also be safe for **multiple concurrent app instances** (DD-08), which shapes how it is
opened (DD-13, see ADR-0006). This ADR locks DD-10, DD-11, and DD-13.

## Decision drivers

- File-first integrity: the on-disk `.md` file is authoritative; the app must never become a
  proprietary container the user's content is trapped in.
- Persist a small, well-defined set of preferences/recents/window state reliably across launches
  (DD-10).
- Use a proven SQLite-KV pattern (`settings(key, value, type)` table via
  `modernc.org/sqlite`) — no new persistence R&D, CGO-free (DD-03).
- Concurrency safety: several instances may run at once and share this store (DD-08, DD-13).
- Deliberate simplicity: **no session restore, no crash recovery, no swap files** (DD-11) — reduces
  scope, avoids stale/ghost state, and keeps launch behaviour predictable.
- Atomic, transactional, typed reads/writes for scalar preferences — better than hand-rolled file
  parsing.

## Considered options

- **SQLite key-value store** (`modernc.org/sqlite`, `settings(key, value, type)` pattern) for settings/recent/window state.
- **JSON (or TOML) config file(s)** on disk.
- **OS-native preference/keychain store** (macOS `defaults`/Keychain, Windows Registry/Credential
  Manager, Linux GSettings/Secret Service).

## Decision outcome

Chosen: **file-first for documents (the `.md` files are the source of truth) plus a small SQLite
key-value store (`modernc.org/sqlite`) for settings, recent files/folders, window size, and
per-document view mode**, using a proven SQLite KV pattern. The store holds only small scalar
preferences and short recent-lists, written infrequently. Crucially, the app **opens clean** — no
session is auto-restored and there are **no swap/recovery files** (DD-11); the user reopens work via
File → Open Recent or "Reopen last file/folder", and autosave only ever touches files that already
exist on disk (DD-12). Because instances are multi-process (DD-08), the KV database is opened with WAL

- `busy_timeout` so concurrent instances share it safely (DD-13, detailed in ADR-0006). No secrets are
  stored — GoMarkEdit has no accounts, no network, and no credentials (DD-32, DD-33), so a keychain buys
  nothing.

### Consequences

- Positive: User content lives only in plain `.md` files — trivially portable, versionable, and never
  locked into an app database.
- Positive: Settings/recent/window state get atomic, typed, transactional reads/writes via a proven,
  CGO-free store — minimal new code.
- Positive: Clean-launch + no-recovery policy eliminates a whole class of stale-session, ghost-buffer,
  and swap-file-collision bugs, and keeps startup behaviour deterministic.
- Positive: A single SQLite file is simple to locate, back up, or delete to reset preferences.
- Negative: A crash loses unsaved edits to never-saved buffers (by explicit design, DD-11/DD-12) — no
  auto-recovery safety net; users must save deliberately.
- Negative: A binary SQLite file is less hand-editable than a JSON config for power users (mitigated:
  everything in it is reconstructable, and it is inspectable with any SQLite browser).
- Neutral: The KV schema evolves additively only (new keys); there is no migration/backfill of existing
  preference rows.

## Pros and cons of the options

### Option A — SQLite KV store (`modernc.org/sqlite`)

- Good: Proven SQLite-KV pattern; atomic/transactional/typed; single file; CGO-free; safe for
  concurrent instances via WAL + `busy_timeout` (ADR-0006); trivially inspectable/resettable.
- Bad: Binary file (not hand-editable as text); a full relational engine is mild overkill for a handful
  of scalar keys.

### Option B — JSON / TOML config file

- Good: Human-readable and hand-editable; zero dependency; easy to diff and version.
- Bad: No transactional/atomic multi-writer story — concurrent instances (DD-08) can clobber each
  other's writes or leave a truncated/corrupt file on a mid-write crash; requires hand-rolled
  parsing/validation/versioning; recent-list growth and typed values are fiddlier than a KV table.

### Option C — OS-native preferences / keychain

- Good: Idiomatic per-OS integration; secure secret storage where relevant.
- Bad: Three divergent APIs to implement and test (defaults vs Registry vs GSettings); harder to back
  up/inspect/reset uniformly; no shared cross-instance transactional guarantee; **no secrets to store**
  in GoMarkEdit so the keychain's core value is moot — pure added complexity for a fully offline app.

## Links

- Design decisions: DD-10 (persist recent/settings/window/view-mode in a SQLite KV store), DD-11 (clean
  launch; no session restore; no crash recovery/swap files), DD-13 (WAL + `busy_timeout` for
  multi-instance safety). Related: DD-12 (autosave existing files only), DD-03 (CGO-free `modernc`),
  DD-08 (multi-instance — see ADR-0006).
- Spec clauses: `../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#3-persistence--state`,
  `../../_archive-2026-07-28-specification/02_Architecture/05_STATE_AND_PERSISTENCE.md`, `../../_archive-2026-07-28-specification/01_Product/03_FILES_TABS_WORKSPACE.md`,
  `../../_archive-2026-07-28-specification/01_Product/11_SETTINGS.md`, `../../_archive-2026-07-28-specification/05_Dependencies/01_GO_DEPENDENCIES.md`.
- Stories: Phase 00 DB-open scaffold story and Phase 07 recent-files / reopen-last stories, per
  `07_Phases/00_ROADMAP.md` (authored per phase; none `done` at ADR time).
