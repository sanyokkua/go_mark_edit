# Contract: shared UI components and their consumer inventories

Requirements: FR-034 to FR-048, SC-007 to SC-009. Each component has one implementation in the named
folder, takes props only (no store, adapter or registry import — lint L9), changes appearance only
through tokens, and forbids a second copy through the lint rules L11–L15. The consumer inventory is
the acceptance list: a behaviour change to the component must be visible in every consumer named.
The final inventory is copied into `docs/architecture.md`.

## Layering

```
ui/widgets   → compose components, read the store, dispatch through the action registry
ui/components → compose primitives; props only
ui/primitives → leaf elements; props only
ui/styles    → tokens.css, base.css
```

## Popup — `ui/components/Popup/`

Inputs: `open`, `onOpenChange`, `anchor` (`{ trigger: HTMLElement } | { point: {x, y} } | { bounds: DOMRect }`),
`size` (`menu | wide | details`), `role` (`menu | dialog-less region`), `initialFocus`, `children`,
`returnFocusTo` (defaults to the trigger).

Built on the existing Radix DropdownMenu dependency (research R19). Owns: portal into
`.application-frame`; open/close; Escape; outside pointer (listeners attached only while open);
focus restore; arrow / Home / End / type-ahead navigation among `MenuItem`s; clamp and flip inside
the frame with an 8 px margin; resize and scroll re-placement; the elevation shadow composing with
the focus ring (the `*:focus-visible` rule in `base.css` no longer overrides `box-shadow`); second
click on the trigger closes. Absorbs today's `MenuSurface` and `MenuTrigger` primitives.

Consumers: File menu, Settings menu, View menu, About menu, narrow overflow menu (≤ 376 px), tab
context menu (point or focused-tab bounds), editor context menu (point), toolbar overflow menu
(`»`, < 768 px), Document details (status bar).

## MenuItem — `ui/components/MenuItem/`

Inputs: `label`, `icon`, `accelerator` (formatted once from the action registry by the widget and
passed in), `disabled`, `checked`, `radio`, `onSelect`, `submenu?` (group label with inline items).
Consumers: every Popup menu above; the Shortcuts dialog reuses the accelerator formatting helper.

## Bar — `ui/components/Bar/`

Inputs: `leading`, `main`, `trailing` slots; `overflow: 'scroll' | 'menu'`; `overflowBreakpoint`;
`ariaLabel`, `role` (`menubar | tablist-host | toolbar`). Owns: horizontal framing, gap, alignment,
the overflow policy (measured, not by action id), and the relocation of `main` items into a Popup when
`overflow: 'menu'`. Consumers: menubar (`scroll` never needed; narrow overflow menu at ≤ 376 px),
tab bar (`scroll`), formatting toolbar (`menu` at < 768 px — FR-037).

## Island — `ui/components/Island/`

Inputs: `children`, `label`. Consumers: formatting toolbar groups.

## ToolButton — `ui/primitives/ToolButton/`

Inputs: `variant: 'icon' | 'text'`, `icon`, `label`, `pressed`, `checked`, `disabled`, `onActivate`;
mousedown preserves the editor selection; square when icon-only (FR-038). Consumers: formatting
toolbar (the tab bar's and the menubar's controls belong to TabBar and Bar).

## Button — `ui/primitives/Button/`

Inputs: `variant: 'primary' | 'secondary' | 'quiet'`, `disabled`, `onClick`. Consumers: dialogs,
toasts, launcher.

## Tab and TabBar — `ui/components/TabBar/`

Inputs: `tabs[{id, label, dirty, readOnly, active}]`, `onActivate`, `onClose`, `onReorder`,
`onAdd`, `onContextMenu(id, anchor)`; owns horizontal scrolling, drag reorder, add and close
controls, the context-menu anchor (pointer point or focused-tab bounds); theme differences (Material
radius, Minimal underline) expressed as tokens (`--tab-radius`, `--tab-padding`, `--tab-underline`).
Consumers: document tabs.

## Pane — `ui/components/Pane/`

Inputs: `header` (leading/trailing slots), `body`, `accessory` (banner slot placed from explicit
state), `identity`. Consumers: editor pane, preview pane; the paused/failed preview banner is passed
as `accessory`.

