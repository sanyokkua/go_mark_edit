# Host screenshots — current-host walkthrough, 2026-08-15

Five captures of the **packaged `build/bin/GoMarkEdit.app`** on the current host. These are the
first host screenshots in the Feature 003 evidence tree; before this, every PNG under `evidence/`
was a browser parity triplet, which is what T100 recorded as missing.

**Classification.** T037 requires host media to be classified separately from browser parity
output. These three are **native-host captures**: the packaged Wails webview on macOS, captured by
window ID so nothing else on the desktop is included. They are _not_ parity references, they are
_not_ compared to the binding mockup, and no comparator reads them. They exist to show that a
named behaviour was observed on the real binary.

| File                                            | What it shows                                                                                                                                                                   | What it settles                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-startup-after-forty-documents.png`          | Startup immediately after a session that had 40 documents open: **one** Untitled tab, Split arrangement, `Autosave off`.                                                        | FR-FT-049 adds no session restore — 40 documents do not come back. CL-18's "ordinary startup unchanged" on the real binary, not just the mock. Settings persist (Autosave off, Split) while the document set does not, which is the correct split.                                                                               |
| `02-new-refused-at-forty-documents.png`         | The 41st `File ▸ New File` at capacity: toast titled `Untitled`, message **"The window already contains 40 documents."**, single `Dismiss` control.                             | FR-FT-004's 40-document cap **at the interface, on the real binary**. The classified-error table's `capacity-limit` row — "message-only, naming the limit" — with the remediation rendered as dismissal only.                                                                                                                    |
| `03-open-refused-over-50-mib.png`               | Opening the 52,428,801-byte fixture: toast titled `boundary-50mib-plus-one.md`, message **"The document exceeds the 50 MiB limit."**, single `Dismiss` control.                 | FR-FT-005's requirement that the over-50-MiB refusal carry "a message naming the 50 MiB limit". This is the observation the 2026-08-15 boundaries walk recorded as **F-1, unconfirmed** — it was a defect, fixed by T107, and this is the fix on the real binary.                                                                |
| `t113-details-open-10mib-2026-08-15.png`        | The `Document details` disclosure **open** on the 10,485,761-byte fixture, reading `UTF-8` `LF` `Read-only` `Autosave off` and **`Read-only · over the 10 MiB editing limit`**. | **T113 and T108 together.** The panel used to render, sit in the accessibility tree, and paint nothing — clipped by the status row's own `overflow: hidden`. This is the fixed panel on the real binary, and it is the only surface on which FR-FT-005's "visible reason" is visible. See `../details-disclosure-2026-08-15.md`. |
| `t113-details-open-new-document-2026-08-15.png` | The same disclosure open on a fresh `⌘N` `Untitled`: `UTF-8` `LF` `Not saved` `Autosave off`, and no read-only line.                                                            | T113's defect was "for every document", so the fix has to be too. Also shows the reason is _not_ drawn for a writable document, which is the negative half of T108's contract.                                                                                                                                                   |

Both refusal captures also demonstrate the safe-subject rule: the title is the basename
(`boundary-50mib-plus-one.md`) or `Untitled`, never a full path, never raw OS error text.

## Capture method, and why it is stated

`screencapture -x -o -l <windowID>`, where the window ID comes from
`CGWindowListCopyWindowInfo` filtered to the GoMarkEdit process. Window-ID capture returns only
that window's surface regardless of what overlaps it on screen.

That detail matters because the first attempt used a screen-rectangle capture
(`screencapture -R`), which included an unrelated window that happened to overlap the app. Those
files were discarded rather than committed. A host screenshot has to contain the host application
and nothing else, or it is not evidence about the application.

## What these do not show

- No timing. SC-FT-002's figures come from the harness in
  `../sc-ft-002/explicit-save-timings-2026-08-15.md`, not from a screenshot.
- No document count. The application still surfaces no document total anywhere, and the tab strip
  scrolls without one — the limitation `../sc-ft-002/boundaries-2026-08-15.md` recorded. What
  changed is that the refusal is now _observable_, so the cap can be demonstrated without counting.
- No parity claim. Nothing here is measured against the binding mockup.
