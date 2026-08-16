# SC-FT-013 — what the end-to-end suites actually prove about widths and palettes

**Proves: SC-FT-013 — partially, and the shortfall is structural rather than a missing run.** The
suite proves the criterion under one reading of its wording and does not under the other; which
reading is correct needs the owner and is filed as **T187**. Written by **T158**, which found
SC-FT-013 tied to no run and no artifact.

## The criterion

> All unaffected Feature 001 and Feature 002 responsive, focus, action, and native-shell behavior
> remains intact, **proven by every behavioural assertion in the end-to-end suites passing at all
> three widths and all six palettes**. Zero populated workspace, Assistant/provider, custom
> native-frame, or deferred rich-rendering surface appears in order to manufacture parity. …
> Visual regression now rests on the 14 component keys, the token gate across all six palettes, and
> the structural assertions retained in those suites.

The emphasised clause has two readings. **Reading A**: every behavioural assertion is executed at
each of three widths and each of six palettes. **Reading B**: every behavioural assertion passes, and
the suites between them cover three widths and six palettes. The suite satisfies B. It does not
satisfy A, and no reorganisation short of a large combinatorial expansion would make it.

## The run this artifact is written against

`just e2e-test`, 2026-08-16, on the T158 branch based on `ae597753`. Host darwin/arm64, node
v24.18.0, Playwright 1.61.1.

| Field | Value |
|---|---|
| exit code | **0** |
| result | **268 passed**, 0 failed, 5 workers, 5.1 minutes |
| `[parity states]` | **40/40** additional states covered by a named assertion |
| `[parity accounting]` | **150/150** planned verifications attempted, 150 passed, 0 failed, 0 unaccounted |

**One flake, recorded rather than hidden.** The first attempt of this stack was 267 passed / **1
failed**: `FT-VS-10 dispatches the File accelerators the menu advertises`
(`e2e/real-files-and-tabs.test.ts:875`) timed out on `getByRole('tab')` resolving to 2 where it
expected 1 after `ControlOrMeta+w`. Re-run alone it passed in 934 ms, and the full suite then passed
268/268 as above. The machine was concurrently running a Go race suite during the first attempt.
This is the same load-sensitive shape as the `T026` resize-sample flake recorded in
`ft-ev-09/gates/exit-codes.txt`, and it is worth watching for the same reason: a wall-clock
assertion will fail again on a loaded host. The only tree change on this branch is comments in two
Jest files and new markdown, none of which Playwright loads.

## What genuinely runs at three widths × six palettes

The widths are **1280 / 768 / 375** — not 1024 — declared per file rather than centrally.

| Suite | Matrix | What it asserts at every cell |
|---|---|---|
| `frontend/e2e/window-shell.test.ts` T026 (`:400`) | 3 widths × 6 palettes = 18 | `data-theme`/`data-mode`, `--dur-base: 0ms`, workspace presence and width (216 / 46 / absent), toolbar overflow, `scrollWidth <= innerWidth`, in-viewport geometry, the resolved Monaco background, zero runtime errors. **This is the one place real behavioural assertions run the full cross-product.** |
| `frontend/e2e/editor-stage.test.ts` (`:15`, `:137`, `:319`, `:453`) | 3 widths × 3 themes × 3 modes = 108 | The mockup chrome hierarchy and the reachable Editor-stage journeys. The modes are `Auto (system)` / `Light` / `Dark`, so this is the six palettes **plus** three Auto variants — broader on one axis, not narrower |
| `frontend/e2e/appearance.test.ts` (`:46`) | 3 widths × 6 palettes, one test | Attribute flip, Monaco visible, no horizontal overflow. Its scrollbar-colour assertion is gated to `width === 1280` |
| `frontend/e2e/targeted-parity.test.ts` T063 (`:1437`) | 6 palettes at 1280 | The six backend-authoritative editor-status states against `data-status-state`, the title bar, status-item text and the binding colour token. This is the 36-key behaviour half |

## What does not

Run once, at 1280, in the default `material` / `light` palette:

- `frontend/e2e/interactive-states.test.ts` — **all five** T076 hover / focus / open-state tests. This
  is the file the criterion's word "focus" points at, and it is single-width, single-palette.
