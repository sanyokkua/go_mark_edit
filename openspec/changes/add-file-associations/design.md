# Design

## Context

See proposal.md for motivation. Observed state (paths under `frontend/src/` are written without that prefix):

- **Startup argument.** `main.go:104-108` passes `os.Args[1:]` as `StartupFolderArgs`. The holder keeps only the first
  argument as `pendingStartupFolderPath` (`internal/application/application_context_holder.go:28,91`;
  `firstStartupFolderArgument`, `internal/application/new_window.go:103-108`). `OpenPendingStartupFolder`
  (`new_window.go:110-135`) opens it only when it is an existing directory (`OpenStartupFolderFromArgs`, `:87-101`), so a
  file argument is silently ignored and a flag such as macOS `-psn_…` would be taken as the path.
    - It runs in `OnStartup` after `Init` and before `RestoreNativeWindow` (`main.go:219-236`, call at `:228`) and again
      in `RetryStartup` (`application_context_holder.go:257-268`).
    - Wails runs `OnStartup` in a goroutine while the webview loads. The frontend subscribes to state patches and then
      calls `GetState` (`logic/store/appModelProjection.ts:58-73`).
    - A normal start opens one untouched Untitled tab. A process started by New Window carries
      `GOMARKEDIT_NEW_WINDOW_CHILD=1` and starts with no tab (`application_context_holder.go:80-82`). Opening a file
      replaces an untouched Untitled tab; the "untouched" test is inline at `internal/appmodel/file_lifecycle.go:247-249`
      (no path, empty content, not dirty). The model state holds `workspace` (`internal/appmodel/model.go:24-35`).
- **New windows.** `processNewWindowLauncher.Launch(folderPath)` (`new_window.go:32-61`) runs the own executable with the
  folder as its only argument and the child marker. A failure is shown as "A new window could not be opened."
  (`newWindowRefusal`, `new_window.go:63-70`). There is no `SingleInstanceLock` (`internal/application/options.go:31-55`;
  asserted by `tests/go/integration/application/options_test.go:38`). ADR-0006 allows independent instances.
- **Events.** Event names live in `internal/bridge/events.go:5-9` and `logic/adapter/events.ts:1-5`. `state:error`
  carries a `WireError` that the projection turns into an error notification (`logic/store/appModelProjection.ts:58-63`).
  `main.go:34-45` injects runtime event emission into owners as functions (`emitNativeCloseRequest`), which keeps Go
  tests free of the Wails runtime.
- **macOS file events.** Wails v2.15.0 has `options.Mac.OnFileOpen func(string)`. The app delegate's
  `application:openFile:` pushes into a 100-entry channel that a goroutine drains from frontend construction, so the
  callback can fire before `OnStartup` and `Init`, and fires again in the running process for every later Finder open
  (`wails/v2@v2.15.0/internal/frontend/desktop/darwin/AppDelegate.m:16`, `frontend.go:53,145,449-450,518`). Today
  `Mac` is `&mac.Options{DisableZoom: false}` (`options.go:41`).
- **Open owners.** `OpenRecentFile(path)` → `AppModelService.OpenPath` (`internal/appmodel/handler.go:176-181`,
  `file_lifecycle.go:118`) applies the suffix, size, decoding and 40-tab checks and sets `OpenResult.readingMode` for the
  Viewer default. In `app/useCommands.ts`, `onOpenRecentFile` (`:203-230`) opens by path and enters Reading mode through
  `enterReadingForOpen` (`:105-126`); `onOpenWorkspacePath` (`:300-315`) opens a folder. `useDropHandler(commands,
bootstrap.status === 'ready')` (`app/App.tsx:49`) is the precedent for a hook that opens once bootstrap is ready. The
  app renders under React `StrictMode` (`main.tsx:14`), so effects mount, clean up and mount again in development.
- **Supported suffixes** are listed in `main.go:121` and `internal/file/paths.go:232-248`
  (`SupportedDocumentSuffixes`). An unsupported suffix is refused with "The selected file type is not supported."
  (`internal/file/document_reader.go:178`); a missing path with "The file no longer exists." (`file_lifecycle.go:161`).
- **Packaging.** `wails.json` has no `info` block. `build/darwin/Info.plist` and `Info.dev.plist` are Wails templates;
  their `{{if .Info.FileAssociations}}` block (`Info.plist:26-44`) writes one extension per entry and cannot express
  `LSItemContentTypes`, `LSHandlerRank` or folders. `build/windows/installer/project.nsi:94,110` calls
  `wails.associateFiles` / `wails.unassociateFiles`; the generated `wails_tools.nsh` (git-ignored, `.gitignore:30-32`)
  writes the default value of `Software\Classes\.<ext>`, which makes the application the default, and a non-empty
  `fileAssociations` list makes the Windows build write `build/windows/<IconName>.ico`, which dirties the tree. The NSIS
  installer is built only by `wails build -nsis` with `makensis` installed. Wails generates nothing for Linux.
  `scripts/build:106` runs `wails generate module`, `:109-120` runs `wails build` (`-tags webkit2_41` on Linux), and
  `:140-146` fails when the build changed the working tree. `scripts/format:51-55` runs `shfmt -i 4 -ci` on every
  tracked `*.sh`. `.github/workflows/release.yml` builds only a macOS zip; `push.yml` runs Go tests on macOS and Windows.
