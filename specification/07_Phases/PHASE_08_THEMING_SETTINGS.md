**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_ROADMAP.md`, `../01_Product/10_THEMING.md`, `../01_Product/11_SETTINGS.md`, `../01_Product/12_KEYBOARD_SHORTCUTS.md`, `../02_Architecture/02_BACKEND_GO.md`, `../02_Architecture/03_FRONTEND_REACT.md`, `../03_NonFunctional/05_ACCESSIBILITY.md`, `../00_Foundation/04_DESIGN_DECISIONS.md`, `../06_Process_and_Traceability/01_MODULE_INVENTORY.md`, `../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`

# Phase 08 — Theming & Settings

## Goal

Give GoMarkEdit its finished look and control surface: three themes (Liquid Glass, Material, Minimal)
each with Auto/Light/Dark appearance (Auto follows the OS live), unified editor+preview theming driven
by a token layer, a full Settings dialog covering every group, Shortcuts and About dialogs, an in-app
menu bar, and a keyboard-shortcut registry. Backfills the real token values reserved in Phase 00.
Refines: `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-theming`,
`../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-settings`, and
`../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#fr-shortcuts`.

## Depends on

- Phase 01 (app shell / status bar). Consumes settings groups introduced across Phases 02–07.

## Scope

- `tokens.css` full values for 3 themes × light/dark (keyed by `data-theme` × `data-mode`).
- `logic/theme` — `resolveEffectiveTheme`, `applyTheme`, `initTheme`, `watchSystemTheme`.
- Appearance Auto/Light/Dark + live OS `prefers-color-scheme` following; fallback on invalid persisted value.
- `SettingsDialog` — Appearance, Editor, Markdown, Export, Content & privacy, Language groups.
- `AppMenuBar` in-app menu; `ShortcutsDialog`; `AboutDialog`.
- `useShortcuts` registry with per-platform mapping (`Ctrl`/`Cmd`).
- Window & UI-layout state persistence: `window.*`/`ui.*` groups written through on change, restored on
  new window / launch, multi-window last-writer-wins by change (DD-60/DD-61). UI-layout toggles are
  `SetUILayout` **commands** to `internal/appmodel`, which mutates the authoritative UI state, emits
  `state:patch`, and persists the durable subset via `internal/settings` (DD-62;
  `../02_Architecture/02_BACKEND_GO.md#application-model`).

## Out of scope

- User-authored themes (explicitly excluded, DD-28; `../01_Product/10_THEMING.md#no-custom-themes`).
- Content-privacy **enforcement** (remote policy/banner) — Phase 09 (this phase renders the settings control).
- i18n string routing — Phase 10 (labels here still go through `t()` once Phase 10 lands; English literals acceptable interim).

## Suggested stories / tasks

> Planned backlog for this phase. The `architect` generates the actual story files into `../docs/stories/` during implementation (one story per session), assigning the ids shown.


