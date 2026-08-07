# Phase 21 T093 real-control follow-up

Captured 2026-08-06 on the current macOS arm64 host. This is append-only fresh
evidence. No product, test, gate, task, or prior evidence file was changed.

## Real Wails development bridge

The unchanged `just dev` recipe was rerun with host access after the sandbox
could not read the existing Go build cache. It served the Wails development
window at `wails://wails.localhost:34115/`, with the frontend watcher at
`http://localhost:5173/`.

Through the native GoMarkEdit window, the following fresh controls were
operated:

- The editor received `T093 native proof`, native Cmd+A selected it, Bold
  produced `**T093 native proof**`, and native Cmd+Z restored the exact source
  in one step.
- A native right-click opened exactly: Cut, Copy, Paste, Paste as plain text,
  Bold, Italic, Link, disabled Format document, disabled Compact, and disabled
  Command palette.
- The native accessibility state continued to show disabled Image, Format,
  Compact, Lint, and Toggle Assistant; no deferred control reported success.

Fresh native-window capture: `phase-21-t093-real-wails-native-final.jpeg`.

## Responsive local-bridge measurements

The same real development bridge was inspected at all required widths through
the controlled local page. Every row below represents all six combinations:
Liquid Glass/Material/Minimal × Light/Dark.

| Width | Page client/scroll width | Tab client/scroll width | Glass Light blur | Glass Dark blur | Material/Minimal blur |
|---:|---:|---:|---|---|---|
| 1280 | 1280 / 1280 | 988 / 988 | `blur(28px) saturate(1.5)` | `blur(28px) saturate(1.6)` | none |
| 768 | 768 / 768 | 698 / 698 | `blur(28px) saturate(1.5)` | `blur(28px) saturate(1.6)` | none |
| 375 | 375 / 375 | 351 / 512, contained `overflow-x:auto` | `blur(28px) saturate(1.5)` | `blur(28px) saturate(1.6)` | none |

Fresh measured popup rectangles remained within their viewport:

- 1280: File `(36,50) 160×398`; Settings `(8,54) 480×656`; View
  `(198,46) 116.77×417`; About `(273,50) 160×202.5`; editor context
  `(526,226) 224×372`.
- 768: File `(36,50) 160×398`; Settings `(8,54) 480×656`; View
  `(198,46) 116.77×417`; About `(273,50) 160×202.5`; editor context
  `(233,226) 224×372`.
- 375: File `(12,45.5) 206.94×454.5`; Settings `(8,53.5) 367×656`; View
  `(13,47) 116.77×417`; About `(12,45.5) 194.54×144`.

## Local-only request observation

The browser evaluator exposed no `performance` object, so no
`PerformanceResourceTiming` claim is made. Instead, read-only socket tables
were captured for the running real Wails process (PID 15909) before and after
the fresh journey. Both showed only loopback endpoints: the Wails listener and
connections at `127.0.0.1:34115`, plus frontend watcher connections at
`127.0.0.1:5173`. No non-loopback or external endpoint appeared. This is
process-level local-socket evidence, not browser ResourceTiming instrumentation.

## Native movement/resize status

The native zoom secondary action, titlebar drag, right-edge drag, and bottom-
right corner drag were attempted on the real Wails window. The attempts did
not produce an authoritative bounds change. The corner/edge retries also
returned the Computer Use `windowNotFoundAtPosition` error for the requested
screen coordinate. Therefore native movement and manual resize remain
unverified; this record does not promote them to a pass.

## T093 verdict

**Not complete.** Fresh native formatting/context/deferred-control evidence,
responsive measurements, and process-level loopback-only socket observations
are retained. T093 remains unchecked because current-host native movement and
manual resize still lack authoritative observed bounds changes. The existing
packaged-app and Phase 16–20 records remain unchanged.