- **Print.** Wails offers only Go `runtime.WindowPrint(ctx)`; the JavaScript runtime has none. On macOS 11+ it runs an
  `[WKWebView printOperationWithPrintInfo:]` with landscape orientation and zero margins hard-coded, as a sheet with no
  completion signal (`wails/v2@v2.15.0/internal/frontend/desktop/darwin/Application.m:470-499`), and only on macOS 11
  or later; `window.print()` in the page does nothing on macOS. On Windows and Linux `WindowPrint` calls
  `window.print()` in the page. `LSMinimumSystemVersion` is 10.13 (`Info.plist:20-21`).
    - A standalone spike (macOS 27, a `WKWebView` printed with the same `NSPrintInfo` settings and saved to PDF) showed:
      `@media print` applies, an element hidden on screen and shown for print is printed over as many pages as needed
      (400 paragraphs → 19 pages) with nothing else, and `print-color-adjust: exact` keeps a dark background to the page
      edge. `@page { size: A4 portrait }` does not change the landscape page, and an `@page` margin adds unpainted white
      borders. No code has `@media print`. The native window port is
      `NativeWindowAPI` (`internal/application/native_window.go:28-33`), implemented by `wailsNativeWindow` in
      `main.go:252-273`.
- **Current text of the active document.** The editor sends edits to the backend through `UpdateBuffer` after a
  debounce; `subscribeAcceptedBuffers` events (`logic/adapter/appModelAdapter.ts:536-548`) are transient. The preview's
  `useLivePreviewSnapshot` (`logic/hooks/useLivePreview.ts:41-115`) seeds from the projected `activeBuffer.content` and
  then follows those events, so a newly mounted component misses earlier edits. `flushActiveDocument`
  (`app/useCommands.ts:65-68`) calls `flushActiveSession`, which captures the editor model and sends its content to the
  backend (`ui/widgets/EditorStage/EditorStage.tsx:174-185`, `logic/hooks/useLifecycleBarrier.ts:105-121`). The backend
  document holds that content, and `GetState` returns it as `activeBuffer.content` (`internal/appmodel/service.go:275-299`).
  Save uses exactly this pair: `flushActiveSession` then `appModelAdapter.getState()` (`app/useDocumentWrites.ts:294-295`).
- **Preview.** `ui/widgets/PreviewPane.tsx:15` loads `MarkdownView` lazily behind `Suspense`, so its chunk may not be
  loaded while the preview is hidden. Dialogs and popups render through `createPortal` into `document.body`
  (`ui/components/ModalShell/ModalShell.tsx:159,188`, `ui/components/Popup/Popup.tsx:368,381`); the application root is
  `<div id="root">` (`frontend/index.html:9`). `ui/components/MarkdownView.tsx:251` renders source at a standard; images render as `<img>` or a fallback
  (`PreviewImage`, `MarkdownView.tsx:37-52`); `ui/widgets/PreviewPane.tsx:276-285` resolves local images through
  `classifyImageSource` and `resolvePreviewImage`. `ui/components/MermaidBlock.tsx` shows a limit placeholder for the
  51st diagram or a source over 50,000 characters (`:24,67-70`), an SVG (`:71-77`), an error (`:78-84`) or "Rendering
  diagram…" (`:85-88`) inside `<div data-mermaid-block>` (`:66`). It resolves its theme with `resolveMermaidTheme()`
  (`logic/markdown/mermaid/theme.ts:41-58`), which probes a span appended to `document.body` and reads `data-mode` from
  the root; the token map is `theme.ts:1-26`. Preview colours come from `ui/styles/tokens.css`.
- **Settings pattern.** `view.readingWidth` (`internal/settings/repository_sqlite.go:17`; `internal/settings/model.go`;
  `AppearanceSettings.ReadingWidth`, `internal/apperr/results.go:10-15`) travels with the appearance group through
  `UpdateAppearance` / `ResetAppearance`. The appearance controller state is `AppearanceState`
  (`ui/widgets/appearanceSettingsContext.ts:8-26`, `useAppearanceSettings` `:30-35`), provided by
  `AppearanceSettingsProvider`, which `app/AppFrame.tsx:51-62` mounts around the menu bar and
  `AppearanceControlsContent`. Its menu rows use a registry action (`reading-width`, `logic/actions/actionRegistry.ts:60,280`;
  label `action.reading-width.label`, `i18n/locales/en.json:294`).
- **Export action.** `export-pdf` exists on the File menu with `availability: fileDeferred`
  (`logic/actions/actionRegistry.ts:207,239-242`); Mod+P is unbound. `logic/actions/useShellShortcuts.ts:29-55` calls
  `preventDefault` only for an available action, so an unavailable shortcut reaches the webview's own handling.
- **Light tokens.** `ui/styles/tokens.css` defines colours on `:root` attribute selectors only; the Material Light
  values are `:root[data-mode='light']` (`:514`) and `:root[data-theme='material'][data-mode='light']` (`:400`).
  `--preview-content-background` is `var(--editor-content-background)`, transparent at `:root` (`:18,163`). Stylelint
  bans colour literals outside `tokens.css`.
