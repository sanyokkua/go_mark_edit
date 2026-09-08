# Retrospective — Features 001–003, and what must change before Phase 06

**Measured at:** `544372de` (2026-08-19), branch `feature/v1-implementation`
**Written:** 2026-08-21
**Status:** analysis complete; remediation proposed, not yet executed

---

## 1. Scope and method

This document examines the three delivered Spec Kit features — `001-gomarkedit-product`,
`002-editor-stage-formatting`, `003-real-files-and-tabs` — and the 361 commits that produced them.
It asks four questions the owner raised: *what went wrong, is the architecture still sound, is the
work still tracked honestly, and can we proceed to the next phases?*

Every figure here was measured, not estimated. Each is followed by the command that produces it, so
any claim can be re-checked at a later commit. Nothing in this document is an assertion you have to
take on trust.

**Method:** static analysis of the repository at `544372de` plus git history since the merge base
with `master` (`85205ba7`, 2026-07-20). No test suite was executed for this document; where test
*results* are cited they come from committed evidence artifacts, and that is stated at the point of
use. The specific runtime defects the owner has observed were deliberately **not** hunted here — the
point of §7 is that the gates should find them, and doing it by hand again would prove the opposite
of what we want.

---

## 2. Where the project actually stands

Six of fourteen roadmap phases are delivered. Features 001–003 cover roadmap phases 00–05.

| | Phases | Phase-spec lines |
|---|---|---:|
| Delivered | 00–05 | 534 |
| Remaining | 06–13 | **691** |

```sh
wc -l docs/delivery/plan/phase-*.md
```

The remaining eight phases are collectively **larger** than the six delivered, and contain the two
hardest bodies of work in the project:

- **Phase 06** introduces the app's first security boundary — the HTML sanitiser, a fixed CSP, a
  local-image handler that must reject path traversal, and the first sanctioned network egress.
- **Phases 11–13** introduce the AI assistant: provider abstraction, an agentic tool-call loop, a
  token budget, and document rewriting.

This matters for the question "can we proceed". At the observed rate — 361 commits and 315,685
insertions over 31 days for six phases — the remaining eight larger phases would consume more than
everything spent so far. **The process, not the code, is what makes that untenable.**

---

## 3. The finding that reframes everything

The intuitive reading is "feature 003 went off the rails; tighten the planning." That reading is
wrong, and acting on it would make the next phase worse.

Requirement coverage inverts it:

| Feature | Tasks checked | Declared FRs | FRs with a resolvable proving test |
|---|---|---:|---:|
| 001 | 43 / 43 (100%) | 100 | **14** |
| 002 | 97 / 97 (100%) | 27 | **3** |
| 003 | 195 / 196 (99%) | 58 | **56** |

```sh
grep -c '^- \[[xX]\]' specs/003-real-files-and-tabs/tasks.md
grep -oE 'FR-[A-Z]*-?[0-9]+' specs/003-real-files-and-tabs/spec.md | sort -u | wc -l
grep -rhoE '// Proves: [A-Z-]+-[0-9]+' --include='*_test.go' --include='*.test.ts*' . | sort -u
```

**Feature 003 is the only feature that was actually verified.** Its own convergence phases say so:

> `## Phase 21: Convergence — the contracts that nothing enforces` — 42 tasks
> `## Phase 22: Coverage gaps opened by the Phase 21 CRITICAL block`
> `## Phase 20: Convergence — evidence that has fallen behind the code`

Phase 21 alone is larger than the entire original 39-task plan. 003 did not overrun because it was
planned badly. It overran because **it was the feature running when someone finally looked**, and it
paid — inside its own budget — the accumulated verification debt of everything before it.

### An important correction

001 and 002 are **not** untested. **122 of 123** `STORY-NNN-AC-N` anchors in the test tree resolve to
real acceptance criteria in `docs/delivery/work/`.

```sh
for a in $(grep -rhoE 'STORY-[0-9]+-AC-[0-9]+' --include='*_test.go' --include='*.test.ts*' . \
           | grep -v node_modules | sort -u); do
  grep -rqF "$a" docs/delivery/work/ && echo "resolves: $a"
done | wc -l
```

