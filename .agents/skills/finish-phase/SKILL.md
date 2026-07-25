---
name: finish-phase
description: >-
  Check whether a phase is actually finished, by running the gates and using the app rather than validating documents. Use when every story in a phase is built and you want to know if it is done.
---

# finish-phase

**This skill is a pointer. The instructions live in one place: [`../../../.claude/commands/finish-phase.md`](../../../.claude/commands/finish-phase.md).**

Read that file and follow it exactly. It is shared by Claude Code (as the slash command
`/finish-phase`) and by Codex (as this skill), so there is only ever one copy to keep correct.

Argument: phase number (e.g. 04).

Why a pointer and not a copy: this repository previously kept the same guidance in
`.claude/`, `.agents/` and `.codex/`, hand-synced. They drifted — the `.claude/` copies of the
story and test-naming rules were stale while the `.agents/` copies were current, and nobody
noticed. One file, two entry points.
