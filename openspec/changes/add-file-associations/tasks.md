# Tasks

Paths under `frontend/src/` are written without that prefix. Every task follows `openspec/config.yaml` apply guidance:

- run `scripts/baseline` once before the first production edit;
- TDD where practical;
- strings from `i18n/locales/en.json`, colors from tokens;
- regenerate bindings and models with `wails generate module` (as `scripts/build:106` does) after a Go bridge change;
- a task is done when its named tests pass, the relevant `scripts/verify` stages are green against the baseline
  (`scripts/baseline --compare`), and visible behaviour has been exercised in the real application on macOS. The
  macOS real-app checks are performed by the user. Windows and Linux runtime behaviour cannot be exercised here; each
  task says what stands in for it.

Test edits listed under "Changes existing tests" are required by the named requirement. They are not weakened tests.

## 1. Verification temp retention

- [ ] 1.1 Share the tool caches in `.local_tmp_files/cache/`, keep only the 10 newest run folders, and remove stale E2E
      and tooling test folders older than 24 hours. Verify that `node --test tools/verify/results.test.mjs` passes as
      part of the Unit stage, that a `scripts/verify lint` run leaves at most 10 folders under `.local_tmp_files/runs/`,
      and that `.local_tmp_files/specification/` and `.local_tmp_files/baseline/*.json` are unchanged.
    - Independent of the other tasks. Tooling only: no spec requirement.
    - Design: Decision 11.
    - Work:
        - `scripts/lib/stages.sh:9,14,44,51`: `GOLANGCI_LINT_CACHE`, `--tsBuildInfoFile` and both Jest
          `--cacheDirectory` values move to `.local_tmp_files/cache/` (`golangci`, `tsconfig.node.tsbuildinfo`,
          `jest-unit`, `jest-integration`);
        - `scripts/lib/common.sh`: `prune_local_tmp <root>` (keep the 10 newest folders of `<root>/runs/` by
          modification time; delete `e2e-run-*` and `verification-test-*` folders directly under `<root>` older than
          24 hours; nothing else), called by `new_run_dir` (`:99-108`) with `$REPO_ROOT/.local_tmp_files` after it
          creates the run folder;
        - `run_unit_stage` (`scripts/lib/stages.sh:41-46`) also runs `node --test tools/verify/results.test.mjs`
          through `run_command`; its exit status fails the stage.
    - Adds tests (`tools/verify/results.test.mjs`, node:test, a temporary root; source `common.sh` in bash as the
      existing tests do at `:384-400` and `:877-890`, then call `prune_local_tmp`): 11 run folders leave the 10 newest;
      an `e2e-run-*` folder 25 hours old is removed and a fresh one is kept; `verification-test-*` likewise;
      `baseline/main.json`, `specification/`, `cache/` and a loose `verify31.out` are untouched; a missing `runs/`
      folder is not an error.
    - Docs: `AGENTS.md:93-94`, `docs/architecture.md:419-427` and `docs/e2e-performance.md:31-32` say that only the
      10 newest run folders are kept and caches live in `.local_tmp_files/cache/`; `docs/index.md` §10.2 mentions the
      retention.

## 2. Opening paths from the operating system and the command line