- **Verification temp files.** `new_run_dir` (`scripts/lib/common.sh:99-108`), used by `scripts/baseline:29`,
  `scripts/verify:39` and `scripts/test:37`, creates `.local_tmp_files/runs/<kind>-<UTC>-<pid>/` and never removes
  anything. Each run holds its own `golangci-cache` (`scripts/lib/stages.sh:9`), `tsconfig.node.tsbuildinfo` (`:14`),
  `jest-unit-cache` (`:44`) and `jest-integration-cache` (`:51`). `scripts/baseline --compare` reads only
  `.local_tmp_files/baseline/<branch>.json` and the current run. E2E creates `.local_tmp_files/e2e-run-*`
  (`frontend/tests/support/prepare.ts:174-176`), left behind by a hard kill; `tools/verify/results.test.mjs:11-15`
  creates `.local_tmp_files/verification-test-*`. `tools/verify/results.test.mjs` (17 passing tests) is run by no stage;
  it already sources `scripts/lib/common.sh` in bash (`:9,384-400,877-890`).
- **E2E harness.** `frontend/tests/support/harness.ts:66,181-233` spawns the development executable with no arguments
  (`:191`) and `GOMARKEDIT_E2E_HEADLESS=1`; `launch()` takes no parameters.

## Goals / Non-Goals

**Goals:**

- One backend entry for every path the operating system or the command line passes, a race-free rule that only a
  starting window opens one, a new window for every other path, and the existing open commands doing the opening.
- Platform declarations that list GoMarkEdit without taking any default, built from the repository by
  `scripts/build` on each platform.
- PDF export that reuses the preview renderer and the native print dialog, with no second Markdown pipeline.
- Bounded verification temp storage with no change to what CI uploads or what `scripts/baseline --compare` reads.

**Non-Goals:**

- Windows or Linux release artifacts, code signing, or notarization changes.
- A single-instance lock or forwarding paths between running processes.
- Page setup, headers, footers, page numbers or a silent PDF writer.
- Localizing operating-system shell verbs ("Open with GoMarkEdit" is English, like the installer).

## Decisions

1. **A window accepts at most one target, and only while it is starting.**
    - The holder keeps `launchTarget` (path and kind), `targetAccepted bool` and `startupOpen bool` (true from
      construction) under its mutex. `AcceptOpenRequest(path)` accepts the path when `startupOpen && !targetAccepted`: it
      stores it and sets `targetAccepted`. `FrontendReady` (`application_context_holder.go:295`) sets `startupOpen` to
      false before it forwards readiness, so every path that arrives after the frontend reported ready goes to a new
      window (Decision 2), whatever the window shows. No model state is inspected.
    - Why this gate: on Windows and Linux every external open starts its own process, which receives the path as its
      argument (Decision 3). On macOS a cold-start Finder open reaches the newly started process as an open event while
      the webview is still loading, so before `FrontendReady`; a double-click after the window is shown arrives after
      it and starts a new window.
    - `TakeLaunchTarget` removes and returns the stored target, or an empty result. Taking with nothing stored changes
      nothing, so the frontend may take at any time and as often as it likes.
    - The frontend hook `app/useLaunchTarget.ts` takes once when `bootstrap.status` becomes `ready`, then opens the target
      with `onOpenWorkspacePath(path)` for a folder or `onOpenRecentFile(path, tabSetRevision)` for a file. Bootstrap
      calls `windowReady` (`app/useBootstrap.ts:218`), which reaches `FrontendReady`, before it becomes `ready`, and
      acceptance and the gate share `holder.mu`, so the take sees every target the window will ever accept. No event is
      needed.
    - The open commands are reused on purpose: they apply the `OpenPath` checks and refusal notices, the Untitled
      replacement and `enterReadingForOpen`. `onOpenRecentFile` also refreshes Recent Items after a missing path, which
      drops that path from the list; `onOpenWorkspacePath` never shows its replace-folder prompt here, because a starting
      window has no workspace.
    - Under `StrictMode` the effect is cleaned up and run again. A take that is in flight still opens its result; a
      second take returns empty, so nothing opens twice.
    - Locking: `AcceptOpenRequest`, `TakeLaunchTarget` and the gate change in `FrontendReady` take only `holder.mu`.
      `Init` holds `holder.mu` for its whole run, so a macOS event that arrives during `Init` waits for it. The launcher
      and the event emitter are called after `holder.mu` is released.
    - Exact signatures:

        ```go
        // internal/apperr/results.go
        type LaunchTargetResult struct {
            Failure
            Path  string     `json:"path,omitempty"`
            Kind  string     `json:"kind,omitempty"` // "file" or "folder"
            Error *WireError `json:"error,omitempty"`
        }
        // internal/application
        func (holder *ApplicationContextHolder) AcceptOpenRequest(path string)
        func (holder *ApplicationContextHolder) TakeLaunchTarget(ctx context.Context) apperr.LaunchTargetResult
        func (handler *ApplicationHandler) TakeLaunchTarget(request bridge.Request) (result apperr.LaunchTargetResult)
        ```

        `ApplicationServiceAPI` (`handler.go:23-26`) gains `TakeLaunchTarget(context.Context) apperr.LaunchTargetResult`.
        The handler uses `bridge.Guard` and `bridge.Once` like `WindowReady`. `Kind` is `folder` when `os.Stat` reports a
        directory at take time and `file` otherwise, including a missing path, which the file open then refuses.

    - `OpenPendingStartupFolder`, `OpenStartupFolderFromArgs` and `firstStartupFolderArgument` are removed; neither
      `OnStartup` nor `RetryStartup` opens anything. A target accepted before an `Init` failure stays takeable after a
      successful retry.
    - Rejected:
        - Letting an already-shown, empty-looking window take a later path: the user wants every external open in a new
          window, and it would need a model query and an event to reach a running frontend.
        - A target in the `GetState` snapshot: `OnStartup` runs while the webview loads, so the value races the
          projection's subscription.
