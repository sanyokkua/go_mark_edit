# Two decisions this session could not take

Recorded 2026-08-14. Both are owner decisions, not implementation problems. Each is stated
with what is blocked, what the options are, and a recommended default — so the decision can be
taken in one reading.

---

## Decision A — the Feature 002 editor term blocks a full T035 pass

### What is blocked

**T035** (the unrestricted 546-case matrix), and through it **T036, T037, T038, T044, T054 and
T068**, which each require the matrix to be green.

### The measurement

`phase-18/t035-run.md` records it. The editor region's computed styles differ from the binding
on **eight properties**:

| Property                               | Reference (binding)                                           | Production                                                |
| -------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `font-family`                          | `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace` | `Inter, -apple-system, "Segoe UI", system-ui, sans-serif` |
| `font-size`                            | `13px`                                                        | `16px`                                                    |
| `line-height`                          | `23.4px`                                                      | `normal`                                                  |
| `overflow`, `overflow-x`, `overflow-y` | `auto`                                                        | `hidden`                                                  |
| `min-width`, `min-height`              | `auto`                                                        | `0px`                                                     |

Those eight assertions fail in **432 of the 1,638 comparisons**; a further 126 also fail
`width` and `height` in that region. The pixel weight, over the identical region at 1280px
Minimal Light: `editor-only` **23,019**, `editor-split` **23,024**, and — the control that
isolates the cause — `preview-only` **177**.

### Why it cannot be resolved here

`spec.md` (Clarifications, Session 2026-08-13) already answers whether Feature 003 changes it:

> **No.** The editor's typeface, type scale and scrolling model are Feature 002's decision …
> Feature 003 may not silently redefine another feature's approved surface to improve its own
> numbers … **T035 cannot reach a full pass until Feature 002 resolves it.**

And the residual cannot simply be attributed. The 2026-08-13 clarification defines a pass as
"every differing pixel has a written, proven cause", where **proven** requires that "the
region's bounds and every compared computed style match exactly". These eight styles are
exactly what does not match, so the attribution mechanism refuses them by design — correctly.

### The options

1. **Feature 002 adopts the binding's editor typography and scrolling** (`JetBrains Mono
13px/23.4px`, `overflow: auto`). Unblocks 432 comparisons and moves ~23,000 pixels per
   editor-family case toward zero. It changes the shipped editing experience, which is why it
   belongs to Feature 002 and not to a parity metric.
2. **Amend FR-FT-055 so a named cross-feature region exclusion may also record its owning
   feature's computed-style differences** instead of requiring them to match this feature's
   binding. FR-FT-055 currently says such an exclusion "MUST still assert the excluded region's
   bounds and computed styles exactly" — which contradicts the exclusion's own premise that
   another feature owns the region. The bounds requirement stays; the style requirement becomes
   _recorded and bounded_ rather than _matching_, on the same footing as an attributed pixel
   residual: the exact set of differing properties and both sides' values are declared, and the
   comparison **fails if that set changes**. Real editor drift is still caught; the
   already-decided Feature 002 difference stops being counted as Feature 003 drift.
3. **Leave T035 permanently open**, carried as a cross-feature dependency.

### Recommended default: option 2

It resolves an internal contradiction rather than weakening a rule. An exclusion exists
precisely because this feature does not own the region; requiring that region's computed styles
to match this feature's binding asks the exclusion to be simultaneously excluded and compared.
Bounding the difference — declared property set, both sides' values, fails on change — keeps
every property of the attributed-residual mechanism that makes it safe, and it is the same
shape the codebase already uses for pixels.

Option 1 remains the better _product_ outcome if Feature 002 wants it; option 2 does not
prevent it and would simply stop firing when it landed.

---

## Decision B — 25 committed screenshot baselines are stale and need owner approval

### What is blocked

The green e2e run that **T036** requires and **T038** aggregates. Also the final palette pass
of **T066**, which depends on `appearance.test.ts` and the `window-shell` T026 matrix.

### The measurement

Every committed baseline in these three suites was written by commit `848856ef` on
**2026-08-06**:

| Suite                                          | Images |
| ---------------------------------------------- | -----: |
| `frontend/e2e/window-shell.test.ts-snapshots/` |     18 |
| `frontend/e2e/appearance.test.ts-snapshots/`   |      6 |
| `frontend/e2e/core-editor.test.ts-snapshots/`  |      1 |
| **Total**                                      | **25** |

Since that commit, **48 commits have changed `frontend/src/ui/widgets/` or
`frontend/src/ui/styles/`**. The images therefore depict an application that no longer exists.
The `appearance-glass-light.png` diff shows it directly: the expected image contains the full
**Settings dialog** and a `spec-draft.md` tab; the actual contains the compact **Settings
popup** the binding specifies (`mockup.html:624`) and an `Untitled` tab. 31,440 pixels differ,
reproduced identically on a re-run — deterministic, not flake.

24 of the 25 are currently **masked** by an earlier assertion failing first in the same case.
Fixing those assertions surfaces them.

### Why it cannot be resolved here

STORY-018 and STORY-032 both state that an approved reference image cannot be self-updated by
the test that consumes it. Running `--update-snapshots` inside an implementation session is
precisely the thing FR-FT-055 forbids: "accepting a baseline solely to make a gate pass".

### What is needed

One owner-approval pass over all 25 images, taken **after** the minimum-window behaviour
(T077–T080) has landed, so the re-approved images depict the final surface rather than needing
a second pass. The command is `npx playwright test --update-snapshots` scoped to the three
suites, run by, or explicitly authorised by, the owner — and the resulting images reviewed, not
just regenerated.
