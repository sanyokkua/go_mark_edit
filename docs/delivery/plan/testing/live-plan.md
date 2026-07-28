# Live testing plan

**Version:** 1.0 · **Last updated:** 2026-07-25 · **Covers phases:** 00–03

Things to check by using the application, because no mocked bridge can produce them. Written in the
same voice as the phase documents: what to do, and what you should see. Read `README.md` first for the
three rules and for what does *not* belong here.

Each phase adds a section as it ships. Phases 04 onward are listed with their headings only, so it is
obvious what is not yet covered rather than looking complete.

## Before you start

- Build the real artifact — `just build` — not `wails dev`. Several of these are only observable in a
  packaged build: the production log level, window geometry restored before the window appears, and the
  `-Dev` folder split.
- Know where the app keeps things: the configuration folder, `gomarkedit.db`, and the log folder. The
  Diagnostics settings group shows all three.
- Open the database **read-only** when you inspect it. A second writer is a different test.
- Record the commit you are testing. A report that does not name one cannot be compared to anything.

## P0 — It starts, and it survives being started oddly

| # | Do this | Expect |
|---|---|---|
| P0-1 | Launch the built app on a machine that has never run it | Opens at a sensible default size, in the default theme, with the launcher screen. No error, no flash of an unstyled window. |
| P0-2 | Quit and relaunch | Same window size and position, same sidebar state, no flash of a default layout first. |
| P0-3 | Launch **two** instances (`open -n` on macOS, or run the binary twice — a Finder double-click is coalesced and tests the wrong path) | Both open. Neither reports the other. Both are usable. |
| P0-4 | With both open, change the theme in instance A | A changes. **B does not** until relaunched. This is expected (`../../spec/product/settings.md#no-cross-window-invalidation`) — confirm it rather than filing it. |
| P0-5 | Quit A, then quit B | Both exit cleanly. Relaunch: the layout is whichever instance changed it last, not whichever quit last. |
| P0-6 | Make the log directory read-only, then launch | **The editor opens.** Logging degrades to console-only. It must not exit before showing a window. |
| P0-7 | Corrupt `gomarkedit.db` (write junk into it), then launch | The app opens with defaults **and tells you** preferences were reset and where the old file was preserved. A `.corrupt-*` file is beside the original. |
| P0-8 | Replace the database with one whose schema version is higher than this build's | A clear message saying it was created by a newer version. The file is **not** modified or replaced. |

## P1 — It looks right

| # | Do this | Expect |
|---|---|---|
| P1-1 | Cycle all three themes × light and dark | Every region changes. No element keeps a colour from the previous palette. No flash. |
| P1-2 | In split view, with a fenced Go block open | The code is the **same colours** on the left and the right. More than one colour — a monochrome block is a failure, and it is the failure both reference applications shipped. |
| P1-3 | Set appearance to Auto, then flip the OS between light and dark | The app follows, live, without a restart. Every open Mermaid diagram re-renders in the new palette rather than staying behind. |
| P1-4 | Select text in the editor and in the preview | The selection uses the theme's colour, not the OS default blue. |
| P1-5 | Tab through the interface | Every focused control shows a visible focus ring in every palette. |
| P1-6 | Scroll any pane | The scrollbar belongs to the theme. |
| P1-7 | Check the fonts on a machine **without** Roboto or Inter installed | Material and Minimal still look different from each other. If they do not, the fonts are not bundled. |

## P2 — The window is a real window

| # | Do this | Expect |
|---|---|---|
| P2-1 | **On macOS:** select text and press Cmd+C, then Cmd+V | It copies and pastes. Then Cmd+Z. Then Cmd+Q. All four work. Without a native menu none of them do, and this is invisible in `wails dev` if another app has put an Edit menu up. |
| P2-2 | Drag the window by its title bar; double-click the title bar | Moves; zooms. |
| P2-3 | Drag the sidebar edge and the editor/preview divider | Both resize. Neither pane can be dragged to unusable. Esc during a drag cancels it. |
| P2-4 | Quit and relaunch | Both widths and the split ratio are as you left them. |
| P2-5 | Resize the window to roughly 375 px wide | Nothing is clipped. The toolbar overflows into a menu rather than growing taller. Status-bar items drop in the specified order, and Problems and Reading are still there. |
| P2-6 | Trigger the same error five times quickly | **One** message with a count, not five stacked messages. |
| P2-7 | Type continuously for a minute with autosave on | **No toasts.** The status bar is the only thing that changes. |

## P3 — Files are real files

*Added when Phase 05 ships.* Bytes on disk, encodings, line endings, the atomic write, file permissions
after a save, the same file open in two instances, the quit prompt with dirty documents, and Cancel
being a genuine no-op.

## P4 — A folder of notes

*Added when Phase 07 ships.* Large-folder enumeration and its guard, permission-denied subfolders,
symlink cycles, creating a file and a folder, and the tree after an external change with no watcher.

## P5 — Rendering and safety

*Added when Phase 06 ships.* The adversarial sanitization corpus against a real webview, local and
remote images, and the network showing nothing except a remote image you explicitly allowed.

## P6 — Export

*Added when Phase 10 ships.* The print dialog on each platform, a dark theme exported legibly, long code
lines wrapped rather than clipped, a multi-page table keeping its header, and cancelling the print
dialog claiming nothing was written.

## P7 — Packaging

*Added when Phase 08 ships.* Double-clicking a `.md` from the file manager, the file-association icon,
the unzipped macOS `.app` still being executable, and the reported version matching the tag.

## P8 — The provider

*Added when Phase 11 ships.* Real Ollama and LM Studio: model discovery, cold-start latency on the first
inference, the four verification checks, and the env-var value appearing in **no** database row, log
line, error message or event. Fault injection via `tools/fault_proxy.py` for the four failures a local
provider cannot produce on demand — 401, 429 with `Retry-After`, 500, and an empty completion — with
the requirement that each produces a **different, actionable** message rather than one generic failure.

## P9 — The assistant

*Added when Phases 12–13 ship.* Cancellation mid-inference, the cancel-versus-completion race producing
exactly one outcome, a second run while busy, a proposal against a document edited since, the iteration
and wall-clock limits, and — the one most likely to be skipped — **the whole loop against a model with
no tool-call support**, confirming it degrades to single-shot rather than producing a retry storm.

Models are named by **size class** (small ≈ 2–3B, mid ≈ 4B, large or MoE), not by name: local model
catalogues rotate too fast to pin, and pinning them makes the plan stale rather than precise. Each report
records which model actually filled each role.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-07-25 | Created. P0–P2 written against phases 00–03; P3–P9 stubbed with their headings so the gaps are visible. |
