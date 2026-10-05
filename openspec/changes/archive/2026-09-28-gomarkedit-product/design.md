# Design

## Context

GoMarkEdit is a single Wails binary: Go backend plus React frontend in the system webview. The first slice had to deliver everything the later features depend on, without showing controls for behaviour that did not exist yet.

## Goals / Non-Goals

- Goals: native shell, durable acknowledged layout, six-palette appearance, settings with atomic reset, shared action catalogue, notifications, offline guarantee.
- Non-Goals: File commands, launcher, tabs, file opening, rendering expansion, packaging, any assistant behaviour.

## Decisions

- The backend owns state; the frontend projects only acknowledged values. A failed write keeps the previous value and raises one classified notification; a stale write loads the newer winner silently.
- Only the frontend adapter layer touches generated Wails bindings.
- The window frame, movement, resize and maximize stay with the operating system. The app draws no custom title controls, drag regions or resize handles. Window position and full-screen state are never restored.
- Layout persistence: discrete changes save immediately; continuous resize saves 250 ms after input stops and flushes on close. Responsive widths never overwrite desktop widths.
- Each document owns its Editor/Split/Preview arrangement; the app-level value is only a fallback for documents without one.
- Appearance: theme choice and resolved value are stored separately. Every visual value is a token on the root element; the Monaco theme is generated from tokens; the first paint already uses the right theme (mirrored at startup). Theme switches are not animated. Fixed overlay stacking scale; toasts sit above dialogs.
- Notifications: toast for completed events, banner for continuing conditions. De-duplicate by code and subject with an xN count. Success/info/warning dismiss after 4/6/8 s; errors never auto-dismiss; at most three toasts, with extra errors queued.
- One action catalogue supplies identity, label, scope, shortcut and availability to every surface. No enabled no-op, duplicate binding or placeholder for future features is allowed.
- Startup: if settings cannot be initialised the shell stays hidden and shows a start-failure screen with Retry; no raw error or private path is exposed.

## Risks / Trade-offs

- Windows and Linux runtime checks were not run on every host; only the current host was exercised.
- Native frame means pixel-identical chrome across platforms is not a goal.

Deferred (not built): the assistant stages (document actions, chat, provider settings) and their reserved right region content were never built; the region stays at zero width with no placeholder. Launcher, recents and file commands arrived in a later change.
