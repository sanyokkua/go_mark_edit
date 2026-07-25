# Phase 08 — My Markdown stays tidy, and I can share it as a PDF

## What you get

Reformat a messy document into a consistent style with one command, or strip the extra blank lines out
of it. A linter points out inconsistencies with squiggles in the editor and a count in the status bar.
And you can export what you are looking at as a PDF.

## Why these two together

Both are long operations over a snapshot of the document, both need the process-wide gate so two of
them cannot run at once, and both need the diff view to show you what changed before you accept it.
Splitting them meant building the same machinery twice.

## Build it in this order

1. **Format and Compact.** Format rewrites the document into the canonical style — consistent bullet
   markers, emphasis markers, heading style. Compact removes redundant blank lines. Both preserve
   meaning exactly; both are one undo step. Add their buttons to the Phase 03 toolbar and their
   bindings (`Alt+Shift+F`, `Alt+Shift+L`) to the Phase 03 registry — the toolbar was built without
   them because they did not exist yet.
2. **The diff view.** Before a format is applied, show what will change. This component is reused by
   the assistant in Phase 10, so build it properly now — side-by-side or unified, keyboard navigable,
   themed.
3. **Lint.** Run consistency rules over the document, show findings as squiggles at the right
   positions in the editor, and put a problems count in the status bar. Clicking a finding jumps to it.
4. **On demand and on save.** Format-on-save and lint-on-save as settings, off by default, running
   before the write so what lands on disk is what you were shown.
5. **Export to PDF.** Export what is rendered, in two flavours: Current theme, and Clean — a neutral
   print stylesheet. Go drives it; the webview prints. A cancelled print is not an error.

## Where the details are

- Behaviour: `01_Product/06_FORMAT_AND_LINT.md`, `01_Product/07_PDF_EXPORT.md`
- The gate: `02_Architecture/07_LARGE_FILES_AND_CONCURRENCY.md#gate`, and `internal/gate/`, which has
  existed unused since Phase 00. This phase or Phase 09 is its first consumer, whichever you build
  first — the gate is shared, so neither may assume it owns it
- Print styling: `ui/styles/` print stylesheet
- Decisions: DD-16, DD-17, DD-18 (canonical style and lint rules), DD-23 (webview print), DD-24 (PDF
  styling setting)

## Questions to settle first

- **Who holds the gate during a Format, and who releases it if the frontend dies mid-operation?**
  Format is specified as a frontend operation, while a large format-all is required to take the Go
  process-wide gate — and no bound method, ownership boundary or cancellation path connects the two.
  Decide the acquire/release protocol, including crash-safe release, before step 1.
- **The exact print handshake.** Go orchestrates, the frontend renders and calls print, and nothing
  specifies the message sequence, the readiness signal, the timeout, what a native cancel looks like,
  or which side releases the gate. Decide before step 5.
- **Stale async renders during export.** Same generation-token rule Phase 05 settled for Mermaid and
  KaTeX; reuse it rather than inventing a second one.

## Done when

Take a badly formatted document — mixed bullet markers, inconsistent emphasis, five blank lines in a
row — run Format, review the diff, accept it, and get consistent Markdown in one undo step. Run Lint
and see squiggles where the problems are and a count in the status bar; click one and land on it. Turn
format-on-save on and watch a save tidy the file. Export the document to PDF in both stylings and open
both in a PDF reader. Cancel a print and get no error.
