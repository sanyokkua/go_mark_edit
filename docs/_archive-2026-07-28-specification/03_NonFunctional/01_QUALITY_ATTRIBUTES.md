**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `02_Architecture/*`, `03_NonFunctional/02_PERFORMANCE.md`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `03_NonFunctional/04_OFFLINE.md`, `03_NonFunctional/05_ACCESSIBILITY.md`

# Quality Attributes

The non-functional targets GoMarkEdit is held to, each with a concrete, checkable acceptance. These
supplement the functional requirements; a story that touches a relevant area must not regress the
attribute's acceptance.

## Table of Contents

1. Attribute table
2. How these are verified

## Attribute table

| Attribute                | Target                                                                         | Concrete acceptance                                                                                                                                                                                                                                                                                                                                         | Sources                                                                   |
| ------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Usability**            | Document-forward, minimal chrome; core actions reachable by keyboard           | Editor, Viewer, save, open, format, lint, reading-mode, settings all have shortcuts shown in menus/tooltips + a Shortcuts dialog; Viewer hides all chrome                                                                                                                                                                                                   | DD-30, DD-31                                                              |
| **Reliability**          | No data loss; predictable failure                                              | Autosave preserves existing files; never-saved buffers require explicit Save (no silent write); BOM/CRLF preserved on round-trip; pending editor edits are flushed to the backend-authoritative model on blur/tab-switch/close/save so no edit is lost between debounce ticks; every backend failure returns a classified `WireError`, never a crash dialog | DD-12, DD-15, DD-64; `02_Architecture/06_ERROR_HANDLING.md`               |
| **Portability**          | One codebase on Windows 10+, macOS 12+, modern Linux                           | `wails build` cross-compiles CGO-free (modernc SQLite); the manual smoke test passes on all three OSes                                                                                                                                                                                                                                                      | DD-01, DD-03; ADR-0001                                                    |
| **Maintainability**      | Strict layering, one composition root, generated bindings in sync              | `just check` (fmt, lint, typecheck, tests, arch checks) is green; `wails generate module` produces no diff; sqlc `store/` unedited; migrations additive-only                                                                                                                                                                                                | `02_Architecture/02_BACKEND_GO.md`, `#generate-bindings`                  |
| **Testability**          | Units testable with fakes; UI behavior-tested                                  | Handlers/services unit-testable via swappable seams; pure argv/allowlist logic unit-tested; Playwright `verify:ui` covers responsive + smoke flows                                                                                                                                                                                                          | DD-37; module inventory "Test target" column                              |
| **Security**             | Local-only trust boundary; no injection; guarded assets                        | No background/unsolicited network egress (the sole outbound calls are user-invoked assistant LLM inferences to the user-configured provider, local by default — DD-32 as revised); asset server allowlist + traversal rejection; sqlc-parameterized queries; no secrets in code/config/DB (API keys referenced by env-var name only)                        | DD-21, DD-32, DD-45, DD-54; `03_NonFunctional/03_SECURITY_AND_PRIVACY.md` |
| **Privacy**              | Nothing leaves the machine except on an explicit user-invoked assistant action | No telemetry/analytics ever; logs local rotating files only, never transmitted; `cause` never serialized to the UI; document text leaves the machine only when the user invokes a assistant action/chat, and only to the configured provider (on-device with the default local provider)                                                                    | DD-33, DD-54; `02_Architecture/06_ERROR_HANDLING.md` `#wire`              |
| **Performance**          | Fast start, responsive editing                                                 | Startup, editor-latency, preview-debounce, large-file, and memory budgets in `02_PERFORMANCE.md` all met                                                                                                                                                                                                                                                    | DD-20; `03_NonFunctional/02_PERFORMANCE.md`                               |
| **Accessibility (v1)**   | Keyboard operability for core actions; Radix a11y baseline                     | All core actions keyboard-operable; focus managed in dialogs/menus; full screen-reader/contrast certification is explicitly out of v1 scope                                                                                                                                                                                                                 | DD-36; `03_NonFunctional/05_ACCESSIBILITY.md`                             |
| **Openness**             | MIT, reproducible-from-spec                                                    | MIT license shipped; unsigned-build caveats documented; no auto-update                                                                                                                                                                                                                                                                                      | DD-34                                                                     |
| **Internationalization** | i18n-ready; English shipped                                                    | All user-facing strings via the i18n layer; adding a locale needs only a new resource file, no code change                                                                                                                                                                                                                                                  | DD-35; `01_Product/13_I18N.md`                                            |

## How these are verified

**Each attribute names the command that proves it.** An attribute whose verification is "it is
verified" is an attribute nobody checks.

| Attribute            | Proven by                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness          | `just test` (Go `-race` + Jest), plus the renderer's golden-file corpus                                                                                 |
| Reliability          | the hard-limits fixtures (`02_PERFORMANCE.md#hard-limits`) — a file at each threshold produces the specified refusal, not a hang                        |
| Security             | the adversarial sanitization corpus (`01_Product/19_SANITIZATION_AND_CSP.md#the-adversarial-corpus`), run as unit tests _and_ as one browser smoke flow |
| Offline              | the build-output scan and the bundled-asset assertion (`04_OFFLINE.md` §5) — both CI gates                                                              |
| Performance          | the bundle-size ceiling as a CI gate; startup measured against the built artifact and recorded, not gated on a shared runner's wall clock               |
| Consistency (visual) | `just verify-ui` across 3 widths × 6 palettes, with committed baselines                                                                                 |
| Testability          | the coverage ratchet (`03_CI_AND_HOOKS.md` §4c), sitting beneath the test-quality rules rather than replacing them                                      |
| Openness             | `scripts/verify-release-artifacts.sh` — the published artifacts are what the tag says they are                                                          |

- **Automated gate** — `just check` must pass; CI runs the same gate plus
  `wails generate module` drift, `sqlc` sanity, and Playwright `verify:ui`.
- **Offline verification** — a network-egress check (no outbound sockets during a representative
  session) is part of acceptance for offline-touching stories (`03_NonFunctional/04_OFFLINE.md`).
- **Manual cross-OS smoke** — the release smoke test in `01_Product`/`00_Foundation` success criteria
  exercises association, autosave, workspace, full rendering, format/lint, PDF export, and theme
  switching on each OS.
- **Staging note** — the full CI/testing rigor is the target but is staged across phases
  (DD-37); the earliest scaffolding stories are not blocked on the full gate, but later phases restore
  it.
