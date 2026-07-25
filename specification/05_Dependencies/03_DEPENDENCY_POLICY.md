**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-03, DD-32, DD-33, DD-34), `04_Build_and_Release/03_CI_AND_HOOKS.md`, `05_Dependencies/01_GO_DEPENDENCIES.md`, `05_Dependencies/02_FRONTEND_DEPENDENCIES.md`

# Dependency Policy

The rules governing what may be added to GoMarkEdit's dependency graph, and how. The graph is
deliberately small and offline-first; every addition is a liability (supply-chain, license, binary
size, offline-breakage) and must be justified. These rules bind every story that touches `go.mod`,
`frontend/package.json`, or a lockfile.

## Table of Contents

1. [Offline / no-CDN rule](#1-offline--no-cdn-rule)
2. [No telemetry / network dependencies](#2-no-telemetry--network-dependencies)
3. [License compatibility (MIT)](#3-license-compatibility-mit)
4. [Version pinning & lockfiles](#4-version-pinning--lockfiles)
5. [How to add a dependency](#5-how-to-add-a-dependency)
6. [Avoid heavy / native dependencies](#6-avoid-heavy--native-dependencies)
7. [Generated code is not a dependency you edit](#7-generated-code-is-not-a-dependency-you-edit)

## 1. Offline / no-CDN rule

GoMarkEdit is **fully offline** (DD-32). Every runtime asset a dependency needs — JS, CSS, fonts,
workers — must be **bundled into the app** and served from the local bundle. No dependency may fetch
anything from a CDN or remote origin at runtime.

- Prefer libraries that bundle cleanly under Vite (assets emitted into `frontend/dist`).
- KaTeX fonts, highlight.js themes, Mermaid, and Monaco workers must be imported/bundled, not linked
  (`05_Dependencies/02_FRONTEND_DEPENDENCIES.md` §7).
- A dependency that hard-requires a network fetch for a core feature is **rejected**; find a bundleable
  alternative or drop the feature.
- The only network access anywhere is **document-referenced** remote assets (content policy + guarded
  AssetServer) and the **user-invoked assistant LLM inference** to the user-configured provider (DD-32
  as revised) — never a library phoning home.

## 2. No telemetry / network dependencies

Per DD-33 (no telemetry/analytics) and DD-32 as revised (no background/unsolicited app network calls):

- **No analytics, telemetry, crash-reporting, or "check for updates" dependency** — client or server.
  Logs are local rotating files only (`internal/logging`).
- The Go backend carries **no third-party HTTP client** (Resty and similar are excluded,
  `05_Dependencies/01_GO_DEPENDENCIES.md` §3); the assistant provider client uses the standard library
  `net/http`, opened only on user action to the user-configured provider.
- **No auto-update** dependency (DD-34).
- A dependency discovered to beacon out (even opt-in) is removed and flagged in a story note.

## 3. License compatibility (MIT)

GoMarkEdit is **MIT-licensed open source** (DD-34). Every dependency's license must be compatible with
redistribution under MIT:

- **Allowed:** MIT, BSD-2/3-Clause, Apache-2.0, ISC, MPL-2.0 (file-level), Unlicense/CC0, and similar
  permissive licenses.
- **Disallowed for linked/bundled code:** strong copyleft (GPL/AGPL) that would impose obligations on
  GoMarkEdit's distribution. (System libraries linked by the OS webview are out of scope of GoMarkEdit's
  own license.)
- A new dependency's license is verified **before** adding it; the choice is recorded in the story.
  Attribution/NOTICE obligations (e.g. Apache-2.0) are honoured in the distributed licenses file.

## 4. Version pinning & lockfiles

- **Pin dependencies and commit lockfiles.** `go.sum` (Go) and `frontend/package-lock.json` (npm) are
  committed; CI uses `npm ci` (exact lockfile install) and the Go module cache. Reproducible builds
  depend on this (`04_Build_and_Release/01_BUILD_MATRIX.md`).
- Frontend deps use caret ranges in `package.json` but the **lockfile is authoritative**; the
  `modernc.org/sqlite`, Wails, and other engine-carrying Go deps are pinned to exact
  minor/patch and upgraded deliberately.
- **Upgrades are their own change** (story), so a version bump is reviewable and revertable in
  isolation — never bundled silently into an unrelated feature.
- `govulncheck` (Go) and `npm audit --audit-level=high` (frontend) run in CI; a new high-severity
  finding blocks the gate (`04_Build_and_Release/03_CI_AND_HOOKS.md`).

## 5. How to add a dependency

A dependency is added only when justified. In the story that introduces it, record:

1. **Why** — the concrete need and why an existing dep / the standard library / a small vendored
   helper does not suffice.
2. **What** — package, exact version, license, and transitive-graph impact (does it pull a large
   subtree?).
3. **Offline check** — confirm it bundles with no runtime network fetch (§1).
4. **Security check** — clean `govulncheck`/`npm audit`; **security-sensitive** deps (parsing
   untrusted input, crypto, anything touching the network/filesystem broadly) are **flagged** for
   extra review and, if significant, an ADR.
5. **Policy fit** — CGO-free (Go, DD-03), permissive license (§3), no telemetry (§2).

Removing an unused dependency is always in scope and encouraged.

## 6. Avoid heavy / native dependencies

- **Prefer small, focused, pure dependencies.** Avoid large frameworks pulling wide transitive trees
  when a targeted library or a few lines of code suffice.
- **Go: no CGO / no native modules** (DD-03) — a CGO dependency (e.g. a C SQLite driver) is
  prohibited; it breaks cross-compilation and the offline reproducible build.
- **Frontend: avoid native node-gyp build steps** and prefer libraries that tree-shake and bundle
  small. Weigh bundle-size impact — the app ships the bundle inside the binary via `go:embed`.
- The excluded deps (`next`, `browser-fs-access`) illustrate the rule: replace framework-
  and browser-shim dependencies with the native Wails path where one exists
  (`05_Dependencies/02_FRONTEND_DEPENDENCIES.md` §8).

## 7. Generated code is not a dependency you edit

- **`internal/db/store/` is sqlc-generated** and **never hand-edited** — it is regenerated from
  `migrations/` + `queries/` and its drift is a CI gate (`sqlc diff`). Treat it as build output, not
  source you own.
- **`frontend/wailsjs/`** is Wails-generated bindings, imported only through `logic/adapter/`; its
  drift is likewise a CI gate. Regenerate with `wails generate module`; never edit by hand.

Editing generated code is treated the same as adding an unvetted dependency — it is rejected.
