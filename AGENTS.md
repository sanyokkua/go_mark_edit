# Working in this repository

GoMarkEdit is one desktop binary: a Go process (Wails v2) serving a React application in a native
webview. Everything normative lives under `docs/delivery/`.

## Read first

`docs/delivery/architecture/README.md` — one page — then the story you were given.

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
| baseline | `just baseline STORY-NNN` |
| verify | `just verify STORY-NNN` |
| everything | `just check` |
| check one story | `just story-check NNN` — copy fidelity, glob match, anchors, rule count |
| check the spec tree | `just spec-check` — writing rules, revision level, every `Proves:` tag |

`just spec-check` and `just story-check` are deliberately not part of `just check`. Documentation
drift is worth knowing about; it is not a reason to block a commit that changes code.

`just dev` runs the real bridge. `just dev-ui` runs the frontend against a mock — every Playwright run
uses that mock, which is a known divergence recorded in `docs/delivery/plan/KNOWN_ISSUES.md`.

## Workflow

`/plan-phase NN` → `/plan-story NNN` → `/build-story NNN` → `/finish-phase NN` → `/reconcile NN`.

The manual is `docs/delivery/WORKFLOW.md`: which command when, what each leaves on disk, what to do
with it, and what to do when it goes wrong. Every command also ends by naming the next one.

Planning writes a file to `docs/delivery/work/`. It does not use plan mode: a permission state
evaporates, and a file on disk is durable, reviewable and resumable.

A story marked `**STATUS:** stub — not buildable.` is not buildable. `/build-story` refuses it, and
the correct response to that refusal is `/plan-story NNN`, never filling the gap in place.

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

The full set is `docs/delivery/architecture/rules.md`, and `/plan-story` copies the ones that match
your paths into the story so you do not have to look.

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

## Definition of done

Generated per story from `docs/delivery/work/DOD_TEMPLATE.md`. Every item runs a command and is compared
against the baseline captured before the work started.

A finding that is in the baseline is not yours. A finding that is not, is.

`just archtest` is the exception: it is never diffed against a baseline. It must be green.

The baseline records each gate's **exit code and reliability verdict**, and keeps its raw output in
`docs/delivery/work/baselines/story-NNN.logs/`. A gate marked `UNRELIABLE` exited non-zero having
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

**Per phase, at the gate.** `/finish-phase` walks the phase's "Done when" paragraph on `just build`
output — the real binary, **not** `wails dev`. The dev server serves the mock bridge for anything
Playwright touches, and it runs with a different log level, version string and configuration folder.
The two checks are not interchangeable: the dev-server check tells you the interface behaves; only the
real build tells you the application does. A story-level live check never substitutes for the phase
gate.
