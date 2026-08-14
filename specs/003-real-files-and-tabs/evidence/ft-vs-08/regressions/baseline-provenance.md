# Baseline provenance for Feature 003

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
re-approved *either*, and they no longer describe the application.

## The 25 unchanged baselines

| Suite | Images | Last written |
|---|---:|---|
| `frontend/e2e/window-shell.test.ts-snapshots/` | 18 | `848856ef`, 2026-08-06 |
| `frontend/e2e/appearance.test.ts-snapshots/` | 6 | `848856ef`, 2026-08-06 |
| `frontend/e2e/core-editor.test.ts-snapshots/` | 1 | `848856ef`, 2026-08-06 |
| **Total** | **25** | |

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

| Disposition | Count | Meaning |
|---|---:|---|
| Accepted change, mapped to a Feature 003 FR | **0** | none were changed |
| Unchanged and still correct | **0** | none still match |
| Unchanged and now stale, awaiting owner re-approval | **25** | all of them |

## Behaviour preservation, which is the other half of FR-FT-057

The requirement is not only about images. "MUST preserve unaffected Feature
001/002 baselines and **behavior**" is the part that can be settled here, and it
is settled: **every behavioural assertion in every end-to-end suite passes.**

| Suite | Result | Notes |
|---|---|---|
| `editor-stage.test.ts` | 108 / 108 | Feature 002 editor stage |
| `narrow-width.test.ts` | 20 / 20 | added this phase |
| `targeted-parity.test.ts` | 15 / 15 | |
| `real-files-and-tabs.test.ts` | all passing | |
| `interactive-states.test.ts`, `launcher-binding.test.ts` | all passing | |
| `core-editor.test.ts` | 6 / 7 | the 1 is a stale baseline |
| `window-shell.test.ts` | 12 / 30 | the 18 are stale baselines |
| `appearance.test.ts` | 17 / 18 | the 1 is a stale baseline |

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
