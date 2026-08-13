# Two defects the e2e baseline was hiding

**Requirement**: Constitution VI (usable actual controls, correct roles, actions
derive from their canonical registries), FR-FT-045/FR-FT-055 (surface governs
shape).
**Origin**: the two pre-existing Playwright failures recorded in
`e2e-baseline-failures.md`, which `just check` never runs.
**Branch**: `feature/v1-implementation--003-settings-toggle-dead-control`.

## Defect 1 — the Settings switches were dead controls

### What was happening

`SettingsMenu.tsx` drew each save toggle as

```jsx
<span className={menu.toggle} data-checked={checked}>
  <input aria-label={label} checked={checked} className={styles.toggleInput} … />
</span>
```

with `.toggleInput` at `height:1px; width:1px; opacity:0; position:absolute`
(`SettingsMenu.module.css:93-98`) and `.toggle` a 34×19px switch declaring
`cursor: pointer` (`MenuSurface.module.css:201-210`).

The visible switch was a **`span`**, so it had no label relationship with the
input. A pointer click landed on the span and stopped there. The switch
advertised itself as clickable — `cursor: pointer`, and the binding's `.tgl`
declares the same (`mockup.html:248`) — and did nothing.

Measured directly against the running interface, clicking the visible switch
twice:

```
INITIAL            {"prop":true,"attr":true,"dataChecked":"true"}
AFTER_USER_CLICK_1 {"prop":true,"attr":true,"dataChecked":"true"}
AFTER_USER_CLICK_2 {"prop":true,"attr":true,"dataChecked":"true"}
```

Nothing moved. **Autosave could not be turned off by any user.**

### Why the test suite could not see it

The test drove `locator.check()` / `uncheck()` on the **hidden 1px input**,
which Playwright can click directly. That exercised a control no user can reach,
so the suite was measuring a path that did not exist in the product. What it
then hit was a React controlled-checkbox desync: the click flipped the DOM
*property* without any state change, React's diff saw no change to the `checked`
prop and never reset it, so the element reported

```
locator resolved to <input checked type="checkbox" …/>   ← attribute says checked
IS_CHECKED false                                          ← property says unchecked
```

and the following `check()` waited forever. The suite failed for a reason
adjacent to the real defect without ever naming it.

### The fix

`span` → `label` around the input. A label forwards its click to the contained
control, so the visible switch becomes the control. It is a flex item either
way, so `.toggle`'s width, height and `flex: none` apply identically and nothing
moved on screen.

After the change, the same probe:

```
INITIAL            {"prop":true,"dataChecked":"true"}
AFTER_USER_CLICK_1 {"prop":false,"dataChecked":"false"}
AFTER_USER_CLICK_2 {"prop":true,"dataChecked":"true"}
```

Both the control and the projected `data-checked` follow the click.

The test now clicks `[data-settings-toggle="Autosave"]` — the visible switch —
and asserts both the checkbox state and the projected attribute on each
transition. That is a strictly stronger test than before: it exercises the real
control, as Constitution VI requires, instead of a hidden input.

## Defect 2 — the toggle rows had no ARIA role

The open-mode and Markdown-standard rows above them carry `role="menuitem"`
(`SettingsMenu.tsx:207`, `:219`); the save-toggle rows carried none. They were
plain `div`s inside `role="menu"`, so they were **not exposed as menu children
at all** and assistive technology never announced them as part of the menu.

`role="menuitem"` added, matching the sibling rows.

This is why `menu.getByRole('menuitem', { name: 'Format on save' })` had never
resolved. The assertion sat below a line that always failed first, so it had
never actually run.

## Defect 3 — availability came from a wiring accident, not the registry

With the role in place the assertion finally ran, and reported `Format on save`
**enabled** where the test expects it disabled.

`actionRegistry.ts:266-271`:

```ts
entry('format-on-save', 'application', ['settings-menu'], { availability: laterDeferred }),
entry('lint-on-save',   'application', ['settings-menu'], { availability: laterDeferred }),
```

Both are deferred. But `SettingsMenu` computed availability as
`onMarkdownSettingsChange === undefined` — and `AppearanceControls.tsx:178`
does supply that handler. So both rows shipped **enabled and operable** while
the canonical registry said deferred.

Constitution VI: "Actions, shortcuts, menus, tooltips, dialogs, and
command-palette entries MUST derive from their single canonical registries
rather than duplicate labels or bindings." `SettingsMenu` never called
`getAction` at all.

Fixed with a `settingUnavailable(id)` helper reading
`getAction(id).availability.kind === 'deferred'`, applied to both rows. Autosave
is `available()` in the registry (`:263-265`) and stays operable, which is
consistent with the fix to defect 1.

## Defect 4 — FT-VS-07 asserted a File menu the design does not have

The last baseline failure was `expect(openRecent).toBeEnabled()` on
`getByRole('menuitem', { name: 'Open Recent' })`. That locator matched **zero**
elements: the File menu contains no Open Recent submenu.

It is not supposed to. `mockup.html:604` draws recents as indented rows inside
the File popup itself:

```html
<div class="mi sub"><svg class="ic"><use href="#i-file"/></svg> release-notes.md</div>…
```

and `ShellMenuRow.tsx:583-590` says so explicitly — "There is no separate Open
Recent trigger row, so the canonical open-recent command is dispatched from the
rows themselves." Production had been converged to the binding by the T070 File
popup work; **the test still described the pre-convergence submenu**, so it had
been failing ever since and nobody saw it, because `just check` does not run
Playwright.

The test now asserts the full ordered row list of the File popup, which proves
the six recents *and* the binding's grouping around them:

```
New File, New Window, Open File…, Open Folder…,
t032-recent-07.md … t032-recent-02.md,
↺ Reopen last file, Save, Save As…, Export to PDF…, Close Tab, Exit
```

This is a stronger assertion than the one it replaces — it pins placement, not
just membership.

## Result

`frontend/e2e/real-files-and-tabs.test.ts`: **8 passed / 0 failed**, from the
2 failed / 6 passed recorded at `6efb45fa`. The e2e baseline for this file is
now clean.

Three of the four items above were genuine production defects — a dead control,
a missing role, and availability bypassing the registry. The fourth was a stale
test asserting a superseded design. All four were invisible to the gate that was
being run and reported as green.
