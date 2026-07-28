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

`just dev` runs the real bridge. `just dev-ui` runs the frontend against a mock — every Playwright run
uses that mock, which is a known divergence recorded in `docs/delivery/plan/KNOWN_ISSUES.md`.

## Workflow

`/plan-phase NN` → `/plan-story NNN` → `/build-story NNN` → `/finish-phase NN` → `/reconcile NN`.

Planning writes a file to `docs/delivery/work/`. It does not use plan mode: a permission state
evaporates, and a file on disk is durable, reviewable and resumable.

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

## Live verification

For every story that changes a visible surface or user interaction, validate the running app in live
mode during implementation after a material UI change and again before claiming the story is done.
Start the appropriate development server, open its local URL in the available in-app browser, and use
the actual controls. Confirm the visible state, root attributes or other authoritative UI signal, and
the affected layout at the relevant viewport. Treat a live finding as a defect: fix it, reload the app,
and repeat the live check. Automated unit, Playwright, and build checks complement this step; they do
not replace it.
