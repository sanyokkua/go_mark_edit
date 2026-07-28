# Exporting a document

## What it's for

A Markdown file is for the person editing it. A PDF is for everybody else — a colleague, a customer,
somebody who does not have a Markdown renderer. HTML is for pasting into a wiki or an email. Export is
where a document stops being a working file and becomes something you send, so the things that matter
are the ones that make a printed document look wrong: a code line cut off at the right margin, a table
losing its header on page two, page one printing and nothing else.

## What you can do

**Export to PDF…** — `Ctrl/Cmd+Shift+E`, or the File menu — renders the current document and opens your
operating system's Save as PDF dialog.

Settings → Export chooses whether the PDF uses the current theme or a clean document style.

To get the Markdown itself somewhere else, save the file or copy from the editor — copying from the
editor gives you the source, exactly as written.

## Rules

### Export covers the current document only {#export-is-one-document}
- Export acts on the active document. There is no export of a folder, a selection or several tabs.

Examples: three tabs open, Export → the active one. · three tabs open with two of them
multi-selected in the tab strip → still the active one, because there is no multi-tab export to
invoke

### Export renders the backend's copy after a flush {#export-flushes-first}
- Export flushes any pending editor sync, then renders the backend's canonical content through the
  standard pipeline.
- An unsaved document can be exported, because export operates on the rendered content rather than on
  the file.

Examples: type, then export immediately → the last word is in the PDF · a never-saved document → exports
fine.

### Export renders into a separate off-screen root {#print-root-is-separate}
- The document is rendered into a dedicated off-screen print root, not into the live preview with the
  chrome hidden by a print media query.

Examples: a long document exported while the preview is scrolled to the middle → the whole document is
in the PDF, from the top · printing the live preview → the preview pane is a scroll container, and
printing a scroll container prints its first page and clips the rest. That is the classic "only page one
came out" bug, and a reviewed reference application ships it.

- Only the rendered document is printed, never the app's chrome.
- Styled-versus-clean becomes a single `data-print-style` attribute on that one root element.

### Export waits for asynchronous content, with a bound on the wait {#export-readiness}
- Export proceeds when all three of these hold:
  1. every Mermaid block has reported success or failure for the current generation;
  2. `document.fonts.ready` has resolved;
  3. every image in the print root has decoded.
- **Each has a timeout, and a timeout proceeds rather than failing.**

Examples: a document with four diagrams → export waits for all four, then prints · a remote image
blocked by policy → it never resolves, the timeout fires, and the export completes without it · no
timeout → the export waits forever for something that will never happen, and the gate is held while it
does.

*Why fonts are on that list:* KaTeX renders with its own fonts, and printing before they load produces
fallback glyphs at the wrong metrics — mathematics that is subtly, unfixably wrong.

### The export handshake never strands the gate {#export-handshake}
- Export acquires the single long-operation gate and drives this sequence: `export:prepare{generation}`
  → the frontend mounts the print root and waits for readiness → `export:ready{generation}` →
  `export:print` → `window.print()` → `afterprint` → `export:done{generation}` → the gate is released.
- **If** the frontend never reports back, **then** a wall-clock timeout releases the gate.
- **If** a reply carries a generation that is not the current one, **then** it is ignored.

Examples: the webview goes away mid-export → the timeout releases the gate and the app is usable again ·
a stale reply from an abandoned export → ignored, so it cannot release the gate for a live one · no
timeout → the application is permanently "busy" and only a restart fixes it.

### The print stylesheet {#print-stylesheet}
- Every rule below exists because its absence is a visible defect in a printed document.

