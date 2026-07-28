**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md`, `01_Product/03_FILES_TABS_WORKSPACE.md`, `02_Architecture/04_WAILS_INTEGRATION.md`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`

# File Associations

OS integration that makes GoMarkEdit a handler for Markdown files (DD-07, DD-25, DD-26). Refines
`01_FUNCTIONAL_REQUIREMENTS.md#fr-associations`. Per-OS packaging detail lives in
`04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`; the backend routing helper is
`internal/fileassoc`.

## Table of Contents

1. [Declared extensions](#declared-extensions)
2. [macOS](#macos)
3. [Windows](#windows)
4. [Linux](#linux)
5. [OnFileOpen](#onfileopen)
6. [Open in default mode](#open-in-default-mode)
7. [Set as default](#set-as-default)
8. [Multi-instance routing](#multi-instance-routing)
9. [Edge cases](#edge-cases)

## Declared extensions

GoMarkEdit declares handling for **`.md`, `.markdown`, `.mdown`, `.txt`** (DD-07) and ships a custom
document icon for its file types. The same extension set filters the open dialog and the workspace
tree (DD-06). The declaration is made in `wails.json` `info.fileAssociations` and materialised per OS
by the packaging step.

## macOS

Associations are declared via `CFBundleDocumentTypes` (and matching `UTImportedTypeDeclarations` /
`UTExportedTypeDeclarations` where needed) in the app bundle `Info.plist`, produced from
`wails.json`. macOS delivers an opened file through the Wails **`OnFileOpen`** callback (wired via
`Mac.OnFileOpen` in `main.go`). The app appears in Finder's "Open With" and can be set as default via
Finder's Get Info → "Open with" → "Change All…"; GoMarkEdit cannot silently seize the default (DD-25).

## Windows

Associations are registered by the installer, which declares a **ProgID** for GoMarkEdit and links each
extension to it, plus the custom icon. An opened file is delivered as the **first CLI argument** to the
launched process. GoMarkEdit appears in "Open with"; the user sets it as default through the installer
option or Settings → Default apps. Windows policy prevents an app from force-seizing a default (DD-25).

## Linux

Associations use a **`.desktop`** entry with `MimeType=` for the Markdown/text MIME types, an
`install`ed icon, and registration via the freedesktop database (`update-desktop-database`,
`xdg-mime`). An opened file arrives as the **first CLI argument**. `xdg-mime default gomarkedit.desktop
text/markdown` sets GoMarkEdit as default for a type; the app may prompt the user to run/confirm this
rather than doing it silently.

## OnFileOpen

The single normalization point for OS-open is `internal/fileassoc` (`ResolveOpenTarget` /
`OpenPathArgs`), which turns a macOS `OnFileOpen` path or a Windows/Linux argv path into an open
request (DD-26). This mapping is pure and unit-testable. It handles paths with spaces/Unicode
(EC-ASSOC-3) and multiple paths (EC-ASSOC-5). On macOS
cold start, `OnFileOpen` may fire before the app is fully initialised — such events are **queued** and
opened once the context/app is ready (EC-ASSOC-6).

## Open in default mode

A file opened from the OS opens in the configured **default open mode** — Reading (Viewer) or Editor (default Editor)
(DD-27, `02_EDITOR_AND_VIEWER_MODES.md#default-open-mode`). This is the same setting used by
tree-open. An unsupported extension can only reach GoMarkEdit through an explicit user "Open With"
choice (the OS routes only the four declared extensions automatically), so it is handled
deterministically: if the file's content **decodes as text**, it opens as a tolerantly-decoded text
document (the same tolerant read as `.txt`, EC-DOCS-8); if it is **clearly binary**, the app declines
with a toast and opens nothing (EC-ASSOC-2). It is never silently corrupted.

## Set as default

"Default app" means: GoMarkEdit appears in the OS "Open With" list on all three OSes, is **settable as
default**, and — when a Markdown file is opened — **launches and opens it** (DD-25). GoMarkEdit **cannot
and will not** silently seize the default on Windows/macOS. When it detects it is not the default it
may present a non-blocking **"set as default" prompt** with the OS-appropriate instructions/action
(EC-ASSOC-4); the user remains in control.

## Multi-instance routing

Because GoMarkEdit supports multiple instances with no single-instance lock (DD-08), an OS-open while an
instance is already running follows a defined routing policy: the open may be handled by launching a
**new window/instance** (VS Code-style) rather than being forwarded to an existing process
(EC-ASSOC-1). Each opened path yields an open request routed per this policy; multiple paths open per
`03_FILES_TABS_WORKSPACE.md#tabs` and this section (EC-ASSOC-5). The routing rule is documented here so
stories do not assume single-instance forwarding.

## Edge cases

- **EC-ASSOC-1** — OS-open while an instance runs → route per multi-instance policy (new instance).
- **EC-ASSOC-2** — Unsupported extension via explicit "Open With" → decode-as-text if the content is
  textual (tolerant read, EC-DOCS-8); decline with a toast if it is clearly binary. Never corrupt it.
- **EC-ASSOC-3** — Path with spaces/Unicode → parsed correctly by `fileassoc`.
- **EC-ASSOC-4** — Not the default handler → "set as default" prompt, never forced.
- **EC-ASSOC-5** — Multiple paths at once → open each per routing policy.
- **EC-ASSOC-6** — `OnFileOpen` before init (macOS cold start) → queue and open when ready.
