# Definition of Done — template

`/plan-story` renders this into each story. Do not hand-edit the rendered copy.

If you find yourself rewording an M-item for one story, the M-item is wrong — fix it here, where every
story gets the fix.

---

## Definition of done

### Baseline — captured at `<sha>`, `<date>` → `../baselines/story-<NNN>.md`

|                 | at baseline                                                              |
| --------------- | ------------------------------------------------------------------------ |
| tests           | `<N>` pass, `<M>` fail (`<names>`)                                       |
| static analysis | `<N>` findings · types clean · format clean · build ok · coverage `<X>%` |

Capture it with `just baseline STORY-<NNN>` **before writing any code**, and paste the two rows above
from what it printed. If the baseline is red in a way that would mask this story's work — a failing
test in the same area, an architecture gate that does not pass — stop and say so rather than starting.

### Mechanical — identical in every story

| #   | Check                    | Command                                                                               | Passes when                                                                                                                                                                                                                          |
| --- | ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | Format                   | `just fmt-check`                                                                      | exit 0                                                                                                                                                                                                                               |
| M2  | Types                    | `just typecheck`                                                                      | exit 0, or exactly the baseline error set                                                                                                                                                                                            |
| M3  | Static analysis          | `just lint`                                                                           | no finding absent from the baseline                                                                                                                                                                                                  |
| M4  | Tests                    | `just test`                                                                           | every baseline-passing test still passes; baseline failures unchanged; all new tests pass                                                                                                                                            |
| M5  | Architecture             | `just archtest`                                                                       | **exit 0.** Never diffed, never weakened, never suppressed                                                                                                                                                                           |
| M6  | Build                    | `just frontend-build` and `just build`                                                | exit 0                                                                                                                                                                                                                               |
| M7  | New code is tested       | manual, against the diff                                                              | every added or changed source file is touched by at least one test                                                                                                                                                                   |
| M8  | No placeholders added    | `git diff <sha>..HEAD`                                                                | the diff introduces no unfinished marker, no `TODO`, no no-op return standing in for logic                                                                                                                                           |
| M9  | Gate configs untouched   | `git diff --name-only <sha>..HEAD`                                                    | no change to `.golangci.yml`, `frontend/eslint.config.js`, `frontend/eslint.architecture.config.js`, `frontend/scripts/archtest-allowlist.json`, `justfile`, `.github/`, `lefthook.yml` — or the change is named and justified below |
| M10 | Normative docs untouched | `git diff --name-only <sha>..HEAD -- docs/delivery/spec/ docs/delivery/architecture/` | empty. A needed change is a reconcile item, not a commit                                                                                                                                                                             |
| M11 | Descriptive docs current | manual                                                                                | anything outside `docs/delivery/` that this story made stale is fixed, or explicitly none                                                                                                                                            |

`just verify STORY-<NNN>` runs M1–M6, M9 and M10 and prints them as a pass/fail table against the
baseline, naming the specific new finding or newly-failing test. M7, M8 and M11 are yours.

**M5 is not diffed** because architecture tests are the only mechanical thing standing between an
implementer and a design decision nobody approved. Adding a file to
`frontend/scripts/archtest-allowlist.json` is weakening the gate and is an M9 failure, not a fix.

**M9 exists** because the most convenient response to a failing gate is to loosen the gate.

### Add an M-item when the work genuinely needs one

- a story that adds a migration: _the migration applies against a copy of a real database, and a second
  instance of the app can still read it_
- a story that adds a surface: _the surface is checked in three themes across light and dark at 375,
  768 and 1280 px, and `just verify-ui` covers it_
- a story that adds a long operation: _starting it while another holds the gate is refused immediately,
  and cancelling it releases the gate_
- a release story: _the packaged artifact launches and completes one journey end to end_

Everything else is verbatim.

### This story — generated from the rules above

| Rule                    | Proven by                | Kind             |
| ----------------------- | ------------------------ | ---------------- |
| `<feature>#<anchor>`    | `<TestName>` in `<path>` | unit             |
| `architecture#<anchor>` | `<TestName>` in `<path>` | architecture     |
| all, end to end         | `<TestName>` in `<path>` | component or e2e |

Each test's first line carries `// Proves: <feature>#<anchor>` — for example
`// Proves: opening-and-saving-files#crlf-is-preserved`. It is a convention for a human reading a
failure. Nothing generates from it and nothing validates it.

### Walkthrough — a person does this on a real build

1. `<step, with the exact thing to type or click>`
2. `<what should appear, in the words the user would read>`
3. `<a negative assertion — something that must not happen>`
4. `<the boundary case, at the value, not near it>`

### Unblocks

`<what the next story needs from this one, and whether its plan still holds>`
