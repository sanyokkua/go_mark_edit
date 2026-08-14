# GoMarkEdit — how to work here

## Where this stands

GoMarkEdit is one desktop binary: a Go process (Wails v2) serving a React application in a
native webview, for editing Markdown documents locally.

**Stack.** Go backend + Wails v2 bridge, React/TypeScript frontend, CGO-free SQLite persistence.

**State.** The active, migrated Spec Kit feature is tracked in `.specify/feature.json` →
`specs/<feature>/`. The older `docs/delivery/` tree is reference-only for already-migrated work;
never silently change it to make an active spec or gate pass.

**The spec is the authority.** The active feature's `spec.md`/`plan.md`/`tasks.md` under
`specs/<feature>/` (or, for a legacy story, the story file plus
`docs/delivery/architecture/README.md`). Never invent behaviour. If the spec is silent on
something you must decide, stop and ask with a recommended default.

## The loop

Six phases. No feature code before PLAN is complete.

| Phase | Exit condition | Command |
|---|---|---|
| ORIENT | Active feature and state read from `.specify/feature.json` and its artifacts | read `specs/<feature>/` |
| SPEC | Spec is unambiguous, with acceptance criteria and edge cases | `/speckit-specify` → `/speckit-clarify` |
| PLAN | Dependency-ordered task list exists; one task = one branch = one commit | `/speckit-plan` → `/speckit-tasks` |
| BUILD | Each task implemented and individually verified | `/speckit-implement` |
| VERIFY | Gate is green **and** the implementation matches the spec | `/speckit-analyze` → `/speckit-converge` → `just check` |
| CLOSE | Converged, docs updated, branches merged, next unit named | review/release |

A feature that still lives exclusively under `docs/delivery/` uses `/plan-phase` → `/plan-story` →
`/build-story` → `/finish-phase` → `/reconcile` instead. Use `/speckit-taskstoissues` only when
asked to mirror tasks into GitHub issues.

**Advance without asking**, except to: resolve a spec that is ambiguous or silent (ask, with a
recommended default); report a gate that has gone red twice for the same cause; raise a decision
that is architecturally significant and costly to reverse; do anything irreversible or outside
the repo (merge to `master`, tag, publish); or report new information that contradicts the
approved spec — never resolve that silently in code.

Choose the next step from the actual artifact state, not a completion label. A legacy story
marked `**STATUS:** stub — not buildable.` routes to `/plan-story NNN`, never a fill-in-place;
`/build-story` refuses a stub outright.

## Definition of Done

**Gate:** `just check` — the local mirror of the CI gate set (security gates join later).

A unit of work is done when the gate is green **and** the implementation matches the spec. Both.
Tests passing against the wrong behaviour is not done.

- **Baseline first.** `just baseline FEATURE-DIR-OR-ID` captures every gate's exit code before a
  story starts. A finding in the baseline is not yours. A finding that is not, is.
- **A gate that exits non-zero having parsed nothing crashed — it did not pass.** `just baseline`
  marks it `UNRELIABLE`; `just verify FEATURE-DIR-OR-ID` refuses to build on it. STORY-058 shipped
  against exactly this: `just lint` exit 5, zero findings, recorded as a pass. Fix the gate first.
- `just archtest` is never diffed against a baseline — it must be green outright.
- Run the full gate, not module scope, whenever a change can open a dialog, block a thread, touch
  startup/the composition root, or alter a public interface.

Closing checklist — evidence, not assertion:

- [ ] Every acceptance criterion met, each named with the evidence that proves it
- [ ] Every task checked off
- [ ] `just check` (or `just verify`) green and diffed against baseline; no new findings
- [ ] Docs updated for anything that changed the public surface
- [ ] Next step stated

## Git protocol

```
master                          protected. Never developed on, never committed to.
  └── feature/<slug>            parent branch, one per unit of work
        └── feature/<slug>--<task>   task branch, one per plan task
```

1. On `master`, create `feature/<slug>` — or use an existing suitable feature branch (e.g. the
   current `feature/v1-implementation`); do not stack another parent on top of it.
2. Before touching a file, branch a task sub-branch off the parent.
3. **The separator is `--`, not `/`.** `feature/x` and `feature/x/y` cannot both exist as git refs.
4. Commit only on task branches. One task, one commit, Conventional Commits.
5. Task done: run the gate → squash-merge into the parent → delete the task branch.
6. **Never merge the parent into `master`.** Final review and merge belong to the user.
7. Never `--no-verify`, never `--force`. If a hook is wrong, fix the hook and say you did.

## Delegation

You are the orchestrator. The main session holds the plan and the decisions — not file dumps,
search output, or test logs. Anything shaped like "read N files and come back with a conclusion"
goes to a subagent whose context is discarded on return.

| Work | Delegate to |
|---|---|
| Which Spec Kit step runs next | the loop's binding table above — don't duplicate it here |
| Broad search across many files | `Explore` |
| Implementing one independent task group | a coder subagent |
| Writing the covering tests | a tester subagent |
| Diagnosing a red gate | a debugger subagent |
| Independent conformance check before converge/close | a reviewer subagent |

