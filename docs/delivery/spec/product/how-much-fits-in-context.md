# How much fits in context

## What it's for

Every model has a fixed amount of room. Send more than it holds and one of three things happens: a
clean error, a timeout, or — worst — the provider silently truncates the prompt and returns a
plausible, incomplete answer that nothing flags. The third is the common case with local providers, and
it is why this is a feature with a visible meter rather than an internal detail.

The meter tells you, before you press anything, whether what you are about to do will fit.

## What you can do

The assistant sidebar shows a bar and a label: `≈ 1,480 tokens of document` and `fits · 8,192 ctx`.
Switch the scope to Selection and it recomputes — `≈ 96 tokens of selection`. Green means it fits, amber
means it is close, red means it will not.

Settings → AI · Context sets the estimator, the safety margin and the reply reserve, and the maximum
number of tool iterations a single run may take.

## Rules

### Estimation is offline and is an estimate {#estimation-is-offline}
- Token count is estimated on the machine, with no network call and no model round trip.
- Two estimators are offered: an embedded BPE-style estimate, and a cheaper `characters ÷ 4` heuristic.
- Estimation re-runs whenever the scope or the document changes, so the meter is live.
- The app treats the number as an **estimate** and never claims exactness, because different models
  tokenise the same text differently.

Examples: switching scope → the meter updates immediately · asking the provider to count tokens → a
network call the app is not allowed to make, and one it would have to make on every keystroke.

### A safety margin is added before the fit decision {#safety-margin}
- A configurable safety margin is added on top of the raw estimate, defaulting to **15 %**, and it is
  applied **before** the fit decision.
- Raising it makes the app warn sooner. Lowering it packs the window tighter and risks an overflow.

Examples: an 8,000-token estimate with a 15 % margin against an 8,192-token window → treated as over,
not optimistically sent · applying the margin after the decision → the margin does nothing at all.

### Room is reserved for the reply {#reply-reserve}
- The reply reserve is subtracted from the usable window before deciding what input fits. Its default is
  **1,024 tokens**.
- The effective input budget is `context length − reply reserve − margin`.
- The reserve and **Max output tokens** are related and are not the same number: the reserve is what the
  meter subtracts, and max output tokens is the wire field that caps generation.
  `replyReserve ≤ maxOutputTokens < contextWindow`.

Examples: an 8,192 window with a 1,024 reserve and a 15 % margin → about 6,100 tokens of usable input.

### For a rewrite, the reserve follows the scope {#reserve-follows-the-scope}
- For any action whose expected output is a rewrite of its scope, the fit check is:

  ```
  estimate(prompt) + margin + max(replyReserve, estimate(scope) × 1.1) ≤ contextWindow
  ```

- The meter refuses **up front** rather than failing halfway through.

Examples: a 5,000-token document, an 8,192-token window, a flat 1,024-token reserve → passes the fit
check, then truncates at 1,024 tokens of output, producing a broken JSON argument, a schema-validation
failure, and a message saying a tool call had invalid arguments, which is true and useless. With the
scope-sized reserve it is refused before anything is sent · a 96-token selection → the flat reserve
applies, because it is larger.

*This is arithmetic, not a preference.* Proofreading a document requires the model to emit the entire
corrected document. Proposals carry full replacement text rather than a patch, because small local
models cannot produce a valid unified diff; this formula is the budget admitting what that choice costs.

### The meter has three states {#three-state-meter}
- **Green — fits.** Estimate plus margin plus reply reserve is within the window. The label reads
  `fits`.
- **Amber — tight.** Within the margin band of the limit. The run proceeds and the user is cautioned.
- **Red — over.** The estimate exceeds the usable window. A whole-document action is blocked and the
  over-context choice is offered.
- The meter reads its ceiling from the **Context length** setting and its reserve from the **reply
  reserve**, so changing either updates it immediately.

Examples: 1,480 tokens against 8,192 → green · 6,000 → amber · 9,000 → red and blocked.

### The meter is the real protection, not the fallback {#the-meter-is-the-real-protection}
- The proactive meter is the primary defence. The provider's own context-window error is the backstop,
  and it mostly does not fire.

Examples: live testing of a comparable application set `contextWindow` to 200,000 against real Ollama
and the request **succeeded** — the provider silently reloaded the model at its own 131,072 ceiling. The
provider clamped; the application never knew. Across a whole test matrix the worst observed outcome was
a clean timeout, and the reactive over-context case had to be recorded as *skipped — not reachable with
the configured providers*.

*So the failure you actually get is a timeout, or a silently truncated prompt and a plausible-looking
but incomplete answer — which is worse than an error, because nothing tells anyone it happened.*

### An over-context whole-document run is blocked, and offers the selection {#over-context-is-blocked}
- **If** a whole-document run's estimate is red, **then** the app blocks the send and offers to process
  the **selection** instead. The user chooses; nothing is sent until they do.
- The app never sends a request it knows exceeds the window, and never silently truncates one.

Examples: a 200-page document with Proofread pressed → blocked, with the selection offered · sending it
anyway → whichever of the three failure modes the provider happens to have.

### A provider's context-window error is classified and offered a narrower scope {#reactive-backstop}
- **If** the estimate was green or amber and the provider still rejects the request for length, **then**
  the classified error is reported and narrowing the scope is offered.
- The identical over-length request is **not** retried.

Examples: a rejection for length → `The document is too long for this model` · retrying it → three
identical requests, three identical rejections.

