# ADR-0010 — Assistant in a right sidebar; LLM edits applied via the editor command seam (never direct writes)

**Status:** accepted
**Date:** 2026-07-10
**Deciders:** project owner, architect

> **Historical vocabulary — this record is not rewritten.** The `DD-…` and `EC-…` identifiers below cite the retired 78-entry design-decision registry, last present in git at `e1bd33f` under `specification/00_Foundation/` as `04_DESIGN_DECISIONS.md`; every one of those decisions now lives in the sentence of the feature file that needs it. Links into `_archive-2026-07-28-specification/` are the pre-conversion specification, kept so a citation still resolves, and **not normative**. See `README.md`. A decision record says what was decided against what was known then, so neither is translated forward.
> A link beginning `07_Phases/` names a retired phase document that was deleted rather than archived; that set is in git at `e1bd33f`.

## Context and problem statement

The assistant has to live somewhere in the GoMarkEdit shell and has to have a way to turn a
model's suggested rewrite into an actual change in the user's document. Two coupled UX/architecture
questions follow: **where** does the assistant surface (and how do its settings fit the existing Settings
dialog), and **how** does an accepted LLM suggestion reach the editor buffer?

The answer must honor the constraints the rest of the app already sets. The pre-assistant shell was built with
forward-compatibility seams for exactly this feature: a reserved, previously-empty **right** layout region
(F1), a first-class document model with a content/selection accessor (F2), an editor **document-command**
interface exposing replace-range and replace-all (F3/F7), programmatic Format/Lint (F8), and a reusable
DiffView component (F9). Crucially, DD-42 requires that **all edits are proposals the user reviews** and
that nothing is written to disk except through the normal save/autosave path after the user applies a
change — the model must never write files, and no component may reach into the Monaco instance directly.
This ADR records the assistant's placement and its apply-path, and locks DD-38, DD-42, and DD-53. The
sidebar layout and interaction it describes are prototyped in `mockups/gomarkedit-mockup.html`.

## Decision drivers

- **A reserved home already exists.** The three-region layout reserves the right region and its show/hide
  plumbing (F1); the assistant should drop into it, not restructure the shell (DD-38).
- **Human-in-the-loop edits.** Every LLM edit must be a reviewable proposal the user explicitly applies,
  reviews by hunk, or discards — never an automatic mutation (DD-42).
- **One apply path, not two.** Applying a proposal must reuse the editor's existing document-command seam
  (replace-range for a selection, replace-all for the whole document) and the normal save/autosave path,
  so an AI edit is indistinguishable downstream from ordinary typing (DD-42, F3/F7).
- **No direct editor/disk access from the assistant.** No component may touch the Monaco instance or write
  a file directly; the model never writes files (DD-41, DD-42).
- **Settings belong in the existing dialog.** AI configuration should be dedicated tabs in the Settings
  dialog, not a separate window (DD-53).
- **Reuse, don't reinvent.** Diff rendering should reuse the standalone DiffView already used by the
  Format/Lint flow (F9), and Format-after-apply should reuse programmatic Format (F8).

## Considered options

- **Right sidebar + apply-via-command-seam** — the assistant is a right-hand sidebar (provider/model
  header, apply-to scope with a fit meter, quick actions, chat transcript, composer); proposals render as
  a diff in the sidebar and Apply routes through the editor's replace-range/replace-all command interface;
  AI settings are dedicated Settings tabs.
- **Inline auto-apply edits** — the model's rewrite is written straight into the buffer inline (optionally
  with post-hoc undo), no explicit review step.
- **Modal-dialog-per-action** — each action opens a modal dialog that shows the result and an apply
  button, with no persistent assistant surface.

## Decision outcome

Chosen: **the assistant lives in the reserved right sidebar, and every LLM edit is a diff the user applies
through the editor's document-command seam.** The sidebar (consuming F1) presents, top-to-bottom: a
provider/model header, an **apply-to scope** control (Whole document / Selection) with a **live token-fit
meter** (ADR-0009), a **quick-actions** bar, a **chat transcript**, and a **composer** for free-text
instructions (DD-38). It is hidden by default until a provider is configured.

