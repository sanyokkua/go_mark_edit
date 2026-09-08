# Working in this repository

GoMarkEdit is one desktop binary: a Go process (Wails v2) serving a React application in a native
webview. Active, migrated Spec Kit work is governed by the matching feature directory under `specs/`.
The older `docs/delivery/` tree is reference-only for migrated work; do not silently change it to make
an active specification or gate pass.

## Read first

Read the active feature's `spec.md`, `plan.md`, `tasks.md`, applicable `contracts/`, and
`.specify/memory/constitution.md` before implementation. For legacy work that has not migrated, read
the assigned story and its `docs/delivery/architecture/README.md` first.

The story is self-contained by design. If you cannot tell what to build from it alone, that is a defect
in the story: say so rather than going hunting.

## Commands

| Verb | Command |
|---|---|
| bootstrap | `just setup` |
| format | `just fmt` |
| format-check | `just fmt-check` |
| typecheck | `just typecheck` |
| lint | `just lint` |
| test | `just test` |
| e2e-test | `just e2e-test` |
| archtest | `just archtest` |
| build | `just build` |
| package | `just package` — **not built yet; Phase 08 introduces it, and it exits non-zero until then** |
| baseline | `just baseline FEATURE-DIR-OR-ID` |
| verify | `just verify FEATURE-DIR-OR-ID` |
| everything | `just check` |

If a command is not listed by `just --list`, do not report it as having run. In particular, this
checkout currently has no `just spec-check` or `just story-check` recipe. Use the available targeted
checks and the Spec Kit analysis/convergence skills instead, and report unavailable gates honestly.

`just dev` runs the real bridge. `just dev-ui` runs the frontend against a mock — every Playwright run
uses that mock, which is a known divergence recorded in `docs/delivery/plan/KNOWN_ISSUES.md`.

## Spec Kit workflow

For active Spec Kit features, follow the first applicable step in this dependency-ordered flow:

`$speckit-specify` → `$speckit-clarify` → `$speckit-plan` → `$speckit-tasks` →
`$speckit-analyze` → `$speckit-implement` → `$speckit-converge` → review/release.

Use `$speckit-taskstoissues` only when the user asks to mirror the task list into GitHub issues. Use
the legacy `/plan-phase` → `/plan-story` → `/build-story` → `/finish-phase` → `/reconcile` flow only
for a feature that still lives exclusively under `docs/delivery/`.

Choose the next step from the actual artifact state, not from a completion label:

| Current state | Next action | Suggested prompt |
|---|---|---|
| Requirements are missing or ambiguous | `$speckit-clarify` | `Run $speckit-clarify for <feature>. Ask only the questions needed to remove the remaining ambiguity, preserve approved decisions, and update the active specification.` |
| The specification is ready but has no implementation plan | `$speckit-plan` | `Run $speckit-plan for <feature>. Produce a dependency-ordered vertical-slice plan from the active spec, constitution, and contracts; do not invent unresolved decisions.` |
| The plan is ready but tasks are missing or incomplete | `$speckit-tasks` | `Run $speckit-tasks for <feature>. Generate complete, traceable, dependency-ordered tasks with one owner and named evidence for every in-scope requirement.` |
| Tasks exist but have not all been implemented | `$speckit-implement` | `Run $speckit-implement for <feature>. Execute every remaining task in dependency order, verify each task, mark only genuinely completed tasks, and report any blocked requirement.` |
| Tasks are marked complete after implementation | `$speckit-converge` | `Run $speckit-converge for <feature>. Read the current spec, plan, tasks, constitution, and implementation as the sole intent; append only traceable remaining work, or report converged without changing tasks.` |
| Convergence appended tasks | `$speckit-implement` | `Run $speckit-implement for <feature> to execute the newly appended convergence tasks, then verify them against the current baseline.` |
| Convergence reports no remaining work | Review/release | `Review the converged feature against its evidence and release gates. Do not claim the whole product is complete unless every product slice and final gate is complete.` |

Every command handoff must name the next applicable flow step and provide a copy-paste prompt like the
ones above. The prompt must name the feature, preserve the current scope and dependencies, and state
whether the next command is read-only or allowed to edit artifacts/code.

Planning writes durable, reviewable artifacts under the active feature directory. It does not use plan
mode as a substitute for writing the plan to disk.

An active Spec Kit feature with unresolved questions or missing plan/task coverage is not buildable;
run the applicable planning skill before implementation. A legacy story marked `**STATUS:** stub — not
buildable.` is not buildable. `/build-story` refuses it, and the correct response is `/plan-story NNN`,
never filling the gap in place.

## Non-negotiable

- **Never weaken, delete or reinterpret a rule to make a check pass.** If a rule is wrong or
  impossible, stop and report.
- **Never suppress an architecture test**, never add a file to
  `frontend/scripts/archtest-allowlist.json`, and never edit `.golangci.yml`, an eslint config, the
  `justfile` or anything under `.github/` to make a gate pass.
