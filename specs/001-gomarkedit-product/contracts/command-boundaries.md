# Contract: Commands and Cross-Layer Boundaries

## Wails boundary

Every bound handler returns one typed `apperr.*Result`, takes no `context.Context`, uses a named result,
and recovers panics in its first statement. A handler calls its service only. Services accept lifecycle
context first and call repositories, operating-system adapters, or other service interfaces. Concrete
wiring remains in `main.go`.

Only `frontend/src/logic/adapter/` imports generated `wailsjs/`. The adapter validates arity, decodes
typed envelopes, and exposes application commands to the rest of the frontend. Generated bindings and
generated database code are regenerated, never hand-edited.

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

## Compatibility rule

Contracts in this document constrain future slices without fixing method names or DTO layouts. The
first production consumer owns those concrete choices and must prove default wiring, failure, recovery,
cancellation, and stale-state behavior.
