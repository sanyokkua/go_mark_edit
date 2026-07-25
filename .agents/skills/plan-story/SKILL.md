---
name: plan-story
description: >-
  Plan and build one story end to end. Use when a story in docs/stories/ is ready to implement — investigating readers/writers/lifecycle boundaries, planning the change and its tests, verifying in the running app, and closing out.
---

# plan-story

**This skill is a pointer. The instructions live in one place: [`../../../.claude/commands/plan-story.md`](../../../.claude/commands/plan-story.md).**

Read that file and follow it exactly. It is shared by Claude Code (as the slash command
`/plan-story`) and by Codex (as this skill), so there is only ever one copy to keep correct.

Argument: story number (e.g. 057).

Why a pointer and not a copy: this repository previously kept the same guidance in
`.claude/`, `.agents/` and `.codex/`, hand-synced. They drifted — the `.claude/` copies of the
story and test-naming rules were stale while the `.agents/` copies were current, and nobody
noticed. One file, two entry points.
