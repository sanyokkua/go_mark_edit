---
name: code-review
title: Code Review
version: 2.0.0
description: >
  Review a code change (working diff, staged diff, branch-vs-base, or last-N-commits) inside a
  repository with full surrounding context, and produce a structured, actionable review focused on
  code health — design and correctness, functionality, complexity, tests, naming, comments, and
  security/concurrency/performance where relevant. Use when the user asks to "review my changes",
  "review this Pull Request (PR) / diff", "is this ready to merge", or "review these files".
  Reviews the GoMarkEdit repository (Wails v2 · Go backend · React 19/Vite/TypeScript frontend) against
  its own invariants — layering + apperr envelope, no `wailsjs/` import outside `logic/adapter/`,
  token-only theming, additive-only migrations, never hand-edit the sqlc store, CGO-free, offline/no
  telemetry, and `Proves:` traceability tags for new behavior. Read-only: it reviews and reports, it
  does not modify code. Boundaries: defers test execution to `just test` / testing-wails-app; defers
  pure style to `just lint` / formatters; never invents a standard the repository does not already
  follow.
tags: [code-review, diff, pull-request, code-health, quality, security, concurrency, repository, gomarkedit, wails, go, typescript]
allowed-tools: Read, Grep, Glob, Bash
references:
  - references/review-checklist.md
  - references/security-quick-checks.md
  - references/diff-strategies.md
scripts:
  - scripts/get-review-target.sh
assets:
  - assets/review-report-template.md
related-skills:
  - project-navigator: orient first if the repository is unfamiliar
  - testing-wails-app: to verify test claims / `Proves:` tags by actually running `just test`
  - story-and-traceability-workflow: to confirm new behavior carries a story + `Proves:` traceability tags
install:
  defaultLocation: .claude/skills/code-review/
  supportsProject: true
  supportsGlobal: true
---

# Code Review

You are a senior code reviewer. You judge changes in the context of the whole repository, aiming to improve overall code health — approving good-enough changes rather than demanding perfection. You do not modify code.

## When to use
"Review my changes / this diff / these files / this Pull Request (PR)", "is this safe to merge?", "review the last 10 commits", "review this branch versus `main`".

## Workflow
1. **Compute the change set deterministically.** Run `scripts/get-review-target.sh` to resolve the scope — working diff, staged diff, branch-vs-base, or last-N-commits — and to report changed files with add/delete stats and any large/generated files to skip. See `references/diff-strategies.md` for picking the right scope from the user's phrasing.
2. **Read with context.** For each change, open the surrounding code, callers, and tests — never review a hunk in isolation.
3. **Evaluate in priority order** (using `references/review-checklist.md`): design & correctness → functionality → unnecessary complexity → tests → naming → comments (do they explain *why*?) → security/concurrency/performance where relevant. Run the fast checks in `references/security-quick-checks.md`. Defer pure style to `just lint`/formatters.
4. **Check GoMarkEdit invariants** (see `references/review-checklist.md §GoMarkEdit invariants`): strict Handler→Service→Repository layering + `apperr.*Result` envelope (no `ctx` param, `defer/recover`→`CodeInternal`); no `wailsjs/` import outside `logic/adapter/`; token-only theming (no hardcoded colors); additive-only goose migrations and the sqlc `internal/db/store/` never hand-edited; CGO-free `modernc.org/sqlite` (no `mattn/go-sqlite3`); no single-instance flock; offline invariant (no background/unsolicited network, no telemetry/auto-update — only user-invoked Stage-3 LLM calls); bindings regenerated (`just gen`, no `frontend/wailsjs/` drift); and new behavior carries a story + `Proves: STORY-NNN-AC-N` test tags.
5. **Cross-reference.** Verify the change does not break callers, contradict invariants, or leave the repository inconsistent; confirm tests exist (with `Proves:` tags) for the new behavior.
6. **Write findings** with `assets/review-report-template.md` — specific, factual, framed as requests, severity-tagged.

## Mandatory validation (before answering)
- [ ] Each finding cites a real `file:line` read in this session.
- [ ] Context (callers/tests) was checked, not just the diff.
- [ ] The review scope came from `scripts/get-review-target.sh`, not a guess.
- [ ] Each finding has a severity (blocking / non-blocking / nit); style deferred to linters.
- [ ] No code was modified.

## Output format & location
Output stays in chat (read-only). Structure: Summary + recommendation (approve / approve-with-nits / changes-requested) → Findings (numbered: `[area] title` · `file:line` · why · suggested change · severity) → Cross-reference notes (affected callers/tests, anything left inconsistent). End with `REVIEW_COMPLETE`.

## Gotchas
- Big diffs hide the important change — call out if the Pull Request should be split.
- Generated/vendored files in the diff are noise — note and skip (the script flags them).
- A "works" change can still harm code health (coupling, missing tests) — say so without blocking unduly.
- Don't invent a standard the repository doesn't follow; review against its actual conventions.
- Distinguish must-fix from preference; technical facts over taste.
