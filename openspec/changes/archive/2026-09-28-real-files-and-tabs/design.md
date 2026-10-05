# Design

## Context

The Go application model already owned state; this change adds files and tabs to it. The frontend keeps only a content-free projection and receives document text only on activation, hydration or reload.

## Goals / Non-Goals

- Goals: no silent data loss, no silent overwrite of external edits, one canonical path for opening and writing files.
- Non-Goals: folder workspace, file associations, drag-and-drop, rich rendering expansion, packaging, assistant.

## Decisions

- Document identity is an opaque id minted in Go, independent of path and unchanged by Save As. The canonical path is the dedupe key: opening an open file focuses it.
- The tab set is ordered, holds 0 to 40 documents, and carries a revision that every add, remove, reorder or activation change bumps; commands carry the expected revision and a 41st tab is refused before any change.
- Open order: validate suffix and limits, canonicalize and focus an existing tab, stat then bounded read, classify (UTF-8, NUL, BOM, line endings, size), apply default open mode and saved arrangement, replace a lone empty untitled tab, update recents. Any failure leaves the model unchanged.
- Limits: over 52,428,800 bytes refused; over 10 MiB or unsafe text opens read-only with a visible reason; live preview pauses above 2,097,152 bytes with a Refresh preview action.
- One write coordinator serves Save, Save As, autosave and close-save: snapshot under lock, serialize I/O per document, temp file in the target directory, apply permission mode, sync, recheck disk version, atomic replace (Windows uses a dedicated replace API), then clear dirty only if content is unchanged since the snapshot. Pre-commit failures remove the temp file and keep the document dirty. New files are UTF-8/LF; existing uniform endings and BOM are preserved; mixed endings need explicit normalization approval.
- Disk checks run only on tab activation, window focus and before writes. No watcher or polling. If only the disk version changed but bytes, endings and permissions are the same, the baseline is refreshed and the write continues without a prompt.
- Conflict prompt: shows bounded On disk and Yours previews (12 lines, 4096 bytes per side), actions Reload from disk, Keep mine, Skip. Keep mine yields a single-use authorization bound to document, revision, path and disk version. Skip writes nothing. Read-only documents get Reload or Cancel only. One conflict modal at a time; waiting tabs are marked blocked.
- A missing backing file marks the document detached and dirty; only explicit Save recreates it.
- Autosave: one-second debounce per accepted revision, saved writable files only, never runs format or lint.
- Close plan: PrepareClose summarizes dirty targets, all prompts (Save As, overwrite, normalization, conflicts) are gathered first, then the plan executes; any cancel or stale revision applies nothing.
- Recents: at most six canonical paths, newest first, stored in SQLite and validated lazily. Recently closed tabs are per-window memory (up to 40), not persisted. Tabs are never restored at launch.

## Risks / Trade-offs

- A non-cooperating program can still modify a file between the final check and replacement; this is documented, not hidden.
- Atomic replace may break hard links and drops extended attributes.
- Windows and Linux behaviour was verified through platform-specific code and tests rather than on every host.

Deferred (not built): the exhaustive pixel-parity matrix against the design mockup, the full multi-width/palette coverage ledger and release evidence stack were left unfinished; Open Folder and recent folders were unavailable here and arrived with the folder workspace change.
