# Architecture at a glance

GoMarkEdit is one desktop binary: a Go process that opens a native webview and serves a React
application embedded in the binary. There is no server, no daemon, and no second process. Wails v2
carries method calls and events between the two halves.

```
                       main.go — wails.Run, Bind, EnumBind, embed frontend/dist
                                            │
   Go process          internal/…/handler.go       returns apperr.*Result · no context.Context
                                            │
                       internal/…/service.go       (T, error) · ctx is the first parameter
                                            │
                       internal/db · internal/file · OS dialogs
                                            │
                       internal/apperr · logging · bootstrap · gate     (bottom of the graph)

   ── Wails bridge ──  generated bindings in frontend/wailsjs/ · runtime events

   Webview             frontend/src/logic/adapter/     the only importer of wailsjs/
                                            │
                       frontend/src/logic/store/       Redux — a projection, not a source of truth
                                            │
                       frontend/src/ui/widgets → ui/components → ui/primitives → ui/styles
```

**The Go backend owns the application model.** `internal/appmodel` holds the open documents and their
canonical text, the tab set, the workspace reference and the layout state. The Redux store is hydrated
once from `GetState()` and thereafter only applies `state:patch` events; every user interaction is a
command sent to Go. The one exception is the text in the focused Monaco editor, which is a working copy
pushed back to Go by `UpdateBuffer` on a debounce and flushed before save, blur, tab switch and close.
Go never sends buffer text back into the focused editor, because that would move the caret.

**Two rules matter more than the rest.** Every method Wails binds returns an `apperr.*Result` value
rather than `(T, error)`, so a failure crosses the bridge as data instead of a rejected promise with no
type. And the build is CGO-free — SQLite is `modernc.org/sqlite`, a pure-Go translation — so
`wails build` cross-compiles without a C toolchain on any host. Both are checked by `just archtest`.

Read next: `stack.md` for versions · `structure.md` for where a new thing goes · `rules.md` for what you
may and may not do · `release.md` for how it is built, versioned, packaged and shipped · `patterns/` for
how a recurring job is done here.
