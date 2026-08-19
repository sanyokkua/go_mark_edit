# A document at exactly the live-preview limit wedges the whole interface

**Found:** 2026-08-19, during T181's host walk. **Severity:** the application becomes
permanently unusable and the user cannot save, close a tab, or open a menu.
**Build:** `just build` at commit `bcf0b548`, binary mtime `09:00:31`, process started
`09:01:24` — stale-instance guard recorded.

## What happens

Open a Markdown document of **exactly 2,097,152 bytes** (2 MiB). The document loads and the
live preview renders it. From that moment the entire interface stops accepting input:

- the tab strip does not switch tabs when clicked (the click focuses the tab button — the
  focus ring moves — but the tab does not activate);
- the **File** and **View** menus do not open when clicked;
- the editor takes no keystrokes: `Ln 1, Col 1` is unchanged after clicking into the text,
  pressing Down and Right, and typing three characters, and the document's word count and
  `Saved` state never move.

The window continues to **paint** — the newly opened document did eventually appear, about
70 seconds after the open — which is what makes the state so easy to misread. It looks like
a slow but live application. It is not: nothing that requires the main thread to run script
will ever complete.

`com.apple.WebKit.WebContent` sits at **100% CPU, state `Rs`, 662 MB RSS**, with
`DispatchQueue_1: com.apple.main-thread` saturated and JavaScriptCore heap-helper threads
running. The Go process is idle at **0.2%**. It had not recovered five and a half minutes
after the open, when the instance was killed.

**Checking the Go process is what hides this.** A wedge in the webview leaves the Go side
looking perfectly healthy, so "the app is not spinning" is true and irrelevant. Sample the
`WebContent` XPC process, not the binary.

## The cause is the live preview, demonstrated by a one-byte control

`PreviewPane.tsx:7` sets `PREVIEW_BYTE_LIMIT = 2_097_152` and the guard at `:28` and `:52`
is `byteLength <= PREVIEW_BYTE_LIMIT` — **inclusive**. So a document of exactly the limit is
the largest one the live preview will render, and it renders it.

The control is decisive. The same file plus **one byte** (2,097,153) opens with

> Live preview is paused — this document is over 2 MB.

and a `Refresh preview` button; the application stays fully responsive, the caret moves on
click (`Ln 4, Col 22`), typing lands, and autosave writes normally. The entire T181 large-
document measurement was taken on that file.

One byte either side of the boundary is the difference between a usable application and a
dead one, so the cause is the preview render, not the editor and not document size as such.

## Why no test caught it

- `PreviewPane.test.tsx` exercises the limit against `byteLength` as a **number**. It never
  renders 2 MiB of Markdown, so it cannot observe the cost of doing so.
- Playwright runs the mock bridge and no e2e fixture approaches the limit.
- The boundary fixtures that do exist (`boundary-10mib-*`, `boundary-50mib-*`) are about
  FR-FT-016's open/read-only thresholds, and both are **above** the preview limit — so every
  one of them opens with the preview already paused. The one size that hurts is the one no
  fixture uses.

## What is not yet known

- **Whether it is a hang or merely very slow.** Five and a half minutes with no progress is
  enough to call it unusable, and enough to file, but it was not left overnight.
- **Where the boundary of the pathology is.** Only 2,097,152 was tried. The document is
  304,765 words of `lorem ipsum` in ~28,000-character lines; line length and structure may
  matter as much as byte count, and a 1 MiB document was not tried.
- **Whether an exclusive threshold would be enough**, or whether the limit is simply set too
  high for the renderer. Making the guard exclusive would move the cliff by one byte, not
  remove it — a document of 2,097,151 bytes is not meaningfully cheaper to render.

Filed rather than fixed: the fix is a requirement question (what the preview limit should
be, and whether the pause must be based on something other than byte count), and this walk's
scope was T181's latency.
