# Troubleshooting

Common mistakes to check for before finishing, plus a one-line index of the edge cases this skill owns.

## Common mistakes

- **Called the network to tokenize** — the estimator must be embedded/offline (DD-32, DD-50); no round-trip.
- Hard-coded the margin or reply reserve instead of reading the AI Context settings.
- Fit check omits the reserve or margin — it must be `estimate + margin + reserve ≤ window`.
- Silently sent an over-context whole-document request instead of Warn (default) → offer selection/chunk.
- Removed the reactive `context_window` backstop after adding the proactive meter — keep both.
- Trimmed the scoped document or current directive in favor of old history (violates primacy priority).
- Trimming mutated the visible transcript — trimming affects only what is sent to the model.
- Read the meter ceiling from a constant instead of the per-model `num_ctx`.
- Bundled tool schemas for actions outside the current scope, inflating the fixed-overhead allocation
  (ADR-0009: only schemas valid for the current scope belong in the budget).
- Let `Trim()` receive a negative headroom instead of clamping to `0` when system + schemas + document
  alone exceed the usable window.

## Edge-case index

| ID | One-line summary |
|---|---|
| EC-LLM-10 | Over-context whole document: Warn blocks + offers selection/chunk; Chunk proceeds in overlapped windows; never sends a known-over-length request. |
| EC-LLM-15 | Reactive context-window overflow despite a green/amber estimate: report the classified error, offer narrow-scope/chunk, never retry the identical request. |
| EC-LLM-21 | Over-budget history is trimmed by the configured strategy before the request is built; current turn and directive are never trimmed; only what is sent is affected, never the visible transcript. |

See `references/over-context-and-settings.md` for EC-LLM-10/15 in full, and `references/context-budget.md`
for EC-LLM-21 in full.