| Rule | Prevents |
|---|---|
| `@page { margin: 18mm 16mm }` | Text running to the paper's edge; it is also the only lever on the print engine's own header and footer |
| `pre, code { white-space: pre-wrap; word-break: break-word; overflow: visible }` | Long code lines being silently cut off — on screen a `pre` scrolls horizontally, on paper the overflow is clipped and the right-hand end of every long line vanishes with no indication |
| `pre, table, blockquote, figure, .gme-mermaid { break-inside: avoid }` | A fenced block split across a page boundary mid-line |
| `h1, h2, h3, h4, h5, h6 { break-after: avoid }` | A heading orphaned at the foot of a page |
| `table thead { display: table-header-group }` | A multi-page table losing its header |
| `print-color-adjust: exact` on code blocks, table headers and blockquotes | Backgrounds being dropped — print engines omit them by default, so a code block's tint disappears and only its border remains |
| `.gme-mermaid svg { max-width: 100%; max-height: 220mm; height: auto }` | A viewBox'd SVG collapsing or overflowing in an unconstrained print context |
| `a[href^="http"]::after { content: " (" attr(href) ")" }`, **Clean only** | A printed link whose destination is unknowable |

Examples: a 200-character line in a code fence → it wraps in the PDF · without the wrap rule → everything
past the right margin is gone, which is the single most common complaint about Markdown-to-PDF and
neither reference application handles it.

### Two PDF styles, and Current theme always prints light {#printing-forces-light}
- **Current theme** exports using the active theme's colours and fonts.
- **Clean document** exports with a neutral print stylesheet: black text on white, print-friendly fonts,
  regardless of the active theme.
- The default is **Current theme**.
- **Current theme always exports on a light background.** The print root is forced to
  `data-mode="light"`, `--blur` becomes `none`, and `--canvas` becomes white. The theme's accent, fonts
  and character survive; only the backdrop is neutralised.
- The choice affects styling only. The content and the scope are identical.

Examples: a Liquid Glass dark document in Current theme → a light page with the Glass accent and radius ·
without the override → a full-page dark gradient behind translucent panels, which comes out as a black
page or as nothing at all depending on the print engine.

### PDF is the only export {#pdf-is-the-only-export}
- Export produces a PDF and nothing else. There is no HTML export, no Markdown export, and no clipboard
  action that produces markup.
- Getting the Markdown somewhere else is what **Save** and **Save As** already do: the file on disk *is*
  the Markdown.

Examples: File → Export → the PDF path and nothing beside it · an `Export as HTML…` menu entry → not
present anywhere in the product.

### Copying is the webview's own behaviour, unmodified {#copying-is-not-implemented}
- Copying from the **editor** puts the raw Markdown source on the clipboard as plain text, because that
  is what the editor contains.
- Copying from the **rendered preview or the reader** does whatever the webview does with rendered
  content — on most platforms that is text with its formatting carried along.
- **The app implements neither.** There is no copy handler, no clipboard transformation, and no setting.

Examples: select `**bold**` in the editor and copy → the clipboard holds `**bold**` · select the same
passage in the preview and paste into a word processor → bold text, because the webview did that ·
a "Copy as HTML" action → not offered, and not needed: the second case already produces it, for free,
by doing nothing.

*Why this is a rule and not silence:* a reader who sees the preview produce styled text on paste will
assume the app implemented it and go looking for the code, or "improve" it. It is worth one paragraph to
say that the correct implementation is none.

### Export shows progress and can be cancelled {#export-progress-and-cancel}
- Export holds the gate, so it shows progress and offers cancel like every other long operation.
- The Export control **becomes Cancel in place** while the export runs.
- **When** cancel is pressed before the print dialog is invoked, the gate is released and nothing is
  written.
- Cancelling is a normal outcome, not an error.

Examples: a large document exporting → the Export button reads Cancel · a cancel control that appears
somewhere else → the control the user pressed is where they will look to un-press it.

### Cancelling the operating system's dialog writes nothing {#os-cancel-writes-nothing}
- **If** the user dismisses the Save as PDF dialog, **then** no file is written and the gate is released.

Examples: dismiss the dialog → back to the editor, no file, the app not busy. · the dialog dismissed
twice in a row → the same outcome both times, with no accumulated busy state and no second gate to
release

