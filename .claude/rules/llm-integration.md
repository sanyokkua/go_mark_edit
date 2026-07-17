---
paths:
  - "internal/llm/**"
  - "frontend/src/logic/store/assistant/**"
  - "frontend/src/logic/llm/**"
  - "frontend/src/ui/widgets/assistant/**"
---

# LLM integration (Stage 3 assistant)

**Authority:** `specification/02_Architecture/08_LLM_INTEGRATION.md` (normative contract for the
`internal/llm/*` group + the frontend assistant surface),
`specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-32 revised, DD-38..DD-55),
`specification/00_Foundation/06_IMPLEMENTATION_STAGES.md` (Stage 3; the F1–F9 seams). The assistant
**extends, never rewrites** the backend layering (`go-backend-architecture.md`) and error envelope
(`go-error-envelope.md`). Everything here is additive.

The assistant is a **Stage-3-only**, agentic, tool-call-based workflow over the open document. It must not
exist in Stages 1–2, and it is built **entirely by consuming** the reserved seams (F1 layout slot, F2
document identity/content accessor, F3/F7 document-command seam, F5 single-flight gate, F8 programmatic
Format/Lint, F9 reusable DiffView). It restructures no earlier contract.

## DO

- **Provider abstraction via profile + factory (DD-45).** Serve every kind (ollama · lmstudio · llamacpp ·
  openai · azure · compat) with the **one** `OpenAICompatibleProvider` parameterized by a `ProviderProfile`
  and selected by `ProviderFactory`. A new kind is a new profile row, not new client code.
- **Secret handling: env-var *name* only (DD-45).** Persist the environment-variable name, never the key.
  Resolve the value via `os.Getenv` at request-construction time; attach it to the auth header; never write
  it to the DB, the transcript, or any log. Env-var name set but unresolved → `missing_credential`, do not
  send an unauthenticated request.
- **Retries + timeouts owned by the service (DD-48).** The service — not the `*http.Client` — classifies
  each outcome to a fixed `ErrorCode`, retries only retryable classes with backoff that honors
  `Retry-After`, and stops at a bounded attempt count. Errors surface through the standard `apperr.*Result`
  envelope + toast path.
- **Single-flight gate + Busy (DD-47, F5).** `AgentHandler.RunAgent` and `verify.TestInference`
  `TryAcquire()` the same process-wide `internal/gate`; a held gate returns `apperr.Busy()` (`busy`). Release
  in a `defer` on every exit (success/error/cancel). At most one inference runs app-wide.
- **Bounded agent loop (DD-40).** Hard **iteration** and **wall-clock** limits (configurable in AI Context).
  Check `ctx.Err()` **each iteration and before each tool dispatch** so cancellation aborts between turns or
  mid-tool. A clean stop at a limit reports `agent_limit`; a cancel reports `cancelled`.
- **Tools least-privilege, read-mostly (DD-41).** Exactly the five tools (`read_document`, `read_selection`,
  `list_workspace_files`, `read_workspace_file`, `propose_edit`). **Document/selection reads come from the
  backend's canonical buffer**: `read_document`/`read_selection` read the Go-owned model
  (`internal/appmodel`, DD-62/DD-64) — never the frontend editor; a pending edit is flushed on
  blur/tab-switch/close/save, so the assistant sees what the user sees
  (`08_LLM_INTEGRATION.md#tool-registry`). Validate every call's args against its
  JSON schema before invoking — model output is **untrusted input**. Advertise the two workspace tools
  **only when a folder workspace is open**, and reuse the Stage-1 asset **allowlist** (document folder +
  workspace root + configured roots) with **path-traversal rejection**. No arbitrary filesystem, shell, or
  network tools.
- **Edits are proposals, applied via the editor command seam (DD-42, F3/F7).** `propose_edit` returns a
  **diff**, rendered with the reusable DiffView (F9). The user reviews and **Applies**, which calls the
  editor document-command interface (`replace-range` for selection scope, `replace-all` for whole-document);
  the updated buffer debounce-syncs to the backend model, which owns dirty state and the normal
  save/autosave path (DD-64). The model and loop **never write files
  directly**; no component touches the Monaco instance directly.
- **Proactive token fit + reactive backstop (DD-50, DD-51).** Before a whole-document action, estimate
  tokens **offline** and apply a **safety margin** + **reply reserve** (`estimate + margin + reserve ≤
  window`) to drive the fit meter; warn and offer chunk/selection when it will not fit (chunking opt-in in
  v1). The provider's reactive `context_window` error is the backstop when the estimate under-counts.
- **Explicit context budget (DD-51).** Allocate the window in priority order — system prompt → tool schemas
  → scoped document/selection → chat history — and trim over-budget history by sliding window (default) or
  summarization (setting). Keep system prompts and tool schemas terse.
- **Network only to the configured provider, on user action (DD-32 revised, DD-54).** The provider HTTP
  client is the app's **only** outbound socket, opened **only** when the user invokes an action / sends a
  chat message, and **only** to the user-configured endpoint (local by default). No background/unsolicited
  network; telemetry/auto-update remain never.

## DON'T

- Don't persist or log an API key; don't send an unauthenticated request when the env-var is unset.
- Don't add a per-kind provider client class, or bake retry/timeout policy into the HTTP client.
- Don't run two inferences at once, skip the gate, or forget the `defer` release.
- Don't let the loop run unbounded, skip the per-iteration/pre-tool cancellation check, or write to disk.
- Don't add filesystem/shell/network tools, trust model tool-args without schema validation, expose the
  workspace tools with no folder open, or read a path outside the allowlist / through a traversal.
- Don't apply an edit by reaching into the editor widget; always go through the F3/F7 command seam.
- Don't open a socket in Stages 1–2, or to anything other than the user-configured provider.
- Don't restructure the Stage-1/2 shell, document model, gate, or Format/Lint/Diff contracts — consume the
  F1–F9 seams; a required change to an earlier contract is a new story (+ ADR if significant).

## Authoring checklist

- [ ] Provider work goes through the profile + factory + shared `OpenAICompatibleProvider`; a new kind is a
      new profile.
- [ ] API key is env-var-name only; resolved at call time; never persisted/logged; unset → `missing_credential`.
- [ ] Retry/timeout classification + backoff live in the service; errors map to the fixed `ErrorCode` set.
- [ ] `RunAgent`/`TestInference` acquire the single-flight gate; held → `busy`; released in `defer`.
- [ ] Loop is bounded (iteration + wall-clock) and checks cancellation each iteration and before each tool.
- [ ] Only the five least-privilege tools; args schema-validated; workspace tools gated on an open folder and
      allowlisted + traversal-rejected; document/selection reads come from the `internal/appmodel`
      canonical buffer, never the frontend editor (DD-62/DD-64).
- [ ] Edits are diffs applied via the F3/F7 command seam through DiffView (F9); no direct file writes.
- [ ] Token fit uses the offline estimator + margin + reply reserve; `context_window` is the backstop.
- [ ] Context is an explicit budget with sliding-window/summarization trimming.
- [ ] Network only to the configured provider, only on user action; Stage-3-only; F1–F9 seams consumed, not
      restructured; bound-signature change → `just gen`, no `wailsjs/` drift.
