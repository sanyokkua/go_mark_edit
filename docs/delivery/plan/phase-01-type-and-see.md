# Phase 01 — I can type Markdown and watch it render

**Status: done.**

## What you get

Type Markdown on the left, see it rendered on the right, live. Switch between editor-only, split and
preview-only. A status bar shows where the cursor is and how much you have written.

There is one document and it lives in memory — you cannot open or save a file yet. That is Phase 05.

## What was built

- Monaco as the source editor, and a live GFM preview beside it (headings, lists, tables, task lists,
  footnotes, links), sanitized and fully offline.
- Editor / Split / Preview arrangements, switchable from a segmented control and a menu, always
  leaving at least one pane visible.
- A status bar: cursor line and column, word and character counts, current arrangement, and
  placeholder encoding and line-ending values.
- The Go backend as the single owner of the document. The frontend holds a projection: it hydrates
  once with `GetState` and is reconciled by content-free `state:patch` events. Typing goes into Monaco
  immediately and is synced to Go on a debounce, so there is no bridge traffic per keystroke, and the
  backend never echoes text back into the editor you are typing in.
- A stable document-command seam — read content, read selection, replace a range, replace everything —
  so later features can edit the document without reaching into Monaco.
- The i18n catalog with the active-locale → English → key fallback chain.

## Where the details are

- Behaviour: `../spec/product/writing-in-the-editor.md`, `../spec/product/choosing-a-markdown-standard.md`
- State ownership: the Go backend owns the application model and the Redux store is a projection of it
  (`../architecture/rules.md#store-is-a-projection`, `../adr/0014-backend-authoritative-state.md`)
- Command seam: ADR-0017

## Known debt carried forward

Phase 05 will need these, and Phase 01 did not build them because there were no tabs and no saving:

- **Per-document Monaco models.** Phase 01 deliberately built exactly one editor session for one
  document. Several open documents need several models, one visible session, and disposal on close.
- **Flush before switching away.** `flushBuffer` and `flushDocView` exist and are keyed per document,
  but their only caller is editor blur. Nothing yet guarantees the outgoing document's pending edit
  reaches the backend before another document becomes active.
- **A genuinely empty state.** The model assumes one document always exists; see
  `KNOWN_ISSUES.md` §2.

## Done when

Done. Type in the editor, see it render, switch arrangements, watch the counts update.

And the constraints every phase carries: every control is reachable by keyboard alone with a visible
focus ring; the empty state has its exact wording; no user-visible string is hard-coded; watch the
network for five minutes and confirm nothing is sent. All of it in a real build.