- [ ] 2.1 Route every path from argv or the operating system through one backend entry: an untouched window accepts at
      most one and every other path starts a new window; the frontend takes the accepted path after bootstrap and on a
      launch-target event and opens it with the existing open commands. Verify that the named tests pass,
      `scripts/verify` is green, and in the real app `GoMarkEdit.app/Contents/MacOS/GoMarkEdit ~/notes/a.md` shows
      `a.md`, a folder argument shows the tree, and the Viewer default shows `a.md` in Reading mode.
    - Requirements:
        - os-integration "Command-line arguments" (all scenarios) and "Opening from the operating system" (Open a file
          into a starting window, Unsupported file and New window cannot be started, all reachable from argv and Go
          tests; the macOS event scenarios are checked in the real app in task 3);
        - file-lifecycle "Open a document" (the command-line source);
        - reading-mode "Reading mode on open" (Command-line argument and Folder argument scenarios);
        - app-shell "Independent windows" (replaces "Multiple windows", whose startup-folder rule moved to
          os-integration).
    - Design: Decisions 1, 2, 3, 12 (D18).
    - Work:
        - `internal/appmodel`: `IsPristine() bool` and one untouched-Untitled helper shared with
          `file_lifecycle.go:247-249`;
        - `internal/apperr/results.go`: `LaunchTargetResult` (Decision 1);
        - `internal/bridge/events.go:5-9`: `EventApplicationLaunchTarget = "application:launch-target"`;
          `logic/adapter/events.ts:1-5`: `applicationLaunchTarget`;
        - `internal/application/application_context_holder.go:28,54,91`: replace `pendingStartupFolderPath` and
          `StartupFolderArgs` with the accepted target, `targetAccepted`, `StartupArgs` and `EmitEvent`; the
          constructor parses argv (Decision 3) into `AcceptOpenRequest`;
        - `internal/application/new_window.go`: `AcceptOpenRequest(path)` and `TakeLaunchTarget(ctx)` on the holder;
          `NewWindowLauncher.Launch(folderPath)` becomes `Launch(targetPath)` (`:15-61`); a launch failure emits
          `state:error` with `newWindowRefusal().Error` (`:63-70`); remove `OpenStartupFolderFromArgs`,
          `firstStartupFolderArgument` and `OpenPendingStartupFolder` (`:87-130`) and their calls at `main.go:228` and
          `application_context_holder.go:267`;
        - `internal/application/handler.go`: `TakeLaunchTarget(request bridge.Request) (result apperr.LaunchTargetResult)`
          with `bridge.Guard` and `bridge.Once`; `ApplicationServiceAPI` (`:22-26`) gains it;
        - `main.go`: pass `StartupArgs: os.Args[1:]` (`:107`) and `EmitEvent: runtime.EventsEmit`, following
          `emitNativeCloseRequest` (`:34-45`);
        - `takeLaunchTarget` and `subscribeLaunchTargets` in `logic/adapter/windowAdapter.ts` and `applicationAdapter`
          (`logic/adapter/index.ts:577-579`);
        - `app/useLaunchTarget.ts`, called from `app/App.tsx` next to `useDropHandler` (`:49`): subscribe to the event,
          take once when ready and on each event while ready, then `onOpenWorkspacePath` (`app/useCommands.ts:300-315`)
          or `onOpenRecentFile` (`:203-230`, current tab-set revision). Effect cleanup only unsubscribes; an in-flight
          take still opens its result (`StrictMode`, `main.tsx:14`);
        - `frontend/tests/support/harness.ts:65,181-191`: `launch(args: readonly string[] = [])` passes the arguments
          to `spawn`, and `relaunch` keeps them.
    - Changes existing tests:
        - `tests/go/integration/application/new_window_test.go:138-290`: the startup-argument tests move to
          `AcceptOpenRequest` / `TakeLaunchTarget` (the first non-flag path among several; a file argument is now taken
          as `file` instead of ignored; the folder child takes a `folder` target; retry opens nothing and the target is
          still takeable); `TestNewWindowLauncherReceivesEachRequestedFolderPath` (`:77`) also passes a file path;
        - `tests/go/integration/application/handlers_test.go:28-40`: the recording service gains `TakeLaunchTarget`;
        - `frontend/tests/unit/adapter/windowAdapter.test.ts` and `frontend/tests/integration/bootstrap.test.tsx`
          fakes gain `takeLaunchTarget` and `subscribeLaunchTargets`.
    - Adds tests:
        - Go black-box (`tests/go/integration/application/launch_target_test.go`): `-psn_0_1 a.md` accepts `a.md`;
          `a.md b.md` accepts only `a.md` and launches nothing; a relative path is made absolute; a directory is
          `folder` and a missing path `file`; `TakeLaunchTarget` returns the target once and then empty; a pristine
          window accepts the first `AcceptOpenRequest` and passes the second to a recording launcher; a window with a
          workspace, an opened file or Untitled text passes every path to the launcher; after `SetContext` a recording
          `EmitEvent` sees `application:launch-target` once per accepted path and `state:error` with "A new window could
          not be opened." for a failing launcher; retry after an `Init` failure leaves the target takeable;
        - Jest integration: the hook opens a folder through `openWorkspace` and a file through `openRecentFile`, does
          nothing for an empty result, takes again on an event after ready, ignores events before ready but takes at
          ready, enters Reading mode on a true `readingMode`, shows the refusal notice for a refused open, and under
          `StrictMode` opens a target exactly once;
        - e2e (`frontend/tests/e2e/launch-target.test.ts`): launch with a file shows it in the only tab; with a folder
          shows the tree; with `-flag file`; with a missing file shows "The file no longer exists." and the Untitled
          tab; with the Viewer default a file argument starts in Reading mode.
    - Docs:
        - `docs/architecture.md`: add D18 after D17 (line 876) and note in ADR-0035 (line 793) that D18 refines the
          startup argument; the open flow under "Opening and identity" (line 483) lists launch targets;
        - `docs/index.md`: the Desktop launch row (line 52) and the upstream list (line 150) describe file and folder
          arguments, the untouched-window rule and the new-window fallback.

