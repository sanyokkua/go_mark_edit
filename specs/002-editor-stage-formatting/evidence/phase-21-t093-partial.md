# Phase 21 T093 partial real-control evidence

Captured 2026-08-06 on the current macOS arm64 host. This record is partial:
T093 remains unchecked. It does not substitute mock-bridge browser coverage for the
required real Wails and packaged-app control walks.

## Real Wails development bridge

`just dev` started the real Wails development bridge at
`http://localhost:34115` (with the frontend watcher at `http://localhost:5173`).
The desktop accessibility controller observed an ordinary native GoMarkEdit window
whose webview URL was `wails://wails.localhost:34115/`.

At the controller's 1225 by 768 desktop capture, the following were operated through
the real window (not synthetic DOM events):

- File opened its complete deferred inventory, including disabled Open Recent; View
  opened the functional Editor/Split/Preview, Sidebar, line-number, word-wrap, and
  full-screen controls alongside disabled Toggle Assistant and Distraction-free
  reading.
- Settings selected Liquid Glass and both Light and Dark appearance modes. The
  resulting real Glass-Dark surface retained the correct menu row, tab fixtures,
  grouped toolbar, Split arrangement, enabled Sidebar, and disabled Assistant.
- The real Monaco editor received `T093 live formatting`; native Cmd+A followed by
  toolbar Bold produced `**T093 live formatting**`; native Cmd+Z restored the exact
  original source in one undo step. The preview rendered the unmarked text.
- A real right-click opened the approved ten-entry editor context menu: Cut, Copy,
  Paste, Paste as plain text, Bold, Italic, Link, disabled Format document, disabled
  Compact, and disabled Command palette.

`t093-live-wails-glass-dark.jpeg` is the fresh real-window capture. The desktop
controller rejected its native-window resize drag with `noWindowsAvailable` before
dispatch, so this run does **not** claim fresh real-window 768/375 observations,
native movement/resizing/zoom/fullscreen/close, focus-restoration coordinates,
tab-strip scroll widths, or local-only network observations.

## Fresh package attempt

An unchanged `just build` completed successfully for `darwin/arm64` and reported a
self-signed bundle at
`build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`. An immediate inspection found
that exact file present as a 16,250,208-byte arm64 Mach-O executable. `open -n
build/bin/GoMarkEdit.app` reported the app running, but the desktop accessibility
controller timed out while attaching to it. The required packaged-app interactions
therefore remain unobserved and are not claimed.

No broad browser gate was rerun. The historical Phase 16--20 records remain
unchanged, no product or test source was modified, and this partial record must be
completed by a successful real Wails and packaged-app walk before T093 can be marked
complete.
