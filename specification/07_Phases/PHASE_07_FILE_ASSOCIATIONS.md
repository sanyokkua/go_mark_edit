**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/08_FILE_ASSOCIATIONS.md`, `../02_Architecture/04_WAILS_INTEGRATION.md`, `../04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 07 — File Associations

## Goal

Make GoMarkEdit feel native: register as a handler for `.md/.markdown/.mdown/.txt` on Windows, macOS,
and Linux with a custom file icon, route an OS-open through Wails `OnFileOpen` (macOS) or the first
CLI argument (Windows/Linux) into a document opened in the configured default mode, offer a
"set as default" prompt (never force), and route multiple/queued opens per the multi-instance policy.
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-associations`.

## Depends on

- Phase 02 (docs service, and the `internal/appmodel` tab/open ownership — STORY-101/102 — whose
  `OpenDoc` command every OS open dispatches into).
- Phase 03 (multi-instance / new-window path) recommended for full routing.

## Scope

- `internal/fileassoc` — pure `ResolveOpenTarget`/`OpenPathArgs` argv-normalisation (Unicode/space-safe).
- `wails.json` `info.fileAssociations` + custom file icon + per-OS packaging hooks.
- `main.go` `OnFileOpen` (macOS) + argv routing; queue opens that arrive before init completes; the
  normalized request is dispatched as an `internal/appmodel` `OpenDoc` command (DD-62;
  `../02_Architecture/04_WAILS_INTEGRATION.md#file-associations`).
- Open-in-default-mode (Reading (Viewer) / Editor, default Editor, DD-27) on OS/tree opens.
- "Set as default" prompt.
- Multi-instance open routing.

## Out of scope

- The default-open-mode **setting UI** — Phase 08 (this phase consumes the persisted value).
- Full packaging matrix (NSIS/nfpm) — Phase 10 (this phase adds the association metadata + icon hooks only).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-045 | Implement pure ResolveOpenTarget/OpenPathArgs argv normalisation safe for spaces and Unicode | M | `internal/fileassoc/`, `internal/apperr/` | `01_Product/08_FILE_ASSOCIATIONS.md#onfileopen`, `01_Product/08_FILE_ASSOCIATIONS.md#multi-instance-routing` | STORY-002 |
| STORY-046 | Declare fileAssociations and the custom file icon in wails.json with per-OS packaging hooks | M | `internal/application/`, `internal/fileassoc/` | `01_Product/08_FILE_ASSOCIATIONS.md#declared-extensions`, `01_Product/08_FILE_ASSOCIATIONS.md#macos`, `01_Product/08_FILE_ASSOCIATIONS.md#windows`, `01_Product/08_FILE_ASSOCIATIONS.md#linux` | STORY-045 |
| STORY-047 | Route OnFileOpen and argv into an open request, queuing opens that arrive before init | M | `internal/application/`, `internal/fileassoc/`, `logic/hooks/` | `01_Product/08_FILE_ASSOCIATIONS.md#onfileopen`, `02_Architecture/04_WAILS_INTEGRATION.md#file-associations`, `02_Architecture/02_BACKEND_GO.md#application-model`, `02_Architecture/04_WAILS_INTEGRATION.md#lifecycle` | STORY-046, STORY-101 |
| STORY-048 | Open OS/tree-opened files in the configured default open mode (Reading (Viewer) / Editor) | S | `logic/store/`, `internal/settings/` | `01_Product/08_FILE_ASSOCIATIONS.md#open-in-default-mode`, `01_Product/02_EDITOR_AND_VIEWER_MODES.md#default-open-mode` | STORY-047 |
| STORY-049 | Offer a "set as default" prompt without forcing the default handler | M | `ui/widgets/`, `internal/fileassoc/`, `logic/adapter/` | `01_Product/08_FILE_ASSOCIATIONS.md#set-as-default`, `00_Foundation/04_DESIGN_DECISIONS.md#8-os-integration` | STORY-047 |
| STORY-050 | Route multiple/queued OS opens per the multi-instance policy | M | `internal/application/`, `internal/fileassoc/` | `01_Product/08_FILE_ASSOCIATIONS.md#multi-instance-routing`, `01_Product/03_FILES_TABS_WORKSPACE.md#multi-instance` | STORY-047 |

## Edge cases

- **EC-ASSOC-1** — OS opens a file while an instance runs → routed per multi-instance policy (STORY-050).
- **EC-ASSOC-2** — Unsupported extension → open as text or decline gracefully (STORY-045/047).
- **EC-ASSOC-3** — Path with spaces/Unicode in argv or `OnFileOpen` → parsed correctly (STORY-045).
- **EC-ASSOC-4** — App not the default handler → offer "set as default" prompt, never force (STORY-049).
- **EC-ASSOC-5** — Multiple paths at once → open each per policy (STORY-050).
- **EC-ASSOC-6** — `OnFileOpen` before full init (macOS cold start) → queue and open once ready (STORY-047).

## Phase exit checklist

Automated:

- [ ] `ResolveOpenTarget` parses spaced/Unicode paths and rejects unsupported extensions gracefully (EC-ASSOC-2/3, pure unit test).
- [ ] An `OnFileOpen` arriving before init is queued and drained after `Init` (EC-ASSOC-6).
- [ ] A routed OS open dispatches an `internal/appmodel` `OpenDoc` command and the tab set updates via
      `state:patch` — the frontend receives no ad-hoc open event (DD-62, STORY-047).
- [ ] Multiple argv paths open each per policy (EC-ASSOC-5).
- [ ] `wails.json` declares all four extensions and the icon (config assertion).
- [ ] `just check` green; bindings regenerated with no drift.

Manual:

- [ ] **Double-clicking a `.md` in the OS file manager opens it in GoMarkEdit in the default open mode** (per-OS: macOS `OnFileOpen`, Windows/Linux argv).
- [ ] GoMarkEdit appears in the OS "Open With" list; the "set as default" prompt appears when it is not default and never seizes the default silently.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Stage 1 (Viewer); contributes to Milestone **M1**.