2. **Every other path starts a new process.**
    - When `AcceptOpenRequest` does not accept, it calls the new-window launcher with the path, outside the mutex.
      `NewWindowLauncher.Launch(folderPath)` becomes `Launch(targetPath)`; the child opens the path through its own
      argv. The child marker gives it an empty session, and the argument is accepted in its constructor.
    - A launch failure is emitted as `state:error` with the existing "A new window could not be opened." wire error
      (`newWindowRefusal().Error`), so the receiving window shows the existing error notification. Before the lifecycle
      context exists it is logged only.
    - The holder gets the runtime emitter as `ApplicationContextOptions.EmitEvent func(context.Context, string, any)`,
      set in `main.go` to `runtime.EventsEmit`, following `emitNativeCloseRequest` (`main.go:34-45`). Go tests pass a
      recorder.
    - Rejected: Wails `SingleInstanceLock` with forwarding (contradicts ADR-0006 and the per-file new window); adding
      later paths as tabs of an existing window (the user asked for a new window per external open).
3. **Argument parsing.** `ApplicationContextOptions.StartupFolderArgs` becomes `StartupArgs`. The constructor passes the
   first argument that is non-empty and does not start with `-`, made absolute against the working directory, to
   `AcceptOpenRequest`; all others are ignored. The constructor runs before `wails.Run`, so the argument is always
   accepted.
4. **Platform files hold the declarations; `wails.json` gets no `fileAssociations`.**
    - The Wails NSIS macro writes the default value of `Software\Classes\.<ext>` (takes over the default), and the plist
      template cannot express ranks, content types or folders. The application icon is the document icon.
    - One Go black-box test, `tests/go/integration/packaging/associations_test.go`, checks shipped configuration for
      consistency. It is an accepted exception to the rule that tests do not assert document text: it compares
      configuration files with the backend's suffix list, not product wording.
        - macOS: walk `build/darwin/Info.plist` and `Info.dev.plist` with `encoding/xml` tokens, collect the `<string>`
          values of every `CFBundleTypeExtensions` and `UTTypeTagSpecification` → `public.filename-extension` array,
          and compare the set, with a leading dot, to `file.SupportedDocumentSuffixes()`. The Wails template lines
          (`{{…}}`) are character data and are ignored by the walk.
        - Windows: scan `build/windows/installer/project.nsi` line by line; the suffixes on `OpenWithProgids` and
          `SupportedTypes` lines equal the four suffixes, no `WriteRegStr` line writes the default value (`""`) of a
          `Software\Classes\.<ext>` key, `Directory\shell\GoMarkEdit` opens with `"%1"` and
          `Directory\Background\shell\GoMarkEdit` with `"%V"`, and every key or value the install section writes is
          deleted by the uninstall section.
        - Linux: the desktop entry's `MimeType=` contains `text/markdown`, `text/x-markdown`, `text/plain` and
          `inode/directory`, and the MIME XML contains a `*.mdown` glob. Shared-mime-info is not modelled.
    - Rejected: a `tools/lint/repo-rules.mjs` rule, which would have to parse the Go suffix list from source.
5. **macOS.**
    - `build/darwin/Info.plist` and `Info.dev.plist` get static `CFBundleDocumentTypes`, outside the unused
      `{{if .Info.FileAssociations}}` block:
        - Markdown: `LSItemContentTypes` `net.daringfireball.markdown`, role Editor, `LSHandlerRank` Alternate, with a
          `UTImportedTypeDeclarations` entry for `net.daringfireball.markdown` (conforms to `public.plain-text`,
          extensions `md`, `markdown`, `mdown`);
        - Plain text: `CFBundleTypeExtensions` `txt`, Editor, Alternate;
        - Folder: `LSItemContentTypes` `public.folder`, role Viewer, Alternate, so a folder can be dropped on the Dock or
          application icon. Finder has no Open With for folders; that is a recorded limitation.
    - `application.Options` gains `OnFileOpen`, set into `Mac.OnFileOpen`; `main.go` passes
      `applicationContext.AcceptOpenRequest`.
    - `LSMinimumSystemVersion` becomes `11.0` in both plists (Decision 8: printing needs macOS 11).