## 3. macOS document types and file-open events

- [ ] 3.1 Declare the four suffixes and folders in the macOS bundle without taking any default, pass macOS file-open
      events to `AcceptOpenRequest`, and add the packaging test for the plists. Verify that the named tests pass,
      `scripts/verify` is green, and the user runs the macOS checklist in design "Verification" on an installed `.app`.
    - Depends on 2.1.
    - Requirements:
        - os-integration "Open With registration" (macOS scenarios), "Opening from the operating system" (Untouched
          window takes the file, Double-click while running, Several files at once), "Folder open from the operating
          system" (Folder dropped on the macOS Dock icon);
        - file-lifecycle "Open a document" (Opened from the operating system scenario);
        - reading-mode "Reading mode on open" (Opened from the operating system scenario).
    - Design: Decisions 4, 5, 12 (D19).
    - Work:
        - `build/darwin/Info.plist` and `build/darwin/Info.dev.plist`: static `CFBundleDocumentTypes` (Markdown, Plain
          text, Folder) and `UTImportedTypeDeclarations` for `net.daringfireball.markdown`, outside the unused
          `{{if .Info.FileAssociations}}` block (`Info.plist:26-44`);
        - `internal/application/options.go:18-55`: `Options.OnFileOpen` set into `Mac.OnFileOpen`; `main.go` passes
          `applicationContext.AcceptOpenRequest`;
        - `tests/go/integration/packaging/associations_test.go` (macOS part of Decision 4): the `encoding/xml` walk of
          both plists equals `file.SupportedDocumentSuffixes()` (`internal/file/paths.go:246`), and a `public.folder`
          entry exists.
    - Changes existing tests: `tests/go/integration/application/options_test.go:38` also asserts `Mac.OnFileOpen` is
      set while `SingleInstanceLock` stays nil.
    - Adds tests: the packaging test above. Event routing itself is covered by task 2's Go tests.
    - Docs:
        - `docs/architecture.md`: add D19 (macOS part) after D18; the "Packaged verification walkthrough" (line 723)
          gains the macOS association checklist; ADR-0001 (line 774) points to D19;
        - `docs/index.md`: remove "operating-system file associations" from the deferred list (line 232) and add a
          platform-integration paragraph to §10.3 (lines 222-226) saying what macOS declares, that Finder has no folder
          Open With, and that GoMarkEdit never becomes the default by itself.

