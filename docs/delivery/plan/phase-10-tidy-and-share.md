# Phase 10 — My Markdown stays tidy, and I can share it as a PDF

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
   meaning exactly; both are one undo step. Add all three buttons to the Phase 04 toolbar and their
   bindings (`Alt+Shift+F`, `Alt+Shift+C`, `Alt+Shift+L`) to the Phase 04 registry — the toolbar was
   built without them because they did not exist yet. Compact previously had no button, no binding and
   no menu item in three documents that all required it.
2. **The diff view.** A standalone, themed, keyboard-navigable diff, reused three times — by
   **Preview changes** below, by the external-change prompt (the external-change prompt), and by the assistant in
   Phase 12. Build it as a standalone component taking a before string and an after string now, with both
callers in mind. Monaco's `DiffEditor` is already in the bundle and costs nothing
   extra.

   **Format applies directly; it does not open a diff first.** `../spec/product/tidying-markdown.md` says
   Format mutates the buffer as one undo step, and a modal on every save would destroy the cursor
   preservation that a single undo step requires. Undo is the review mechanism, because Format is exactly one
   undo step by construction.

   The diff is reachable **on demand** — a *Preview changes* item beside Format — for the case where a
   user wants to look before committing to a large reformat. Never automatically, and never on save.
3. **Lint.** Run consistency rules over the document, show findings as squiggles at the right
   positions in the editor, and put a problems count in the status bar. Clicking a finding jumps to it.
4. **On demand and on save.** Format-on-save and lint-on-save as settings, running before the write so
   what lands on disk is what you were shown. Defaults: format-on-save **off**, lint-on-save **on**.
   **Neither runs on autosave**  — autosave is on by default and debounced, so formatting on it
   would reflow the document under the cursor several times a minute.
5. **Export to PDF.** Export what is rendered, in two flavours: Current theme, and Clean — a neutral
   print stylesheet. This phase owns the `printing-forces-light` behaviour: Current theme keeps the
   selected theme but forces its light appearance, while Clean prints a neutral white document. Go
   drives it; the webview prints. A cancelled print is not an error.

## Where the details are

- Behaviour: `../spec/product/tidying-markdown.md`, `../spec/product/exporting-a-document.md`; the
  print-theme rule is `../spec/product/exporting-a-document.md#printing-forces-light`
- The gate: `../architecture/rules.md#one-long-operation-at-a-time`, and `internal/gate/`, which has
  existed unused since Phase 00. This phase or Phase 11 is its first consumer, whichever you build
  first — the gate is shared, so neither may assume it owns it
- Print styling: `ui/styles/` print stylesheet
- Decisions: Format serialises through `remark-stringify` with canonical `-`, `_` and `#`
  (`../adr/0031-format-via-remark-stringify.md`); the PDF path is the webview's print
  (`../adr/0003-rendering-format-pdf.md`), with a Current-theme or Clean-document styling setting

## Questions to settle first

Print ownership was settled on 2026-07-28: Phase 10, not Phase 02, owns
`printing-forces-light`; Phase 02 supplies only the reusable theme tokens.

- **Who holds the gate during a Format, and who releases it if the frontend dies mid-operation?** —
  *Settled 2026-07-25 by `../adr/0032-run-registry-and-shutdown-ordering.md`, recorded 2026-07-28.*
  **Go holds it.** Every long-running operation derives its context from the `OnStartup` context,
  registers its cancel function in a mutex-guarded run registry owned by the composition root, and
  `defer`s both the `delete` and the `cancel` on exit — so the release is crash-safe by construction
  rather than by protocol. One bound `CancelRun(runId)` serves every feature, and cancelling an
  unknown or already-finished id is a **success no-op**. On quit, `OnBeforeClose` cancels every
  in-flight run through the registry and releases the gate before anything is flushed or closed.
- **The exact print handshake.** Go orchestrates, the frontend renders and calls print, and nothing
  specifies the message sequence, the readiness signal, the timeout, what a native cancel looks like,
  or which side releases the gate. Decide before step 5.
- **Stale async renders during export.** Same generation-token rule Phase 06 settled for Mermaid and
  KaTeX; reuse it rather than inventing a second one.

## Done when

Take a badly formatted document — mixed bullet markers, inconsistent emphasis, five blank lines in a
row — run Format, review the diff, accept it, and get consistent Markdown in one undo step. Run Lint
and see squiggles where the problems are and a count in the status bar; click one and land on it. Turn
format-on-save on and watch a save tidy the file. Export the document to PDF in both stylings and open
both in a PDF reader: Current theme uses the selected theme in its forced light appearance, while Clean
uses the neutral white stylesheet. Cancel a print and get no error.

And the constraints every phase carries: start a format on a large document and confirm the Format
button itself becomes Cancel, then cancel it and confirm the report names what completed rather than a
loop index; produce more than 1,000 lint findings and confirm the count stays true while only the first
thousand are decorated; the problems list and the diff view are reachable by keyboard alone with a
visible focus ring and work in three themes across light and dark; every new string goes through `t()`;
watch the network for five minutes and confirm nothing is sent, including during an export. All of it
in a real build.
