**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-01..04, DD-32, DD-34), `02_Architecture/04_WAILS_INTEGRATION.md`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`, `04_Build_and_Release/03_CI_AND_HOOKS.md`, `05_Dependencies/01_GO_DEPENDENCIES.md`

# Build Matrix

How GoMarkEdit is compiled into shippable artifacts, per OS. GoMarkEdit is a Wails v2 desktop app
(Go backend + React/Vite/TypeScript frontend embedded in the native webview) targeting Windows,
macOS, and Linux from one codebase (DD-01, DD-02, DD-04). The overriding constraint is that the Go
backend is **CGO-free** (DD-03): the build never links a C SQLite library, so cross-toolchain setup
stays minimal and reproducible.

## Table of Contents

1. [Supported OS baseline](#1-supported-os-baseline)
2. [Artifact matrix](#2-artifact-matrix)
3. [Per-OS build prerequisites](#3-per-os-build-prerequisites)
4. [CGO-free / pure-Go SQLite](#4-cgo-free--pure-go-sqlite)
5. [Why each OS builds on its own runner](#5-why-each-os-builds-on-its-own-runner)
6. [Wails build flags](#6-wails-build-flags)
7. [Dev vs prod (isDev folder isolation)](#7-dev-vs-prod-isdev-folder-isolation)
8. [Signing, notarization, and install caveats](#8-signing-notarization-and-install-caveats)

## 1. Supported OS baseline

| OS | Minimum baseline | Webview engine | Notes |
|---|---|---|---|
| Windows | **Windows 10+** (x64) | WebView2 (Evergreen runtime) | Runtime bootstrapped by the installer if absent (DD-01). |
| macOS | **macOS 12+ (Monterey)** | WKWebView (system) | `LSMinimumSystemVersion` set in `Info.plist`. Universal not required — separate arm64/amd64 artifacts. |
| Linux | **Modern Linux** with GTK3 + WebKit2GTK 4.1 | WebKitGTK (`webkit2gtk-4.1`) | Baseline is a current LTS such as Ubuntu 24.04; the `webkit2_41` build tag selects the 4.1 ABI. |

These map to DD-01. There is no 32-bit target and no Windows-on-ARM target in v1.

## 2. Artifact matrix

Each release produces one primary artifact per row. Artifact naming embeds the version and platform
(`GoMarkEdit-<version>-<platform>`), matching the release job in `03_CI_AND_HOOKS.md`.

| Platform | Runner | Output | Release asset | Build tags |
|---|---|---|---|---|
| `darwin/arm64` | `macos-latest` (Apple Silicon) | `GoMarkEdit.app` bundle | `GoMarkEdit-<v>-macos-arm64.app.zip` | — |
| `darwin/amd64` | `macos-13` (Intel) | `GoMarkEdit.app` bundle | `GoMarkEdit-<v>-macos-amd64.app.zip` | — |
| `windows/amd64` | `windows-latest` | `GoMarkEdit.exe` (+ NSIS installer) | `GoMarkEdit-<v>-windows-amd64.exe`, `GoMarkEdit-<v>-windows-amd64-installer.exe` | — |
| `linux/amd64` | `ubuntu-24.04` | ELF binary (+ `.deb`/`.rpm` via nfpm) | `GoMarkEdit-<v>-linux-amd64`, `.deb`, `.rpm` | `webkit2_41` |

- **macOS** ships **both arm64 and amd64** as separate `.app.zip` artifacts (DD-01). The `.app`
  bundle is zipped with `-X` to preserve the executable bit on `Contents/MacOS/GoMarkEdit` (see the
  release packaging in `03_CI_AND_HOOKS.md`).
- **Windows** ships the bare `.exe` plus an **NSIS installer** that registers file associations and
  bootstraps WebView2 (`02_PACKAGING_AND_ASSOCIATIONS.md`).
- **Linux** ships the raw executable plus **`.deb`/`.rpm`** packages produced by nfpm carrying the
  `.desktop` entry, MIME registration, and icon (`02_PACKAGING_AND_ASSOCIATIONS.md`).
- Every release also carries a `SHA256SUMS.txt` for download verification.

## 3. Per-OS build prerequisites

Common to all: **Go 1.25+** (DD-03), **Node.js 22+** (an active LTS line — Node 20 reached
end-of-life on 2026-04-30, and Node 24 is the current Active LTS) plus npm, and the **Wails CLI**
(`go install github.com/wailsapp/wails/v2/cmd/wails@latest`).

- **macOS** — **Xcode Command Line Tools** (`xcode-select --install`). No CGO toolchain is needed for
  SQLite, but the CLT provide the linker and codesign stub Wails invokes.
- **Windows** — **C++ Build Tools** (MSVC) and the **WebView2 Runtime** for local runs. The Evergreen
  WebView2 runtime is redistributed/bootstrapped by the NSIS installer for end users; a build/dev
  machine needs it installed to run the app.
- **Linux** — **`build-essential`**, **`libgtk-3-dev`**, and **`libwebkit2gtk-4.1-dev`**
  (`sudo apt-get install -y build-essential libgtk-3-dev libwebkit2gtk-4.1-dev`). These provide the
  GTK3 + WebKitGTK 4.1 headers the webview links against; the app itself is still CGO-free for
  SQLite, but the Linux webview binding requires these system dev packages at build time.

`wails doctor` on each machine confirms the toolchain is complete before a build.

## 4. CGO-free / pure-Go SQLite

GoMarkEdit uses **`modernc.org/sqlite`** — a pure-Go SQLite (DD-03) — for the settings/recent KV store
(`internal/db`, `05_Dependencies/01_GO_DEPENDENCIES.md`). Consequences for the build:

- **`CGO_ENABLED=0` is the default posture.** No C compiler is required to build the SQLite layer, so
  there is no cross-compilation friction from a C SQLite dependency and no libsqlite ABI to match.
- **Reproducibility.** Builds do not depend on a system SQLite version; the database engine is
  vendored as Go source and pinned in `go.mod`.
- The only C-adjacent system requirement is the **Linux webview** (`libwebkit2gtk-4.1-dev`,
  `libgtk-3-dev`), which is a property of Wails on Linux — not of the database. macOS and Windows use
  the system webview and need no such dev package.

Never introduce a CGO SQLite driver (e.g. `mattn/go-sqlite3`) — it would break `wails build`
cross-compilation and violates DD-03 (see `CLAUDE.md` "Never do this").

## 5. Why each OS builds on its own runner

Each platform is built on a **native runner of that OS** (macOS `.app` on macOS, `.exe` on Windows,
ELF on Linux) rather than cross-compiling from a single host, because:

- **The webview binding is OS-native.** Wails links WKWebView (macOS), WebView2 (Windows), and
  WebKitGTK (Linux) — each needs that OS's SDK/headers and, on Linux, the GTK3/WebKit2GTK dev
  libraries. Cross-compiling the webview layer is impractical.
- **Packaging is OS-native.** `.app` bundle assembly + `Info.plist` (macOS), NSIS installer +
  WebView2 bootstrap (Windows), and `.deb`/`.rpm` via nfpm (Linux) each require the host OS or its
  packaging tools.
- **Signing/codesign stubs** (even the unsigned ad-hoc path, DD-34) run on the native OS.

The CI matrix therefore fans out to `macos-latest` (arm64), `macos-13` (amd64), `windows-latest`, and
`ubuntu-24.04`, each running `wails build --platform <p>` (`03_CI_AND_HOOKS.md`).

## 6. Wails build flags

Base command per platform:

```bash
wails build --platform <os>/<arch> -o "<output_name>" \
  -ldflags "-X gomarkedit/internal/settings.AppVersion=<version>"
