**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/09_ASSETS_AND_SECURITY.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../03_NonFunctional/03_SECURITY_AND_PRIVACY.md`, `../03_NonFunctional/04_OFFLINE.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 09 — Assets & Security

## Goal

Render local images correctly while staying offline and safe: a guarded Wails `AssetServer` handler
that resolves local image paths relative to the current document (GitHub/GitLab semantics), restricts
reads to a directory allowlist (document folder + workspace root + configured roots), rejects path
traversal, governs remote content by policy (Ask/Always allow/Always block) with an in-preview banner,
and applies a CSP/sanitization level. The app itself makes no network calls.
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-assets`.

## Depends on

- Phase 04 (rendering pipeline / image handling).

## Scope

- `internal/assets` — `NewAssetHandler`: relative-path resolution, allowlist enforcement, path-traversal rejection (HTTP 403).
- `assets` adapter wiring + markdown image URL rewriting to the guarded handler.
- Remote-content policy setting + `ExternalContentBanner` widget (Ask default).
- CSP / sanitization level for raw HTML and remote references.

## Out of scope

- New settings-dialog chrome — Phase 08 (this phase supplies the Content-privacy enforcement behind that control).
- Any outbound network capability from the app itself — Stages 1–2 make zero network calls; the sole
  later exception is the Stage-3 user-invoked LLM call to the configured provider (DD-32 as revised,
  ADR-0011). Telemetry/auto-update remain permanently excluded (DD-33/DD-34).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-059 | Implement the guarded AssetServer handler with relative resolution, allowlist, and path-traversal rejection | L | `internal/assets/`, `internal/file/`, `internal/apperr/` | `01_Product/09_ASSETS_AND_SECURITY.md#relative-path-resolution`, `01_Product/09_ASSETS_AND_SECURITY.md#allowlist`, `01_Product/09_ASSETS_AND_SECURITY.md#path-traversal`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#2-asset-allowlist-and-traversal`, `02_Architecture/04_WAILS_INTEGRATION.md#assetserver-handler`, `00_Foundation/04_DESIGN_DECISIONS.md#6-rendering--assets` | STORY-023 |
| STORY-060 | Rewrite markdown image URLs to the guarded handler and resolve them against the document folder | M | `logic/markdown/`, `logic/adapter/`, `ui/components/` | `01_Product/09_ASSETS_AND_SECURITY.md#relative-path-resolution`, `01_Product/05_RENDERING_AND_EXTENSIONS.md#components-override` | STORY-059 |
| STORY-061 | Enforce the remote-content policy (Ask/Always allow/Always block) with an ExternalContentBanner | M | `ui/widgets/`, `logic/markdown/`, `internal/settings/` | `01_Product/09_ASSETS_AND_SECURITY.md#remote-content-policy`, `01_Product/09_ASSETS_AND_SECURITY.md#banner`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#3-remote-content-policy`, `03_NonFunctional/04_OFFLINE.md#4-document-referenced-remote-assets`, `00_Foundation/04_DESIGN_DECISIONS.md#6-rendering--assets` | STORY-060 |
| STORY-062 | Apply the CSP / sanitization level for raw HTML and remote references | M | `logic/markdown/`, `internal/application/` | `01_Product/09_ASSETS_AND_SECURITY.md#csp`, `01_Product/05_RENDERING_AND_EXTENSIONS.md#sanitization`, `03_NonFunctional/03_SECURITY_AND_PRIVACY.md#4-webview-csp` | STORY-061 |

## Edge cases

- **EC-ASSET-1** — Relative path escaping the allowlist (`../../…`) → rejected (403), placeholder shown (STORY-059).
- **EC-ASSET-2** — Referenced local file missing → alt/placeholder, no dialog spam (STORY-060).
- **EC-ASSET-3** — Remote image/CSS with policy Ask → blocked until banner choice (STORY-061).
- **EC-ASSET-4** — Remote content with Always block → never requested, no banner (STORY-061).
- **EC-ASSET-5** — Absolute local path outside allowlist → rejected (STORY-059).
- **EC-ASSET-6** — Asset from an unsaved buffer (no document folder) → only workspace root + configured roots apply (STORY-059/060).
- **EC-RENDER-5** — Raw HTML handled per sanitization level (STORY-062).

## Phase exit checklist

Automated:

- [ ] A `../../secret.png` request outside the document root is rejected with HTTP 403 and never read from disk (P5, EC-ASSET-1/5).
- [ ] `./assets/x.png` resolves relative to the document folder and is served (unit/integration test).
- [ ] Under policy Ask, a remote image is blocked and the banner appears; under Always block, no request is made and no banner shows (EC-ASSET-3/4).
- [ ] Raw `<script>` in source is stripped/neutralised per the sanitization level (EC-RENDER-5).
- [ ] A no-network architecture check confirms zero outbound calls (DD-32).
- [ ] `just check` green.

Manual:

- [ ] In `wails dev`: a document referencing `./img.png` shows the image; a `../../` path shows a placeholder.
- [ ] A remote image stays blocked until the banner's "allow" is chosen.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Stage 1 (Viewer); contributes to Milestone **M1**.
