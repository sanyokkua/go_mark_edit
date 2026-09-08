# T112 — the Settings menu advertised `Ctrl ,` on macOS

Date: 2026-08-15. Branch `feature/v1-implementation--003-t112-settings-accelerator`, based on
`0e7c703b` (T110).

## The defect

The Settings menu drew `Ctrl ,` beside `All settings…` on macOS while the key that actually
dispatches is `⌘,` — observed on the built binary during T110's host probe, where pressing `⌘,`
opened the menu the label told the user to reach with Ctrl.

**Root cause**: `SettingsMenu.tsx` rendered the raw catalogue string
`settings.menu.allSettings.accelerator`, hardcoded to the literal `"Ctrl ,"` in
`frontend/src/i18n/locales/en.json`. It never called `formatShortcut(binding, currentPlatform())`,
so it could not follow the platform. Every other accelerator in the shell is derived from the
action registry — `ShellMenuRow`'s `shortcutForMenuItem` — which is why the File menu renders `⌘N`
correctly on the same host.

Same defect class as T110 (advertised accelerator text decoupled from the registry), but the
opposite failure: T110's keys were inert, this one was *wrong*.

**This was the last instance in production.** `ShortcutsDialog.tsx:119-121` already derives its
entries with `formatShortcut(entry.shortcut, platform)`, so the Settings row was the only
platform-blind accelerator the application rendered.

## Why this was not a one-line fix

The literal was not stray — it **matched the immutable reference**.
`docs/delivery/spec/surface/mockup.html:624` writes `<span class="k">Ctrl ,</span>`, and the whole
Settings/View/About block uses `Ctrl` spellings. The Settings popup is genuinely compared:
`TARGETED_SETTINGS_MANIFEST` drives `T060 state-pairs the Settings popup in Minimal Light` and the
375px overflow variant.

The File menu is allowed to show `⌘N` only through an explicitly reviewed exception —
`FILE_POPUP_ACCELERATOR_GLYPH_EXCEPTION_ACTIONS`, capped at four rows, with
`reference-adapter.ts` recording that the T059 decision deliberately preserves the reference's
literal `Ctrl` text for them "so the reviewed macOS accelerator-glyph pixel exception stays the
only accepted difference".

The change is also **not macOS-only**: `formatShortcut('Mod+,', …)` yields `⌘,` on darwin and
`Ctrl+,` elsewhere, and neither is the reference's `Ctrl ,`. The text comparator normalises
whitespace and `+` away so text still pairs off-macOS, but the rendered pixels shift on every
platform.

## The approach taken — a reference variant, not a fifth exception

FR-FT-056 requires behavior-owned differences from the historical mockup to be **compared rather
than masked**, and `reference-adapter.ts` already applies exactly that to the View and About menus:
"Feature 003 owns its accelerators, so they are formatted for the host the application is actually
running on."

The Settings popup now follows the same rule. `adaptDeferredSettingsRows` takes the host platform
and rewrites the `All settings…` accelerator to the Feature 003 value, using only the mockup's own
`.k` primitive. No HTML or CSS value in `mockup.html` is edited and its raw source hash is
unchanged.

This keeps the row **measured exactly** — glyphs, spacing and geometry — instead of adding a
rectangle the comparator is told to forgive. The reviewed glyph exception stays capped at the four
File rows the T059 decision named; nothing was added to it.

`settingsMenuReferenceAccelerators` and the source markup are folded into
`REFERENCE_ADAPTER_HASH`, so the adapter's hash covers what the adapter actually does rather than
silently diverging from it.

## Tests, failing first

| Test | Asserts |
|---|---|
| `T112 advertises the Settings accelerator the platform actually dispatches` | the rendered text equals `formatShortcut(getAction('settings').shortcut, currentPlatform())` — written against the registry, not a literal, so it cannot drift from the binding `useShellShortcuts` matches |
| `T112 keeps no hardcoded accelerator string in the catalogue` | the key is gone from the catalogue; a literal left behind renders whatever platform it was written for |
| `T112 expresses the Settings accelerator for the host in the reference variant` | the adapted reference carries the host's accelerator and the compared popup no longer carries `Ctrl ,` |
| `T112 fails closed when the source loses the Settings accelerator` | the adapter throws rather than silently serving an unadapted reference |

Before the fix the first two failed. Two **existing** `T069` assertions also had to move, and were
updated rather than weakened:

- `T069 draws every visible Settings popup string from the catalogue` enforced "no hardcoded
  literal survives" by requiring every rendered string to be a catalogue value. The accelerator is
  now legitimately *not* catalogue copy. The test now accepts catalogue values **plus** the
  registry-derived accelerator, computed from `getAction`. The rule still bites — a stray literal
  belongs to neither source — while naming the registry as a second legitimate origin instead of
  exempting the row from the check.
- `T069 keeps the binding popup labels…` asserted the literal `'Ctrl ,'`; it now asserts the
  derived value.

The scope of the reference assertion is deliberately the Settings dropdown, not the document. The
mockup also writes `Ctrl ,` in its keyboard-shortcuts cheat-sheet screen (`mockup.html:917`), which
is a different surface, is absent from the targeted manifest, and is not this task's contract.
Asserting over the whole document would have quietly widened T112 to a screen nothing compares.

## Verification

- `just check` — **exit 0**.
- Frontend unit suites: `SettingsMenu.test.tsx` 7 passed (2 failing first),
  `reference-adapter.test.ts` 14 passed (2 new).
- `just e2e-test` — **258 passed, 1 failed** out of 259. The port-4174 reference server was killed
  before the run, because it is reused across runs and would otherwise have served the pre-change
  HTML and produced a result that looks like production drift.

**The decisive measurement**: `T060 state-pairs the Settings popup in Minimal Light` and
`T060 state-pairs the 375px Settings overflow in Minimal Light` both **pass**, and the parity
accounting reports **150/150 planned verifications attempted, 150 passed, 0 failed, 0
unaccounted**. The row is compared exactly; no pixel exception was added.

**The one failure is the known `T026` flake, not a regression.**
`T026 retains at least 20 measured resize and divider samples` asserts a timing ratio and is
load-sensitive; it failed inside the full suite and then **passed alone in 16.7 s** on an idle
machine. It has flaked this way before — the T038 gate stack records the same case failing once on
a busy machine and passing on re-run. Nothing in this change touches resize timing. Both results
are recorded rather than the failure being hidden or the re-run being presented as the only run.
