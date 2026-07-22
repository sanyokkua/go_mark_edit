---
name: plan-user-story-implementation
description: >-
  Plan the complete implementation, testing, traceability, and definition-of-done work for exactly one
  ready GoMarkEdit story before code changes begin. Use when the user asks to plan a story or invokes the
  former /plan-user-story-implementation workflow.
---

# Plan User Story Implementation

This is the Codex-native equivalent of Claude's `/plan-user-story-implementation` command. It is
strictly read-only. Produce a review-ready implementation and test plan for one story, then obtain
explicit user approval before changing code, tests, bindings, stories, or traceability.

## Canonical workflow

Read [the preserved Claude command](../../../.claude/commands/plan-user-story-implementation.md) in
full before investigating the target story. Its required inputs, grounding checks, five-step workflow,
implementation constraints, test/traceability requirements, guardrails, and required plan output are
binding. The Claude file remains the shared canonical workflow so the two agent systems do not drift.

## Codex translations

Apply these substitutions while following the canonical workflow:

| Claude command term | Codex equivalent |
|---|---|
| `CLAUDE.md` | `AGENTS.md` |
| `.claude/rules/*` | `.claude/rules/*` — the shared rule source for both systems |
| `.claude/skills/*` | `.agents/skills/*` |
| `Task` / `investigator` subagent | the `investigator` custom agent in `.codex/agents/investigator.toml` |
| `TodoWrite` | `update_plan` |
| `ExitPlanMode` | Present the complete plan in the final response and explicitly request user approval. Stop after that request. |

Codex does not treat this as a slash command. Invoke this skill whenever the request matches its
description. After approval, hand implementation of exactly one story to the `coder` custom agent, then
the AC tests to `tester`, and finish with `spec-conformance-reviewer`. Once the story is eligible for
`done`, scan its direct `depends_on` consumers: promote only `draft` dependents whose complete dependency
set is `done` and whose ready-state validation passes; update the stories board, run `just trace`, and
require `just trace-check` before reporting the lifecycle result.

## Non-negotiable checks

- Resolve the target story and confirm it is `ready`; every dependency must be `done`; every
  `phase_requirements` id and AC `Satisfies:` mapping must resolve.
- Keep `specification/` frozen and read-only. Surface ambiguity rather than inferring behaviour.
- Read every cited specification clause, decision, ADR, matching shared rule, and applicable Codex skill
  before planning a change.
- Delegate the required read-only repository and prior-work map to `investigator`.
- Preserve the Handler → Service → Repository, result-envelope, two-phase DI, backend-authoritative
  model, adapter-only Wails import, token-only theming, offline, and forward-compatibility constraints.
- Inspect every reader, writer, lifecycle boundary, sibling consumer, and competing async path. Express
  stateful ACs as ordered event sequences and require the canonical adversarial tests and final
  user-visible postconditions.
- Map every acceptance criterion and edge case to an exact proving test, `Proves:` tag, traceability
  result, and durable runtime/human evidence where required. Accept only S/M implementation stories;
  reject stories larger than M. Do not plan
  unapproved scope or a second story.