## 4. Windows installer registration and folder menu

- [ ] 4.1 Register Open With for the four suffixes and "Open with GoMarkEdit" for folders and folder backgrounds in the
      NSIS installer, remove them on uninstall, never take a default, and build the installer from `scripts/build` on
      Windows when `makensis` is present. Verify that the named tests pass, `scripts/verify` is green, and, when
      `makensis` is installed on the macOS host, `wails build -platform windows/amd64 -nsis` compiles the installer with
      a clean working tree. Explorer behaviour is recorded as unverified.
    - Depends on 2.1 (Explorer starts one process per file with `"%1"`) and 3.1 (the packaging test file).
    - Requirements: os-integration "Open With registration" (Windows installer keeps the defaults, Uninstall), "Folder
      open from the operating system" (Windows folder menu, Windows folder background menu).
    - Design: Decisions 4, 6, 12 (D19).
    - Work:
        - `build/windows/installer/project.nsi:82-114`: replace `wails.associateFiles` / `wails.unassociateFiles` with
          local install and uninstall macros per Decision 6, naming the executable `${PRODUCT_EXECUTABLE}`;
        - `scripts/build:109-120`: add `-nsis` on MINGW, MSYS or CYGWIN when `makensis` is on `PATH`, otherwise log
          that the installer was skipped;
        - extend `tests/go/integration/packaging/associations_test.go` with the NSI line scan of Decision 4.
    - Adds tests: the NSI cases of the packaging test.
    - Docs: `docs/index.md` §10.2 (building the Windows installer locally) and the §10.3 platform-integration paragraph
      (Windows registrations, Windows 11 "Show more options", Windows runtime unverified); D19 gains the Windows part.

## 5. Linux desktop entry, MIME file and install script

- [ ] 5.1 Add the Linux desktop entry, MIME file and POSIX `install.sh [--uninstall]`, and copy them next to the Linux
      binary in `scripts/build`. Verify that the named tests pass (including the install-script test on macOS),
      `scripts/format --check` accepts `install.sh`, `scripts/verify` is green, and `scripts/build` leaves a clean tree.
      Linux desktop behaviour is recorded as unverified.
    - Depends on 2.1 (`Exec=… %f` passes one file or folder per process) and 3.1 (the packaging test file).
    - Requirements: os-integration "Open With registration" (Linux install script, Uninstall), "Folder open from the
      operating system" (Linux Open With for folders, Folders still open in the file manager); file-lifecycle
      "Supported file types" (Unsupported file chosen with Open With).
    - Design: Decisions 4, 7, 12 (D19).
    - Work:
        - new `build/linux/gomarkedit.desktop`, `build/linux/gomarkedit-mime.xml` and executable
          `build/linux/install.sh` per Decision 7 (`#!/bin/sh`, no `install -D` or `readlink -f`, `Exec=` and `Icon=`
          rewritten to absolute installed paths, never `xdg-mime default`);
        - `scripts/build`: on Linux copy the three files and `build/appicon.png` into `build/bin/`;
        - extend `tests/go/integration/packaging/associations_test.go` with the Linux checks of Decision 4.
    - Adds tests:
        - Go integration (`tests/go/integration/packaging/linux_install_test.go`, skipped when `runtime.GOOS` is
          `windows`): run `/bin/sh install.sh` from a temporary copy of the build output with a temporary `HOME`, unset
          `XDG_DATA_HOME` and a `PATH` holding recording stubs for `update-desktop-database`, `update-mime-database`
          and `xdg-mime`; assert the binary, desktop entry (absolute `Exec` and `Icon`), MIME file and icon are
          installed, both databases were refreshed, and `xdg-mime` was never called with `default`; `--uninstall`
          removes every installed file; a second install is idempotent;
        - the Linux cases of the packaging test.
    - Docs: `docs/index.md` §10.2 (Linux install script) and the §10.3 platform-integration paragraph (Linux declares
      `text/plain`, so other text files are listed and refused; Linux runtime unverified); D19 gains the Linux part.