Brief every subagent with objective, output format, where to look, and what not to touch — it
inherits nothing from this conversation. **The built-in Explore and Plan agents never receive
`CLAUDE.md`**; any rule they must respect goes in the prompt you hand them. Ask for a summary, not
a transcript. Eight or fewer per batch.

**Never delegated:** the decision about what the next step is, and the judgment about whether the
work satisfies the spec.

## Non-negotiables

| Rule | Enforced by |
|---|---|
| Never bypass a commit hook with `--no-verify` | `lefthook.yml` pre-push |
| Never build on a gate that did not run | `scripts/baseline.sh` marks it `UNRELIABLE`; `scripts/verify.sh` refuses it |
| Never weaken, delete or reinterpret a rule to make a check pass | — (advisory) |
| Never suppress an architecture test, add a file to `frontend/scripts/archtest-allowlist.json`, or edit `.golangci.yml`, an eslint config, `justfile` or `.github/` to make a gate pass | — (advisory) |
| Never edit anything under `docs/delivery/spec/` or `docs/delivery/architecture/` | — (advisory) |
| Never leave a placeholder, stub or no-op on a production path | — (advisory) |
| Never touch a file outside the story's `Where the code goes` without saying so | — (advisory) |
| Never delete, skip or ignore a failing test to get a gate green — includes `t.Skip`, `.skip()`, `.only()` narrowing, and commenting a case out | — (advisory) |

## End every turn with Next step

**Every turn that advances the work ends with this block.** Not after a research answer, not
after a partial run, not after a failure — required even when every current task is complete,
because `/speckit-converge` must still determine whether the implementation matches the spec.

```markdown
## Next step

**State:** <where the work actually is, citing verified evidence>
**Command:** `<exact command>`  — or "none — decision needed from you"
**Prompt:**
> <complete, copy-pasteable: names the feature/task, the artifacts to read first, and whether the
>  next command is read-only or allowed to edit artifacts/code>
```

- **Be honest.** Verify a task's named evidence before calling it complete; "all tasks written" is
  not "all tasks verified."
- **If blocked,** name the missing artifact, failed gate, or user decision — don't call it done.
- **Self-contained.** Must work in a fresh session with no memory of this one.

## What will bite you

- **A Wails-bound handler that doesn't match shape breaks in `just archtest`, not at review time.**
  It must return an `apperr.*Result`, take no `context.Context`, use a named result, and recover
  panics in its first statement. All four are mechanically checked.
- **The Redux store is a projection, not a source of truth.** The Go backend owns the application
  model; the store hydrates once, then applies `state:patch`. Every interaction is a command to
  Go — writing to Redux state directly drifts silently from the backend.
- **Only `frontend/src/logic/adapter/` may import `wailsjs/`.** Importing it elsewhere fails
  `just archtest`, not the TypeScript build.
- **Every colour is a token in `frontend/src/ui/styles/tokens.css`.** Six palettes
  (`data-theme` × `data-mode`); a literal colour is right in at most one and `just archtest`
  catches stray literals.
- **The app makes no background network call, ever.** Migrations only add, never rewrite; SQLite
  is CGO-free; several windows can run at once with no lock.
- **`just dev` and `just dev-ui` are not the same build.** `just dev-ui` serves the frontend
  against a mock bridge, and every Playwright run uses that mock — a known divergence
  (`docs/delivery/plan/KNOWN_ISSUES.md`). A live check against `dev-ui` never substitutes for
  walking the real `just build` binary before calling a story done.
- **`just check` never runs Playwright.** It is exactly `gen-check, frontend-build, fmt-check,
  lint, typecheck, frontend-test, go-vet, archtest, go-test` (`justfile:145`); the e2e suites run
  only under `just e2e-test` / `just verify-ui`, and `just baseline` does not capture them either.
  A green `just check` says nothing about interface behaviour. On 2026-08-13 it was green while
  `real-files-and-tabs.test.ts` was 2 failed / 6 passed — a dead Settings toggle and a test still
  describing a superseded File menu. Run `just e2e-test` explicitly, and diff it, before calling
  any interface work done.
- **Two test runners can claim the same files, and the loser dies at collection.** `just e2e-test`
  could not run *at all* from T034 until 2026-08-14: `playwright.config.ts` matched
  `e2e/**/*.test.ts`, which swallowed the seven Jest unit tests under `e2e/parity/` that
  `jest.config.js` explicitly owns, and `playwright test` with no arguments died with
  `ReferenceError: it is not defined` before one browser case ran. Running a single file
  (`npx playwright test e2e/window-shell.test.ts`) always worked, which is why nobody noticed.
  The config now matches `e2e/*.test.ts` — top level only, one owner per file. **When you add a
  test under `e2e/`, check which runner claims it.**