An edit produced by the loop's `propose_edit` tool is a **diff**, never a write. The diff renders in the
sidebar using the reusable **DiffView** (F9); the user reviews the diff and either **Applies**, re-runs, or discards.
Apply routes through the editor's **document-command seam** — **replace-range** for a selection-scoped edit
(replacing only the selected range) or **replace-all** for a whole-document edit (F3/F7) — reading content
and selection through the first-class document accessor (F2), **never** by touching the Monaco instance
directly. The buffer then dirties and flows through the **same** normal save/autosave path as ordinary
typing; nothing is written to disk by the model or the loop (DD-42). Optionally, Format-after-apply reuses
the programmatic Format transform (F8). AI configuration lives in **dedicated Settings tabs**: **AI /
Providers** (provider, base URL, auth, model, params, the three Test buttons) and **AI Context** (estimator,
safety margin, reply reserve, over-context strategy, history strategy, max tool iterations) (DD-53).

### Consequences

- Positive: The assistant drops into the reserved right region with no shell restructuring; the shell,
  editor, and save path are unchanged (DD-38, F1).
- Positive: The user always reviews an edit as a diff before it lands, by hunk if they wish, and can
  discard — the model can never silently change the document (DD-42).
- Positive: One apply path — an AI edit is applied by exactly the same replace-range/replace-all commands
  and save/autosave flow as manual editing, so undo, dirty-state, autosave, and line-ending/BOM
  preservation all "just work" with no AI-specific code (F3/F7, DD-42).
- Positive: DiffView (F9) and programmatic Format (F8) are reused rather than reimplemented, and AI
  settings extend the existing Settings dialog rather than adding a window (DD-53).
- Negative: The persistent sidebar consumes horizontal space; on narrow windows the three-region layout
  must degrade gracefully (show/hide, responsive collapse).
- Negative: The review-and-apply step is an extra interaction versus auto-applying — a deliberate trade of
  a little friction for user control and safety.
- Neutral: The assistant depends on the F1–F10 seams being present and correct; if a pre-assistant story
  regressed a seam, the assistant surfaces it — this is by design (the seams are the contract).

## Pros and cons of the options

### Option A — Right sidebar + apply-via-command-seam (chosen)

- Good: Uses the reserved region and all the reserved seams; keeps a human in the loop for every edit; a
  single, well-tested apply/save path shared with manual editing; reuses DiffView and Format; settings fit
  the existing dialog; matches the approved mockup.
- Bad: Occupies screen width; adds a review step; couples the assistant to the correctness of the F1–F10
  seams.

### Option B — Inline auto-apply edits

- Good: Fewest clicks — the rewrite appears immediately; feels fast for trusted, tiny fixes.
- Bad: **Directly violates DD-42** — the model would mutate the document with no review; risks destructive
  or unwanted rewrites of large regions that undo alone poorly mitigates; undermines trust for exactly the
  content the user cares about. Rejected as unsafe and off-spec.

### Option C — Modal-dialog-per-action

- Good: Focused, one-thing-at-a-time; no persistent chrome consuming layout space.
- Bad: Modal churn breaks flow, blocks the editor while open, and fits **multi-turn chat and iterative
  custom instructions** poorly (DD-44); no persistent transcript, scope control, or fit meter; would need
  its own diff/apply plumbing rather than the shared seam. Rejected as a poor fit for an agentic,
  conversational assistant.

## Links

- Design decisions: **DD-38** (assistant right sidebar: provider/model header, apply-to scope + token-fit
  meter, quick actions, chat transcript, composer), **DD-42** (all edits are proposals; Apply writes via
  the editor document API; disk only through normal save/autosave), **DD-53** (AI settings in dedicated
  AI/Providers and AI Context Settings tabs). Related: DD-39 (action catalog), DD-43 (scope), DD-44
  (multi-turn chat / custom instructions), DD-49 (streaming into the transcript).
- Spec clauses: `../../_archive-2026-07-28-specification/00_Foundation/04_DESIGN_DECISIONS.md#11-llm-assistant`,
  `../../_archive-2026-07-28-specification/02_Architecture/08_LLM_INTEGRATION.md#forward-compat-seams`,
  `../../_archive-2026-07-28-specification/00_Foundation/06_IMPLEMENTATION_STAGES.md` (F1 three-region layout, F2 document accessor, F3/F7
  document-command seam, F8 programmatic Format/Lint, F9 reusable DiffView), and the assistant mockup
  `mockups/gomarkedit-mockup.html`.
- Stories: Phase 12 (assistant sidebar shell, scope + token meter, edit-proposal → diff → apply via editor
  command seam) and Phase 10 (Settings dialog that the AI tabs extend) per `07_Phases/00_ROADMAP.md`
  (authored per phase; none `done` at ADR time).
