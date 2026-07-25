**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-17
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-34, DD-65, DD-66, DD-67), `04_Build_and_Release/01_BUILD_MATRIX.md`, `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`, `04_Build_and_Release/03_CI_AND_HOOKS.md`, `assets/icon/README.md`, `02_Architecture/01_MODULE_INVENTORY.md`, `../docs/adr/0015-cicd-versioning-icon.md` (ADR-0015)

# Versioning, Icon and CI/CD

The release-finalization layer of the build system: how the app version gets into every artifact
(DD-65), how all platform icons derive from one canonical source (DD-66), and the tag-triggered
release workflow with its production-data isolation guarantee (DD-67). It completes what
`03_CI_AND_HOOKS.md` outlines: that file owns the PR-level gate set, hooks, and command taxonomy;
**this file is the normative description of the release pipeline itself**. Owned by **Phase 07**
(`07_Phases/PHASE_07_INSTALL_IT.md`); recorded in ADR-0015.

## Table of Contents

1. [Version injection](#1-version-injection)
2. [App icon pipeline](#2-app-icon-pipeline)
3. [Release workflow](#3-release-workflow)
4. [CI/dev isolation from production data](#4-cidev-isolation-from-production-data)
5. [Edge cases (REL)](#5-edge-cases-rel)

## 1. Version injection

Per **DD-65**, the **git tag is the single source of truth for the app version**. There is **no
hand-maintained version constant anywhere** — no VERSION file, no bumped `package.json` field, no
release-notes-driven constant. The mechanics:

- **The variable.** `internal/settings` declares a package-level string variable
  **`AppVersion`** whose compiled-in default is **`"dev"`**. It is a plain `var` (not a `const`) so
  the linker can overwrite it.
- **ldflags injection.** A release build stamps the real version at link time:

  ```bash
  wails build --platform <os>/<arch> -o "<output_name>" \
    -ldflags "-X gomarkedit/internal/settings.AppVersion=$VERSION"
  ```

  The `-X` path uses the full module path (`gomarkedit/internal/settings.AppVersion`); see
  `01_BUILD_MATRIX.md#6-wails-build-flags`.
- **The `wails.json` jq patch — and why it exists.** ldflags reach only the Go binary. The
  OS-level packaging metadata is generated from `wails.json` templates: the macOS `Info.plist` and
  the Windows version resource (`info.json`) both resolve a `{{.Info.ProductVersion}}` placeholder
  at build time. So **before** each `wails build`, CI patches both fields in place:

  ```bash
  jq --arg v "$VERSION" '.version = $v | .info.productVersion = $v' wails.json > tmp && mv tmp wails.json
  ```

  Without this patch the binary would report the right version while Finder/Explorer file
  properties show a stale `dev` (EC-REL-6). On the Windows runner this step runs under
  `shell: bash` explicitly, so `jq`/`mv` behave identically on all three runners.
- **Computed once, shared everywhere.** The version string is computed **once** in the
  `determine-version` job (§3) — from the pushed tag `v*.*.*` (leading `v` stripped) or the manual
  dispatch input — and every downstream job consumes the same job output. No job re-derives it.
- **Display.** The running app surfaces `settings.AppVersion` in exactly two places: the **About
  dialog** (`ui/widgets/` AboutDialog) and a **single startup log line** (via `internal/logging`,
  e.g. `app started version=<v>`). Both read the variable; neither formats or stores a second copy.
- **`dev` everywhere else.** Any build without the injection — local `wails build`, `wails dev`,
  a test binary — reports **`dev`**. This is intentional: seeing `dev` in About proves the build
  did not come from the release pipeline.

## 2. App icon pipeline

Per **DD-66**, the app icon is the "MD>GO" glass-tile artwork, and **every** platform icon is
derived from one processed master — **never hand-forked**.

- **Canonical source.** `specification/assets/icon/appicon-source.png` — the artwork exactly as
  provided (square, rounded glass tile on a dark backdrop). It is never edited in place.
- **Processing contract** (`specification/assets/icon/process_icon.py`, deterministic — same input
  → same output):
  1. **Crop** the tile out of the dark backdrop to its bounds.
  2. Make everything **outside the tile's rounded-rect silhouette transparent** (the dark backdrop
     must not ship — it would render as a visible dark plate on macOS docks, the Windows taskbar,
     and Linux launchers).
  3. Export a **1024×1024 RGBA** PNG with the tile centered.
  4. **Assert** the output contract: 1024×1024, RGBA, and **alpha == 0 at all four corner pixels**
     (transparent corners). A violated assertion fails the run.
  If `appicon-source.png` is missing, the script **fails fast** with a clear message (EC-REL-5).
- **Single derivation point.** The script's output is committed as **`build/appicon.png`**. This
  file — not the source artwork — is the one input every downstream icon derives from:
  - **macOS** — Wails derives `build/darwin/*.icns` at build time.
  - **Windows** — Wails derives `build/windows/icon.ico` at build time.
  - **Linux** — the PNG set installed by the `.deb`/`.rpm` packages (hicolor icon theme).
  - **Document/file-association icons** (`gomarkedit-doc`, DD-07) — seeded from the same processed
    artwork per `02_PACKAGING_AND_ASSOCIATIONS.md#2-app-icon-requirements`.
- **Never-hand-fork rule.** No per-OS icon file may be edited or replaced independently. A visual
  change to the icon means: change the source artwork, re-run `process_icon.py`, re-commit
  `build/appicon.png`, and let the per-OS derivations regenerate. Any other path creates drift
  between platforms.

## 3. Release workflow

Per **DD-67**, one workflow file (`.github/workflows/release.yml`) implements the release train as
**four jobs in a three-stage shape**: `determine-version` → (`build` matrix ∥ `test`) →
`create-release`. It refines the outline in
`03_CI_AND_HOOKS.md#5-github-actions-build--release-matrix`.

**Triggers.**

- **Tag push `v*.*.*`** — the automatic release path.
- **`workflow_dispatch`** — manual, with inputs:

  | Input | Type | Default | Meaning |
  |---|---|---|---|
  | `version` | string | — | The version to build, **without** the leading `v` (e.g. `1.2.0`). |
  | `create_release` | boolean | `true` | `false` = **build-only mode**: run everything, upload artifacts, publish no release (EC-REL-2). |

### Job 1 — `determine-version`

Computes `version` (no `v`) and `tag` (`v` + version) exactly once — from the pushed tag or the
dispatch input — and exposes both as **job outputs** consumed via `needs` by every later job
(DD-65). A `-suffix` in the version (e.g. `1.2.0-rc.1`) flows through unchanged and drives the
pre-release flag in Job 4 (EC-REL-3).

### Job 2 — `build` (matrix)

One native runner per artifact (rationale: `01_BUILD_MATRIX.md#5-why-each-os-builds-on-its-own-runner`;
artifact naming: `01_BUILD_MATRIX.md#2-artifact-matrix`):

| platform | runner | build tags | extra setup | artifact path uploaded |
|---|---|---|---|---|
| `linux/amd64` | `ubuntu-24.04` | `webkit2_41` | `apt-get install -y build-essential libgtk-3-dev libwebkit2gtk-4.1-dev` | `build/bin/GoMarkEdit-linux-amd64` (+ `.deb`/`.rpm`) |
| `windows/amd64` | `windows-latest` | — | — | `build/bin/GoMarkEdit-windows-amd64.exe` (+ NSIS installer) |
| `darwin/arm64` | `macos-latest` | — | — | `build/bin/GoMarkEdit.app` (the **whole `.app` bundle**) |
| `darwin/amd64` | `macos-13` | — | — | `build/bin/GoMarkEdit.app` (the **whole `.app` bundle**) |

Per-matrix-entry steps, in order:

1. `actions/checkout`.
2. `actions/setup-go` with the Go module/build **cache** enabled.
3. `actions/setup-node` with the **npm cache keyed on `frontend/package-lock.json`**.
4. Install the Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`).
5. `npm ci` in `frontend/`.
6. **jq-patch `wails.json`** (`.version` + `.info.productVersion` = `$VERSION`, §1) — with
   `shell: bash` forced so the step is identical on the Windows runner.
7. `wails build --platform <os>/<arch> -o GoMarkEdit-<os>-<arch>[.exe]` with
   `-ldflags "-X gomarkedit/internal/settings.AppVersion=$VERSION"` (+ `-tags webkit2_41` on
   Linux, `-nsis` on Windows).
8. **chmod +x fixes** — the Linux binary and, on macOS, everything under
   `GoMarkEdit.app/Contents/MacOS/`.
9. `actions/upload-artifact` with a **7-day retention** (artifacts are staging for Job 4, not the
   long-term record — the GitHub Release is).

### Job 3 — `test` (full gate, headless)

Runs the entire `03_CI_AND_HOOKS.md#4-ci-gate-set` on `ubuntu-24.04`, in the load-bearing order of
`03_CI_AND_HOOKS.md#3-ordering-why-frontend-builds-before-go`:

1. **`wails generate module` first** — `frontend/wailsjs/` is gitignored and absent on a clean
   checkout; nothing frontend compiles without it.
2. **Frontend build** (`npm run build` → `frontend/dist`) — the Go `//go:embed all:frontend/dist`
   directive fails every subsequent Go step without it.
3. Go gates: `gofmt -l` (empty), `go vet`, `go test -race ./...`.
4. Frontend gates: `prettier --check`, `eslint`, `tsc --noEmit`, `jest` with coverage.
5. Playwright verify gates (`verify:ui` + `verify:smoke`, headless, bridge-mock).
6. Security: `govulncheck ./...`, `npm audit --audit-level=high`.
7. Tooling/drift: `wails doctor`, `sqlc diff`, and the **bindings-drift check**
   (`wails generate module && git diff --exit-code frontend/wailsjs/`).

A red `test` job blocks `create-release` — a tag push with a failing gate produces **no release**
(EC-REL-1).

### Job 4 — `create-release`

`needs: [determine-version, build, test]`; runs only on a tag push **or** a dispatch with
`create_release == true`. Steps:

1. Download all build artifacts.
2. **Recreate the macOS `.app` structure and permissions** — Actions artifact transport flattens
   the bundle and drops the execute bit. The job reassembles `GoMarkEdit.app/Contents/...`, runs
   `chmod +x` on `Contents/MacOS/*`, and zips with **`zip -r -y -X`** — the `-X` (and zip, rather
   than the artifact's own packaging) is what preserves the execute bit and symlinks so the
   unzipped app launches (EC-REL-4).
3. **Rename every asset with the version** in the filename
   (`GoMarkEdit-<v>-<os>-<arch>…`, per `01_BUILD_MATRIX.md#2-artifact-matrix`).
4. `sha256sum * > SHA256SUMS.txt` over the renamed assets.
5. Publish the GitHub Release via a release action with:
   - `tag` from `determine-version`;
   - **`prerelease: contains(version, '-')`** — auto-detected, no manual flag (EC-REL-3);
   - generated release notes, **plus the unsigned-install caveats** (Gatekeeper right-click-Open,
     SmartScreen, unsigned `.deb`/`.rpm`) per DD-34 /
     `01_BUILD_MATRIX.md#8-signing-notarization-and-install-caveats`.

### Workflow skeleton

The structure (not the full file — the real YAML carries the complete step lists above):

```yaml
name: release
on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch:
    inputs:
      version: { description: "Version without the leading v", required: true, type: string }
      create_release: { description: "Publish a GitHub release", type: boolean, default: true }

jobs:
  determine-version:
    runs-on: ubuntu-24.04
    outputs:
      version: ${{ steps.v.outputs.version }}   # e.g. 1.2.0 / 1.2.0-rc.1
      tag: ${{ steps.v.outputs.tag }}           # v1.2.0
    steps:
      - id: v
        run: |  # tag push → strip leading v; dispatch → take the input verbatim
          ...

  build:
    needs: determine-version
    strategy:
      matrix:
        include:
          - { platform: linux/amd64,   os: ubuntu-24.04,   tags: webkit2_41 }
          - { platform: windows/amd64, os: windows-latest }
          - { platform: darwin/arm64,  os: macos-latest }
          - { platform: darwin/amd64,  os: macos-13 }
    runs-on: ${{ matrix.os }}
    steps:
      # checkout → setup-go (cache) → setup-node (npm cache: frontend/package-lock.json)
      # → install wails CLI → npm ci → jq-patch wails.json (shell: bash)
      # → wails build --platform ${{ matrix.platform }} -ldflags "-X gomarkedit/internal/settings.AppVersion=$VERSION"
      # → chmod +x fixes → upload-artifact (retention-days: 7)
      - ...

  test:
    runs-on: ubuntu-24.04
    steps:
      # wails generate module → npm run build → full §4 gate set (03_CI_AND_HOOKS.md)
      - ...

  create-release:
    needs: [determine-version, build, test]
    if: github.event_name == 'push' || inputs.create_release
    runs-on: ubuntu-24.04
    steps:
      # download artifacts → rebuild .app + chmod +x + zip -r -y -X → versioned renames
      # → sha256sum * > SHA256SUMS.txt → release (prerelease: contains(version, '-'), generated notes + DD-34 caveats)
      - ...
```

**Publication is gated, and the gate cannot be routed around.** `create-release` runs only after both
`build` and `test` succeed. Any check that fails — or that was skipped, or was never run — blocks
publication; it is never weakened or bypassed to get a release out. No fallback path, manual re-run or
partial-artifact recovery may publish implicitly: publication happens on exactly one path, and only
when every gate before it passed.

## 4. CI/dev isolation from production data

Per **DD-67**, **no CI or dev run ever reads or writes a user's production `GoMarkEdit` folder** —
the config/DB/logs roots listed in `01_BUILD_MATRIX.md#7-dev-vs-prod-isdev-folder-isolation`:

- **Dev builds** (`wails dev`, `just dev`) resolve every path under the **`-Dev` sibling folder**
  (`GoMarkEdit-Dev`) via the `isDev` signal (`internal/bootstrap.IsDevBuild` + `internal/file`).
  A dev session can never corrupt production settings, DB, or logs.
- **CI test runs** use **temp paths** (`t.TempDir()` and equivalents) — never the real
  per-user config roots, not even the `-Dev` ones. CI runners are ephemeral, but the tests must not
  depend on that: the isolation is a property of the code under test, not of the runner.
- **Release-gate assertion.** The pipeline treats "no job touches a production `GoMarkEdit`
  folder" as a **testable release-gate property**, not a convention: a test (or CI assertion)
  verifies that the resolved config root under CI/dev conditions is a temp or `-Dev` path and
  fails the gate otherwise.
- **Only a released artifact is "production."** The one and only thing that operates on a user's
  production `GoMarkEdit` folder is a **released artifact run by an end user**. Every artifact the
  pipeline itself executes (test binaries, verify harnesses, the built app under CI) runs isolated.

## 5. Edge cases (REL)

The `REL` area of the master edge-case registry
(`01_Product/01_FUNCTIONAL_REQUIREMENTS.md#edge-cases`) is enumerated here:

- **EC-REL-1** — A `v*.*.*` tag is pushed but a `test`-job gate (or any matrix build) fails →
  `create-release` does not run; **no release, no assets** are published for that tag.
- **EC-REL-2** — Manual dispatch with `create_release=false` → all four platforms build and upload
  workflow artifacts (7-day retention), but **no GitHub release** is created (build-only mode).
- **EC-REL-3** — The version contains a `-suffix` (`1.2.0-rc.1`) → the release is automatically
  marked **pre-release**; no manual flag exists.
- **EC-REL-4** — The macOS `.app` is zipped without `-X` (or without the chmod/reassembly step) →
  the unzipped app loses the execute bit and won't launch. The re-zip contract
  (§3 Job 4 step 2) is covered by a contract test / release-verification check on the produced zip.
- **EC-REL-5** — `specification/assets/icon/appicon-source.png` is missing (or the processed
  output violates the 1024×1024/RGBA/transparent-corner contract) → `process_icon.py` **fails
  fast** with a clear message; the icon pipeline never emits a non-conforming `build/appicon.png`.
- **EC-REL-6** — The `wails.json` jq patch is skipped or fails → the binary reports the injected
  version but `Info.plist` / Windows `info.json` show a stale (`dev`) version; the
  release-verification check compares the two and fails the release on mismatch.
