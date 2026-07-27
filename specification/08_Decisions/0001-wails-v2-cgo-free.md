# ADR-0001 — Build on Wails v2 (stable), CGO-free Go

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

## Context and problem statement

GoMarkEdit is a cross-platform desktop Markdown editor that must run on Windows 10+, macOS 12+, and
modern Linux from a single codebase, using each OS's native webview (DD-01). It must be registered as
a first-class handler for Markdown files and launch when one is opened (see
`01_Product/08_FILE_ASSOCIATIONS.md`), render a React frontend, and persist a little state in SQLite —
all offline, with no telemetry (DD-32, DD-33).

The framework and runtime choice is the foundational decision every other module inherits: it fixes
the language boundary (Go ↔ web), the packaging story, the file-association mechanism, and the binary
distribution model. Two constraints make it delicate: (1) we want to build on **proven, well-established
patterns** — a Wails v2.12 cross-platform shell provides first-class file-association plumbing
(`CFBundleDocumentTypes` with a `Role` field), and a React Markdown editor/preview is a well-trodden
approach; and (2) `wails build` must **cross-compile cleanly with no C toolchain**, which rules out any
CGO-dependent SQLite driver. This ADR locks DD-01, DD-02, and DD-03.

## Decision drivers

- Single codebase, three OSes, native webview per OS — no per-platform UI rewrite (DD-01).
- File-association / "default app" support as a first-class, already-proven framework feature
  (`OnFileOpen` on macOS, argv on Windows/Linux) — see `01_Product/08_FILE_ASSOCIATIONS.md`.
- Build on proven, well-established patterns (a Wails cross-platform shell + a React Markdown renderer) —
  this is an integration-and-packaging job, not R&D.
- CGO-free builds for reliable cross-compilation and small, dependency-light binaries (DD-03).
- Small, offline, single-user desktop app — small binary and low memory footprint matter; a bundled
  Chromium is a poor fit.
- Framework maturity and stability: v1 must ship on a runtime with a stable API surface, not a moving
  alpha target.

## Considered options

- **Wails v2 (stable)** — Go backend + system webview, current stable line (v2.12+).
- **Wails v3 (alpha)** — next-generation Wails; multi-window native API, but pre-release.
- **Tauri** — Rust backend + system webview.
- **Electron** — Node backend + bundled Chromium.

## Decision outcome

Chosen: **Wails v2 (stable), with a CGO-free Go 1.25+ backend and `modernc.org/sqlite` (pure-Go) for
persistence**, because it is the only option that simultaneously (a) builds on proven, well-established
patterns for both the shell and the renderer, (b) delivers proven first-class file-association support across all three OSes, (c)
keeps builds C-toolchain-free for reliable cross-compilation, and (d) sits on a stable, non-alpha API.
Wails v3 is explicitly deferred: its multi-window ergonomics are attractive, but shipping v1 on an
alpha runtime is an unacceptable stability and churn risk. Multiple-window / multi-instance behaviour
(DD-08) is instead achieved by launching multiple v2 processes (see ADR-0006), which does not require
v3.

### Consequences

- Positive: All hard parts (file association, native dialogs, cross-OS build) are well-established Wails
  capabilities, and a React Markdown renderer is a well-trodden approach. Risk is concentrated in
  integration, not invention.
- Positive: CGO-free means `wails build` cross-compiles without a per-target C toolchain; binaries
  stay small and the dependency surface stays auditable (supports the offline/no-telemetry posture).
- Positive: Native system webview keeps the download and memory footprint far below an Electron bundle.
- Negative: The rendered result depends on each OS's webview engine (WebView2 / WKWebView / WebKitGTK);
  subtle CSS/print differences must be tested per platform rather than assumed uniform.
- Negative: `modernc.org/sqlite` is a pure-Go reimplementation — marginally slower than the CGO
  `mattn/go-sqlite3` driver, though irrelevant at our KV write volume (DD-13).
- Negative: Staying on v2 means we forgo v3's native multi-window API and must model multi-instance as
  separate processes (ADR-0006); a future migration to v3 is possible but out of scope for v1.
- Neutral: We inherit Wails v2's `wails.json` `fileAssociations` schema and lifecycle hooks as the
  binding integration contract (Phase 08).

## Pros and cons of the options

### Option A — Wails v2 (stable)

- Good: Mature, widely deployed Wails v2.12 line; stable API; first-class file associations and
  native dialogs; small binary via system webview; Go backend pairs cleanly with a CGO-free stack.
- Good: A React Markdown renderer runs cleanly inside the webview.
- Bad: No native multi-window API (must use multiple processes); output subject to per-OS webview
  quirks.

### Option B — Wails v3 (alpha)

- Good: Native multi-window and a cleaner runtime API that would model DD-08 directly.
- Bad: Pre-release/alpha — unstable API, breaking changes between releases, thinner docs and fewer
  battle-tested examples; shipping a v1 product on it is a churn and reliability risk. No maturity
  advantage over v2, and would force building the shell against a moving alpha target.

### Option C — Tauri

- Good: Small binaries, system webview, strong security defaults, active ecosystem.
- Bad: Rust backend — we would abandon the Go stack and our team's Go familiarity; the
  file-association and SQLite-KV patterns would have to be rebuilt in a different language. Higher R&D
  cost for zero product-visible gain.

### Option D — Electron

- Good: Most mature ecosystem; identical Chromium render/print on every OS (predictable PDF output).
- Bad: Bundles a full Chromium — large download, high memory footprint, poor fit for a lightweight
  single-user editor. Node backend discards the Go stack. Heavier attack/dependency surface counter to
  the offline, minimal-footprint goals.

## Links

- Design decisions: DD-01 (target OSes / one codebase / native webview), DD-02 (Wails v2 not v3),
  DD-03 (Go 1.25+, CGO-free, `modernc.org/sqlite`). Related: DD-04 (React 19 + Vite + TS frontend).
- Spec clauses: `00_Foundation/04_DESIGN_DECISIONS.md#1-platform--framework`,
  `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `02_Architecture/02_BACKEND_GO.md`,
  `02_Architecture/04_WAILS_INTEGRATION.md`, `04_Build_and_Release/01_BUILD_MATRIX.md`,
  `05_Dependencies/01_GO_DEPENDENCIES.md`.
- Stories: Phase 00 scaffold stories (Wails v2 app boots, Go+React+Vite wiring, DB open) and Phase 08
  file-association stories, per `07_Phases/00_ROADMAP.md`; authored per phase (none `done` at ADR time).
