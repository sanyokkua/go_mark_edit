**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/02_BACKEND_GO.md`, `02_Architecture/03_FRONTEND_REACT.md`, `01_Product/05_RENDERING_AND_EXTENSIONS.md`, `03_NonFunctional/02_PERFORMANCE.md`, `08_Decisions/ADR-0002`

# Large Files and Concurrency

How GoMarkEdit stays responsive on big documents and how it serializes the few operations that must not
overlap. The editor engine is robust; the live preview and long batch operations are the risks this
document constrains (DD-20).

## Table of Contents

1. Large-file strategy
2. Preview debounce
3. Gate
4. Events: progress

## Large-file strategy

Monaco is the editor engine for v1 precisely because it handles large files well — virtualized
rendering, incremental tokenization, and a model that does not re-layout the whole buffer on every
keystroke (DD-20; ADR-0002). Editing itself therefore scales; the **preview** is the cost center,
because re-parsing and re-rendering the full Markdown AST on every keystroke is O(document) work on the
UI thread.

Mitigations, in order of effect:

1. **Never render on the keystroke** — the preview updates from a debounced snapshot (`#preview-debounce`).
2. **Pause live preview for very large files** — a setting (`editor.pauseLivePreview`) stops automatic
   preview updates above a size threshold, leaving a manual "refresh preview" action (DD-20).
3. **Reading mode renders once** — the Viewer renders a static snapshot with no editor attached, so
   large read-only documents cost one render, not a stream.

CodeMirror 6 is a documented future option if Monaco's bundle/memory footprint becomes the dominant
constraint; the `CodeEditor` component boundary keeps that swap local (`03_FRONTEND_REACT.md`
`#components`).

**Memory ownership.** Document content is owned by the Go model (`internal/appmodel`), not the webview
(DD-62/DD-63; `02_BACKEND_GO.md#application-model`). Only the **visible** document's Monaco model is
resident in the webview; inactive tabs cost no webview memory (their content lives in Go), so opening many
large documents scales with Go's memory management rather than the webview's. The active buffer is
debounce-synced to the model (DD-64), so a large document is not re-serialized across the bridge on every
keystroke.

## Preview debounce

Preview rendering is driven by a debounced editor snapshot, not the raw `onChange` stream. The
debounced snapshot is the same text pushed to the backend model (`UpdateBuffer`, DD-64), so the
preview and the authoritative buffer always agree — neither is ever fed on the raw keystroke stream:

```ts
const scheduleSync = useDebouncedCallback((tabId: string, markdown: string) => {
    appModelAdapter.updateBuffer(tabId, markdown); // sync the authoritative model (DD-64)
    dispatch(setPreviewSource(markdown));          // MarkdownView re-renders from the same snapshot
}, DEBOUNCE_MS);
```

The debounce interval and the "pause above N" threshold are performance targets defined in
`03_NonFunctional/02_PERFORMANCE.md`. When paused (large file or setting), the preview shows the last
rendered snapshot plus an explicit refresh control. Mermaid/KaTeX rendering inside the preview is
already async (`MermaidBlock`), so a heavy diagram never blocks the initial text paint. Debounce and
sanitization details are specified normatively in `01_Product/05_RENDERING_AND_EXTENSIONS.md`
`#preview-debounce`.

## Gate

Some operations are exclusive and potentially slow — **PDF export** and **format-all** — and must not
overlap themselves or each other. `internal/gate` is a process-wide, non-blocking, single-slot
semaphore:

```go
type Gate struct{ ch chan struct{} }
func New() *Gate                 { return &Gate{ch: make(chan struct{}, 1)} }
func (g *Gate) TryAcquire() bool { select { case g.ch <- struct{}{}: return true; default: return false } }
func (g *Gate) Release()         { select { case <-g.ch: default: } }
```

An exclusive handler does `if !gate.TryAcquire() { return apperr.Busy() }` and `defer gate.Release()`.
When the gate is held, the second attempt returns `CodeBusy` and the UI shows a "please wait" toast
rather than launching a concurrent run (`06_ERROR_HANDLING.md` `#toasts`). The gate is process-wide, not
per-document, so at most one export/format-all runs per instance at a time. The assistant LLM assistant
reuses this same `internal/gate`, so an LLM run, a PDF export, and a format-all are mutually exclusive
app-wide — at most one of the three is ever in flight per instance (DD-47;
`08_LLM_INTEGRATION.md` `#gate-and-cancellation`).

## Events: progress

Long operations report progress through **Wails events**, not through an incrementally-filled return
value — the bound method still returns a single terminal `*Result`. Progress and completion are emitted
as paired `*:progress` / `*:done` events:

```go
runtime.EventsEmit(ctx, "export:progress", ExportProgress{Phase: "rendering", Percent: 40})
runtime.EventsEmit(ctx, "export:done", ExportProgress{Phase: "done", Percent: 100})
```

```ts
// logic/adapter subscribes and dispatches into the store:
runtime.EventsOn('export:progress', (p: ExportProgress) => store.dispatch(setExportProgress(p)));
```

The adapter is the only place that subscribes to Wails events (`03_FRONTEND_REACT.md`
`#adapter-layer`), dispatching each into the relevant slice so widgets render progress reactively.
Events are one-way, best-effort UI signals; the authoritative success/failure is always the terminal
`*Result` returned by the bound method. The application model's `state:patch` events
(`02_BACKEND_GO.md` `#application-model`) ride this same emit/subscribe channel but are the normative
sync path for the store projection (DD-63); if the projection ever needs to recover it re-hydrates
with `GetState` — the Go model remains authoritative either way. On `OnShutdown`, any in-flight gated
op is cancelled and its gate released.