- **Never edit anything under `docs/delivery/spec/` or `docs/delivery/architecture/`.** Those say what
  must be true. A needed change is reported and approved, not made. Everything else in `docs/` says what
  is true and is updated freely.
- **Never leave a placeholder, stub or no-op on a production path.**
- **Never touch a file outside the story's `Where the code goes`** without saying so.
- **Never bypass a commit hook with `--no-verify`.** The hook is the last thing standing between a
  broken gate and a green history. If it is wrong, fix the hook and say you did.
- **Never delete, skip or ignore a failing test to get a gate green.** A failing test is information.
  Removing it destroys the information and keeps the defect. That includes `t.Skip`, `.skip()`,
  `.only()` narrowing a suite, and commenting a case out.
- **Never build on a gate that did not run.** A gate that exits non-zero and produces no findings
  crashed — it did not pass. `just baseline` marks that `UNRELIABLE` and `just verify` refuses it.
  Fix the gate; do not record the anomaly and carry on.

## Five things about this codebase specifically

1. A Wails-bound handler returns an `apperr.*Result` value, takes no `context.Context`, uses a named
   result, and recovers panics in its first statement. All four are checked by `just archtest`.
2. The Go backend owns the application model. The Redux store is a projection: hydrate once, then apply
   `state:patch`. Every interaction is a command to Go.
3. Only `frontend/src/logic/adapter/` imports `wailsjs/`. Checked by `just archtest`.
4. Every colour is a token in `frontend/src/ui/styles/tokens.css`, keyed by `data-theme` × `data-mode`.
   There are six palettes; a literal is right in at most one. Checked by `just archtest`.
5. The app makes no background network call, ever. Migrations only add. SQLite is CGO-free. Several
   windows run at once with no lock.

The full set is the active feature's applicable architecture/constitution material. The planning and
task skills copy or map those rules into their artifacts; do not invent a second authority in a task.

## Communication

Never assume the reader will look up an identifier, an anchor, a story or a phase. When you refer to a
rule, restate its meaning in the same message.

Bad:

> How should `#preview-pauses-at-2mb` interact with the fallback in `#read-only-above-10mb`?

Good:

> Live preview stops updating for a document over 2 MB, and a document over 10 MB opens read-only with
> no editing at all. A 12 MB file hits both: it cannot be edited, so there is nothing for the preview to
> fall behind. Should it render once on open, or stay paused behind the Refresh button?
> I would render it once — the pause exists to keep typing smooth, and there is no typing.

Use plain words. Describe the actual screen, file or operation. One concrete example beats a paragraph
of abstraction. If you are asking because you do not know something factual, go and find out instead.

## Task handoff

After each implementation task, the agent MUST verify the task's named evidence before calling it
complete. In the completion message, it MUST state the task ID and actual result, identify the next
applicable Spec Kit flow step from the table above, and provide one exact suggested prompt for that
step. If the next step is blocked, name the missing artifact, failed gate, or user decision instead of
pretending the task or feature is finished. This handoff is required even when all current tasks are
complete, because `$speckit-converge` must determine whether the implementation truly matches the
specification before review or release.

## Definition of done

For active Spec Kit features, the Definition of Done is the feature's task list, named evidence, and
current repository gates. For legacy stories, it is generated from `docs/delivery/work/DOD_TEMPLATE.md`.
Every item runs a command and is compared against the baseline captured before the work started.

A finding that is in the baseline is not yours. A finding that is not, is.

`just archtest` is the exception: it is never diffed against a baseline. It must be green.

The baseline records each gate's **exit code and reliability verdict**, and keeps its raw output in the
active feature's evidence directory (or `docs/delivery/work/baselines/story-NNN.logs/` for legacy
stories). A gate marked `UNRELIABLE` exited non-zero having
parsed nothing, so it analysed nothing — every later diff against it compares empty with empty and
prints PASS. That is a hard stop before the story starts, not a caveat to transcribe.

## Live verification

**Per story, during implementation.** For every story that changes a visible surface or user
interaction, validate the running app in live mode after a material UI change and again before
claiming the story is done. Start the appropriate development server, open its local URL in the
available in-app browser, and use the actual controls. Confirm the visible state, root attributes or
other authoritative UI signal, and the affected layout at the relevant viewport. Treat a live finding
as a defect: fix it, reload the app, and repeat the live check. Automated unit, Playwright, and build
checks complement this step; they do not replace it.

**Per feature gate.** For active Spec Kit work, run the named current quality/specification checks,
inspect retained evidence, and walk the real `just build` binary — **not** only `wails dev`. For legacy
work, `/finish-phase` walks the phase's "Done when" paragraph on `just build`. The dev server serves
the mock bridge for anything Playwright touches, and it runs with a different log level, version string
and configuration folder. The two checks are not interchangeable: the dev-server check tells you the
interface behaves; only the real build tells you the application does. A story-level live check never
substitutes for the feature or phase gate.
