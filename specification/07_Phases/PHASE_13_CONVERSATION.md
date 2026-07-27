# Phase 13 — I can have a conversation about my notes

## What you get

A chat in the assistant sidebar. Ask it about the document you are looking at, or about other files in
your workspace — it can list them and read them when it needs to. Answers stream in as they are
generated. You can give it standing instructions about how you like things written. Long conversations
keep working instead of falling over when they outgrow the model's context.

This is the last phase. After it, the product is done.

## Build it in this order

1. **Multi-turn chat.** A conversation per document, held in the backend like everything else, with
   the sidebar rendering a projection of it. Switching tabs switches conversation; closing a tab
   disposes it. Nothing is persisted across launches.
2. **Custom instructions.** Standing text the user writes once that is included in every run.
3. **The tool loop.** A bounded loop where the model may call a small set of read-mostly tools — read
   the document, read the selection, list workspace files, read a workspace file, propose an edit.
   Bounded by iteration count *and* wall-clock. Least privilege: allowlisted, no writes, no shell, no
   network of its own.
4. **Streaming.** Tokens appear as they arrive, with cancellation still working mid-stream.
5. **When it does not fit.** An explicit context budget. Warn before sending something too large.
   Trim old turns with a sliding window as the conversation grows.
6. **Polish and hardening.** A visible transcript of what the assistant did, the provider and model
   clearly shown, and the limits enforced rather than assumed.

## Where the details are

- Behaviour: `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `01_Product/18_TOKENIZER_AND_CONTEXT.md`
- Architecture: `02_Architecture/08_LLM_INTEGRATION.md#agent-loop`, `#tool-registry`
- What it looks like: `mockups/gomarkedit-mockup.html` → `assistant-chat`
- Decisions: DD-44, DD-49…DD-55, ADR-0009 (history strategy), ADR-0010

## Questions to settle first

- **Which files the assistant may read.** Settled: **the workspace root only**, filtered to
  `.md/.markdown/.mdown/.txt`, with path traversal rejected. Configured roots were cut on
  2026-07-25 (`01_Product/09_ASSETS_AND_SECURITY.md`), so this is the same allowlist the asset
  handler already uses — one rule, not two.
- **Tool limits.** Nothing defines a maximum number of files listed, bytes per read, or total
  observation size. Pick numbers — 500 files, 64 KB per read, 32 KB of total observation — with
  deterministic ordering and a visible truncation marker rather than silent cutting.
- **A stream that breaks halfway.** Keep the partial text, or throw it away and retry non-streaming?
  These produce different transcripts and can double-charge a provider. Recommendation: keep the
  partial text and do not replay automatically.

## Two features to cut from v1

Both are specified vaguely enough that building them would mean inventing the specification, and
neither is needed for the product to be good:

- **Chunking an over-context document.** Nothing defines chunk boundaries, overlap size, ordering, or
  how to reconcile conflicting overlaps into one reviewable edit. Warn that it does not fit, and let
  the user select less.
- **Summarising conversation history.** Nothing defines the summary prompt, its schema, its token
  accounting while the gate is held, or its failure fallback. Use the sliding window.

Write both cuts into `01_Product/18_TOKENIZER_AND_CONTEXT.md` rather than leaving them as unbuilt
promises.

## Done when

Open a folder of notes, ask the assistant a question that requires it to find and read a file it was
not given, and get a correct answer citing that file. Watch the answer stream in. Set a custom
instruction and see it change how the next answer is written. Have a long enough conversation that old
turns are trimmed, and watch it keep working. Ask it to rewrite a section, review the diff, apply it.
Cancel a response mid-stream. Then check the network trace: requests to your provider, only when you
pressed something, and nowhere else.
