# Contract: Commands and Cross-Layer Boundaries

## Wails boundary

Every bound handler returns one typed `apperr.*Result`, takes no `context.Context`, uses a named result,
and recovers panics in its first statement. A handler calls its service only. Services accept lifecycle
context first and call repositories, operating-system adapters, or other service interfaces. Concrete
wiring remains in `main.go`.

Only `frontend/src/logic/adapter/` imports generated `wailsjs/`. The adapter validates arity, decodes
typed envelopes, and exposes application commands to the rest of the frontend. Generated bindings and
generated database code are regenerated, never hand-edited.

Frontend Wails runtime operations follow the same adapter-only boundary. Components receive injected
commands for public size/state queries and full-screen operations; no component imports generated
runtime modules or accesses `window.WailsInvoke` or Wails private flags. Native movement, resizing,
title-bar gestures, minimize, maximize/restore, and close remain OS-owned and require no frontend
command, private invocation, custom hit target, or compatibility shim.

Go-side Wails lifecycle access is contained behind an injected native-window port wired in `main.go`.
It applies hidden restore, usable-display correction, show-once, and final native geometry queries.
`OnBeforeClose` synchronously flushes appmodel-owned pending layout intent; it does not wait on an
asynchronous browser callback.

## Command lifecycle

1. The interface validates local shape and captures the current document/session identity.
2. If the command consumes text, it flushes and awaits the newest working-copy acknowledgement.
3. The adapter sends one typed command to Go.
4. The service validates bounds, identity, paths, revisions, gate availability, and policy before I/O.
5. On success, Go commits canonical state and emits projection patches.
6. The adapter returns a classified result; the interface presents localized success, recovery, or
   cancellation state without manufacturing a backend outcome.

Commands that can exceed about 500 ms expose progress. Commands owning the shared operation slot
replace their trigger with Cancel and reach exactly one terminal result. Competing gated commands are
refused immediately, not queued.

## Boundary validation

- File, asset, and workspace paths are canonicalized and checked against allowed roots before access.
- File/document/workspace/result limits are checked before partial state is committed.
- Rendered HTML is sanitized after all Markdown transformations.
- Assistant content and observations are delimited as inert data; capability arguments are validated
  before file access.
- Network access is absent except for an explicit remote-asset approval or direct provider action.

## Registry-derived actions

Visible actions have one canonical registry entry containing stable identity, localized label,
availability, scope, and shortcut where specified. Menus, tooltips, context menus, shortcut help, and
the command palette consume that registry. A later slice may add the first specified binding but may
not silently rebind a shipped action.

The shell slice registers only actions with real consumers. Settings/dialog modality suppresses
background action dispatch. Standard macOS App/Edit roles remain native platform behavior and are not
duplicated in the in-app catalogue. About has one in-app action; native macOS About remains unset.

Delivered Appearance reset is one typed command and one repository transaction, not a sequence of UI
updates. It validates the exact delivered default set before writing and returns one acknowledged
projection only after commit.

## Compatibility rule

Contracts in this document constrain future slices without fixing method names or DTO layouts. The
first production consumer owns those concrete choices and must prove default wiring, failure, recovery,
cancellation, and stale-state behavior.
