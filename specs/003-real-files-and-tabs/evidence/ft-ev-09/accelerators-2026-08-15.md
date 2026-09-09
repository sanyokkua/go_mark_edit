# T110 — File-menu keyboard accelerators

Date: 2026-08-15. Branch `feature/v1-implementation--003-t110-file-accelerators`, based on
`4e141037`. Host: darwin 25.5.0.

The File menu advertised `⌘N`, `⌘O`, `⌘S`, `⌘⇧S`, `⌘W` and `⌥⇧⌘T` beside its rows and no keyboard
handler dispatched any of them.

## 1. The probe that came before the fix

T110's frontend root cause was already located, but the evidence that the keystroke _reached the
application_ was circular: `host-walkthrough-2026-08-15.md` justified it with the 2026-08-14
`⌘S`-committed-a-write observation, which is precisely the observation T110 asked to re-examine.
Remove it and nothing in this tree showed any `⌘` accelerator ever firing on the packaged binary —
every recorded `⌘` observation was of advertised _text_, never a pressed key.

That left a second possible layer: WKWebView never delivering `⌘`-modified keydown to JS at all,
in which case a frontend fix would pass every gate and still fail on the host. The Playwright
suite cannot see it — it runs a real Chromium against the mock bridge, where `⌘` always reaches JS.

**Method.** Rebuild, launch, and press an accelerator that is _already wired_ — `⌘,` (Settings) is
in `createShellActionCatalogue` — beside one that is not. `⌘,` has no side effect that can happen
on its own, so it carries no autosave confound.

Stale-instance guard, per the trap recorded in `host-walkthrough-2026-08-15.md`: binary written
**12:33:29**, process started **12:34:38**. The process is newer than the binary, so it is the
fresh build and not a raised older instance.

