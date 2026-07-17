# Handler and Agent Loop

The bound-handler envelope + single-flight gate contract, and the full bounded service-loop
implementation that the handler delegates to.

## Bound handler + gate (DD-47, F5, go-error-envelope.md)

`RunAgent` is a Wails-bound envelope: returns `apperr.RunResult`, takes **no** `context.Context`
parameter (Wails strips it from bound signatures — see `.claude/rules/go-error-envelope.md`), and is
panic-guarded via a named return + `defer/recover`. It holds the process-wide `internal/gate` for the
whole run: gate already held → `apperr.Busy()` (`busy`, DD-47); released in `defer` on **every** exit —
success, error, and cancel. `OnShutdown` cancels all in-flight runs so a held gate is never orphaned by
app exit.

```go
// internal/llm/agent/handler.go
func (h *AgentHandler) RunAgent(req RunAgentRequest) (res apperr.RunResult) {
    defer func() {
        if r := recover(); r != nil {
            wire := apperr.ToWire(h.zlog, apperr.Internal(fmt.Errorf("panic: %v", r)))
            res = apperr.RunResult{Error: &wire}
        }
    }()
    if !h.gate.TryAcquire() {
        wire := apperr.ToWire(h.zlog, apperr.Busy())
        return apperr.RunResult{Error: &wire}
    }
    defer h.gate.Release() // released on success, error, and cancel
    out, err := h.service.RunAgent(h.ctx, req)
    if err != nil {
        wire := apperr.ToWire(h.zlog, err)
        return apperr.RunResult{Error: &wire}
    }
    return apperr.RunResult{Data: &out}
}
```

This is the same envelope skeleton documented in `.claude/rules/go-error-envelope.md` (named return +
`defer/recover` → `apperr.Internal`; `Error *WireError`; happy path sets `Data`), with one addition
specific to this handler: the `TryAcquire`/`defer Release` pair around the single-flight gate.
`AgentHandler.RunAgent` and `verify.TestInference` share the *same* process-wide gate (DD-47) — at most
one inference runs app-wide, whether it's a chain run or a provider connectivity test.

## Bounded loop + cancellation (DD-40, DD-47, ADR-0008)

Hard **iteration** and **wall-clock** ceilings (configurable in AI Context; defaults: 8 iterations).
Check `ctx.Err()` at the top of every iteration **and** before each tool dispatch, so a cancel aborts
between turns or mid-tool — never mid-provider-call, since the HTTP round trip itself is not
interruptible mid-flight in this design. A clean stop at a limit reports `agent_limit`; a cancel reports
`cancelled`. These are the only two "stopped without final text" outcomes; both are terminal.

```go
func (s *service) RunAgent(ctx context.Context, req RunAgentRequest) (RunOutcome, error) {
    system   := s.actions.SystemPrompt(req.ActionID)          // family prompt, or chat/custom default
    tools    := s.tools.Schemas(scopeCaps(req))               // only tools valid for scope/workspace
    scoped   := s.readScoped(req.DocumentID, req.Scope)       // whole doc or selection from the
                                                               // appmodel canonical buffer (F2 accessor,
                                                               // DD-62/DD-64) — never the frontend editor
    messages := s.budget.Assemble(system, tools, scoped, req.History)

    var lastProposal *EditProposal
    for i := 0; i < s.maxIterations; i++ {
        if ctx.Err() != nil {
            return stopped(Cancelled), apperr.Cancelled()      // per-iteration cancel (DD-47)
        }
        if s.clock.Since(start) > s.maxWallClock {
            return stopped(TimeLimit), apperr.AgentLimit()      // wall-clock ceiling
        }
        s.emit("agent:progress", progress{RunID: req.RunID, Phase: "infer", Iteration: i})

        resp, err := s.provider.Chat(ctx, s.chatRequest(messages, tools, req.Stream))
        if err != nil {
            return RunOutcome{}, err                            // mapped ErrorCode → envelope
        }
        if len(resp.ToolCalls) == 0 {
            s.emit("agent:progress", progress{RunID: req.RunID, Phase: "final"})
            return outcome(resp.Content, lastProposal, FinalText), nil
        }
        messages = append(messages, assistantToolCallTurn(resp.ToolCalls))
        for _, call := range resp.ToolCalls {
            if ctx.Err() != nil {
                return stopped(Cancelled), apperr.Cancelled()   // abort mid-tool
            }
            s.emit("agent:progress", progress{RunID: req.RunID, Phase: "tool", Iteration: i, Tool: call.Name})
            obs, _ := s.tools.Dispatch(ctx, call)               // validates args; least-privilege
            messages = append(messages, toolObservation(call, obs))
            if call.Name == "propose_edit" {
                lastProposal = obs.Proposal                     // a diff, not a write
            }
        }
    }
    return stopped(IterationLimit), apperr.AgentLimit()          // bounded → agent_limit
}
```

Key structural points to preserve on any change to this loop:

- **Message assembly precedes the loop**: system prompt → tool schemas → scoped document/selection →
  history, via the explicit context budget (`s.budget.Assemble`; see `context-and-tokenizer` skill for
  the estimator/trimming details — out of scope here).
- **`lastProposal` is captured across iterations**, not just the final one — if the model proposes an
  edit and then keeps reasoning, the most recent proposal is still returned on `FinalText`.
- **Every provider call, tool dispatch, and phase transition emits `agent:progress`** with `req.RunID` —
  see `references/events-and-errors.md` for the full event contract.
- **Provider errors return immediately** (`return RunOutcome{}, err`) — they are already classified to a
  fixed `ErrorCode` by the provider/service layer (DD-48; `llm-provider-integration` skill), not
  reclassified here.
- **The loop never writes to disk or the editor buffer** — `propose_edit` observations only ever produce
  a diff (`EditProposal`), applied later via the F3/F7 seam (see `references/tools-registry.md`).

## Citations

DD-40 (bounded agent loop — iteration + wall-clock limits, cancellation checks), DD-47 (single-flight
gate + `busy`), ADR-0008 (agentic tool-call loop design), F5 (single-flight gate seam),
`.claude/rules/llm-integration.md` (Bounded agent loop, Single-flight gate + Busy sections),
`.claude/rules/go-error-envelope.md` (canonical bound-handler skeleton).
