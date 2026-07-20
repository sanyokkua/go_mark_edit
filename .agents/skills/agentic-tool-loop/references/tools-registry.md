# Tools Registry and Edit Proposals

The exactly-five least-privilege tool set, the registry dispatch code, workspace-tool gating, and how a
`propose_edit` result becomes an applied edit via the editor command seam.

## Exactly five least-privilege tools (DD-41, `16_CHAT_AND_AGENTIC_WORKFLOW.md#tools`)

Model output is **untrusted input**: validate every call's args against its JSON schema before invoking
(bad args → `tool_failed` observation, EC-LLM-3). Advertise the two workspace tools **only when a folder
workspace is open** (EC-LLM-13), reusing the Stage-1 asset **allowlist** with traversal rejection
(EC-LLM-14). No filesystem/shell/network tools; the model never writes files.

| Tool | Purpose | Source | Least-privilege note |
|---|---|---|---|
| `read_document` | Full text at active scope | `internal/appmodel` canonical buffer, via the F2 content accessor (DD-62/DD-64) | read-only |
| `read_selection` | Current selection (or empty) | `internal/appmodel` per-document view state (F2/F7 selection accessor) | read-only |
| `list_workspace_files` | List `.md/.markdown/.mdown/.txt` under root | `internal/workspace` | read-only; **only when a folder is open** |
| `read_workspace_file` | Read one file by relative path | `internal/workspace` + `internal/assets` allowlist | read-only; allowlisted, traversal-rejected |
| `propose_edit` | Return a proposed replacement as a **diff** | computed vs scoped content | **never writes**; returns a diff for review |

**Reads come from the backend's canonical buffer.** `read_document`/`read_selection` read the Go-owned
model (`internal/appmodel`) — the single source of truth the editor debounce-syncs into (DD-62/DD-64) —
**never the frontend editor**. A pending edit is at most one debounce tick behind and is flushed on
blur/tab-switch/close/save, so the assistant sees what the user sees.

This is the complete tool surface — no sixth tool, no filesystem/shell/network access of any kind. Adding
a tool means adding a row here, a JSON schema, and (if it reads workspace content) reusing the existing
`internal/assets` allowlist rather than a new access path.

## Registry dispatch (JSON-schema arg validation)

```go
// internal/llm/tools/registry.go — model output is untrusted; validate before running.
func (r *registry) Dispatch(ctx context.Context, call ToolCall) (Observation, error) {
    tool, ok := r.tools[call.Name]
    if !ok {
        return Observation{}, apperr.ToolFailed("unknown tool: " + call.Name)
    }
    if err := tool.Schema.Validate(call.Args); err != nil { // JSON-schema arg validation
        return errorObservation(call, apperr.ToolFailed(err.Error())), nil
    }
    return tool.Invoke(ctx, call.Args) // read-mostly; propose_edit returns a diff, never a disk write
}
```

Two failure shapes matter here and must not be conflated:

- **Unknown tool name** (model hallucinated a tool that isn't registered) → `apperr.ToolFailed`, returned
  as a Go `error` — this is a dispatch-level failure, distinct from a tool that ran and reported its own
  failure.
- **Schema validation failure** (known tool, bad args) → returned as a **successful** `Observation`
  carrying a `tool_failed` payload (EC-LLM-3), *not* a Go `error` — the loop feeds this back to the model
  as an observation so it can retry with corrected arguments, rather than aborting the run.

## Workspace-tool gating (EC-LLM-13, EC-LLM-14)

`list_workspace_files` and `read_workspace_file` are only present in the `tools` schema list passed to the
provider when a folder workspace is open (`scopeCaps(req)` in the loop — see
`references/handler-and-loop.md`). If no folder is open, the model must not even see these tools exist
(EC-LLM-13) — this is an advertisement-time gate, not a runtime rejection.

`read_workspace_file` reuses the **same** Stage-1 asset allowlist (`internal/assets`) that gates document
image loading under `offline-and-privacy.md`: document folder + workspace root + any configured roots,
with path-traversal rejection (`..`, symlink escape) applied **before** any I/O (EC-LLM-14). There is no
separate, looser allowlist for agent tool reads — one allowlist, two consumers.

## Edits are proposals via the F3/F7 seam (DD-42, DD-43, ADR-0010)

`propose_edit` returns a **diff** rendered by the reusable **F9 DiffView**. On **Apply**, the frontend
calls the editor document-command seam:

- `replace-range` for a Selection-scoped edit — replaces only the selected range.
- `replace-all` for a Whole-document edit.

The updated buffer debounce-syncs to the backend model (DD-64), which owns dirty state → normal
save/autosave path; no special-cased save logic for agent-applied edits.
Optional Format-after-apply reuses the pure **F8** Format transform (opt-in, not automatic). The loop and
model **never touch Monaco or disk directly** — `propose_edit` is the only tool that produces something
downstream of a user action, and even it only produces a diff, never a write.

**Stale proposals (EC-LLM-6):** if the buffer changed since the proposal was generated (e.g. the user
typed, or a different run applied first), mark the proposal **stale** and offer re-run — never
force-apply a diff computed against content that no longer exists. Detecting staleness means comparing
the backend buffer's current identity/version (the `internal/appmodel` copy, via the F2 accessor)
against the version captured when the proposal was created.

## Citations

DD-41 (exactly five least-privilege tools), DD-42/DD-43 (edits are proposals, applied via F3/F7),
ADR-0010 (assistant sidebar apply-edit design), EC-LLM-3/6/13/14 (see
`specification/01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope` and `#edit-proposals`),
`.claude/rules/offline-and-privacy.md` (the shared `internal/assets` allowlist), `.claude/rules/
llm-integration.md` (Tools least-privilege, Edits are proposals sections).