| Key     | Wired before the fix? | Result on `4e141037`               |
| ------- | --------------------- | ---------------------------------- |
| `⌘,`    | yes (shell catalogue) | **Settings menu opened**           |
| `⌘\`    | yes (shell catalogue) | live                               |
| `⌘N` ×7 | no                    | **nothing; still exactly one tab** |

**Verdict: the defect is entirely in the frontend.** Same webview, same keyboard, same modifier —
the only difference between `⌘,` and `⌘N` was whether anything listened. The native-menu
contingency (`internal/application/native_menu.go` registering a File menu with accelerators) is
retired, and `native_menu.go` is untouched by this task.

Screenshots: `host-screenshots/` (Settings opened by `⌘,`; unchanged single-tab shell after `⌘N`).

## 2. The tests, failing first

Nothing existing could have caught this. `actionRegistry.test.ts:55` asserts the registry
_declares_ `Mod+N`; `useShellShortcuts.test.tsx` drives the hook with synthetic actions it builds
itself. Neither asks whether `ShellMenuRow` — which both renders the accelerator text and installs
the only global keydown listener — passes the file actions to that hook.

`ShellMenuRow.test.tsx` now renders the **real** component and dispatches real key events at
`window`. jsdom reports `navigator.platform === ''`, so `currentPlatform()` is `'linux'` and `Mod`
binds to `ctrlKey` — the convention already used by the neighbouring suites.

Before the fix: **7 failed, 30 passed**. After: **37 passed**. The seven:

| Test                                                                          | Accelerator |
| ----------------------------------------------------------------------------- | ----------- |
| `T110 dispatches the advertised File accelerator Mod+N › runs new-file …`     | `⌘N`        |
| `… Mod+O › runs open-file …`                                                  | `⌘O`        |
| `… Mod+S › runs save …`                                                       | `⌘S`        |
| `… Mod+Shift+S › runs save-as …`                                              | `⌘⇧S`       |
| `… Mod+W › runs close-tab …`                                                  | `⌘W`        |
| `… Mod+Shift+Alt+T › runs reopen …`                                           | `⌥⇧⌘T`      |
| `T110 closes the active document when the File menu Close Tab row is clicked` | (click)     |

**Two of the new tests passed before the fix, and are recorded as guards rather than as proof.**
`T110 leaves Save and Save As unclaimed on a document that is not writable` and `T110 leaves every
File accelerator inert while a modal is open` pass trivially when nothing is wired — dead code
fires nothing. Their value is against a _wrong_ fix: `useShellShortcuts.ts:38-41` calls
`preventDefault()` only after `isAvailable()` returns true, so an implementation hardcoding
`isAvailable: () => true` would go green on all six accelerators while silently swallowing `⌘S` on
a read-only document. Nothing else would catch that.

At the interface level, `FT-VS-10 dispatches the File accelerators the menu advertises`
(`frontend/e2e/real-files-and-tabs.test.ts`) presses the real keys and asserts the interface
changed. Confirmed red by stashing only the two source files and re-running: it fails with
`[data-notification-code="save-success"]` resolving to **0 elements**.

## 3. T104's second symptom, re-examined

T104 attributed an explicit `⌘S` reporting `Autosaved` to the autosave committing the baseline
first, with the explicit save then finding the document clean and no-opping.

**That mechanism is wrong.** There was no explicit save to no-op: `⌘S` had no listener. The
`0 elements` result above is the measurement — a `save-success` notification is emitted only by
`finishWrite`'s explicit path, so its absence means no explicit save was _attempted_, not that one
was attempted and found the document clean. The label read `Autosaved` because the one-second Go
autosave had already committed with `SaveOriginAutosave` and nothing else ever ran.

**Scope.** T104's root cause — `SetAutosaveEnabled` having no Wails binding and no frontend
caller — is untouched, as is the disk measurement that proved it and the fix that closed it.
`internal/appmodel/save_status.go` was correct then and is unchanged now. Only this one symptom's
attribution moves. Corrections appended in place to `walkthrough-2026-08-14-automated.md`,
`host-walkthrough-2026-08-15.md` and T104's entry in `tasks.md`; none rewrites the original record.

## 4. The fix

`frontend/src/ui/widgets/ShellMenuRow.tsx` — the accelerator text, the row's click and the
keystroke now derive from one table. T110 existed because the first was read from the action
registry while dispatch was read from a hand-written catalogue of six shell ids: two lists that
could disagree with every test still green. `fileActionInvoker` and `fileActionDisabled` are
hoisted above the hook call and shared by both surfaces, and the File entries are built from
`actionsForSurface('file-menu')` so a row cannot advertise a shortcut without also dispatching it.
`exit` self-excludes (no registry shortcut — native quit owns it); deferred ids self-exclude
through `fileActionDisabled`.

`frontend/src/App.tsx` — `onCloseDocument` already existed and reached the tab strip, but never the
menu subtree; `ShellMenuRow` renders under `.application-menu` via `AppearanceControls`, a
different subtree from the tabs. It is now threaded through `ApplicationMenuState` and bound to the
active document and tab-set revision in `ApplicationShellMenu`.

**A second defect fixed by the same prop.** `File ▸ Close Tab` rendered _enabled_ and its click was
a silent no-op — `dispatchFileAction` had no `close-tab` arm, so `invoke` was `undefined` and it
returned early. `ShellMenuRow` had no close callback in its props at all, which is the same
missing prop `⌘W` needed. Covered by the click-parity test above.

Not touched: `useShellShortcuts.ts` (its `ShortcutAction` branch already did what was needed),
`shellActions.ts` (its six-id union is closed and `shellScope()` throws on `document` scope, so
File actions belong on the `ShortcutAction` branch), `actionRegistry.ts`, `native_menu.go`.

## 5. The host walk after the fix

Binary rebuilt at **13:27:50**, process started **13:27:56** — newer than the binary, so not a
raised older instance. Autosave **off** throughout, which removes the confound that made T104's
second symptom ambiguous in the first place.

| Accelerator | Observed on the real binary                                                                  |
| ----------- | -------------------------------------------------------------------------------------------- |
| `⌘N`        | **works** — one tab to three                                                                 |
| `⌘W`        | **works** — three to two, then two to one, twice                                             |
| `⌘S`        | **works** — status reads `Saved` (not `Autosaved`), and the edit is on disk                  |
| `⌘O`        | **works** — opens the real native Open dialog                                                |
| `⌘⇧S`       | **works** — opens the real native Save As dialog                                             |
| `⌥⇧⌘T`      | advertised and correctly greyed (no reopenable file in this session); dispatch not exercised |

Glyph rendering was checked at magnification: `⌘N`, `⌘O`, `⌥⇧⌘T`, `⌘S`, `⌘⇧S`, `⌘W`, with `Exit`
deliberately bare and the three deferred rows greyed with no accelerator.

**`⌘S` closes T104's second symptom on the host.** With autosave off, an explicit `⌘S` on
`fixture-a.md` reported `Saved` and the file on disk gained the typed line
(`Probe after the T104 fix. Edited on host at 13:35.`, 147 bytes). No `.gomarkedit-*` temporary
survived, so FR-FT-009's atomic replace is clean on this path. This also retires a risk the
browser suite could not address: the editor is real Monaco, lazily imported at `EditorView.tsx:145`,
so `⌘S` could in principle have been swallowed before reaching the `window` listener. It is not.

### One thing this walk could not confirm — `File ▸ Close Tab` by click

`⌘W` closes a tab reliably on the host. The **menu row's click does not**, observed twice from a
stable two-tab state, with the click verified to land (the row highlights under the pointer before
the click). The same click **passes in Chromium against the mock bridge** — a scratch Playwright
case clicking the row closed the tab and produced no console error — and passes at unit level,
where the adapter is mocked.

That combination is the mock-divergence class this tree has been bitten by before: both test
levels stop short of the real Go close plan, so neither can see it. The accelerator and the click
call the identical `onCloseDocument` with the identical dispatch context, so the difference is
likely downstream in `prepareClose`'s expected-tab-set-revision handling rather than in this
change.

**Recorded as unresolved rather than claimed.** It is not a regression — the row was a silent
no-op before this task, so the click path is no worse and is now demonstrably correct in two of
three environments. T110's own scope, the accelerators, is unaffected and verified. Filed as its
own task rather than folded into this one.

## 6. Filed, not fixed here

The Settings menu advertises `Ctrl ,` on macOS while the key that works is `⌘,`.
`SettingsMenu.tsx:285-287` renders the raw i18n string `settings.menu.allSettings.accelerator`,
hardcoded to `"Ctrl ,"` at `frontend/src/i18n/locales/en.json:129`, instead of going through
`formatShortcut(..., currentPlatform())` the way `ShellMenuRow`'s `shortcutForMenuItem` does. Same
defect class as T110 — advertised accelerator text decoupled from the registry — but a _wrong_
label rather than an inert key, on a different menu, and under the parity contract.

Critically, the literal `Ctrl ,` **matches the immutable reference** (`mockup.html:624`), and the
Settings popup is compared by `T060`. The File menu renders `⌘N` only through the reviewed
exception recorded at `reference-adapter.ts:124-129`, limited to four named rows. Fixing the
Settings row means extending that reviewed exception — a parity-contract change, not a one-line
derivation. Out of T110's scope; filed as **T112** with the full constraint written down.

The unresolved `File ▸ Close Tab` click from §5 is filed as **T111**.
