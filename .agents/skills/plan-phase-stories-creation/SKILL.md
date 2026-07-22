---
name: plan-phase-stories-creation
description: >-
  Plan the complete, current-codebase-informed story set for a GoMarkEdit phase before creating any
  story files. Use when the user asks to plan a phase, create phase stories, or invokes the former
  /plan-phase-stories-creation workflow.
---

# Plan Phase Story Creation

This is the Codex-native equivalent of Claude's `/plan-phase-stories-creation` command. It is strictly
read-only. Produce a review-ready story-creation plan and obtain explicit user approval before creating
stories, ADRs, traceability output, or implementation files.

## Canonical workflow

Read [the preserved Claude command](../../../.claude/commands/plan-phase-stories-creation.md) in full
before doing any phase analysis. Its requirements, grounding checks, five-step workflow, guardrails, and
required plan output are binding. The Claude file remains the shared canonical workflow so the two agent
systems do not drift.

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
description. Never create a story merely because the plan is complete; wait for the user's explicit
approval, then hand story authoring to the `architect` custom agent.

## Non-negotiable checks

- Keep `specification/` frozen and read-only.
- Treat a phase's suggested backlog as input, not authority; reconcile it against the current codebase,
  existing stories, traceability, stage constraints, and the module inventory.
- Start from the phase's permanent requirement ledger and produce the canonical command's inverse coverage
  matrix, temporal/adversarial hazard pass, producer/consumer contracts, low-context packets, and skeptical
  passing-but-incomplete review.
- Delegate the required read-only current-state map to `investigator`.
- Resolve every cited specification anchor and verify each proposed module exists in the module inventory.
- Allocate monotonic, unique story ids; maintain an acyclic dependency graph; map every AC with
  `Satisfies:` to real phase requirements; make every AC and edge case independently testable; reject L
  stories as ready.
- When the specification is ambiguous or contradictory, report the gap and ask rather than inventing
  behaviour. Propose an ADR only in the mutable `docs/adr/` area when the canonical workflow permits it.
