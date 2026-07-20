# Token Budget Worksheet

Fill in this worksheet with real numbers (from the model's `num_ctx`, the AI Context settings, and a
`tokenizer.Estimate` run) to sanity-check a budget allocation before or while touching
`internal/llm/context/budget.go`. Mirrors the priority order in `references/context-budget.md`.

## 1. Usable window

```
context window (num_ctx)        = __________ tok
− reply reserve (default 1024)  = __________ tok
− safety margin (default 15% of estimate, computed in step 2)
= usable                         = __________ tok
```

## 2. Raw estimate and margin

```
tokenizer.Estimate(prompt candidate) = __________ tok   (promptTokens)
safety margin % (AI Context setting) = __________ %
margin tokens = promptTokens * marginPct / 100 = __________ tok
```

## 3. Fixed overhead (priority 1–2)

```
system prompt tokens   = tokenizer.Estimate(system)          = __________ tok
tool schema tokens      = sum of in-scope tool schema tokens  = __________ tok
fixed = system + schemas                                      = __________ tok
```

## 4. Primary payload (priority 3)

```
scoped document / selection tokens = tokenizer.Estimate(scopedContent) = __________ tok
```

## 5. History headroom (priority 4 — the trimmable remainder)

```
histHeadroom = usable − fixed − doc = __________ tok
```

- If `histHeadroom < 0`: clamp to `0` before calling `Trim()` — this is the "document alone doesn't fit"
  case that should surface through the fit check (`FitRed`) and the over-context strategy, not a crash.
- If `histHeadroom ≥ 0`: this is the budget `Trim()` receives for the configured history strategy
  (sliding window drops oldest turns first; summarize replaces older turns with a running summary).

## 6. Fit result

```
FitState = Fits(promptTokens, replyReserve, window, safetyMarginPct).State
  Green  → promptTokens + marginTokens ≤ usable − marginTokens
  Amber  → promptTokens + marginTokens ≤ usable
  Red    → otherwise → over-context strategy (Warn default / Chunk opt-in)
```

Record the resulting state and, if Red, which over-context path was exercised (Warn → selection/chunk
offer, or Chunk → overlapped windows) — see `references/over-context-and-settings.md`.