6. **Windows.**
    - `build/windows/installer/project.nsi` drops `wails.associateFiles` / `wails.unassociateFiles` and defines local
      macros that write under `SHCTX\Software\Classes`, always naming the executable `${PRODUCT_EXECUTABLE}`:
        - ProgID `GoMarkEdit.Document` ("Markdown document", `DefaultIcon` `$INSTDIR\${PRODUCT_EXECUTABLE},0`,
          `shell\open\command` `"$INSTDIR\${PRODUCT_EXECUTABLE}" "%1"`);
        - for each suffix, the value `GoMarkEdit.Document` under `.<ext>\OpenWithProgids`, never the key's default value;
        - `Applications\${PRODUCT_EXECUTABLE}` with `SupportedTypes` for the four suffixes and its open command;
        - `Directory\shell\GoMarkEdit` ("Open with GoMarkEdit", icon, command `"…" "%1"`) and
          `Directory\Background\shell\GoMarkEdit` (command `"…" "%V"`);
        - `SHChangeNotify(SHCNE_ASSOCCHANGED)` after install and uninstall.
    - The uninstall section deletes exactly these keys and values.
    - `scripts/build` adds `-nsis` on Windows (`uname -s` MINGW, MSYS or CYGWIN) when `makensis` is on `PATH`, and
      otherwise logs that the installer was skipped.
7. **Linux.**
    - New `build/linux/gomarkedit.desktop` (`Type=Application`, `Name=GoMarkEdit`, `Exec=GoMarkEdit %f`,
      `Icon=gomarkedit`, `Categories=Office;TextEditor;`,
      `MimeType=text/markdown;text/x-markdown;text/plain;inode/directory;`), `build/linux/gomarkedit-mime.xml`
      (adds `*.mdown` and `*.markdown` globs to `text/markdown`) and `build/linux/install.sh [--uninstall]`.
    - `install.sh` is POSIX `sh` (`#!/bin/sh`, `set -eu`), portable to macOS bash 3.2 and BSD tools: `mkdir -p` and
      `cp`, never `install -D` or `readlink -f`; it finds its own folder with `cd "$(dirname "$0")" && pwd`. It is
      formatted by `scripts/format` (shfmt picks up every tracked `*.sh`).
    - It installs per user: the binary to `$HOME/.local/bin/GoMarkEdit`, the icon to
      `${XDG_DATA_HOME:-$HOME/.local/share}/gomarkedit/gomarkedit.png`, the desktop entry to `…/applications/` with
      `Exec=` and `Icon=` rewritten to those absolute paths (so no hicolor size folder is needed), and the MIME file to
      `…/mime/packages/`. It runs `update-desktop-database` and `update-mime-database` when they exist and says so when
      they do not. It never runs `xdg-mime default` and never edits `mimeapps.list`. `--uninstall` removes the same files
      and refreshes the databases.
    - `scripts/build` on Linux copies the desktop entry, MIME file, install script and `build/appicon.png` into
      `build/bin/` (git-ignored).
8. **PDF export prints a hidden print copy through the native print dialog.**
    - `NativeWindowAPI` gains `Print(context.Context)`, implemented by `wailsNativeWindow` with
      `runtime.WindowPrint(ctx)`. `ApplicationHandler.PrintWindow(request bridge.Request) (result apperr.VoidResult)`
      calls it through `ApplicationServiceAPI.PrintWindow(context.Context)`; in E2E headless mode
      (`native_window.go:15`) it does nothing. This is the only print path that works on macOS, and it works from
      macOS 11, which becomes the minimum (Decision 5).
    - Source text: `app/usePdfExport.ts` calls `flushActiveDocument()` and then `appModelAdapter.getState()`, and takes
      `activeBuffer.content` when `activeBuffer.documentId` is still the document being exported, exactly as Save does
      (`useDocumentWrites.ts:294-295`). That is the backend's copy of the editor model after the flush, including
      unsaved and untitled text. The live-preview snapshot is not used: a freshly mounted component would miss the
      transient accepted-buffer events.
    - `ui/widgets/PrintDocument.tsx` renders `MarkdownView`, loaded lazily through the same lazy declaration as
      `PreviewPane.tsx:15` (moved to one shared module), with that text as a fixed snapshot, the projected Markdown
      standard (`state.settings.markdown`) and the image resolver, which is extracted from
      `PreviewPane.tsx:276-285` into one exported function used by both. Its `Suspense` fallback is an element marked
      `data-print-pending`, so the copy reports when its content has rendered. Being the same renderer, it applies the same
      limits and placeholders, and it does not depend on the arrangement, scroll position or a paused preview.
    - Mounting: `App.tsx` passes the print request to `AppFrame`, which renders `PrintDocument` inside
      `AppearanceSettingsProvider` next to `AppearanceControlsContent` (`AppFrame.tsx:51-62`). `PrintDocument` renders
      through `createPortal` into `document.body`, as `ModalShell` and `Popup` do, so it is outside `#root`; React
      context still reaches it, so the PDF appearance (Decision 10) is read with `useAppearanceSettings()` and needs no
      Redux projection.
    - Lifecycle: the copy stays mounted and hidden on screen (`display: none`) until the next export replaces it or the
      active document changes. No completion signal is needed.
    - Print CSS: `@media print` hides every child of `body` except the copy (the application root, open dialogs and
      popups, the Mermaid render frame and theme probes) and shows the copy. There is no `@page` rule: the spike showed
      it neither changes the macOS landscape page nor paints its margins. Page padding sits inside the copy, which paints
      its own background, and `print-color-adjust: exact` keeps Styled backgrounds. Stylelint accepts the property
      (`frontend/stylelint.config.mjs` has no unknown-property rule).
    - Sequence: the `export-pdf` action flushes, reads the text, mounts the copy, waits (Decision 9), then calls
      `PrintWindow`. A request made while one is waiting is ignored; the action stays enabled.
    - Wiring: File-menu rows and their shortcuts are dispatched by `ui/widgets/Menubar/Menubar.tsx`
      (`FILE_ACTIONS_WITH_INVOKERS` `:54`, `fileActionInvoker` `:243`, `fileShortcutActions` `:370-405`), fed with
      handlers from `app/useAppPresentation.ts` through `ui/widgets/Menubar/ApplicationMenubar.tsx`. `export-pdf` joins
      `FILE_ACTIONS_WITH_INVOKERS` with an `onExportPdf` handler that is always provided, also with no document, so the
      action stays in the shortcut list and availability alone decides whether it runs.
    - `export-pdf` loses `fileDeferred`, needs an open document and no modal, gets `shortcut: 'Mod+P'` and the
      `shortcuts` surface. `useShellShortcuts` calls `preventDefault` for a matched `export-pdf` before its availability
      checks, so Ctrl+P never reaches the webview's own print (WebView2, WebKitGTK) while Export is unavailable. Other
      shortcuts keep their current handling.
    - Rejected:
        - `window.print()` from the page: does nothing on macOS.
        - Printing the live preview pane: depends on the arrangement and a paused preview, and the scroll container clips.
        - Seeding the copy from `useLivePreview`: misses edits made before it mounted.
        - A Go-side or bundled PDF renderer: a second rendering pipeline and a new dependency.