The tests exist and pass. What was lost is the **join between two requirement namespaces** — legacy
`STORY-*-AC-*` and Spec Kit `FR-*`. `docs/traceability.yaml` held that join. It was the
fourth-most-churned file in the project (40 commits) and was **deleted on 2026-07-25** in
`927d15fe` ("Changing the approach in the development"), with nothing replacing it.

Coverage did not disappear. It became **unmeasurable**. The Spec Kit migration was never finished,
and that single omission is why verification debt could accumulate invisibly for two features.

---

## 4. What went well

This section is not a courtesy. These are the things that must survive the remediation, and several
of them are better than is typical.

**The architecture invariant held under 361 commits.** ADR-0014 makes the Go backend the single
source of truth and Redux a projection. It is still true: `documentsSlice` and `uiSlice` declare
`reducers: {}` — no local mutation path exists at all; state arrives only via hydrate and
`state:patch`.

```sh
grep -n 'reducers' frontend/src/logic/store/{documentsSlice,uiSlice}.ts
```

**Zero placeholders on production paths.** No `TODO`, `FIXME`, `HACK` or `XXX` anywhere in Go or
frontend product code. The AGENTS.md non-negotiable was honoured literally.

**Test discipline is excellent — better than most production codebases.** Across 999 test blocks
there is exactly **one** skipped test, and it carries a stated host reason
(`internal/file/disk_version_test.go:117`, "host does not expose a portable file identity"). There
are **zero** `.only`, `xit`, `fit`, `test.fixme`, commented-out test blocks, or `eslint-disable`
directives in tests.

**Clean, honest history.** 361 commits, **0 merge commits, 0 reverts**, 81% Conventional Commits, one
author. Commit bodies record negative results plainly — *"proved nothing"*, *"the first injection
attempt was itself a false negative"*, *"an injection that does not land looks exactly like an
assertion that cannot fail"*. That is unusually good engineering writing, and it is why this
retrospective was possible at all.

**The investigation quality is high.** The problem with the 35 `docs(evidence)` commits is their
volume and timing — not their rigour. Each is a real finding, correctly reasoned.

**Knowledge capture is exceptional.** AGENTS.md's "What will bite you" is a working list of specific,
verified traps with reproduction detail. Most projects have nothing comparable.

**CI was repaired.** Since 2026-08-16 it triggers on pushes to `feature/**`, on pull requests and on
tags, runs all nine `just check` steps, and adds a second job running `just e2e-test`. It is a strict
superset of the local gate.

---

## 5. What went wrong

### 5.1 Planning accuracy collapsed, monotonically

| Feature | Planned tasks | Appended after planning | Appended % | Convergence phases |
|---|---:|---:|---:|---:|
| 001 | 36 | 7 | 16% | 4 |
| 002 | 42 | 55 | 57% | 15 |
| 003 | 39 | **157** | **80%** | 13 (+4 dated in-flight appends) |

This is not one bad feature. It is a worsening trend across three, and by 003 the plan predicted
**one task in five**. `plan.md` covers 39 of 196 tasks and documents its own drift in a
`## Plan currency` section admitting it "was written on 2026-08-07 and not touched again until
2026-08-14" while the spec accumulated 44 clarifications.

### 5.2 The plan churned harder than the code

- `specs/003-real-files-and-tabs/tasks.md` was modified in **192 of 361 commits (53%)** — 3.7× the
  most-churned source file (`App.tsx`, 52).
- `specs/` + `docs/` account for **1,620 file-touch events** — essentially equal to all of
  `frontend/` (1,663) and **3.45× all Go code** (469).
- **84 of 361 commits (23%) changed no code at all.**

```sh
git log master..HEAD --name-only --pretty=format: | sort | uniq -c | sort -rn | head -20
```

### 5.3 The work changed character on 2026-08-12

| Commit type | Before 08-12 (n=123) | On/after 08-12 (n=238) |
|---|---:|---:|
| `feat` | 33 | 21 |
| `fix` | 10 | **80** |
| `docs` | 1 | **70** |

Two-thirds of the branch's commits fall in the last eight active days, and they are predominantly
investigation. In the **last 30 commits, 2 are `feat` (6.7%)**; `docs` + `refactor` + `test` are 22
(73%). The two highest-frequency subject keywords across the whole branch are **`evidence` (60
commits)** and **`parity` (50)** — neither is a product feature.

