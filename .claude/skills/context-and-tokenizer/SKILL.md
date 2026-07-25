---
name: context-and-tokenizer
description: >
  Use when working on Stage-3 offline token estimation, the context budgeter, the fit meter, reply
  reserve / safety margin, over-context handling (warn / chunk / selection), or chat-history trimming
  (sliding window / summarize) for the assistant. Triggers: Estimate, Fits, FitResult, token meter,
  num_ctx, reply reserve, safety margin, context_window, sliding window, summarize, Budget.Assemble,
  Budget.Trim, AI Context settings tab. Stage-3 only; additive; offline estimator, never a network call.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
references:
  - references/tokenizer-and-fit.md
  - references/context-budget.md
  - references/over-context-and-settings.md
  - references/troubleshooting.md
assets:
  - assets/budget-worksheet.md
---

# Context and Tokenizer

`internal/llm/tokenizer/` estimates prompt cost **offline** and `internal/llm/context/` allocates the
model's context window as an **explicit budget** before each run. Together they drive the sidebar
fit meter, the over-context warning, and history trimming — with the provider's reactive
`context_window` error as the backstop.

## When to use

- Adjusting `Estimate` / `Fits`, the safety margin, reply reserve, or the three-state fit meter.
- Implementing `Budget.Assemble()` / `Trim()`, the priority allocation, or history strategy.
- Wiring the over-context warn / chunk / selection offer, or the **AI Context** settings tab.

## When NOT to use

- Provider client, discovery, retry/error mapping, secret handling → use `llm-provider-integration`.
- The tool-call loop, cancellation, gate, edit-proposal diff → use `agentic-tool-loop`.
- Anything in Stages 1–2. The tokenizer/budgeter are **Stage-3 only** and **additive** — they consume
  F2 (document/selection accessor) and per-model params, and restructure nothing.

## Source of truth

- `specification/02_Architecture/08_LLM_INTEGRATION.md` — *Context budgeter*, *Tokenizer*, and the
  `context_window` row of *Error codes*.
- `specification/01_Product/18_TOKENIZER_AND_CONTEXT.md` — `#token-estimation`, `#safety-margin`,
  `#reply-reserve`, `#fit-meter`, `#over-context-strategy`, `#context-budget`, `#history-strategy`
  (and EC-LLM-10, EC-LLM-15).
- `specification/00_Foundation/04_DESIGN_DECISIONS.md` — DD-50, DD-51, DD-52, DD-53 (and DD-43 scope).
- `specification/08_Decisions/0009-tokenizer-context-budget.md` (ADR-0009).
- `specification/02_Architecture/01_MODULE_INVENTORY.md` — the only valid module paths.
- Rules: `.claude/rules/llm-integration.md`, `offline-and-privacy.md`.

## Workflow (load references progressively)

1. Read the *Context budgeter* and *Tokenizer* sections of `08_LLM_INTEGRATION.md`, all of
   `18_TOKENIZER_AND_CONTEXT.md`, DD-50/51/52/53, and ADR-0009 (see **Source of truth** above).
2. Keep `Estimate` offline and pure; apply the configurable margin + reply reserve in `Fits`, not
   hard-coded constants. Load `references/tokenizer-and-fit.md` for the offline-estimate contract,
   the fit-check formula, the full `tokenizer.go` code, and the three-state fit meter.
3. Implement/adjust `Budget.Assemble()`/`Trim()` to allocate in priority order and trim history by the
   configured strategy, preserving primacy + recency. Load `references/context-budget.md` for the
   priority allocation table, the full `budget.go` code, and the sliding-window/summarize strategies.
   Use `assets/budget-worksheet.md` to work out a concrete allocation by hand before or while coding.
4. Wire the three-state `FitResult` to the sidebar fit meter and the warn / chunk-or-selection offer for
   over-context whole-document actions. Load `references/over-context-and-settings.md` for the Warn vs.
   Chunk decision, EC-LLM-10, and the AI Context settings tab fields (estimator, margin, reserve,
   strategies, max iterations).
5. Keep the reactive `context_window` error as the backstop path even when the estimate says it fits
   (EC-LLM-15, in `references/over-context-and-settings.md`).
6. Surface estimator / margin / reserve / strategies / max-iterations through the AI Context tab via
   `logic/adapter/` and `logic/llm/`.
7. Run `just check`; if a bound signature changed, run `just gen` with **zero `wailsjs/` drift**.
8. Before finishing, walk `references/troubleshooting.md` and the **Mandatory validation** checklist
   below.

## Reference Index

| File | Load when |
|---|---|
| `references/tokenizer-and-fit.md` | Touching `Estimate`, `Fits`, `FitState`/`FitResult`, the fit-check formula, or the sidebar fit meter |
| `references/context-budget.md` | Touching `Budget.Assemble()`/`Trim()`, the priority allocation, or history strategy (sliding window / summarize) |
| `references/over-context-and-settings.md` | Touching the Warn/Chunk over-context offer, the reactive `context_window` backstop, or the AI Context settings tab |
| `references/troubleshooting.md` | Before finishing — common mistakes and the EC-LLM-10 / EC-LLM-15 edge-case index |
| `assets/budget-worksheet.md` | Working out a concrete token-budget allocation by hand (window → usable → per-segment) |

## Mandatory validation (before finishing)

- [ ] Token estimate is offline (no network); safety margin and reply reserve are configurable, not hard-coded.
- [ ] Fit check is `estimate + margin + reserve ≤ window`; three-state result drives the fit meter.
- [ ] Over-context whole-document action warns and offers chunk/selection (default warn); `context_window`
      remains the reactive backstop.
- [ ] Budget allocates system → schemas → document/selection → history, trimming by sliding-window/summarize.
- [ ] Trimming affects only what is sent to the model — never the visible transcript.
- [ ] Estimator, margin, reserve, over-context + history strategy, and max iterations are AI-Context settings.
- [ ] `just check` passes; if bound signatures changed, `just gen` run; no `wailsjs/` drift.

## Gotchas

- The estimator must never make a network call — offline embedded BPE / `chars ÷ 4` fallback only (DD-32, DD-50).
- The fit check must include **both** margin and reserve, not just one.
- Don't silently send an over-context whole-document request — Warn (default) blocks the send.
- Don't drop the scoped document or current directive in favor of old history (primacy priority).
- Full list, with rationale, in `references/troubleshooting.md`.

## Spec references

- `specification/02_Architecture/08_LLM_INTEGRATION.md` (Context budgeter, Tokenizer, Error codes)
- `specification/01_Product/18_TOKENIZER_AND_CONTEXT.md` (all sections; EC-LLM-10, EC-LLM-15)
- `specification/00_Foundation/04_DESIGN_DECISIONS.md` (DD-43, DD-50, DD-51, DD-52, DD-53)
- `specification/08_Decisions/0009-tokenizer-context-budget.md`
- `specification/02_Architecture/01_MODULE_INVENTORY.md` (`internal/llm/tokenizer/`,
  `internal/llm/context/`)
- Rules: `.claude/rules/llm-integration.md`, `offline-and-privacy.md`
