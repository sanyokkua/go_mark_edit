# Troubleshooting

Common mistakes to check for before finishing any change to the agent loop, tools, or apply path, plus
an index of the EC-LLM edge cases this skill's contract is built around.

## Common mistakes

- **Forgot the gate `defer` release** on an error/cancel path → the app deadlocks on the next run.
- **Unbounded loop / missing per-iteration cancel check** → runaway; must stop at `agent_limit` (EC-LLM-1)
  and cancel promptly (EC-LLM-5).
- Trusted model tool-args without JSON-schema validation (model output is untrusted input).
- **Advertised workspace tools with no folder open** — they must be absent (EC-LLM-13).
- Read a path outside the allowlist or via `..`/symlink — must be rejected before I/O (EC-LLM-14).
- **Loop wrote to disk / the buffer** instead of returning a `propose_edit` diff for review.
- Applied an edit by reaching into Monaco instead of the F3/F7 `replace-range`/`replace-all` seam.
- Force-applied a stale proposal after the buffer changed (must flag stale, EC-LLM-6).
- An event payload missing `runId`, so the UI can't correlate the active run.
- Made streaming load-bearing — it is optional; the non-streaming path must be equally correct.

## EC-LLM index

The full edge-case range cited by this skill's Source of truth is `EC-LLM-1..7, 12–14`, defined in
`specification/01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`. The ones this skill's contract directly
enforces are:

| EC-LLM id | One-line meaning |
|---|---|
| EC-LLM-1 | Loop must stop at the iteration/wall-clock ceiling and report `agent_limit`, not run away. |
| EC-LLM-3 | Invalid tool arguments (untrusted model output) must fail as a `tool_failed` observation, not crash or bypass validation. |
| EC-LLM-5 | A cancel request must abort promptly — checked every iteration and before every tool dispatch, not just at run start. |
| EC-LLM-6 | A `propose_edit` diff computed against a buffer that has since changed must be flagged **stale** and offered for re-run, never force-applied. |
| EC-LLM-13 | The two workspace tools (`list_workspace_files`, `read_workspace_file`) must be absent from the advertised tool schema when no folder workspace is open. |
| EC-LLM-14 | A workspace file read outside the allowlist, or via path traversal (`..`, symlink escape), must be rejected before any I/O occurs. |

For the remaining ids in the cited range (EC-LLM-2, 4, 7, 12) consult
`specification/01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md` directly — they fall outside this skill's
direct contract (e.g. token-fit/context-budget edge cases belong to `context-and-tokenizer`, provider
retry/error edge cases belong to `llm-provider-integration`) and should not be guessed at here.
