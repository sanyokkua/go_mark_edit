# FT-VS-07 — recents, reopen, launcher, and status evidence

Date: 2026-08-09
Feature: `specs/003-real-files-and-tabs`
Task: T032
Status: evidence collected; final gate verification pending

## Browser control evidence

The mock-bridge Playwright journey passed with exit status 0:

```text
npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts --grep 'FT-VS-07'
```

It operated the visible controls and verified:

- the File → Open Recent submenu exposes six entries in most-recent-first order;
- selecting `t032-recent-04.md` selects the corresponding tab and document identity;
- closing with Discard and then choosing File → Reopen last file / folder restores the document;
- a fresh launcher view disables Open Folder, exposes the six recent entries, and opens the first entry;
- Document details remains reachable at a 375px viewport, and the document width does not overflow the viewport;
- no `not_found` notification is emitted during the exercised reopen and launcher paths.

The browser run uses the repository's deterministic mock bridge. It proves control wiring and
responsive layout, but it is not evidence of SQLite commit ordering or two native application
instances.

## Real bridge and disk evidence

The native-evidence binary was built successfully with the repository's production Go tags and
started twice against the same temporary settings database:

```text
binary: /tmp/GoMarkEdit-t032-native
database: /tmp/gomarkedit-t032.opRXV7/settings.db
fixtures: alpha.md, bravo.md, charlie.md, delta.md, echo.md, foxtrot.md, golf.md
instances: native-evidence A and native-evidence B
```

The database was seeded with seven entries and, after initialization, contained the six-entry
bounded MRU list below. This is disk evidence of the real settings store and lazy pruning:

```text
recent.files|{"version":1,"entries":["/private/tmp/gomarkedit-t032.opRXV7/golf.md","/private/tmp/gomarkedit-t032.opRXV7/foxtrot.md","/private/tmp/gomarkedit-t032.opRXV7/echo.md","/private/tmp/gomarkedit-t032.opRXV7/delta.md","/private/tmp/gomarkedit-t032.opRXV7/charlie.md","/private/tmp/gomarkedit-t032.opRXV7/bravo.md"]}|recent.files.v1
```

The focused appmodel tests also passed for MRU persistence, commit-order promotion, stale
snapshot rejection, persistence-warning rollback, recently-closed history, and reopen lifecycle.
Those tests exercise two SQLite handles inside the test process; they do not replace a native UI
walkthrough across two visible application instances.

## Build evidence

The first sandboxed `just build` attempt failed because Wails' Go subprocess could not access
the host Go build cache. After allowing the official build to access that cache, the unchanged
`just build` command passed with exit status 0 and produced the signed macOS application at
`build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`.

The direct production Go build also passed and is retained as a supporting artifact. The raw log
records both the sandbox-denied attempt and the successful official build.

## Native UI boundary

The initial attempt was blocked while the host was locked. After the user unlocked the Mac, the
same signed build was launched through the native Wails window and exercised through its actual
controls. The successful native observations were:

```text
File -> Open File -> /private/tmp/gomarkedit-t032.opRXV7/alpha.md
identity: gomarkedit-t032.opRXV7 / alpha.md
status: Saved
notifications: none

File -> Open File -> /private/tmp/gomarkedit-t032.opRXV7/bravo.md
identity: gomarkedit-t032.opRXV7 / bravo.md
tabs: alpha.md, bravo.md
status: Saved
notifications: none

File -> Open Recent
entries: alpha.md, bravo.md (most recent first)
select alpha.md: existing alpha.md tab selected; no duplicate tab

Close alpha.md, then File -> Reopen last file / folder
command: enabled; no not_found notification during the successful native control walk

artifact: artifacts/t032/native-status-saved.jpeg
```

The native-evidence harness was also started twice against the same temporary SQLite database;
the corresponding process output and database inspection are retained above and in `logs/t032/`.
That harness plus the focused appmodel tests provide the two-handle commit-order, stale-snapshot,
busy-timeout-warning, bounded-history, and lazy-prune evidence. The visible signed application
walk supplies the real Wails controls, document identity, tab selection, status, and no-error
observation. The earlier locked-host launch failure remains preserved as historical raw output;
it does not describe the unlocked run.

See the raw command outputs under `logs/t032/`.
