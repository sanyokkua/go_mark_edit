# The status bar's trailing group — removing two duplicated controls

**Requirement**: FR-FT-051, FR-FT-055 (surface governs shape), Constitution VI
(one canonical registry per action, no duplicate labels).
**Decision**: session decision 5 — remove `Not saved` and `Editor`, keep
`Document details`.
**Branch**: `feature/v1-implementation--003-status-bar-inventory`.

## What the binding actually draws

`mockup.html:837-845`, the whole `.statusbar` row, in order:

| Position | Element | Production |
|---|---|---|
| leading | `.sb-std` Markdown · GFM | kept |
| leading | `.sb-caret` Ln 3, Col 12 | kept |
| leading | `.sb-count` 231 words | kept |
| — | `.ssp` spacer (`flex:1`) | kept |
| trailing | `.sb-enc` UTF-8 | kept |
| trailing | `.sb-eol` LF | kept |
| trailing | `.sb-autosave` Autosave: On | kept |
| trailing | `⚠ 1` lint count | deferred, not drawn |
| trailing | `.sb-provider` Ollama · last call OK | deferred, not drawn |
| trailing | `◱ Reading` pill | deferred, not drawn |

**The binding draws no save status and no arrangement label in this row.**
Production had added both.

## Why each was a duplicate

**`Not saved`.** The binding puts the save status in the *title bar*:
`mockup.html:594` — `<div class="doc-name"><span class="save-dot"></span>Notes /
release-notes.md · autosaved</div>`. Production already renders that through
`DocumentIdentity.tsx:56`. The status-bar copy was a second rendering of the
same backend field in the same window.

**`Editor`.** The arrangement is chosen and displayed by the
Editor/Split/Preview switch, which is a real control with `menuitemradio`
semantics and a `data-state`. A read-only text label repeating the selected
option is a duplicate of a control the user is already looking at, and the
binding's trailing pill is `◱ Reading` — a deferred reading-mode toggle, not an
arrangement label. Production had bound the wrong thing to `.pill`.

## What replaced them

`StatusBar.tsx`:

- The `data-status-item="standard"` item is now rendered **only while a write is
  in flight**, and carries just the transient `Saving` label. Constitution VI
  requires a visible loading state, and removing the item outright would have
  removed one. Parity captures are taken at rest, so at rest the row now carries
  exactly the binding's item inventory. The
  `[data-status-item="standard"][data-write-in-flight="true"]` selector that
  `real-files-parity.test.ts:782` drives is unchanged.
- The `data-status-item="arrangement"` pill is gone, and the `arrangement` prop
  was removed from `StatusBarProps` and both `AppShell` call sites — a prop no
  longer read is a stub on a production path.
- `Document details` stays. See below.
- `data-status-state` on the `<footer>` is untouched, so the backend-authoritative
  status projection is still observable without a visible duplicate.

## Why `Document details` stays, though the binding does not draw it

Decision 5 keeps it, and there is a requirement reason to record.

The row hides `count`, `encoding` and `line-ending` at ≤376px
(`StatusBar.module.css:88-104`). Constitution VI requires every surface to
remain usable at relevant viewports and every stated fact to stay reachable.
Without the disclosure, the encoding, line ending, autosave state and the
read-only warning become unreachable at the narrow width — the information would
simply be gone rather than relocated.

The binding never faced this: it is a fixed-width mockup with no narrow
behaviour for that group beyond `.app[data-w="375"]` hiding `.sb-provider` and
`.sb-autosave` (`mockup.html:82`), and it has no obligation to keep the hidden
facts reachable. Production does. `Document details` is therefore an addition
the binding does not draw and that the specification's accessibility rule
requires; it is recorded here as a deliberate, named difference rather than
drift.

It also now carries the save status inside the popover, which is what keeps that
fact reachable from the status region after the visible copy was removed.

## Semantic contract — production now follows the binding's own path

`frontend/e2e/parity/state-contract.ts:354` already reads

```ts
saveState: statusFromText(statusText) || identityStatus
```

The reference has no status text in `.statusbar`, so it always fell through to
`.doc-name`. Production used to short-circuit on the first term. It now falls
through the same way. **The contract was already written to the binding's shape;
production was the outlier.** No contract change was needed.

## Tests — relocated, not dropped

Every assertion that named a removed element was moved to the surface that now
owns the behaviour, and the de-duplication itself is now asserted:

| Test | Before | After |
|---|---|---|
| `StatusBar.test.tsx` STORY-016-AC-1 | `getByText('Split')` | dropped from the row; arrangement absence asserted in a new case |
| `StatusBar.test.tsx` T015 | `toHaveTextContent('Saved')` | row must **not** contain it; details region must |
| `StatusBar.test.tsx` (new) | — | no `[data-status-item="arrangement"]`, no Editor/Split/Preview text |
| `StatusBar.test.tsx` write-in-flight | text `Unsaved changes` + `Saving` | `Saving` present while in flight, **and the item leaves the row at rest** |
| `AppShell.test.tsx` T042 | `toHaveTextContent('Saved')` | `data-status-state="saved"` — the authoritative projection |
| `EditorView.integration.test.tsx` STORY-016-AC-4 | `toHaveTextContent('Split')` / `('Preview')` | pane visibility before and after the patch |
| `real-files-and-tabs.test.ts` FT-VS-02 | `footer` has `Saved` | identity header has `Saved` |
| `real-files-and-tabs.test.ts` FT-VS-05 | `footer` has `Not saved` | identity header has it **and** footer must not |
| `targeted-parity.test.ts` T063 | `status` contains the state text | identity header contains it **and** status must not |

Nothing was skipped, narrowed or removed; two assertions became stronger by
adding the negative case that proves the duplicate is gone.

## Gate

`just check` green. Unit suites 75 / **484** tests (was 483 — one net new case),
lint 0 errors and the 2 baseline `react-refresh` warnings, typecheck clean.

Targeted parity re-run by name after the change:

| Slice | Result |
|---|---|
| T062 tabs and toolbar | **passed** — the protected zero-pixel slice is unaffected |
| T063 editor-status, six states | **passed** |

## A finding this uncovered: `just check` does not run the parity suites

`just check` is `gen-check, frontend-build, fmt-check, lint, typecheck,
frontend-test, go-vet, archtest, go-test` (`justfile:145`). Playwright runs only
under `just e2e-test` / `just verify-ui`, which `just check` never calls.

Running `real-files-and-tabs.test.ts` on the **unmodified** tree at `6efb45fa`
gives **2 failed / 6 passed**:

- `FT-VS-05 exposes acknowledged autosave control and truthful save status wiring`
- `FT-VS-07 proves recents, reopen, launcher, and responsive status controls`

Both fail on `expect(openRecent).toBeEnabled()` — the File ▸ Open Recent item is
disabled when the test expects it enabled. **These are pre-existing and are not
from this change**; the same 2 fail before and after, and the count returned to
2 once this change's own breakages were fixed. They are recorded in
`e2e-baseline-failures.md` and carried as an open finding.

This is the mechanism behind "defects kept being found by eye": the local gate
labelled green while an entire suite of real-interface tests was never executed
by it.
