**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-07, DD-25, DD-26, DD-34), `01_Product/08_FILE_ASSOCIATIONS.md`, `02_Architecture/04_WAILS_INTEGRATION.md`, `04_Build_and_Release/01_BUILD_MATRIX.md`, `04_Build_and_Release/03_CI_AND_HOOKS.md`

# Packaging and Associations

How GoMarkEdit's file associations (DD-07) and app icon are materialised into shippable packages, per
OS. The product-level behaviour ("Open With", set-as-default, `OnFileOpen`/argv routing) is specified
in `01_Product/08_FILE_ASSOCIATIONS.md`; **this file covers the packaging mechanics** that make that
behaviour real. The single declaration source is `wails.json` `info.fileAssociations`; each OS build
projects it into the native metadata format.

## Table of Contents

1. [Declaration source: wails.json fileAssociations](#1-declaration-source-wailsjson-fileassociations)
2. [App icon requirements](#2-app-icon-requirements)
3. [macOS: CFBundleDocumentTypes + Info.plist](#3-macos-cfbundledocumenttypes--infoplist)
4. [Windows: NSIS installer + ProgID](#4-windows-nsis-installer--progid)
5. [Linux: .desktop + MIME + nfpm](#5-linux-desktop--mime--nfpm)
6. [Extension set consistency](#6-extension-set-consistency)

## 1. Declaration source: wails.json fileAssociations

GoMarkEdit declares its handled document types **once**, in `wails.json` under
`info.fileAssociations`. Each entry names an extension, a human-readable type name, the role, and the
icon asset. Wails expands these into per-OS metadata at build time.

```jsonc
{
  "$schema": "https://wails.io/schemas/config.v2.json",
  "name": "GoMarkEdit",
  "outputfilename": "GoMarkEdit",
  "info": {
    "companyName": "Oleksandr Kostenko",
    "productName": "GoMarkEdit",
    "productVersion": "dev",
    "copyright": "Copyright © Oleksandr Kostenko",
    "comments": "Native offline Markdown editor & viewer",
    "fileAssociations": [
      { "ext": "md",       "name": "Markdown Document",  "description": "Markdown Document",  "iconName": "gomarkedit-doc", "role": "Editor" },
      { "ext": "markdown", "name": "Markdown Document",  "description": "Markdown Document",  "iconName": "gomarkedit-doc", "role": "Editor" },
      { "ext": "mdown",    "name": "Markdown Document",  "description": "Markdown Document",  "iconName": "gomarkedit-doc", "role": "Editor" },
      { "ext": "txt",      "name": "Plain Text Document","description": "Plain Text Document","iconName": "gomarkedit-doc", "role": "Editor" }
    ]
  }
}
```

- **`ext`** — one of the declared extensions **`md`, `markdown`, `mdown`, `txt`** (DD-07). One entry
  per extension.
- **`name` / `description`** — the type label shown by the OS ("Markdown Document").
- **`role`** — **`Editor`** (GoMarkEdit can edit, not merely view, the type; DD-25). This maps to
  `CFBundleTypeRole=Editor` on macOS.
- **`iconName`** — the document-type icon asset (`gomarkedit-doc`), resolved under `build/<os>/` per OS
  (`.icns` fragment on macOS, `.ico`-derived on Windows, PNG on Linux).

The release version is patched into `wails.json` (`.version`, `.info.productVersion`) before each
build so version placeholders in the generated metadata resolve (`03_CI_AND_HOOKS.md`).

## 2. App icon requirements

Two icon roles ship:

- **Application icon** — the app/binary icon. Source is a high-resolution master (1024×1024 PNG) in
  `build/appicon.png`, from which Wails derives `build/darwin/*.icns`, `build/windows/icon.ico`, and
  the Linux PNG set.
- **Document-type icon** (`gomarkedit-doc`) — the custom Markdown file icon shown by the OS for
  associated files (DD-07). Provided per OS: an `.icns` fragment referenced by
  `CFBundleTypeIconFile` (macOS), an `.ico` referenced by the ProgID's `DefaultIcon` (Windows), and a
  PNG installed into the icon theme (Linux).

Both must be **bundled offline** — no runtime download (DD-32). Icons are visually consistent across
OSes and follow each platform's shape conventions (rounded-rect masking is handled by the OS on
macOS/Windows).

## 3. macOS: CFBundleDocumentTypes + Info.plist

Wails generates the app bundle `Info.plist` from `wails.json` and the `build/darwin/Info.plist`
template. When `info.fileAssociations` is non-empty, Wails emits a **`CFBundleDocumentTypes`** array —
one `<dict>` per association — automatically:

```xml
<key>CFBundleDocumentTypes</key>
<array>
  <dict>
    <key>CFBundleTypeExtensions</key>
    <array><string>md</string></array>
    <key>CFBundleTypeName</key>
    <string>Markdown Document</string>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleTypeIconFile</key>
    <string>gomarkedit-doc</string>
  </dict>
  <!-- markdown, mdown, txt … -->
</array>
```

Also set in the plist: **`LSMinimumSystemVersion` = 12.0** (macOS 12+ baseline, DD-01),
`CFBundleIdentifier` (`com.gomarkedit.GoMarkEdit`), version keys, and `NSHighResolutionCapable`. Where a
custom UTI is warranted, `UTImportedTypeDeclarations` / `UTExportedTypeDeclarations` may accompany the
document types (`01_Product/08_FILE_ASSOCIATIONS.md#macos`).

macOS delivers an opened file through the Wails **`OnFileOpen`** callback (wired via `Mac.OnFileOpen`
in `main.go`), routed through `internal/fileassoc` (DD-26). The app appears in Finder "Open With";
the user sets default via Get Info → "Open with" → "Change All…". GoMarkEdit never seizes the default
silently (DD-25). The `.app` is **unsigned** (DD-34) — see the Gatekeeper caveat in
`01_BUILD_MATRIX.md` §8.

## 4. Windows: NSIS installer + ProgID

The Windows release is built with **`wails build --platform windows/amd64 -nsis`**, producing both
`GoMarkEdit.exe` and an NSIS installer (`build/windows/installer/project.nsi`, using the Wails
`wails_tools.nsh` macros). The installer:

- **Bootstraps the WebView2 runtime** (`!insertmacro wails.webview2runtime`) so Windows 10 machines
  without Evergreen WebView2 still run the app (`01_BUILD_MATRIX.md` §3).
- **Registers a ProgID** for GoMarkEdit and links each declared extension (`.md`, `.markdown`,
  `.mdown`, `.txt`) to it, with the custom document icon as the ProgID `DefaultIcon`
  (`!insertmacro wails.associateFiles`, derived from `info.fileAssociations`).
- Creates Start-menu and Desktop shortcuts and writes an uninstaller that **unassociates** the
  extensions (`wails.unassociateFiles`).

An opened file is delivered to the launched process as the **first CLI argument**, normalised by
`internal/fileassoc` (DD-26). Windows policy forbids force-seizing a default (DD-25); the app appears
in "Open with" and the user sets it as default via the installer option or Settings → Default apps,
optionally nudged by the in-app "set as default" prompt (`01_Product/08_FILE_ASSOCIATIONS.md`). The
installer and exe are **unsigned** in v1 (DD-34) — SmartScreen caveat in `01_BUILD_MATRIX.md` §8; the
`.nsi` keeps `signtool` hooks commented for a future signed build.

## 5. Linux: .desktop + MIME + nfpm

The Linux release ships the raw binary plus **`.deb` and `.rpm`** packages produced by **nfpm**
(configured in `build/linux/nfpm.yaml`, invoked by CI after `wails build … -tags webkit2_41`). The
packages carry:

- A **`.desktop` entry** (`gomarkedit.desktop`) with `Exec=gomarkedit %f`, `Categories=Utility;TextEditor;`,
  the app icon, and a **`MimeType=`** line listing the handled types
  (`text/markdown;text/x-markdown;text/plain;`).
- A **custom MIME type definition** installed under `usr/share/mime/packages/gomarkedit.xml` mapping the
  extensions and `text/markdown` glob patterns, plus the document icon under the hicolor icon theme.
- **Post-install / post-remove scriptlets** running `update-desktop-database`, `update-mime-database`,
  and `gtk-update-icon-cache` so the desktop environment picks up the association.

An opened file arrives as the **first CLI argument** (DD-26). A user sets GoMarkEdit as default with
`xdg-mime default gomarkedit.desktop text/markdown`; the app may prompt to run/confirm this rather than
doing it silently (DD-25). Packages are unsigned (DD-34).

## 6. Extension set consistency

The **same four extensions** — `.md`, `.markdown`, `.mdown`, `.txt` (DD-07) — must appear
identically in every place they are declared, or OS integration and in-app filtering will disagree:

- `wails.json` `info.fileAssociations` (this file, §1).
- macOS `CFBundleDocumentTypes`, Windows ProgID registration, Linux `.desktop` `MimeType` + MIME XML.
- The **open dialog filter** and the **workspace tree filter** (DD-06, `internal/docs`,
  `internal/workspace`).
- The `internal/fileassoc` accepted-extension check for OS-open routing.

A story that changes the extension set must update **all** of these together and re-run
`wails generate module` / rebuild packages. This is called out so no single surface drifts from the
others.