```

- **`--platform <os>/<arch>`** — selects the target triple (`darwin/arm64`, `darwin/amd64`,
  `windows/amd64`, `linux/amd64`).
- **`-o <output_name>`** — names the emitted binary/bundle under `build/bin/`.
- **`-ldflags "-X gomarkedit/internal/settings.AppVersion=<version>"`** — stamps the release version
  into the binary at link time; the same version is patched into `wails.json`
  (`.version`, `.info.productVersion`) before the build so `Info.plist` / Windows `info.json`
  version placeholders resolve.
- **Linux only:** add **`-tags webkit2_41`** to select the WebKit2GTK 4.1 ABI on the Ubuntu 24.04
  runner. macOS/Windows pass no extra tags.
- **`-nsis`** (Windows) triggers the NSIS installer build alongside the `.exe`
  (`02_PACKAGING_AND_ASSOCIATIONS.md`).
- **`-clean`** may be used in CI to force a fresh `build/bin`.

Production builds run in release mode (Wails strips the dev bridge; the frontend is the
`vite build` output embedded via `go:embed all:frontend/dist` in `main.go`). `frontend/dist` and the
Wails bindings (`frontend/wailsjs/`) must exist before any Go compile step — this ordering is
enforced by the hooks and CI (`03_CI_AND_HOOKS.md`).

## 7. Dev vs prod (isDev folder isolation)

GoMarkEdit keeps a **dev build fully isolated** from a production install so a `wails dev` session never
touches real user settings, the real DB, or real logs (`internal/file`
in `02_Architecture/01_MODULE_INVENTORY.md`):

| Concern | Production | `wails dev` |
|---|---|---|
| Config/DB/logs root (macOS) | `~/Library/Application Support/GoMarkEdit` | `~/Library/Application Support/GoMarkEdit-Dev` |
| Config/DB/logs root (Linux) | `~/.config/GoMarkEdit` | `~/.config/GoMarkEdit-Dev` |
| Config/DB/logs root (Windows) | `%APPDATA%\GoMarkEdit` | `%APPDATA%\GoMarkEdit-Dev` |
| Log level | WARNING | DEBUG |
| Frontend | embedded `frontend/dist` | Vite dev server (hot reload) |

Isolation is driven by an `isDev` signal (`internal/bootstrap.IsDevBuild` build tag +
`internal/file` path resolution). `just dev` runs `wails dev`; `just dev-ui` runs the frontend alone
against the **bridge mock** (`frontend/src/dev/bridge-mock/`) with no Go backend. See
`01_BUILD_MATRIX.md` §6 for the prod build path.

## 8. Signing, notarization, and install caveats

Per DD-34, v1 ships **unsigned** — **no code signing, no macOS notarization**, and **no
auto-update**. This is a deliberate, documented tradeoff for an MIT open-source app:

- **macOS** — Gatekeeper will warn on first launch of the unsigned `.app`; users open it via
  right-click → Open (or `xattr -dr com.apple.quarantine`). This caveat is documented for end users.
- **Windows** — SmartScreen may warn on the unsigned installer/exe until reputation accrues. The NSIS
  script leaves signtool hooks commented out for a future signed build.
- **Linux** — `.deb`/`.rpm` are unsigned; users install with the usual package manager.

No telemetry or update-check code is built into any artifact (DD-32, DD-33). Adding signing later is
an additive change tracked by its own story/ADR.
