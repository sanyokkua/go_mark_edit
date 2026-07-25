---
name: plan-phase
description: >-
  Turn one phase into a complete, ordered set of stories. Use when starting a new phase from specification/07_Phases/ — reading the phase, answering its open questions, slicing it into vertical stories, and checking coverage before any story file is written.
---

# plan-phase

**This skill is a pointer. The instructions live in one place: [`../../../.claude/commands/plan-phase.md`](../../../.claude/commands/plan-phase.md).**

Read that file and follow it exactly. It is shared by Claude Code (as the slash command
`/plan-phase`) and by Codex (as this skill), so there is only ever one copy to keep correct.

Argument: phase number (e.g. 04).

Why a pointer and not a copy: this repository previously kept the same guidance in
`.claude/`, `.agents/` and `.codex/`, hand-synced. They drifted — the `.claude/` copies of the
story and test-naming rules were stale while the `.agents/` copies were current, and nobody
noticed. One file, two entry points.
