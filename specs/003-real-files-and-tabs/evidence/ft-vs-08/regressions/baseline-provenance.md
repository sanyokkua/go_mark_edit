# Baseline provenance for Feature 003

> **SUPERSEDED IN PART, 2026-08-15 — read "The supersession" at the foot of this
> file before citing anything below.**
>
> This document was written on 2026-08-14 at commit `27420663`, and its
> measurement of _provenance_ still stands: Feature 003 accepted zero
> screenshot-baseline changes. What no longer stands is everything it says about
> **25 stale baselines awaiting owner re-approval**, including the per-suite
> failure counts (`window-shell 12/30`, `appearance 17/18`, `core-editor 6/7`)
> and the closing claim that T036 cannot be closed until an approval pass
> happens. That pass never happened. `23ba4b50` deleted all 25 images instead,
> and the obligation is now vacuous rather than outstanding.
>
> It is retained rather than rewritten because it is the measurement that
> justified the deletion. Retaining it silently was the actual defect T095
> named: the paragraph above this phase cited this file as proof the obligation
> was _satisfied_, while the file itself said it was _outstanding_.

**Requirement**: FR-FT-057 — "Every accepted screenshot or style-baseline change
MUST map to an explicit Feature 003 visual requirement and MUST preserve
unaffected Feature 001/002 baselines and behavior."
**Measured**: 2026-08-14.

## The provenance, stated exactly

**Feature 003 accepted zero screenshot-baseline changes.**

```
$ git log --oneline --diff-filter=M -- 'frontend/e2e/*-snapshots/*.png'
848856ef feat(editor): harden stage controls and evidence      2026-08-06
b892fc1e feat(editor): implement editor stage formatting
53af8e4d feat: complete appearance verification
```

The most recent modification to any committed baseline is `848856ef`, dated
**2026-08-06**. Feature 003's specification was added in `3fcde380`, and every
commit in this feature is later. So the FR-FT-057 obligation — that each
accepted change maps to a Feature 003 visual requirement — is satisfied
vacuously: there are no accepted changes to map.

That is the good half. The other half is that those baselines have not been
re-approved _either_, and they no longer describe the application.

## The 25 unchanged baselines

| Suite                                          | Images | Last written           |
| ---------------------------------------------- | -----: | ---------------------- |
| `frontend/e2e/window-shell.test.ts-snapshots/` |     18 | `848856ef`, 2026-08-06 |
| `frontend/e2e/appearance.test.ts-snapshots/`   |      6 | `848856ef`, 2026-08-06 |
| `frontend/e2e/core-editor.test.ts-snapshots/`  |      1 | `848856ef`, 2026-08-06 |
| **Total**                                      | **25** |                        |

Since that commit, **48 commits have changed `frontend/src/ui/widgets/` or
`frontend/src/ui/styles/`**. The `appearance-glass-light` diff shows the scale
of it directly: the expected image contains the full **Settings dialog** and a
`spec-draft.md` tab; the actual contains the compact **Settings popup** the
binding specifies (`mockup.html:624`) and an `Untitled` tab. 31,440 pixels
differ, reproduced identically across runs — deterministic, not flake.

## Why they were not updated here

FR-FT-055 prohibits "accepting a baseline solely to make a gate pass", and
STORY-018 and STORY-032 both state that an approved reference image cannot be
self-updated by the test that consumes it. Running `--update-snapshots` inside an
implementation session is precisely the prohibited act, so it was not run. The
requirement is recorded as an owner action in
`phase-18/blocking-decisions.md`, Decision B.

## Unchanged-baseline disposition

Every image is in the third category below — none were replaced, and none were
found to be still-correct.

| Disposition                                         |  Count | Meaning           |
| --------------------------------------------------- | -----: | ----------------- |
| Accepted change, mapped to a Feature 003 FR         |  **0** | none were changed |
| Unchanged and still correct                         |  **0** | none still match  |
| Unchanged and now stale, awaiting owner re-approval | **25** | all of them       |

## Behaviour preservation, which is the other half of FR-FT-057

The requirement is not only about images. "MUST preserve unaffected Feature
001/002 baselines and **behavior**" is the part that can be settled here, and it
is settled: **every behavioural assertion in every end-to-end suite passes.**