Single tasks consumed extraordinary effort: **T173 spans 14 commits** with bodies labelled "Second
pass", "Third pass", "Fourth pass" and "T173 stays open"; **T191 spans 13 commits**, its last body
reading *"the fifth of five causes, each individually necessary and each producing an identical
symptom."*

### 5.4 The verification apparatus outgrew the product

| | Lines |
|---|---:|
| Product code (Go `internal/` + `main.go`; frontend `src/` excl. dev and tests) | **29,005** |
| Test and verification infrastructure | **59,903** |
| Spec and docs prose | **53,600** |

Product code is roughly **20% of the repository**. Specific consequences:

- `frontend/e2e/parity/` is a **6,304-line measuring apparatus**, of which **1,982 lines are tests of
  the apparatus itself** — the measuring instrument grew large enough to need its own test suite.
- The hand-written mock bridge (`AppModelHandler.ts`, **2,024 lines**) is the second-largest file in
  the frontend, nearly the size of the entire Go `appmodel` service it imitates.
- Feature 003's evidence tree holds **13,036 parity capture files**.

### 5.5 "Done" stopped carrying information

`tasks.md` reports **195 of 196 tasks checked and zero unchecked** — while the app has known scenario
defects, T173 "stays open", and **8 of 13 success criteria have no proving test**
(`SC-FT-002, -004, -005, -006, -007, -009, -010, -011`).

The `Proves:` anchoring mandate in AGENTS.md is honoured at **52.6% in Go and 27.9% in TypeScript**.

### 5.6 Tracking integrity degraded in four specific places

1. **`docs/traceability.yaml` deleted**, nothing replaced it (§3).
2. **`tasks.md` has two sections both numbered `## Phase 22`** (lines 1797 and 2128), separated by
   `## Phase 23`, with task ids emitted out of order (`T156 T157 T158 T159 T161 T160`;
   `… T194 T196 T195`).
3. **`roadmap.md` still marks phases 02–05 unfinished** while `specs/` says they shipped. The
   constitution's Principle I points authority at `docs/delivery/spec/`, which AGENTS.md now calls
   read-only reference — the governing document points at the wrong tree.
4. **Feature 003's committed baseline was captured on a dirty working tree** — `baseline.md` says
   "dirty — uncommitted changes are part of this baseline" — and HEAD is **22 commits ahead** of it.
   Principle VII's trustworthy-baseline requirement is violated by its own artifact. KNOWN_ISSUES
   items 9 and 15 are likewise stale, contradicted by the current CI configuration.

### 5.7 The ADR log went dormant exactly when decisions got hard

26 ADRs exist; the last is dated **2026-07-25**. **Zero were written during any of the three Spec Kit
features.** All 26 are marked `accepted` and none superseded — yet `spec.md` carries 9 `Superseded`
and 6 `Amended` markers, and a separate `decisions-phase-21.md` records twelve owner decisions.

The decision record fragmented into three places, none of them the ADR log. This is why
`decisions-phase-21.md` had to exist at all, and why a memory note was needed to stop a later session
re-asking questions the owner had already answered.

---

## 6. Why none of this was caught earlier

This is the most important section. The failures above were not caused by carelessness — they were
**invisible to every automated instrument the project had**. Nine distinct mechanisms produced a
green signal while measuring nothing.

**1. `just check` never ran the interface tests — and still doesn't.**
The gate is exactly `gen-check, frontend-build, fmt-check, lint, typecheck, frontend-test, go-vet,
archtest, go-test`. Its own comment in the justfile admits: *"A green `check` therefore says nothing
about interface behaviour."*

**2. `just e2e-test` died at collection for weeks.**
`playwright.config.ts` matched `e2e/**/*.test.ts`, which swallowed the seven Jest unit tests under
`e2e/parity/` that `jest.config.mjs` owns. Playwright with no filter died with
`ReferenceError: it is not defined` **before one browser case ran** — true from the T034 harness
commit until 2026-08-14. Running a single file always worked, which is why nobody noticed. *A runner
that never starts is indistinguishable, in a scrollback, from one nobody invoked.*