9. **Waiting for content, diagrams and images.**
    - The copy is content-ready when its root exists and holds no `[data-print-pending]` element (the lazily loaded
      renderer has committed). This part of the wait ships with the print copy; diagrams and images extend it.
    - `MermaidBlock` exposes its state on its existing root as `data-mermaid-state`: `pending` while it shows "Rendering
      diagram…" (including before its theme resolves), `drawn`, `error`, or `limit` for the placeholders at
      `MermaidBlock.tsx:24,67-70`. Only `pending` counts as unsettled.
    - The export polls the copy every 100 ms: it is settled when it is content-ready, no `[data-mermaid-state='pending']`
      remains and every `img` inside it has `complete === true` (loaded or failed; preview images have no lazy loading,
      so they load while the copy is hidden). It prints when settled or 10 s after the export
      started. No callback is threaded through `MarkdownView`.
    - Rejected: an `onSettled` callback from each block (threads a prop through the renderer for one consumer); a
      `MutationObserver` (needs the same predicate and still misses image load events).
10. **PDF appearance setting.**
    - Key `export.pdfAppearance`, values `styled` | `clean`, default `styled`, carried in the appearance group as
      `AppearanceSettings.PdfAppearance` (`json:"pdfAppearance"`) with `PdfAppearanceStyled` / `PdfAppearanceClean`.
      Backend handling follows `view.readingWidth` (repository read, write and reset; normalization of a missing or
      invalid value to `styled`; refusal of other writes). Reset appearance restores Styled.
    - Frontend: `PdfAppearance = 'styled' | 'clean'` in `logic/adapter/settingsTypes.ts`; `AppearanceState` gains
      `pdfAppearance`; the controller gains `onPdfAppearanceChange`; a radio group after Reading width in the Settings
      menu backed by a new `pdf-appearance` registry action; a segmented row in the Settings dialog. No Redux
      projection, because `PrintDocument` is inside the provider (Decision 8).
    - Clean sets `data-print-appearance='clean'` on the print copy. `ui/styles/tokens.css` gains one
      `[data-print-appearance='clean']` block that redefines, with the Material theme's Light-mode values (from
      `:root[data-mode='light']` and `:root[data-theme='material'][data-mode='light']`, whatever the active theme), the
      colour tokens the preview, the copy's page background (`--surface`, as the preview content area,
      `ui/widgets/PreviewPane.module.css:25`) and diagrams use: `--surface`, `--surface-2`, `--text`, `--muted`, `--err`, `--warn`, `--stroke`, `--stroke-soft`,
      `--accent`, `--accent-soft`, `--accent-ink`, `--md-emphasis`, `--md-strong`, `--md-quote`, `--code-fg`,
      `--hl-attr`, `--hl-comment`, `--hl-function`, `--hl-keyword`, `--hl-number`, `--hl-punct`, `--hl-string`,
      `--hl-type`, and for Mermaid (`theme.ts:1-26`) `--elevated`, `--surface-raised` and `--border` (the last two are
      `var(--elevated)` and `var(--stroke)` through `:root[data-theme][data-mode]`, `tokens.css:564-566`). No new token name
      is declared, so the token lint (`tools/lint/tokens.mjs`) is unaffected, and the selector is allowed by
      `stylelint.config.mjs`.
    - `resolveMermaidTheme(element)` probes inside the given element and reads dark mode as "closest `data-mode` is
      `dark` and no `data-print-appearance='clean'` ancestor"; `MermaidBlock` passes its root element.
    - Strings: `settings.pdfAppearance` ("PDF appearance"), `settings.pdfAppearance.styled` ("Styled"),
      `settings.pdfAppearance.clean` ("Clean"), `settings.pdfAppearance.description`, `action.pdf-appearance.label`.
