# Proposal

## Why

GoMarkEdit cannot be chosen to open Markdown or text files from the operating system.

- No platform package declares the four supported suffixes. Finder, Explorer and Linux file managers never list
  GoMarkEdit under "Open With", so it can neither open a double-clicked file nor become the default application.
- A file passed on the command line is silently ignored: only an existing directory as the first argument is used.
  macOS sends file-open events to a running application, and nothing handles them.
- Windows and Linux packaging is not filled in, so a developer who builds locally on those systems gets a bare binary.
- `docs/index.md` lists "operating-system file associations" and "export" as deferred, and the add-reading-mode change
  explicitly postponed opening files from the operating system. File, Export to PDF… is shown but disabled.

The verification tooling also leaks disk space. Every run keeps its own Jest, golangci-lint and TypeScript caches, so
`.local_tmp_files/runs/` holds about 170 run folders (7.6 GB) that nothing reads again.

## What Changes

- **Open With registration on macOS, Windows and Linux** for `.md`, `.markdown`, `.mdown` and `.txt`.
    - The user can pick GoMarkEdit in the operating system's Open With list and make it the default through the
      operating system's own controls.
    - Installing or starting GoMarkEdit never sets or requests a default and never asks to; an existing default stays.
    - The Windows installer and the Linux install script remove their registrations on uninstall.
    - On Linux, GoMarkEdit declares plain text, so it is also listed for other plain-text files. Choosing it for an
      unsupported file shows the existing "not supported" refusal.
- **Open a folder from the operating system** where the platform allows it:
    - Windows: "Open with GoMarkEdit" on a folder and on a folder's background in Explorer;
    - Linux: GoMarkEdit listed in Open With for folders;
    - macOS: drop a folder on GoMarkEdit's Dock or application icon. Finder offers no Open With for folders; this is a
      documented limitation.
- **Opening from the operating system and the command line.**
    - Only the first argument that does not start with `-` counts. A folder opens as the workspace; any other path
      opens as a document through the normal open checks, and a refusal is shown in the window.
    - Every path opened from outside the application gets its own window. The process started for the path shows
      it; on macOS, where the operating system sends paths to a running GoMarkEdit, only the first path that arrives
      while the window is still starting opens in it. Every other path opens in a new, independent window, whatever
      the existing windows show. Opening into the current window stays with drag and drop and the in-app commands. If
      the new window cannot be started, the existing "A new window could not be opened." message is shown.
    - With the Reading (Viewer) default open mode, a file opened this way is shown in Reading mode.
- **Export to PDF** becomes available from File, Export to PDF… and Ctrl+P (Cmd+P on macOS).
    - It opens the operating system's print dialog, where the user saves a PDF or prints. Cancelling writes nothing.
    - The macOS minimum version rises from 10.13 to 11, the first version on which the webview can print.
    - The output is the active document rendered as the preview renders it: Mermaid diagrams as drawn, math only where
      the current Markdown standard renders it, the same placeholders for remote images and render limits. The whole
      document is exported, whatever the arrangement or scroll position.
    - A new PDF appearance setting chooses Styled (current theme colors, the default) or Clean (black on white).
- **Verification temp retention (tooling only, no behavior spec).** Caches move to one shared
  `.local_tmp_files/cache/` folder. Each new run keeps only the 10 newest run folders and removes leftover E2E and
  tooling test folders older than 24 hours. `.local_tmp_files/specification/`, `.local_tmp_files/baseline/*.json`
  and `.local_tmp_files/e2e-performance/` are never touched.

Out of scope:

- release artifacts for Windows and Linux: `.github/workflows/release.yml` stays macOS-only, and Windows and Linux
  packaging is built locally by developers;
- a single-instance mode, and any "make GoMarkEdit the default" prompt or setting;
- a setting that opens files from the operating system in the last active window instead of a new one;
- a Finder Open With entry for folders, and a Quick Look or thumbnail extension;
- a PDF writer that bypasses the print dialog, page size or margin settings, and headers or footers;
- custom document icons (the application icon is used).

## Capabilities

### New Capabilities

- `os-integration`: Open With registration for the supported suffixes, opening files and folders passed by the
  operating system or on the command line (which window receives them), and folder open from the file manager.
- `pdf-export`: exporting the active document through the system print dialog, its fidelity to the preview, and its
  appearance.

### Modified Capabilities

- `app-shell`: the startup-folder rule leaves "Multiple windows" (it moves to `os-integration`; the rest is restated as
  "Independent windows"), and Export to PDF leaves "Present-but-disabled controls" (restated as "Controls shown
  disabled"). Both are removed and re-added because OpenSpec cannot drop a scenario from a modified requirement.
- `file-lifecycle`: the operating system and the command line become sources of "Open a document"; "Supported file
  types" covers an unsupported file chosen through Open With.
- `reading-mode`: "Reading mode on open" covers files opened from the operating system and the command line.
- `settings`: a PDF appearance setting (Styled or Clean, default Styled) joins the catalogue, the allowed values, the
  Settings menu and the Settings dialog.
- `actions-shortcuts`: Ctrl+P (Cmd+P) runs Export to PDF.

## Impact

- **Backend (Go):** the application context holder replaces its pending startup folder with one launch target,
  accepted only while the window is starting, and a `TakeLaunchTarget` binding; macOS file-open events wired in
  `internal/application/options.go`; the new-window launcher passes any path; a `PrintWindow` binding;
  the appearance settings group gains `export.pdfAppearance` (`styled` or `clean`). Generated bindings and models
  follow.
- **Frontend:** a launch-target hook that reuses the existing open commands; a print copy of the active document built
  on the existing Markdown renderer from the backend's flushed text, print styles, a wait for diagrams and images, the
  `export-pdf` action with Mod+P, and the PDF appearance controls in the Settings menu and dialog.
- **Packaging:** `build/darwin/Info.plist` and `Info.dev.plist` document types and `LSMinimumSystemVersion` 11.0; local registry macros in
  `build/windows/installer/project.nsi`; new `build/linux/` desktop entry, MIME file and install script; `scripts/build`
  builds the Windows installer when `makensis` is present and copies the Linux files next to the binary. `wails.json`
  stays without file associations.
- **Tooling:** `scripts/lib/common.sh`, `scripts/lib/stages.sh`; the Unit stage also runs
  `tools/verify/results.test.mjs`.
- **Docs:** `docs/index.md`, `docs/architecture.md` (three new durable decisions), `AGENTS.md`,
  `docs/e2e-performance.md`.
- **Verification limits:** only macOS can be exercised at runtime by the user. Windows installer output and the Linux
  install script are checked by builds and tests; their behavior inside Explorer and Linux desktops stays unverified.
- No new dependency, no network request and no data migration. A missing `export.pdfAppearance` row reads as Styled.
  The first run after the tooling change deletes the old run folders once.