**3. Piping a gate hid its exit code.**
`just check | tail` returns `tail`'s status. A failed gate read green, and the `&&` after it still ran.

**4. Assertions measured the wrong property.**
`toContainText` and jsdom both pass on an element clipped to zero visible area. Three test layers
"verified" a read-only disclosure that could not be seen; it was only reachable by walking the real
binary.

**5. The test double deleted whole branches from the reachable space.**
The mock bridge implements **12 of 67** Wails runtime functions. Go computes `dirty` as a five-clause
expression (`internal/appmodel/document.go:76`); the mock has no equivalent of `detached`,
`failedWrite`, or the `ContentRevision > committedRevision` clause. Because `vite.config.ts` aliases
`wailsjs/*` to the mock for `npm run dev`, **every Playwright run and every CI interface job exercises
the mock, not the backend** — and there is no conformance test between them. A rule missing from a
double does not fail anything; its absence looks exactly like coverage.

**6. Two gates hid each other.**
Availability (`actionRegistry`/menu state) and command refusal (the handler) both block an action. A
test calling the handler directly went green with the control dead for every real user.

**7. Symbols proved arithmetic, not behaviour.**
Several exported symbols had no importer outside their own test file. Removing the real consumer
broke nothing, so nothing signalled that the contract had gone dark.

**8. `archtest` enforces 12 of 38 declared architecture rules.**
`docs/delivery/architecture/rules.md` declares 38 rules with anchors. Twelve are mechanically checked.
The other 26 — including `#store-is-a-projection`, `#tests-prove-behaviour`, `#one-document-seam` and
**`#rendered-html-is-sanitised`** — are advisory prose.

**9. The enforcement scripts named in KNOWN_ISSUES do not exist.**
`scripts/check_proves.py`, `scripts/check_story.py` and `scripts/upgrade_check.py` are cited as the
mechanism that enforces requirement anchoring. `find` returns nothing for all three. The `Proves:`
mandate has **never** been machine-checked, which is why 27.9% TypeScript anchoring went unnoticed.

### Coverage the gate stack does not reach

Two of these are genuine gaps; one commonly-cited item is **not**.

- **Not a gap.** `just vuln` (govulncheck) and `just sqlc-check` are defined but uncalled *on
  purpose*. Both the justfile and AGENTS.md state "Security gates (sqlc-check, vuln) join later."
  They are staged work, not oversight — the same category as `just package` exiting non-zero
  deliberately. Do not "fix" them.
- **A real gap.** `just go-test` runs `./internal/... .` — **not `./cmd/...`**. Combined with the
  `//go:build native_evidence` tag, `cmd/native-evidence`'s 13 test functions run in **neither**
  `just check` nor CI.
- **A real gap.** `scripts/baseline_verify_test.sh` — the test of the baseline machinery itself — is
  invoked by no recipe, hook or CI job. The machinery that decides whether a gate is trustworthy is
  itself unverified.

```sh
grep -n 'go-test:' -A2 justfile
grep -rn 'baseline_verify_test' justfile .github/workflows/ lefthook.yml
```

---

## 7. Root cause

**The constitution is not the problem.** It is unusually good, and Principle VII predicted this exact
failure in writing:

> *"A green aggregate label alone is never evidence of completion."*
> *"Mock-bridge browser tests MUST be complemented by numbered live cases for real files, processes,
> platforms, providers, and the built binary."*

Feature 003 **followed it faithfully**. That is precisely *why* there are 35 evidence commits, host
walkthroughs, and 13,036 capture files. The rigour was real and it was correctly directed.

Two things turned faithful compliance into overrun.

### 7.1 Principle VII mandates evidence with no budget and no stopping rule

It says what evidence must exist. It never says **how much is enough**, what a measurement costs, or
when to stop investigating and start deciding. Applied to a contract nobody had measured, that is
unbounded by construction.

The amplifier was the visual-parity contract: a **546-case, 1,638-comparison zero-pixel target,
committed to before anyone ran it once**. Its first full run scored **0 passed / 1,620 failed** and
cost **30.6 minutes**. Several residuals are provably unreachable by any production edit — Chromium
gradient dithering whose phase is set by layerisation, and antialiased popup boundaries that only
close when unrelated chrome converges. The contract silently committed the project to fixing the
browser.