## Sidebar — `ui/components/Sidebar/`

Inputs: `side`, `width`, `collapsed`, `minWidth`, `onResize`, `onResizeEnd`, `children`; the
acknowledged/pending/refused width comes from the layout owner (`logic/store/uiLayoutCommands`),
never from notification text. Consumers: workspace panel (assistant later).

## ModalShell — `ui/components/ModalShell/` (the existing `ui/primitives/ModalShell`, extended)

Inputs: `open`, `title`, `initialFocus`, `dismiss: 'backdrop' | 'escape' | 'none'`, `width`,
`children`, `onRequestClose`. Owns: portal, focus trap, Tab/Shift+Tab, Escape, opener restore, backdrop.
Consumers: Settings, About, Shortcuts, Normalisation, Close, External change, Recovery.

## Segmented — `ui/primitives/Segmented/` (existing, extended)

Inputs: `options`, `value`, `onChange`, `ariaLabel`; owns roving tabindex, Arrow/Home/End.
Consumers: the formatting toolbar's arrangement control, the Settings menu's mode group, the
Settings dialog's radio groups (`ViewModeToggle`, the fourth radiogroup today, is deleted as dead
code under Story 7).

## Icon — `ui/primitives/Icon/` (existing, extended)

Inputs: `name`, `size?` (defaults to `--icon-size`), `stroke?` (defaults to `--icon-stroke`); the
only glyph source (preview file glyph and tab `×`/`+` included). Consumers: menubar, formatting
toolbar, tab bar (`×`, `+`), preview file glyph, status bar, dialogs, launcher — every glyph site;
a stray inline `<svg>` fails lint L15.

## StatusBar — `ui/components/StatusBar/`

Inputs: `facts[{id, rowLabel, detailLabel, value, dropPriority}]`, `saveIdentity`, `transient`;
the row drops facts by priority; the Details Popup lists every dropped fact. Consumers: status bar.

## Notification surface — `ui/components/Notifications/`

Inputs: `notices[{id, kind: error | warning | stuck, title, message, actions}]`; Save errors keep
their rules; a refused link is a `warning` notice that inherits the surface's existing warning
duration (today 8 s in the severity table of `Toast.tsx`), dismissible early, no new value;
stuck notices carry Retry and Cancel.
Consumers: the application shell (single mount).

## Widgets after decomposition (FR-046)

| Widget                                                                                                                               | Owner of                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/App.tsx` + `app/useBootstrap.ts`, `app/useShutdown.ts`, `app/useCommands.ts` (further hooks only as the decomposition requires) | composition; startup steps; the frontend half of the shutdown protocol; command orchestration and shortcuts (write pipeline and notification delivery are owned by `useCommands` or a hook split from it) |
| `widgets/Menubar/`                                                                                                                   | File, Settings, View, About and the narrow overflow menu, all through Bar + Popup + MenuItem; availability from the registry                                                                              |
| `widgets/DocumentTabs/`                                                                                                              | TabBar consumer; the external-change sweep and the single `ExternalChangePrompt` mount move to the app layer (today mounted in both `App.tsx` and `DocumentTabs.tsx`)                                     |
| `widgets/FormattingToolbar/`                                                                                                         | Bar + Island + ToolButton + Segmented; composable without tabs                                                                                                                                            |
| `widgets/EditorStage/`                                                                                                               | Pane × 2, arrangement, preview banner from state                                                                                                                                                          |
| `widgets/dialogs/*`                                                                                                                  | ModalShell consumers                                                                                                                                                                                      |
| `widgets/StartupFailure/`                                                                                                            | per-step message, Retry, Quit                                                                                                                                                                             |

The menubar is not rendered through the appearance controller; `AppearanceControls` becomes a
settings-only widget.

## Tokens and themes (FR-044)

Theme differences live in `tokens.css` values; where structure must differ it lives in the shared
component's stylesheet; widget stylesheets contain no `[data-theme]`, `[data-mode]` or parity selector
(lint L19); every dead token is removed and every used token defined (lint L21); `--icon-size` and
`--icon-stroke` control every icon.