## What it looks like

- Settings → Export — `../surface/mockup.html#material-light/settings-export`
- A gated operation with progress and Cancel — `../surface/mockup.html#material-light/busy`
- The File menu, where Export lives — `../surface/mockup.html#material-light/menu-file`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| Export pressed while something else is running | `Something else is running` · `Wait for the current operation to finish, or cancel it.` | Wait, or cancel the other operation |
| The frontend never reports ready | The export times out, the gate is released, and a message says the export did not complete | Try again |
| A diagram in the document fails to render | It exports as its inline error block; the rest of the document exports normally | Fix the diagram and export again |
| Remote content is blocked by policy | It is absent from the export, and the export does not stall | Change the policy if it is wanted |

## Edge cases

**Export while the preview is paused for a large document**
- *Trigger:* a 3 MB document with the preview paused, Export pressed.
- *Expected:* the print root renders the whole document once. The paused preview is unaffected.
- *Avoid:* exporting whatever the paused preview last rendered, which may be an hour of edits behind.

**A document that is 200 pages long**
- *Trigger:* export of a very large document.
- *Expected:* progress is shown, cancel works, and the readiness timeouts still apply per item.
- *Avoid:* an unbounded wait with no feedback, which is indistinguishable from a hang.

**A second export is started while one is running**
- *Trigger:* `Ctrl/Cmd+Shift+E` twice.
- *Expected:* the second is refused immediately with the busy message.
- *Avoid:* two print roots mounted at once, both racing to call the print dialog.

**The theme is changed during an export**
- *Trigger:* the operating system flips to dark while an export is preparing.
- *Expected:* the print root is already forced to light, so the output is unaffected.
- *Avoid:* the export picking up the new appearance halfway and producing a half-dark document.

**A table that spans four pages**
- *Trigger:* a long table exported to PDF.
- *Expected:* the header row repeats on every page.
- *Avoid:* pages two to four with no header, so the columns are unidentifiable.

## Not this

- **No paginated layout controls in v1.** No page-size picker, no margins control, no headers or footers
  beyond what the print engine provides. The print path is the webview's, and it does not offer them.
- **No folder or batch export.** Each export holds the single long-operation gate and opens a platform
  save dialog, neither of which composes into a batch without a queue and a progress model nobody has
  specified.
- **No HTML export, and no Copy as HTML.** The two things people want HTML for are already covered: a
  PDF to send someone, and copying from the preview, which the webview already turns into styled text
  without the app doing anything. An export path we own is a second sanitising surface, a second image
  story and a second settings row, for output that arrives free.
- **No Markdown export.** The document on disk is Markdown. Save is the export.
- **No export of the app's chrome.** Only the rendered document is printed.
- **No dark PDFs.** A dark page prints as either solid black or nothing at all depending on the
  platform's print engine, and the user finds out after it is on paper.

## Decisions

- *2026-07-25* — Export renders into a separate off-screen root rather than printing the live preview
  with the chrome hidden, because printing a scroll container clips everything after page one.
- *2026-07-25* — Readiness has three specific conditions, each with a timeout that proceeds rather than
  fails, so blocked remote content cannot stall an export indefinitely.
- *2026-07-25* — The export handshake carries a generation and a wall-clock timeout so the gate can never
  be stranded. Recorded in `../../adr/0032-run-registry-and-shutdown-ordering.md`.
- *2026-07-28* — HTML export and Copy as HTML were removed. They had entered the specification during an
  earlier migration and were never a decision: the app exports a PDF, saves Markdown, and leaves copying
  to the webview. Copying from the preview already yields styled text on every platform, so the feature
  was paying for output the platform gives away.
- *2026-07-28* — Phase 10 owns `printing-forces-light`. Phase 02 supplies the theme tokens, but the
  Current-theme and Clean behavior is implemented and proven only through the real PDF export entry
  point.

## Open questions