| Story id | Title | Est(S/M/L) | Modules | Spec clauses | depends_on |
|---|---|---|---|---|---|
| STORY-051 | Author the full tokens.css for three themes × light/dark keyed by data-theme × data-mode | M | `ui/styles/` | `01_Product/10_THEMING.md#themes`, `01_Product/10_THEMING.md#token-model`, `00_Foundation/04_DESIGN_DECISIONS.md#9-theming--ux` | STORY-006 |
| STORY-052 | Implement theme resolution and application (resolveEffectiveTheme/applyTheme/initTheme) | M | `logic/theme/`, `logic/store/` | `01_Product/10_THEMING.md#unified-theme`, `01_Product/10_THEMING.md#token-model`, `02_Architecture/03_FRONTEND_REACT.md#theme` | STORY-051 |
| STORY-053 | Follow the OS prefers-color-scheme live under Auto and fall back on invalid persisted appearance | M | `logic/theme/`, `logic/hooks/`, `internal/settings/` | `01_Product/10_THEMING.md#appearance-auto-light-dark`, `01_Product/10_THEMING.md#reading-mode-chrome` | STORY-052 |
| STORY-054 | Build the full Settings dialog covering Appearance/Editor/Markdown/Export/Content-privacy/Language groups | L | `ui/widgets/`, `logic/store/`, `internal/settings/` | `01_Product/11_SETTINGS.md#settings-surface`, `01_Product/11_SETTINGS.md#appearance-group`, `01_Product/11_SETTINGS.md#editor-group`, `01_Product/11_SETTINGS.md#markdown-group`, `01_Product/11_SETTINGS.md#export-group`, `01_Product/11_SETTINGS.md#content-privacy-group`, `01_Product/11_SETTINGS.md#language-group`, `01_Product/11_SETTINGS.md#defaults`, `01_Product/11_SETTINGS.md#persistence` | STORY-053 |
| STORY-055 | Add the in-app AppMenuBar exposing file/view/format actions | M | `ui/widgets/`, `ui/components/`, `logic/store/` | `01_Product/11_SETTINGS.md#settings-surface`, `01_Product/12_KEYBOARD_SHORTCUTS.md#shortcut-registry` | STORY-054 |
| STORY-056 | Add the useShortcuts registry with per-platform mapping and a ShortcutsDialog | M | `logic/hooks/`, `ui/widgets/` | `01_Product/12_KEYBOARD_SHORTCUTS.md#shortcut-registry`, `01_Product/12_KEYBOARD_SHORTCUTS.md#platform-mapping`, `03_NonFunctional/05_ACCESSIBILITY.md#2-keyboard-operability`, `03_NonFunctional/05_ACCESSIBILITY.md#3-focus-management` | STORY-055 |
| STORY-057 | Add the About dialog | S | `ui/widgets/` | `01_Product/11_SETTINGS.md#settings-surface`, `00_Foundation/04_DESIGN_DECISIONS.md#10-non-functional--operations` | STORY-054 |
| STORY-058 | Bind the formatting/heading/list/link/view/file shortcuts to their registered actions | M | `logic/hooks/`, `ui/components/`, `logic/store/` | `01_Product/12_KEYBOARD_SHORTCUTS.md#format-shortcuts`, `01_Product/12_KEYBOARD_SHORTCUTS.md#file-shortcuts`, `01_Product/12_KEYBOARD_SHORTCUTS.md#view-shortcuts`, `03_NonFunctional/05_ACCESSIBILITY.md#2-keyboard-operability` | STORY-056 |
| STORY-098 | Persist and restore application window & UI-layout state (window size, sidebar visibility, view arrangement) with write-through-on-change and multi-window last-writer-wins, driven through `internal/appmodel` `SetUILayout` commands | M | `internal/settings/`, `internal/appmodel/`, `logic/store/`, `logic/adapter/` | `02_Architecture/05_STATE_AND_PERSISTENCE.md#window-state`, `02_Architecture/02_BACKEND_GO.md#application-model`, `01_Product/11_SETTINGS.md#persistence`, `00_Foundation/04_DESIGN_DECISIONS.md#13-window--ui-layout-state` | STORY-054 |

## Edge cases

- **EC-THEME-1** — OS toggles light/dark under Auto → live token update (STORY-053).
- **EC-THEME-2** — Theme switched during reading mode → tokens still apply to the reader surface (STORY-052/053).
- **EC-THEME-3** — Persisted theme/appearance invalid/missing → fall back to defaults (STORY-053).
- **EC-SET-2** — Corrupt/newer schema → safe defaults per persistence policy (STORY-054, in concert with STORY-004).
- **EC-SET-5** — A new window / next launch restores the last saved window & UI-layout state (STORY-098).
- **EC-SET-6** — Multi-window: the last window to **change** a layout value wins, not the last to close (STORY-098).
- **EC-SET-7** — Missing/invalid persisted layout value → sensible default, window still opens (STORY-098).
- **EC-I18N-3** — Long translated strings tolerate overflow without clipping actions (STORY-054, verified fully in Phase 10).

## Phase exit checklist

Automated:

- [ ] `resolveEffectiveTheme(theme, 'auto', osDark)` returns `dark` and sets `data-mode="dark"` within one frame (P2, EC-THEME-1).
- [ ] Every setting has a defined default and round-trips through the KV store (unit test, `#persistence`).
- [ ] Default open mode defaults to **Editor**; a file-system open in **Reading (Viewer)** lands in reading mode (P1/P2).
- [ ] Toggling a sidebar / switching arrangement writes through immediately; a fresh window restores the last layout (P2, EC-SET-5).
- [ ] Simulated two-window sequence: a change in window A survives window B closing without a change — last-writer-by-change wins (unit/integration test, EC-SET-6).
- [ ] An invalid persisted theme falls back to the default (EC-THEME-3).
- [ ] Each registered shortcut fires its action and matches the menu label (registry test).
- [ ] `verify:ui` passes across 3 themes × light/dark with zero overflow/console errors at 375/768/1280.
- [ ] `just check` green.

Manual:

- [ ] In `wails dev`: switching theme/appearance updates editor and preview together; Auto reacts to an OS dark-mode toggle.
- [ ] Settings, Shortcuts, and About dialogs open, persist, and match the mockup.

DoD reference: `06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`. Stage 1 (Viewer shell — the AI settings tabs land later in Phase 11); contributes to Milestone **M1**.
