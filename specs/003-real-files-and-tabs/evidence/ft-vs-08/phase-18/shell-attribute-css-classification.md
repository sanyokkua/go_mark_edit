# T193 — classifying the 39 remaining shell-attribute CSS rules

**Requirement:** FR-FT-054. **Opened by:** T173, which decoupled these rules from the
parity substitutions but deliberately did not judge them.

## What was classified

39 rules keyed on `AppShell`'s `data-parity-shell` / `data-parity-family` attributes:

| File | Rules |
|---|---|
| `frontend/src/ui/widgets/EditorChrome.module.css` | 34 |
| `frontend/src/ui/widgets/EditorView.module.css` | 5 |

`base.css`'s four rules are outside this set — T173 already classified them as capture
conditions (they give the browser the mockup's bounded window geometry, which production
gets from the native webview), and the two attributes themselves stay for exactly that
reason.

## Method

The method that worked on `AppShell`: neutralise, run `just e2e-test`, read
`[parity accounting]`. Neutralisation was a selector rename (`data-parity-shell` →
`data-parity-shell-PROBE`), so every rule remained syntactically present and only its
match was removed — a deletion and a rename are indistinguishable to the comparator, and
a rename cannot accidentally take a neighbouring rule with it.

Both runs were made after killing the port-4174 server, since a reused server serves a
stale adaptation.

## Measurements

**Run 1 — all 39 neutralised.** `just e2e-test` exit **1**, 232 passed / 3 failed.

```
Error: attributed residual "popup-antialiased-boundary" grew to 184 pixels,
above its measured 181
(specs/003-real-files-and-tabs/evidence/ft-vs-08/phase-18/residual-attribution.md)
```

The same failure in all three repetitions of the case — deterministic, not flake. So the
39 are not collectively dead.

**Run 2 — `EditorChrome`'s 34 restored, `EditorView`'s 5 still neutralised.**
`just e2e-test` exit **0**, 271 passed.

```
[parity accounting] 147/147 planned verifications attempted, 147 passed,
0 failed, 0 unaccounted
```

## Classification

**`EditorView.module.css` — 5 rules, dead. Deleted.**

The full suite passes at 147/147 without them: they hold nothing still. Their content
also explains why. Four narrowed the preview pane's paused-state overflow, background and
heading/list line-height; one was keyed on `data-parity-family='toolbar-overflow'`, and
that family's only pixel-compared key left `targeted-manifest.ts` when T173 removed the
`settings-overflow` substitution — the selector could no longer match anything the
comparator renders.

**`EditorChrome.module.css` — 34 rules, capture conditions. Kept.**

They carry the entire difference between the two runs: with `EditorView`'s five already
neutralised, restoring these 34 is the only change between exit 1 at 184 pixels and exit 0
at 147/147. Removing them moves `popup-antialiased-boundary` from its measured 181 to
**184 pixels**, which is a residual growth, and `residual-shrink-rule.md` does not permit
one.

The 3-pixel magnitude is worth stating plainly rather than rounding to "load-bearing":
it is small, it is deterministic across three repetitions, and it is enough to fail the
gate. This classification records the collective measurement, not a per-rule one — the
34 were measured as a set. A finer split would need 34 more five-minute runs and would
only matter if someone later wants to remove a subset; whoever does should re-measure
that subset rather than reading a per-rule verdict into this file.

## Three tests went with the rules

`EditorView.test.tsx` carried three `T045` cases that read `EditorView.module.css` as text
and asserted the five deleted declarations appeared in it. They were removed with their
subject, and the file records why in their place.

Removing a failing test to green a gate is forbidden here, so the distinction matters. These
did not assert behaviour — a string appeared in a stylesheet. Whether that is worth asserting
depends entirely on whether the declaration does anything, and the measurement above is that
it does not: the selectors match only under the parity harness, and the harness is green
without them. Their subject was measured dead first; the tests followed it. That is the same
disposition T173 applied to their siblings, which asserted `.parityOverlay` and `.parityPick`
rules no shipped selector could reach.

One of the three also held a negative guard (`not.toMatch(... margin-inline-start: 66.797px)`).
It is vacuous once the rule it guarded is gone.

## A deletion bug worth recording

The first attempt at the deletion removed both `:global(:root[data-theme='glass'])` rules —
real theme CSS, unrelated to parity. `just check` caught it at `tokens.test.ts`'s
`T157 keeps each family the structure FR-FT-053 names for it`, which is exactly the rule that
test exists to hold.

The cause is worth naming because it is a general shape: the script located each block by
walking back to the preceding blank line, and then consumed *every* trailing newline after
deleting. Iteration N therefore destroyed the delimiter iteration N+1 navigated by, and the
next pass walked past a healthy rule into the one before it. A loop that both reads a
delimiter and destroys it corrupts its own next step. The fix consumes exactly one newline.

## What this does not cover

- No per-rule attribution inside `EditorChrome`'s 34, for the reason above.
- The residual named here (`popup-antialiased-boundary`) is the only one that moved.
  Rules holding a residual that no case currently exercises would read as dead by this
  method; that is a limit of measuring against the manifest, and it is the same limit
  every classification in this phase was made under.
