# Phase 10 — The assistant can proofread and rewrite my document

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
   Phase 09 telling you before you press the button whether it fits in the model's context.
4. **One run at a time.** A single bounded run against the provider, holding the process-wide gate so
   a second run cannot start; a second attempt is told the app is busy rather than queued silently.
   Progress is visible and the run can be cancelled.
5. **Propose, don't apply.** The result comes back as an edit proposal against the document revision
   it was generated from. Show it in the Phase 08 diff view. Apply goes through the document command
   seam from Phase 01 — a normal editor edit, one undo step. The assistant never writes a file.

## Where the details are

- Behaviour: `01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `01_Product/15_ACTIONS_LIBRARY.md`,
  `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`
- Architecture: `02_Architecture/08_LLM_INTEGRATION.md`
- What it looks like: `mockups/gomarkedit-mockup.html` → `assistant-selection`, `assistant-chat`,
  `no-assistant`
- Decisions: DD-39…DD-44, DD-48…DD-53, ADR-0009, ADR-0010; the gate is DD-47

## Questions to settle first

- **Cancelling a run that is already in flight.** Cancellation is required and nothing defines the
  bound method, the run registry, what happens when cancel and completion race, or which of the two
  produces the terminal result. Define exactly one terminal outcome per run.
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
