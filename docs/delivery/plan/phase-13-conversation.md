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
   Bounded by iteration count _and_ wall-clock. Least privilege: allowlisted, no writes, no shell, no
   network of its own.
4. **Streaming.** Tokens appear as they arrive, with cancellation still working mid-stream.
5. **When it does not fit.** An explicit context budget. Warn before sending something too large.
   Trim old turns with a sliding window as the conversation grows.
6. **Polish and hardening.** A visible transcript of what the assistant did, the provider and model
   clearly shown, and the limits enforced rather than assumed.

## Where the details are

- Behaviour: `../spec/product/chatting-about-a-document.md`, `../spec/product/how-much-fits-in-context.md`
- Architecture: `../spec/product/chatting-about-a-document.md#loop-is-bounded`, `#tool-registry`
- What it looks like: `../spec/surface/mockup.html` → `assistant-chat`
- Decisions: chat is multi-turn per document for the session and is not persisted across launches;
  history is trimmed by a sliding window (`../adr/0009-tokenizer-context-budget.md`); edits stay
  reviewable proposals (`../adr/0010-assistant-sidebar-apply-edit.md`)

## Questions to settle first

- **Which files the assistant may read.** Settled: **the workspace root only**, filtered to
  `.md/.markdown/.mdown/.txt`, with path traversal rejected. Configured roots were cut on
  2026-07-25 (`../spec/product/images-and-remote-content.md`), so this is the same allowlist the asset
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

Write both cuts into `../spec/product/how-much-fits-in-context.md` rather than leaving them as unbuilt
promises.

## Done when

Open a folder of notes, ask the assistant a question that requires it to find and read a file it was
not given, and get a correct answer citing that file. Watch the answer stream in. Set a custom
instruction and see it change how the next answer is written. Have a long enough conversation that old
turns are trimmed, and watch it keep working. Ask it to rewrite a section, review the diff, apply it.
Cancel a response mid-stream. Then check the network trace: requests to your provider, only when you
pressed something, and nowhere else.

And the constraints every phase carries: confirm the transcript is per document and gone after a
relaunch; confirm a tool call outside the workspace root is rejected before anything is read; confirm
an over-context document is refused before the request is sent rather than truncated; cancel a run
mid-tool-call and confirm one terminal outcome; the whole sidebar is reachable by keyboard alone with a
visible focus ring and works in three themes across light and dark; every new string goes through
`t()`; watch the network and confirm exactly one request per turn you sent. All of it in a real build.