**Unbounded rigour × an unachievable absolute = unbounded work.** The contract was eventually
withdrawn and retargeted on 2026-08-14 — nine `Superseded` markers in `spec.md` record it — but by
then it had shaped three convergence phases.

### 7.2 Verification debt compounds silently and is repaid in a lump

Nothing made the debt visible while it accrued, because the instrument that would have shown it —
`traceability.yaml` — had been deleted. So 001 and 002 shipped at 100% task completion with their
requirement coverage unmeasurable, and the entire bill arrived during 003, at the worst possible
moment, discovered one defect at a time by the owner's eye.

**The owner's eye became the project's primary instrument.** That is the slowest, least repeatable,
least scalable tool available, and it is what §8 exists to fix.

### 7.3 A structural accelerant: a blocking decision that blocked nothing

T075 sat marked *"decision required before implementation"* while implementation continued around it.
Work downstream accrued and had to be redone. **A label is not a dependency.** If a task blocks
others, it must block them in the task graph.

---

## 8. What must change before Phase 06

Ordered by leverage. **P0 items should land before Phase 06 opens.** Each is verified by re-running a
measurement, never by assertion.

### P0-1 · Finish the Spec Kit migration: restore the requirement join

The highest-leverage item, because it makes every other claim checkable. Write a **generated**
traceability report replacing the deleted `docs/traceability.yaml`:

- read FR/SC ids from every `specs/*/spec.md`;
- read `// Proves:` anchors from the Go and TypeScript test trees;
- resolve legacy `STORY-*-AC-*` anchors through `docs/delivery/work/`;
- emit per-feature coverage — proven / unproven / anchor-resolves-to-nothing.

Wire it into `just check`. This converts "unmeasurable" back into a number that moves.
**Done when:** the report runs in `just check` and prints a real unproven count for all three features.

### P0-2 · Build the anchor checker that was specified but never written

`check_proves.py` is named in KNOWN_ISSUES as the enforcement mechanism and does not exist. AGENTS.md
already states the rule it should enforce: *"An anchor asserting a claim the body does not make is
worse than no anchor — it converts a coverage gap into a false record of coverage."*
**Done when:** the gate fails against a deliberately broken anchor, then passes once fixed.

### P0-3 · Give Principle VII a budget

Amend `.specify/memory/constitution.md` (**v1.0.0 → v1.1.0**, MINOR — materially expanded guidance)
to add a stopping rule to Principle VII:

> Every measurable contract MUST state its **currently measured value before it is committed to**,
> its **run cost**, and what "enough" is. An acceptance criterion MUST NOT contain an absolute
> quantifier over a space nobody has measured. Investigation that exceeds its stated budget escalates
> as a decision rather than continuing.

Add the four screening questions, already earned the hard way, to the spec workflow and to AGENTS.md's
Definition of Done — ask them of every criterion **before** committing:

1. **Is there a source condition for it?** If the reference artifact cannot express the state being
   compared, no paired capture can exist.
2. **Can the code under test move it?** If the residual is set by the renderer, the task cannot close it.
3. **Does it contain an absolute quantifier over an unmeasured space?**
4. **Does it depend on a decision marked "required before implementation"?** Then it must *block its
   dependents in the task graph* — not merely carry a label.

Also correct **Principle I's authority pointer** to `specs/<feature>/`, with `docs/delivery/` named as
migrated reference, matching what AGENTS.md already says. Update the Sync Impact Report and amendment
date per the governance clause.

### P0-4 · Close the mock/real divergence structurally

The mock is 2,024 hand-written lines with no conformance test, and it is what Playwright *and CI*
exercise. Add a conformance test asserting the mock implements exactly the generated binding surface
(names and arity), and that it honours all five of Go's `dirty` conditions — three are currently
absent.
**Done when:** the test fails against a deliberately removed mock method, then passes.

### P0-5 · Mechanise `#rendered-html-is-sanitised` *before* Phase 06 needs it

Phase 06 introduces the sanitiser, the fixed CSP, the local-image handler with path-traversal
rejection, and the app's first sanctioned network egress. That rule is currently one of the 26 of 38
architecture rules `archtest` does not enforce. **Enforcing a security rule after the feature ships
repeats the 003 pattern exactly** — and this time the blind spot is a security boundary rather than a
pixel count.

