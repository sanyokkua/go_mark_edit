# Live testing reports

One file per run: `YYYY-MM-DD-live-testing-report.md`. A run does not have to cover the whole plan —
covering P0–P2 honestly is worth more than covering everything superficially.

## The shape

```markdown
# Live testing report — 2026-07-25

**Commit:** <sha> · **Build:** `just build`, darwin/arm64
**Plan version:** 1.0
**Environment:** macOS 15.2 · Ollama 0.5.4 (small=gemma2:2b, mid=llama3.1:8b) · LM Studio not running
**Sections run:** P0, P1, P2 · **Not run:** P3–P9 (not yet shipped)

## Result

| Section | Cases | Pass | Fail | Skipped |
| ------- | ----- | ---- | ---- | ------- |
| P0      | 8     | 7    | 1    | 0       |

## Findings

### F1 — Window geometry is lost on quit (CONFIRMED, high)

**Case:** P0-2
**Observed:** After resizing and quitting, the app reopens at the default size, every time.
**Cause:** The debounced geometry write is flushed after `db.Close()`, so it writes to a closed
database. `internal/application/application.go:210`.
**Fix:** <commit or "outstanding">
**Test:** `internal/application/shutdown_test.go:44`

### F2 — … (DECLINED, low)

**Observed:** …
**Ruling:** Not a defect — <who decided, and why>.

## Model behaviour

_Only when a section involving a provider was run. This is not pass/fail — see `../README.md`._

| Action | Model | Input | Output | Judgement |
| ------ | ----- | ----- | ------ | --------- |

## Plan gaps found

Anything the plan should have told you to check and did not. Fix the plan in the same change and bump
its version.
```

## The rules, restated because they are the point

- **A filed report is never edited.** Corrections go in the next one.
- **Every CONFIRMED finding gets an automated test**, cited by path. If it genuinely cannot be tested,
  say so and say why.
- **Skipping a case is a result.** Record it with the reason — "not reachable with the providers
  configured" is useful; a silent gap is not.
- **Re-verify against the current code, not against an older report.** A finding recorded three months
  ago may have been fixed, or may have been about behaviour that has since changed. The reference
  application this practice comes from had to add exactly this rule after a finding survived two
  releases as a documented bug that no longer existed.
- **A severity is a judgement, and the product owner may overrule one.** Record the ruling in the
  report rather than quietly downgrading the finding.
