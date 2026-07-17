<!--
  New ProviderProfile row template.

  Fill this in when adding a new provider kind to internal/llm/providers. The rule (DD-45, ADR-0007):
  a new kind is a ProviderProfile row registered in NewFactory() — never a new client class. See
  references/provider-profiles.md for the full ProviderProfile/OpenAICompatibleProvider/NewFactory/Build
  Go code and the existing per-kind table.

  Delete these comments before committing (this file is a working template, not shipped documentation).
-->

## New provider profile — fill-in

| Field | Value | Notes |
|---|---|---|
| `Kind` | `{new_kind}` | Add to the `ProviderKind` enum; also add to `EnumBind` in `main.go` if it becomes user-visible as a typed value. |
| `DefaultAuthScheme` | `none` \| `bearer` \| `apiKeyHeader` | Prefilled into the draft config; user can override. `none` for anything local by default (DD-32 revised, DD-54). |
| `DefaultBaseURL` | `{scheme://host:port}` | Prefer a local/on-device default when one exists — keeps a default install network-free. |
| `CompletionPathTemplate` | `{/v1/chat/completions or equivalent}` | The chat-completions endpoint path relative to `DefaultBaseURL`. |
| `ModelsPathTemplate` | `{/v1/models, /api/tags, or equivalent}` | The model-listing endpoint path. |
| `DiscoveryStrategy` | `{openai-list \| ollama-tags \| ...}` | Add a new `DiscoveryStrategy` case in `ListModels` **only if** this shape is genuinely new — reuse `openai-list` whenever the endpoint returns a standard OpenAI `/v1/models` array. |
| `Capabilities` | `{tools: bool, streaming: bool, modelListing: bool}` | What this kind actually supports; a capability gap (e.g. no tool-calls) must degrade gracefully, not error. |

## Filled example row (`ollama`, for reference)

| Field | Value |
|---|---|
| `Kind` | `ollama` |
| `DefaultAuthScheme` | `none` |
| `DefaultBaseURL` | `http://127.0.0.1:11434` |
| `CompletionPathTemplate` | `/v1/chat/completions` |
| `ModelsPathTemplate` | `/api/tags` |
| `DiscoveryStrategy` | `ollama-tags` |
| `Capabilities` | `{tools: true, streaming: true, modelListing: true}` |

## Registration checklist

- [ ] `ProviderProfile` row added and registered in `internal/llm/providers/profile.go` `NewFactory()` —
      reusing the existing `OpenAICompatibleProvider`; **no new client type written**.
- [ ] Auth scheme resolves a secret (if any) by **env-var name only**, via `os.Getenv` at call time;
      unset → `missing_credential` (see `references/secrets-and-errors.md`).
- [ ] If a genuinely new `ErrorCode` is introduced for this kind's quirks, it is added to the
      `EnumBind` list in `main.go` (see `references/troubleshooting.md`).
- [ ] Persistence stays additive — no schema rewrite/backfill; new kind fits the existing `providers`
      table columns, or a new nullable column is added via an additive goose migration
      (see `references/discovery-verification-persistence.md`).
- [ ] Default base URL keeps a default install network-free where the kind is local; remote kinds stay
      strictly opt-in (DD-32 revised, DD-54, ADR-0011).
- [ ] `TestConnection`/`TestModels`/`TestInference` all succeed against a draft config for the new kind
      before it can be saved (DD-46).
- [ ] `wails generate module` run if any bound signature changed; `just check` passes; no
      `frontend/wailsjs/` drift.