### Context is an explicit budget with a fixed allocation {#context-is-a-budget}
- Before each iteration the loop allocates the usable window — context length minus reply reserve minus
  margin — across four things:
  1. the **system prompt**, kept concise;
  2. the **tool schemas**, re-sent on every call and therefore kept concise;
  3. the **document or selection**, the largest and most important allocation;
  4. the **chat history**, trimmed to fit.
- **When** allocations compete, the scoped content and the current directive win over older history. The
  system prompt and tool schemas are fixed overhead kept small.

Examples: a long conversation about a long document → history is trimmed, the document is not · trimming
the document to keep history → the model answers about a document it was shown half of.

### The important parts go at the start and the end {#prompt-placement}
- The directive and the scoped document are placed at the **start and end** of the prompt, where models
  attend most reliably. Lower-priority history sits in the middle and is trimmed first.

Examples: a directive buried in the middle of a long prompt → a small model is measurably more likely to
ignore it.

### History is a sliding window {#history-is-a-sliding-window}
- **When** accumulated history exceeds its allocation, the oldest turns are dropped until it fits.
- The **current turn and the directive are never trimmed away.**
- Trimming affects only what is sent to the model, never the visible transcript.

Examples: a 30-turn conversation → the most recent turns that fit are sent, all 30 stay on screen ·
dropping turns from the transcript too → the user loses a conversation they were reading.

### The tool-iteration limit is a setting {#iteration-limit-setting}
- **Max agent tool iterations** caps how many budgeted round trips a single run may take. Its default is
  **8**.

Examples: a model that keeps reading without converging → stopped at 8 with an honest notice.

### AI Context settings {#ai-context-settings}

| Setting | Values | Default |
|---|---|---|
| Token estimator | Embedded BPE-style, `characters ÷ 4` | Embedded BPE-style |
| Safety margin | a percentage | 15 % |
| Reserve for reply | a token count | 1,024 |
| Max agent tool iterations | a count | 8 |

Examples: raising the reserve → the meter turns amber and red sooner, and the model has more room to
answer.

## What it looks like

- Settings → AI · Context — `../surface/mockup.html#material-light/settings-ai-context`
- The token meter with a selection scope — `../surface/mockup.html#material-light/assistant-selection`
- The meter in the sidebar header — `../surface/mockup.html#material-light/assistant-chat`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| The whole document will not fit | The meter is red and the run is blocked, with an offer to process the selection | Select a smaller part |
| The provider rejects the request for length | `The document is too long for this model` · `Select a smaller part, or raise the context length in Settings → AI → Context.` | Do one of those |
| The reply was cut off | `The model ran out of room to answer` · `Raise Max output tokens in Settings → AI → Context, then try again.` | Raise it |
| The context length is set above the model's real ceiling | Nothing — the provider clamps silently and the app cannot tell | Set it to the model's real window |

## Edge cases

**The scope is switched while the meter is mid-estimate**
- *Trigger:* the *Apply to* control is toggled twice quickly.
- *Expected:* the latest estimate wins; a stale one is discarded.
- *Avoid:* an earlier estimate landing after a later one and showing the wrong scope's number.

**The document is edited while a run is in flight**
- *Trigger:* typing during an action.
- *Expected:* the meter keeps updating. The run uses the scope captured when it started.
- *Avoid:* re-reading the scope mid-run, which changes the prompt's inputs halfway through.

**The reply reserve is set higher than the context window**
- *Trigger:* a reserve of 16,384 against an 8,192-token window.
- *Expected:* the value is rejected, naming the acceptable range —
  `replyReserve ≤ maxOutputTokens < contextWindow`.
- *Avoid:* accepting it, producing a negative input budget and a meter that is red for an empty
  document.

**A selection of a few words on a very large document**
- *Trigger:* five words selected in a 200-page document, Proofread pressed.
- *Expected:* green. The scope is the selection, not the document.
- *Avoid:* estimating the document and blocking a run that would have fitted easily.

**The context length setting is changed while the sidebar is open**
- *Trigger:* raising it from 8,192 to 32,768.
- *Expected:* the meter's ceiling and its state update immediately, without a relaunch.
- *Avoid:* a stale ceiling, so the meter blocks a run that would now fit.

## Not this

- **No chunking of an over-long document.** Nothing defines chunk boundaries, overlap size, ordering, or
  how conflicting overlaps reconcile into **one** reviewable edit — and the last of those is the hard
  part, because the product's central promise is that every change arrives as a single proposal you
  review before applying. Building it would mean inventing the specification. Warn is therefore the only
  strategy, and the "If document exceeds context" control is not shipped: a segmented control with one
  option is not a choice.
- **No summarising of chat history.** Nothing defines the summary prompt, its output schema, how its own
  token cost is accounted for **while the gate is held**, or what happens when the summarising call
  itself fails. It is an inference inside an inference, unspecified at every one of those points. Sliding
  window is the only strategy, and the control is not shipped for the same reason.
- **No exact token counting.** Different models tokenise the same text differently, and asking the
  provider to count would be a network request on every keystroke.
- **No automatic raising of the context length.** The app never changes a provider setting on the user's
  behalf; the message names the setting instead.

## Decisions

- *2026-07-25* — Chunking and history summarising were both cut from v1, and their settings controls
  with them. Each was a segmented control with one real option.
- *2026-07-25* — The reply reserve follows the scope for rewrite actions. Recorded in
  `../../adr/0034-assistant-execution-contract.md`.
- *2026-07-10* — Token estimation is offline with an explicit context budget. Recorded in
  `../../adr/0009-tokenizer-context-budget.md`.

## Open questions

*(none — ready to build)*