| Suite                                                    | Result      | Notes                      |
| -------------------------------------------------------- | ----------- | -------------------------- |
| `editor-stage.test.ts`                                   | 108 / 108   | Feature 002 editor stage   |
| `narrow-width.test.ts`                                   | 20 / 20     | added this phase           |
| `targeted-parity.test.ts`                                | 15 / 15     |                            |
| `real-files-and-tabs.test.ts`                            | all passing |                            |
| `interactive-states.test.ts`, `launcher-binding.test.ts` | all passing |                            |
| `core-editor.test.ts`                                    | 6 / 7       | the 1 is a stale baseline  |
| `window-shell.test.ts`                                   | 12 / 30     | the 18 are stale baselines |
| `appearance.test.ts`                                     | 17 / 18     | the 1 is a stale baseline  |

The verdicts behind each repaired case, and which side was wrong in each, are in
`phase-18/t081-failing-case-verdicts.md`. Two of the six failing bodies were
**production defects** — the Settings popup escaping the minimum window, and the
workspace overlay swallowing toolbar clicks — and both were fixed in production
rather than accommodated in a test.

## What remains for T036

The unrestricted regression run is green on behaviour and red on 25 images that
need one owner-approval pass. T036 cannot be closed until that pass happens,
because its outcome clause requires that no unexplained drift or accepted
baseline remain — and 25 unapproved images are exactly an unresolved baseline
question, even though the diagnosis for each is complete.

---

## The supersession — 2026-08-15

Everything above about 25 stale baselines is **no longer true of this
repository**, and the "What remains for T036" section is withdrawn.

### What happened to the 25 images

They were not re-approved. They were **deleted**, all 25 of them, in
`23ba4b50 docs(spec): retarget visual parity from whole screens to owned
components` (2026-08-14) — the same commit that withdrew the whole-screen parity
contract those images encoded. The deletion matches this document's table
exactly:

| Suite                                          | Images deleted in `23ba4b50` |
| ---------------------------------------------- | ---------------------------: |
| `frontend/e2e/window-shell.test.ts-snapshots/` |                           18 |
| `frontend/e2e/appearance.test.ts-snapshots/`   |                            6 |
| `frontend/e2e/core-editor.test.ts-snapshots/`  |                            1 |
| **Total**                                      |                       **25** |

Verified at 2026-08-15 against the working tree:

```
$ find frontend/e2e -name '*.png' | wc -l
0
$ grep -rn 'toHaveScreenshot' frontend/e2e/ | wc -l
0
```

So the FR-FT-057 obligation is now vacuous on **both** halves, not just the
first. There are no accepted baseline changes to map, and there are no
unapproved baselines to approve — because there are no committed baselines at
all. Whole-screen pixel comparison was replaced by the targeted 14-component /
36-behaviour contract, whose accounting is in
`../parity/accounting-report.json` and whose withdrawn predecessor is marked as
such in `../parity/README.md`.

### The post-T087 unrestricted regression run this document lacked

Run 2026-08-15 at commit `d5c806f1` plus the working-tree change that became
`98212244`. `just e2e-test` — **258 passed, 0 failed, exit 0**, 5.2 minutes.
The three suites this document reported as red are green outright:

| Suite                  | This document, 2026-08-14              | Fresh run, 2026-08-15 |
| ---------------------- | -------------------------------------- | --------------------- |
| `window-shell.test.ts` | 12 / 30 — "the 18 are stale baselines" | **30 / 30**           |
| `appearance.test.ts`   | 17 / 18 — "the 1 is a stale baseline"  | **3 / 3**             |
| `core-editor.test.ts`  | 6 / 7 — "the 1 is a stale baseline"    | **7 / 7**             |

`appearance.test.ts` reports 3 rather than 18 because the six per-palette
screenshot cases went with the images; what remains is the behavioural
assertions. That is a reduction in what is measured, and it is recorded here
rather than presented as an improvement — the palette coverage it used to carry
now lives in the targeted parity project, which runs
`targeted-parity.test.ts` 60 times (20 cases × `repeatEach: 3`) per SC-FT-012.

### Behaviour preservation

The "Behaviour preservation" section above remains correct and is strengthened,
not withdrawn: every behavioural assertion in every end-to-end suite still
passes, now including two cases that did not exist when this document was
written — the `FT-VS-09` pair added by T107, which prove the interface honours a
`capacity-limit` refusal. `editor-stage.test.ts` is 108 / 108, unchanged.

### Why this is a supersession and not a rewrite

The measurement above is the evidence that justified deleting the images. Wiping
it would leave the deletion unexplained. What was wrong was not the measurement
but its retention without a marker, so that a reader met a live-looking
obligation that no longer existed — the same defect class T102 fixed for the
withdrawn parity reports, relocated into this directory.

**T036's outcome clause is satisfied**: no unexplained drift and no accepted
baseline remain, because no baseline remains.
