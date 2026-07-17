# Tokenizer and Fit

The offline token estimator, the safety-margin/reply-reserve fit check, and the three-state sidebar fit meter.

## Offline estimate + margin + reserve (DD-50, ADR-0009)

The estimator is **offline** — embedded BPE (e.g. cl100k-style) or a `chars ÷ 4` heuristic fallback,
**never** a network call. This is a repo-wide invariant, not a Stage-3-only preference: `offline-and-privacy.md`
lists a user-invoked LLM inference call as the *only* outbound request the app ever makes, and counting
tokens is not that — it must stay entirely on-device (DD-32, DD-50, ADR-0011).

The estimate is deliberately **approximate**: real tokenization differs per model/provider, and a default
install can point at any of several local models, each with its own tokenizer. Bundling and running the
exact tokenizer for whichever model the user picked is impractical across the supported matrix (ADR-0009,
"Option B — Exact per-model tokenizer bundled per model" — rejected as unmaintainable). Because the
estimate is approximate, a configurable **safety margin** (percentage) is added on top of the raw estimate,
and a **reply reserve** (aligned with Max output tokens) is held back so the model has room to answer. The
fit check is:

```
estimate + margin + reserve ≤ contextWindow
```

Raising the margin makes the app more conservative (warns sooner, at the cost of packing the window less
tightly); lowering it packs the window tighter at more risk of a reactive overflow
(`18_TOKENIZER_AND_CONTEXT.md#safety-margin`).

## `internal/llm/tokenizer/tokenizer.go`

```go
// internal/llm/tokenizer/tokenizer.go — offline only, no network.
func Estimate(text string) int // embedded BPE / heuristic

type FitState int

const (
    FitGreen FitState = iota // fits
    FitAmber                 // tight — within the margin band
    FitRed                   // over — triggers over-context strategy
)

type FitResult struct {
    PromptTokens int
    Usable       int // window - replyReserve - marginTokens
    State        FitState
}

// Fits drives the sidebar three-state fit meter (18_...#fit-meter).
func Fits(promptTokens, replyReserve, window, safetyMarginPct int) FitResult {
    marginTokens := promptTokens * safetyMarginPct / 100
    usable := window - replyReserve
    switch {
    case promptTokens+marginTokens <= usable-marginTokens:
        return FitResult{promptTokens, usable, FitGreen}
    case promptTokens+marginTokens <= usable:
        return FitResult{promptTokens, usable, FitAmber}
    default:
        return FitResult{promptTokens, usable, FitRed} // estimate + margin + reserve > window
    }
}
```

Keep `Estimate` **pure** (no I/O, no globals) — it takes `text` and returns a token count, nothing else.
`Fits` takes the margin percentage and reply reserve as **parameters**, read from the AI Context settings
at call time — never hard-coded constants (see `references/over-context-and-settings.md` for where those
settings live).

## Three-state sidebar fit meter (`18_TOKENIZER_AND_CONTEXT.md#fit-meter`)

The sidebar shows a live **token-fit meter** (the mockup's `.tokenmeter`): a bar plus a label such as
`≈ 1,480 tokens of document` and `fits · 8,192 ctx`. It recomputes when the scope toggles (e.g. switching
to `≈ 96 tokens of selection`) or the document changes.

The meter is a **three-state** signal against the model's context length (DD-50, DD-52):

- **Green — fits.** Estimate + margin + reply reserve is within the window; the label reads `fits`.
- **Amber — tight.** Near the limit (within the margin band); the run will proceed but the user is
  cautioned.
- **Red — over.** Estimate exceeds the usable window; a whole-document action triggers the over-context
  strategy (`references/over-context-and-settings.md`) rather than silently sending.

The meter reads its **ceiling** from Context length (`num_ctx`) and its **reserve** from the reply reserve,
so changing either in settings updates the meter live — never read the ceiling from a constant.

## Estimation triggers

Estimation runs whenever the scope or document changes so the fit meter stays live
(`14_LLM_ASSISTANT_OVERVIEW.md#assistant-sidebar`). "Estimate, not exact" is the framing throughout the
spec — different models tokenize the same text differently, so the app never claims exactness; this is why
the margin exists and why the reactive `context_window` backstop (`references/over-context-and-settings.md`)
is still needed even with a green/amber estimate.