### P0-6 · Cheap wins

- Extend `go-test` to `./cmd/...` so `cmd/native-evidence`'s 13 tests run somewhere.
- Wire `scripts/baseline_verify_test.sh` into a gate — the machinery that judges whether a gate is
  trustworthy is currently unverified itself.
- Re-capture a clean baseline at HEAD; the committed one is dirty and 22 commits stale.
- Leave `just vuln` and `just sqlc-check` alone — they are deliberately staged for a later phase.
- **Owner action:** set the branch-protection rule that makes the existing CI actually block a merge.
  `lefthook.yml` records that CI "still does not *block* a merge — that needs a branch protection
  rule, which is the repository owner's to set." This is the cheapest correctness win available.

### P1-1 · Reconcile the tracking artifacts

Fix the duplicate `## Phase 22`; bring `roadmap.md` into agreement with `specs/`; refresh the stale
KNOWN_ISSUES items 9 and 15; mark plainly which parts of `docs/delivery/` are live (`KNOWN_ISSUES.md`)
versus frozen reference (`spec/`, `architecture/`).

### P1-2 · Restart the ADR log

Require an ADR for any decision that changes a contract across features, and **supersede rather than
amend in place** — the rule `docs/delivery/adr/README.md` already states. The twelve decisions in
`decisions-phase-21.md` and the nine superseded spec clauses belong in that log.

### P1-3 · Cap the evidence tree

Define what is retained in-tree (reports, ledgers, decisions) versus reproducible on demand (the
13,036 raw captures), and gitignore the latter.

### P2-1 · Split `App.tsx`

2,179 lines, 19 `useState`, 37 `useCallback`, 52 commits — the highest-churn source file, and where
the availability/command double-gate defect hid. Not urgent for correctness; deferred until after P0.

---

## 9. What explicitly does not change

Naming these protects them from a well-intentioned overcorrection.

- **The architecture.** Backend authority, the Redux projection, the adapter boundary, CGO-free
  SQLite, no background network. All held under 361 commits. Do not restructure them.
- **The constitution's seven principles.** Only Principle VII gains a budget and Principle I gains a
  corrected pointer. The principles themselves were right.
- **The git protocol.** Parent branch, task sub-branches with `--`, one task one commit, never
  `--no-verify`, never force. It worked: zero reverts in 361 commits.
- **The ADR format.** It is good. It simply needs to be used again.
- **Test discipline.** One skipped test, zero `.only`, zero commented-out blocks. Keep that bar.
- **Evidence-before-completion itself.** The answer to unbounded rigour is a budget, **not** less
  rigour. Do not resolve this retrospective by lowering standards.

---

## 10. Answers to the four questions

**What went wrong?** Verification debt accumulated invisibly across features 001 and 002 because the
instrument that measures it was deleted, and the entire bill was paid inside feature 003 — where it
appeared as an 80% task overrun, 13 convergence phases and 84 zero-code commits.

**Is the architecture still sound?** **Yes.** The backend-authority invariant, the adapter boundary
and the token discipline all hold. The architecture is the healthiest part of this project. The
weakness is that only 12 of its 38 declared rules are mechanically enforced, so its continued
soundness is currently a matter of discipline rather than of gates.

**Is the work still tracked honestly?** **Partly.** Task-level tracking is meticulous and the commit
record is unusually truthful. But requirement-level tracking is broken: two namespaces with no join,
a duplicated phase number, a roadmap contradicting `specs/`, and a stale dirty baseline. A ticked box
currently means "a task was closed", not "a requirement is proven" — and nothing in the repository
makes that distinction visible.

**Can we proceed to the next phases?** **Not yet — but the gap is small and well-understood.** The
remaining eight phases are larger than the six delivered and open with a security boundary that
`archtest` does not currently enforce. The six P0 items above are days of work, not weeks, and they
convert the project's primary defect-finding instrument from the owner's eye back into the gate
stack. Starting Phase 06 before P0-1 and P0-5 land would repeat feature 003 — with a sanitiser and a
CSP in the blind spot instead of a pixel count.