11. **Verification temp retention.**
    - `scripts/lib/stages.sh` points `GOLANGCI_LINT_CACHE`, `--tsBuildInfoFile` and both Jest `--cacheDirectory`
      values at `.local_tmp_files/cache/` (`golangci`, `tsconfig.node.tsbuildinfo`, `jest-unit`, `jest-integration`).
    - `scripts/lib/common.sh` gains `prune_local_tmp <root>`, called by `new_run_dir` after it creates the new folder:
      it keeps the 10 newest folders in `<root>/runs/` by modification time (the new one included) and removes
      `e2e-run-*` and `verification-test-*` folders directly under `<root>` older than 24 hours. It touches nothing
      else: `specification/`, `baseline/`, `e2e-performance/`, `cache/` and loose files stay.
    - The Unit stage runs `node --test tools/verify/results.test.mjs`, which gains the retention tests. They source
      `common.sh` in bash as the existing tests do and call `prune_local_tmp` on a temporary root. The exit status
      fails the stage; the count is not added to the Backend/Frontend counts.
    - CI artifact allowlists are unchanged; they already exclude caches.
    - Rejected: deleting runs only when a baseline is recorded (most runs come from `scripts/verify` and
      `scripts/test`); age-based run deletion (a busy day still fills the disk).
12. **Durable decisions for `docs/architecture.md`.**
    - **D18 — An external path opens in the window started for it, every other one in a new window:** argv and
      operating-system open events enter one backend entry. A window accepts at most one target, and only while it is
      starting (until the frontend reports ready). The frontend takes the accepted target once after bootstrap and opens
      it with the ordinary open commands. Every other target starts a new independent process, whatever existing windows
      show. Refines ADR-0035 and keeps ADR-0006.
    - **D19 — Installers offer Open With and never take a default:** platform declarations live in `build/darwin`,
      `build/windows/installer/project.nsi` and `build/linux`, not in `wails.json`; nothing writes a default handler.
    - **D20 — PDF export prints a hidden print copy through the native print dialog:** the copy reuses the preview
      renderer with the backend's flushed text, is portaled outside the application root and prints once its content,
      diagrams and images have settled (10-second cap); `runtime.WindowPrint` is the only print path, so macOS 11 is the
      minimum; there is no silent writer.
    - D8 ("not-yet-built controls remain visible and disabled") names no control, so its text stays as written; Export
      to PDF simply stops being one of those controls.

Assumptions recorded as defaults (not open questions):

- An unsupported file chosen through Open With is refused visibly, keeping "Supported file types".
- Linux declares `text/plain`, so GoMarkEdit is listed for every plain-text file; unsupported ones are refused.
- The macOS print dialog starts in landscape with zero margins because Wails hard-codes it and CSS cannot override it
  (spike); the user can switch to portrait in the dialog. Recorded as a limitation.
- No "set GoMarkEdit as default" prompt or setting.
- A document over 2 MiB is exported by rendering its current text once, as Refresh does in the paused preview.
- No progress indicator during the at most 10-second wait.

## Risks / Trade-offs

- [Only macOS can be verified at runtime] → Windows registry entries are checked by compiling the installer
  (cross-build) and by the packaging test; Linux files by the packaging test and the install-script integration test.
  Behaviour in Explorer and in Linux desktops stays unverified and is stated as such in the docs and the task close-out.
- [The spike ran in a standalone `WKWebView`, not inside the Wails window] → the macOS real-app check confirms a
  multi-page PDF without application chrome.
- [Landscape is hard-coded on macOS] → accepted limitation; the user switches orientation in the dialog.
- [Raising the macOS minimum to 11 drops 10.13-10.15] → accepted by the user; printing cannot work there.
- [A cold-start macOS open event could in theory arrive after the frontend reports ready] → it would open in a new
  window and leave the first window empty; the real-app checklist opens files with GoMarkEdit not running.
- [A path that arrives while the startup failure screen is shown is still accepted by that window, because the
  frontend has not reported ready] → it opens after a successful Retry; accepted.
