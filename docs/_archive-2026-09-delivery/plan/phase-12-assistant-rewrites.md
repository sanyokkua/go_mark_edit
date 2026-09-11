# Phase 12 — The assistant can proofread and rewrite my document

## What you get

A sidebar on the right with a list of things it can do to your writing — proofread it, turn it into a
Confluence page, restructure it as an article, summarise it, turn it into questions and answers. Pick
one, choose whether it applies to your selection or the whole document, and run it.

What comes back is a **proposal**, shown as a diff. Nothing changes in your document until you look at
it and click Apply.

## Build it in this order

1. **The sidebar.** Fill the region that has been reserved and empty since Phase 00. It collapses, it
   is themed, it is keyboard reachable, and it never covers the editor.
2. **The action catalog.** The preconfigured actions, each with its prompt and its expected output
   shape. Data, not code — adding an action is a catalog entry.
3. **Scope and fit.** Run against the selection or the whole document, with the token meter from
   Phase 11 telling you before you press the button whether it fits in the model's context.
4. **One run at a time.** A single bounded run against the provider, holding the process-wide gate so
   a second run cannot start; a second attempt is told the app is busy rather than queued silently.
   Progress is visible and the run can be cancelled.
5. **Propose, don't apply.** The result comes back as an edit proposal against the document revision
   it was generated from. Show it in the Phase 10 diff view. Apply goes through the document command
   seam from Phase 01 — a normal editor edit, one undo step. The assistant never writes a file.
6. **Show me what you sent.** Each action card has a disclosure revealing the exact system prompt,
   directive, guardrail suffix and delimited scope the run will send, with a copy button. The default
   provider is local and the default model is small, so a model ignoring an instruction is the normal
   failure — and "what did you actually ask it?" is the first question about a bad rewrite. It reads
   from the same composer the run uses, so it cannot drift, and it stores nothing.

## Where the details are

- Behaviour: `../spec/product/chatting-about-a-document.md`, `../spec/product/quick-actions.md`,
  `../spec/product/chatting-about-a-document.md`
- Architecture: `../spec/product/chatting-about-a-document.md`
- What it looks like: `../spec/surface/mockup.html` → `assistant-selection`, `assistant-chat`,
  `no-assistant`
- Decisions: every edit is a reviewable proposal applied through the editor's document-command seam
  (`../adr/0010-assistant-sidebar-apply-edit.md`); an offline tokeniser and an explicit context budget
  (`../adr/0009-tokenizer-context-budget.md`); one inference at a time through the shared gate

## Questions to settle first

- **Cancelling a run that is already in flight.** — _Settled 2026-07-25 by
  `../adr/0032-run-registry-and-shutdown-ordering.md`, recorded 2026-07-28._ One bound
  `CancelRun(runId)` against a mutex-guarded run registry. **Exactly one terminal outcome per run:** a
  run cancelled mid-flight surfaces as `CodeCancelled` and is normalised into the same result, log and
  event shape as one cancelled between steps, so the cancel-arrives-versus-work-completes race is
  resolved once in one place rather than at every call site. The message reports what actually
  **completed**, never the loop index.
- **A proposal against a document you have since edited.** Define what the proposal is anchored to and
  what happens when the buffer has moved on. Recommendation: offer only Re-run. Do not attempt partial
  hunk application against a base that no longer exists — that is how you silently corrupt someone's
  document.
- **Formatting after applying.** The sources mention an optional format-after-apply setting and define
  nothing about it. Recommendation: no setting, never auto-format after apply. The user can press
  Format.

## Done when

Select three badly written paragraphs, run Proofread, read the diff, apply it, and get exactly those
paragraphs improved and nothing else touched — in one undo step. Run an action on a whole document
that is too big for the model and be told before it runs, not after. Start a run and cancel it
halfway. Start a second run while one is going and be told the app is busy. Watch the network and see
requests only to your configured provider, only when you pressed something.

And the constraints every phase carries: start a run and confirm the trigger control itself becomes
Cancel, then cancel it and confirm one terminal outcome naming what completed; start a second run
during the first and confirm it is refused immediately rather than queued; confirm nothing reaches disk
until you press Apply and then save; the sidebar, the diff card and the token meter are reachable by
keyboard alone with a visible focus ring and work in three themes across light and dark; every new
string goes through `t()`; watch the network and confirm exactly one request per action you invoked.
All of it in a real build.