## 6. Export to PDF

- [ ] 6.1 Make File, Export to PDF… and Ctrl+P (Cmd+P) open the system print dialog for a hidden print copy of the
      active document's current text, rendered as the preview renders it. Verify that the named tests pass,
      `scripts/verify` is green, and the user confirms on macOS that Cmd+P opens the print panel, Save as PDF writes a
      multi-page PDF of `frontend/tests/fixtures/reference-document.md` matching the preview, and cancelling writes
      nothing.
    - First step, before any committed code: a throwaway macOS spike (not committed) that prints a three-page document
      through `runtime.WindowPrint` with an `@media print` rule hiding everything else. If the output ignores the rule
      or holds only the visible viewport, stop and ask the user.
    - Requirements:
        - pdf-export "Export to PDF" (all scenarios), "Exported content matches the preview" (all scenarios except
          Mermaid diagram, which needs task 7's wait), "Export appearance" (Styled in Dark mode scenario);
        - app-shell "Controls shown disabled" (replaces "Present-but-disabled controls");
        - actions-shortcuts "Application and window shortcuts".
    - Design: Decisions 8, 12 (D20).
    - Work:
        - `Print(context.Context)` on `NativeWindowAPI` (`internal/application/native_window.go:28-33`), implemented in
          `main.go:252-273` with `runtime.WindowPrint`; a no-op in E2E headless mode; `PrintWindow` on
          `ApplicationHandler` and `ApplicationServiceAPI`;
        - `printWindow` in `logic/adapter/windowAdapter.ts` and `applicationAdapter`;
        - extract the local-image resolver from `ui/widgets/PreviewPane.tsx:276-285` into one exported function used by
          the preview and the print copy;
        - `ui/widgets/PrintDocument.tsx` (+ module CSS): `MarkdownView` with the text snapshot, the projected Markdown
          standard and the shared resolver; `@media print` rules, page padding and `print-color-adjust: exact`;
        - `app/usePdfExport.ts`: `flushActiveDocument()` then `appModelAdapter.getState()` and its
          `activeBuffer.content` for the exported document (as `app/useDocumentWrites.ts:294-295`), keep the request in
          `App.tsx` state, then call `printWindow` after the next frame (task 7 adds the wait); the copy stays mounted
          until the next export or an active-document change;
        - `app/AppFrame.tsx:51-62`: render `PrintDocument` inside `AppearanceSettingsProvider`, after
          `AppearanceControlsContent`, from a new prop;
        - `export-pdf` in `logic/actions/actionRegistry.ts:239-242`: drop `fileDeferred`, require an open document and
          no modal, add `shortcut: 'Mod+P'` and the `shortcuts` surface; its executor calls `usePdfExport`.
    - Changes existing tests:
        - `frontend/tests/unit/actions/actionRegistry.test.ts:258-262`: the deferred loop for `export-pdf` is replaced
          by an assertion that it is available with a document and unavailable without one (the File-menu id list at
          `:241` is unchanged);
        - `frontend/tests/unit/actions/actionDispatcher.test.ts:54`: the loop drops `export-pdf` and the test title
          names only Assistant and the command palette;
        - `frontend/tests/e2e/deferred-controls.test.ts:61`: Export to PDF is enabled (a document is open in that test),
          and the title no longer calls Export deferred;
        - `frontend/tests/unit/actions/registryCatalogue.test.ts` and `frontend/tests/integration/menubar.legacy.test.tsx:249`
          change only if the shortcut hint changes the item's accessible name; the order is unchanged;
        - `tests/go/integration/application/native_window_test.go` and `handlers_test.go` fakes gain `Print` /
          `PrintWindow`.
    - Adds tests:
        - Go black-box: `PrintWindow` calls the native port once per request, once for a repeated request id, and not
          in headless mode;
        - unit: `export-pdf` availability with and without a document and with a modal; `formatShortcut('Mod+P')` per
          platform;
        - integration: typing `# Draft` into Untitled without saving and exporting renders "Draft" in the print copy and
          leaves the document modified; the copy renders in the Editor arrangement and for a 3 MiB document with the
          preview paused; `$x^2$` literal under GFM and rendered under Full; the copy is replaced by the next export and
          removed on a document switch; Reading mode is unchanged afterwards;
        - e2e (`frontend/tests/e2e/pdf-export.test.ts`): Ctrl+P with the editor focused and the File menu entry each
          record one `PrintWindow` call (recorder pattern, `frontend/tests/e2e/preview-links.test.ts:228-235`); with
          `page.emulateMedia({ media: 'print' })` and Chromium `page.pdf()`, text typed into Untitled appears, the
          fixture headings and the last paragraph of a 400-paragraph document appear, and no menu or tab label appears;
          the launcher state has Export disabled and Ctrl+P does nothing; the shortcuts dialog lists Ctrl+P.
    - Docs:
        - `docs/architecture.md`: add D20; D8 (line 837) stays as written because it names no control; record the macOS
          landscape and pre-11 limitations;
        - `docs/index.md`: remove "export" from the deferred list (line 232), and add Export to PDF to the entry points
          and primary flows.

## 7. Waiting for diagrams and images before printing

- [ ] 7.1 Make the export print only once every diagram and image in the print copy has settled, or after 10 seconds,
      and ignore a second request while waiting. Verify that the named tests pass, `scripts/verify` is green, and the
      user confirms on macOS that a PDF of a document with two Mermaid diagrams and a local image shows both diagrams
      and the image.
    - Depends on 6.1.
    - Requirements: pdf-export "Waiting for diagrams and images before export" (all scenarios), "Exported content
      matches the preview" (Mermaid diagram scenario).
    - Design: Decision 9.
    - Work:
        - `ui/components/MermaidBlock.tsx:66`: `data-mermaid-state` on the root (`pending`, `drawn`, `error`, `limit`;
          `limit` for `:24,67-70`);
        - `app/usePdfExport.ts`: poll the copy every 100 ms until no `[data-mermaid-state='pending']` remains and every
          `img` is `complete`, or 10 s pass, then call `printWindow`; a request while waiting returns without effect.
    - Adds tests:
        - unit (`frontend/tests/unit/components/MermaidBlock.test.tsx`): the state attribute is `pending`, then `drawn`;
          `error` for an invalid diagram; `limit` for the 51st diagram;
        - integration (fake timers): printing waits for a pending diagram and an incomplete image, prints once both
          settle, prints at 10 s when one stays pending, treats limit placeholders and errors as settled, and a second
          request while waiting does not print twice;
        - e2e: a fixture with a Mermaid flowchart and a local image `figure.png` beside it; under print media the PDF
          from `page.pdf()` taken after the recorded `PrintWindow` call contains the drawn diagram (an SVG, not
          "Rendering diagram…") and the image.
    - Docs: D20 notes the wait and its 10-second cap.

## 8. PDF appearance setting

- [ ] 8.1 Add the persisted PDF appearance setting (Styled or Clean) to the Settings menu and the Settings dialog, and
      print the copy in neutral black-on-white tokens with Clean, including Mermaid diagrams. Verify that the named tests
      pass, `scripts/verify` is green, and the user confirms on macOS that a Clean export from Dark mode gives white pages
      with dark text and light diagrams while the screen keeps its theme.
    - Depends on 6.1 (the print copy) and 7.1 (diagrams are drawn before printing).
    - Requirements: settings "Settings catalogue and defaults", "Allowed values", "Settings menu and dialog", "PDF
      export appearance choice"; pdf-export "Export appearance" (Clean in Dark mode, Screen unchanged).
    - Design: Decision 10.
    - Work:
        - Go: `PdfAppearanceStyled` / `PdfAppearanceClean` and the `styled` default in `internal/settings/model.go`;
          `PdfAppearance string json:"pdfAppearance"` in `AppearanceSettings` (`internal/apperr/results.go:10-15`); the
          `export.pdfAppearance` key beside `view.readingWidth` (`internal/settings/repository_sqlite.go:17`) in
          `GetAppearance`, `UpdateAppearance` and `ResetAppearance`; normalization and validation in
          `internal/settings/service.go` beside `readingWidth`;
        - `PdfAppearance = 'styled' | 'clean'` and `AppearanceSettings.pdfAppearance` in
          `logic/adapter/settingsTypes.ts`; the default in `logic/settings/settingsCommands.ts`;
        - `ui/widgets/appearanceSettingsContext.ts:8-26`: `pdfAppearance` in `AppearanceState`,
          `onPdfAppearanceChange` in the controller; `ui/widgets/AppearanceControls.tsx`: state, `persist`, and a
          segmented row in `AppearanceControlsContent`; the dialog row in `ui/widgets/dialogs/SettingsDialog.tsx`;
        - actions: `'pdf-appearance'` in the `ActionId` union after `'reading-width'`
          (`logic/actions/actionRegistry.ts:60`) and `entry('pdf-appearance', 'application', ['settings-menu'])` after
          `:280`; label `action.pdf-appearance.label` ("PDF appearance") next to `action.reading-width.label`
          (`i18n/locales/en.json:294`);
        - `ui/widgets/Menubar/SettingsMenu.tsx`: a radio group after Reading width (pattern `:73-75,250-262`) using
          `rowUnavailable('pdf-appearance', …)`, wired in `ui/widgets/Menubar/ApplicationMenubar.tsx`;
        - catalogue keys `settings.pdfAppearance`, `.styled`, `.clean`, `.description`;
        - `ui/widgets/PrintDocument.tsx`: `data-print-appearance` from `useAppearanceSettings()`; the Clean token block
          in `ui/styles/tokens.css` (token list in design Decision 10); `resolveMermaidTheme(element)`
          (`logic/markdown/mermaid/theme.ts:41-58`) and `MermaidBlock.tsx:28-33` passing its root.
    - Changes existing tests:
        - `frontend/tests/unit/actions/registryCatalogue.test.ts:30`: `'pdf-appearance'` follows `'reading-width'`;
        - Go: appearance expectations in `tests/go/unit/settings/service_test.go`, `tests/go/unit/settings/handler_test.go`
          and `tests/go/integration/settings/repository_sqlite_test.go` (including
          `TestResetAppearanceChangesOnlyDeliveredAppearanceKeys`, `:676`) include `pdfAppearance`;
        - frontend: `frontend/tests/unit/widgets/AppearanceControls.test.tsx`,
          `frontend/tests/unit/widgets/dialogs/SettingsDialog.test.tsx`,
          `frontend/tests/unit/settings/settingsCommands.test.ts`, and every typed fixture the type check flags (e.g.
          `frontend/tests/support/loadedMarkdownSettings.ts`).
    - Adds tests:
        - Go black-box: default `styled`; `clean` saved and read back; other written values refused with nothing
          stored; Reset appearance restores `styled`; a missing or invalid stored value read as `styled`;
        - unit: the Mermaid theme resolved inside a Clean element is the light palette while the root is dark;
        - integration: menu and dialog show the stored choice, stay in sync, are reachable with Tab and arrow keys and
          have localized names; Reset restores Styled; the print copy carries Clean while the on-screen preview keeps
          its theme;
        - e2e: choose Clean in the Settings menu, export under print media in Dark mode and check with `page.pdf()` that
          the page background is white; the choice survives a restart.
    - Docs: the `docs/index.md` preferences paragraph (lines 111-115) lists PDF appearance (Styled by default, Clean,
      stored as `styled` or `clean` under `export.pdfAppearance`); D20 notes the setting.