- [The first window's shell is visible for a moment before an accepted target opens] → the hook takes as soon as
  bootstrap is ready; accepted.
- [A launch failure before the lifecycle context exists has nowhere to show] → logged only.
- [WebView2 or WebKitGTK handles Ctrl+P itself] → the shortcut handler always calls `preventDefault` for Mod+P, which is
  expected to suppress the webview's own print; unverified on Windows and Linux.
- [Windows 11 shows folder verbs only under "Show more options"] → documented.
- [Linux `inode/directory` or `text/plain` could become the effective default on a desktop with no configured default]
  → install never sets a default; most file managers register themselves as the folder default; unverified, documented.
- [The macOS extension-only `txt` declaration might not be honoured] → the real-app checklist covers `.txt`; if it fails,
  stop and ask the user before declaring `public.plain-text`, which would list GoMarkEdit for all plain text.
- [The print copy keeps a second rendering of the document in memory until the next export or document change] →
  accepted for simplicity; it is hidden and inert.
- [Shared caches across concurrent verification runs] → Jest and golangci caches tolerate concurrent use; the
  TypeScript build-info file is rewritten whole. A run folder in use is pruned only if 10 newer runs start during it.

## Migration Plan

- No data migration. A missing `export.pdfAppearance` row reads as `styled`; an older build ignores the extra row.
- The first verification run after task 1 deletes all but the 10 newest run folders (about 7 GB today) and any stale
  E2E or tooling test folders. Nothing reads them, and baselines are kept.
- Users of a previous Windows installer get the new registrations by reinstalling. Rollback is reverting the change and
  uninstalling, which removes the registrations.

## Verification

- **Go black-box** (`tests/go/`):
    - launch targets: argv with flags, several paths, a relative path, a folder and a missing file; a path that arrives
      before `SetContext` and `Init` is accepted and taken once after `FrontendReady`; a second path before
      `FrontendReady` and every path after it, including into an empty window, go to a recording launcher; concurrent
      requests accept exactly one; `TakeLaunchTarget` returns the target once and empty afterwards; a failing launcher
      after `SetContext` emits `state:error` with "A new window could not be opened." through a recording emitter and
      before it only logs; retry after an `Init` failure leaves the target takeable;
    - options: `Mac.OnFileOpen` is set and still no `SingleInstanceLock`;
    - `PrintWindow` calls the native port once and not in headless mode;
    - `export.pdfAppearance` default, round trip, refusal, reset and invalid stored value;
    - the packaging test (Decision 4);
    - Linux `install.sh` and `--uninstall` run with `/bin/sh` against a temporary `HOME`, unset `XDG_DATA_HOME`, and a
      `PATH` holding recording stubs for `update-desktop-database`, `update-mime-database` and `xdg-mime`; asserts the
      installed files, the absolute `Exec` and `Icon`, and that `xdg-mime default` is never called. Skipped on Windows.
- **Node tests:** retention in `tools/verify/results.test.mjs` against a temporary root.
- **Jest unit / integration:** the launch-target hook (folder, file, empty, no take before ready, Reading on a true
  flag, refusal notice, `StrictMode` opens once); `export-pdf` availability, Mod+P formatting and Mod+P default
  prevented while unavailable; the print copy is outside `#root`, shows text typed into Untitled without saving, renders
  in the Editor arrangement before the renderer chunk was ever loaded and while the preview is paused, shows a remote
  image's placeholder without a request; the wait
  with fake timers (pending diagram, incomplete image, 10 s cap, limit placeholders and errors settled); a second
  request while waiting is ignored; Clean tokens and the Mermaid theme probe; Settings menu and dialog rows.
- **Playwright E2E** (`harness.launch(args)` gains an argument list): start with a file (first in Recent Items), a
  folder, `-flag file`, a missing file and `server.log`; Viewer default starts in Reading mode; Ctrl+P records `PrintWindow` (recorder pattern from
  `frontend/tests/e2e/preview-links.test.ts:228-235`); with `page.emulateMedia({ media: 'print' })` and Chromium
  `page.pdf()`, the PDF shows text typed into Untitled, the document headings, a drawn diagram, a local image, and white
  pages for Clean and a dark page for Styled in Dark mode (Chromium's `page.pdf()` prints backgrounds only with
  `printBackground: true` or `print-color-adjust: exact`, which the copy sets); the setting survives a restart. macOS file-open events cannot be driven from E2E; Go tests cover
  their routing.
- **Windows installer build:** on macOS with `makensis` installed, `wails build -platform windows/amd64 -nsis` must
  compile `project.nsi`; the installer is not run.
- **Real application on macOS (manual, performed by the user):** install the built `.app` in `/Applications`; Finder
  Open With lists GoMarkEdit for `.md`, `.markdown`, `.mdown`, `.txt` and the default is unchanged; Get Info → Change
  All makes it the default; with GoMarkEdit not running, double-click a file: one window shows it; start GoMarkEdit from
  its icon and double-click a file: a new window shows it and the first keeps its empty Untitled document; double-click
  another file: another new window; multi-select three files with GoMarkEdit not running: three windows; drop a
  folder on the Dock icon while a document is open: a new window with that workspace; Finder still opens folders
  itself; Viewer default opens in Reading mode (task 3.1 checks these items). Cmd+P opens the print panel, Save as PDF
  writes a multi-page PDF that matches the preview with no application chrome, and cancelling writes nothing (6.1);
  diagrams and a local image appear (7.1); Styled and Clean match their descriptions (8.1).
- **Not verified at runtime:** Explorer Open With, folder verbs and uninstall cleanup on Windows; Open With and folder
  behaviour on Linux desktops; Ctrl+P in WebView2 and WebKitGTK.

## Implementation notes

- `applicationAdapter` (`logic/adapter/index.ts:577-579`, `logic/adapter/windowAdapter.ts`) gains `takeLaunchTarget`
  and `printWindow`.
- Bindings and models are regenerated with `wails generate module`, as `scripts/build:106` does.
- The macOS bundle identifier stays `com.wails.GoMarkEdit`; Launch Services keys registrations by it.