- **`.application-frame` is the application window; `window.innerHeight` is not.** Popups portal
  into that frame so they share its containing block, and the parity harness draws the frame inset
  inside a taller page. Clamping a popup against the browser viewport therefore fires at the 720px
  parity height — where the frame is only 619px — creating a scroll container that costs ~332
  antialiasing pixels against the immutable reference. Measure the frame. (The same portalling
  means a control that has relocated into the toolbar overflow at ≤768px is **outside** the
  `toolbar` element: `toolbar.getByRole('button', {name: 'Image'})` finds nothing, and
  `[data-viewport-popup="editor-overflow"]` is where it lives.)
- **Fixing a stale assertion reveals the next one.** Playwright stops a case at its first failure,
  so a failing-case count understates the work by construction. On 2026-08-14 the Settings-popup
  viewport assertion hid a stale portal-target assertion; a status-row arrangement assertion hid a
  divider-bounds assertion; and every repaired assertion in the shell matrix hid its screenshot
  comparison. Budget for the second layer.
- **Availability comes from the action registry, never from whether a handler happens to be
  wired.** `SettingsMenu` computed it as `onMarkdownSettingsChange === undefined` and shipped
  `Format on save` and `Lint on save` enabled while `actionRegistry.ts` marked both
  `laterDeferred`. Read `getAction(id).availability.kind`.
- **A pixel difference with no style or bounds difference is usually layerisation, not drift.**
  The comparator's compared-property list is `METRIC_PROPERTIES` in
  `frontend/e2e/targeted-parity.test.ts` (~line 84): `flex` and `max-width` are not compared,
  `min-width` is — and `min-width: auto` computes to `auto` only for a flex item, so a plain block
  wrapper makes a child compute `0px` and reads as drift. Separately, making an element a scroll
  container costs ~332 deterministic pixels confined to glyphs, because Chromium composites
  scrollable areas and drops LCD subpixel antialiasing. Check determinism and composited-layer
  ancestry before chasing a style fix that does not exist.
- **The parity reference server is reused across runs, so it serves a stale adaptation.**
  `frontend/playwright.config.ts` sets `reuseExistingServer: !process.env.CI` for the server on
  port 4174. A server started before you edit `frontend/e2e/parity/reference-adapter.ts` keeps
  serving the **old** HTML for the rest of the session, and the measurement fails in the direction
  that looks like production drift — the Settings popup reported 2,554 pixels instead of 709 until
  the port-4174 process was killed. Kill it after every adapter change.
- **`git add -A` can silently regress `frontend/wailsjs/**` to mode 644**, especially after a
  `git stash` cycle, which fails `just gen-check` on the mode bit alone with zero content
  difference. Check `git ls-files -s frontend/wailsjs/runtime/` before committing anything that
  used `add -A`.
- **`just package` exits non-zero on purpose** until Phase 08 introduces it — don't report that
  as broken.
- **Everything under `frontend/wailsjs/` is committed executable (`100755`), because that is the
  only mode the generator writes.** Wails writes every generated file through
  `MustWriteString`, which hardcodes `0o755` (`internal/fs/fs.go:161`) with no platform branch.
  "Tidying" those files back to `644` does not survive the next `wails generate module`, and it
  breaks `just gen-check` for everyone afterwards — `git diff --exit-code` fails on the mode bit
  alone, with zero content difference, which reads as generated-code drift when nothing drifted.
  Three of the ten files were stored at `644` and did exactly that.
- **Never assume the reader knows what an identifier means.** Restate a rule, anchor, or story ID
  in the same message with one concrete example — go find the fact rather than asking about it.
- **`.claude/skills/speckit-*` and `.agents/skills/speckit-*` look like duplicate mirrors — they
  are not.** spec-kit deliberately generates different bytes per agent: Claude gets `/speckit-x`
  slash-command phrasing plus Claude-only frontmatter, Codex gets its native `$speckit-x`
  chat-mention form. Re-unifying them (e.g. by symlinking one to the other) silently breaks
  Codex's invocation. `specify integration status --json` is authoritative on whether they still
  match what spec-kit installed.

## Where things live

- Active feature (authority): `specs/<feature>/`, named by `.specify/feature.json`
- Constitution: `.specify/memory/constitution.md`
- Legacy reference-only work: `docs/delivery/` — never edit `spec/` or `architecture/` under it
- Legacy Definition of Done template: `docs/delivery/work/DOD_TEMPLATE.md`
- `.agents/commands` is canonical; `.claude/commands` mirrors it. For skills, only the 5 legacy
  ones (`build-story`, `finish-phase`, `plan-phase`, `plan-story`, `reconcile`) work this way —
  `.agents/skills/<name>` canonical, `.claude/skills/<name>` a symlink to it. The 10 `speckit-*`
  skills are **not** mirrored: `.claude/skills/speckit-*/SKILL.md` and
  `.agents/skills/speckit-*/SKILL.md` are independent files, each owned and regenerated by the
  `specify` CLI (spec-kit) per `.specify/integrations/{claude,codex}.manifest.json` — never
  hand-edit the legacy symlinked side outside `sync-agent-files.py --apply`, and never let that
  tool (or any "unify the mirrors" pass) touch the `speckit-*` pair.