- `frontend/e2e/launcher-binding.test.ts` — all four T057 binding tests
- `frontend/e2e/offline-and-controls.test.ts` — both tests, width hard-set
- `frontend/e2e/real-files-and-tabs.test.ts` — all 20 tests; its own comment at `:59` concedes that
  the Tab-actions-menu clipping clause is proven "only at 1280"
- five of the eight `window-shell` tests; T041 runs `[375, 1280]` with **768 excluded**
- five of the seven `core-editor` tests

And the mirror-image gap: `frontend/e2e/narrow-width.test.ts` never runs at **1280** — its loops are
`[768, 375]`.

**No pixel-compared key runs at 768 at all.** `TargetedEntry.width` is typed `1280 | 375`
(`frontend/e2e/targeted-manifest.ts:12`).

## The two counters, and what they are not

Both are printed by `frontend/e2e/parity/accounting-teardown.ts`, the config's `globalTeardown`.

- **`[parity states] 40/40`** counts the 40 additional parity **state ids**
  (`ADDITIONAL_STATE_ASSIGNMENTS`, `e2e/parity/manifest.ts:157-198`) that had a named covering
  assertion actually run. It plans **one entry per state, not one per palette** — the first match,
  `glass-light`, at that state's single assigned width. So it says: each of 40 states was reachable
  and ran one named assertion, once, in one palette, at one width.
- **`[parity accounting] 150/150`** is `14 pixel-compared keys + 36 behaviour keys = 50`, each
  attempted in `PARITY_REPETITION_COUNT = 3` repetitions. `repeatEach: 3` applies to the `parity`
  project alone — that is, to `targeted-parity.test.ts` and nothing else.

**Neither counter measures widths or palettes.** A reader who takes `40/40` or `150/150` as breadth
evidence for this criterion will be wrong in both directions.

Also worth stating: **the "token gate across all six palettes" the criterion names is not in the
end-to-end suite at all.** It is `frontend/src/ui/styles/tokens.test.ts`
(`suppliesEveryAppearanceContractTokenAcrossAllSixPalettes` and two siblings) — Jest under jsdom, run
by `just check`, not by `just e2e-test`. And there is no contrast-ratio gate anywhere;
`--accent-contrast` is a token name, not a computed check.

## The negative clause is roughly one-quarter proven

`frontend/e2e/offline-and-controls.test.ts:194`
(*FR-FT-049 keeps every deferred surface unavailable rather than absent or working*) is the only test
that asserts any of it, at 1280 in the default palette, once. It asserts that no action in
`open-folder`, `new-window`, `toggle-assistant`, `distraction-free-reading`, `image`, `format`,
`compact`, `lint` has registry availability `available`; that three toolbar controls and two
View-menu items are `disabled`; and that the shell's third grid track — the Assistant column —
computes to **0 px**.

- **Populated workspace**: only sizing and absence are pinned (`window-shell` T026 at 216 / 46 / 0,
  `editor-stage.test.ts:226-238`), which is not the same as "unpopulated".
- **Custom native frame**: **no assertion anywhere.** The wording survives as a prose comment on the
  reference selector table at `frontend/e2e/real-files-parity.test.ts:90-95`, enforced only insofar as
  the reference selectors stop at webview content.
- **Deferred rich-rendering**: **no assertion anywhere.** Nothing in `e2e/*.test.ts` touches mermaid,
  math or footnotes.

## What this artifact claims, exactly

That the end-to-end suites prove, on the run recorded above: the shell's chrome inventory,
availability, geometry, reachability and resolved editor theme hold at three widths × six palettes;
14 component regions match the immutable reference at zero tolerance across three repetitions (13 at
1280, one at 375; six across all palettes, eight at `minimal-light`); the six editor-status states
hold in all six palettes at 1280; and all 40 additional parity states have one covering assertion that
runs. Every assertion that ran, passed.

**It does not claim** that every behavioural assertion runs at all three widths and all six palettes,
that the token gate is covered by this run, or that the custom-native-frame and deferred
rich-rendering halves of the negative clause are proved at all.

**And it must not be read as covering the host.** These are Playwright runs against the dev bridge
mock. **T166** — the interactive walkthrough of `Copy path` and `Reveal in file manager` on the real
binary, both of which were dead in every shipped binary until T161 — has **not** been performed, and
nothing in this run touches it.
