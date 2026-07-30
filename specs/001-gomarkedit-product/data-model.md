# Phase 1 Data Model: GoMarkEdit Product

This is the logical product model. It records authority, identity, relationships, validation, and
state transitions without prematurely choosing future SQL tables or bridge DTOs.

## Authority map

| Entity                                           | Canonical owner                                         | Durable?                                                   | First real stage                           |
| ------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Document, Tab Set, Workspace, Application Layout | Go application model                                    | Document bytes on disk; selected layout/settings in SQLite | Viewer                                     |
| Editor Working Copy                              | Active Monaco session through the document command seam | No                                                         | Existing limited slice; expanded in Editor |
| Appearance Preference, Setting                   | Go settings service; applied projection in UI           | SQLite                                                     | Existing/theme frontier                    |
| Provider Profile                                 | Go service/repository                                   | Profile metadata only; never secret values                 | Assistant actions                          |
| Assistant Action                                 | Canonical application catalogue                         | Bundled static data                                        | Assistant actions                          |
| Assistant Run, Proposal                          | Go-owned run/document services with projected UI state  | Session only unless a later approved rule says otherwise   | Assistant actions                          |
| Transcript                                       | Per-document session state                              | No; discarded on tab close and relaunch                    | Assistant chat                             |

## Document

Fields: stable document ID; optional canonical path; canonical text accessor; disk baseline and
revision; encoding/BOM/line-ending metadata; modified, read-only, and preview-paused flags; per-document
arrangement, caret, selection, editor scroll, preview scroll, and reading state.

Relationships: belongs to one Tab Set while open; may resolve assets through its folder and the active
Workspace; owns at most one Editor Working Copy; may own one session Transcript and current Proposal.

Validation: supported picker extensions are `.md`, `.markdown`, `.mdown`, and `.txt`; binary input is
refused; above 50 MB is refused, above 10 MB is read-only, above 2 MB pauses live preview; canonicalized
asset paths may not escape allowed roots.

Transitions: `pathless-clean -> pathless-modified -> saved`; `disk-clean <-> modified` through editing
and acknowledged save/reload; any editable state may become `external-change-pending`; a write succeeds
atomically or leaves both original disk content and canonical modified content intact. Close never
discards modified content without an explicit decision.

## Editor Working Copy

Fields: bound document ID; session token/handle; immediate text; caret and selection; view state;
pending synchronization revision; last acknowledged canonical revision.

Validation: every command resolves a live identity-bound session. Flush completes before tab switch,
close, save, export, blur consumer, or Assistant read. A failed or stale acknowledgement changes
neither the active document nor canonical state.

Transitions: `clean -> pending -> acknowledged`; `pending -> failed` retains the last acknowledged
canonical state and visible working copy. Backend projection never echoes full content into the
focused editor.

## Tab Set

Fields: ordered document IDs; optional active ID; monotonic revision; recently closed identities.

Validation: at most 40 open documents; a canonical path appears once; stale reorder/close revisions are
rejected atomically; zero documents is a valid state.

Transitions: open/focus; reorder; close after flush and optional discard decision; close-last to empty;
reopen closed where the document contract permits.

## Workspace

Fields: optional canonical root; lazy entry tree; enumeration generation; loading/error/empty/filter
state; supported-file allowlist.

Validation: at most 20,000 enumerated entries and 12 levels; list displays at most 1,000 results;
absolute paths, traversal, and symlink escapes are rejected before access. Mutations are limited to
non-conflicting create file/folder, reveal, and copy path.

Transitions: absent -> opening -> open or failed; open -> refreshing -> open; replacement requires the
specified unsaved-work decision. No rename, move, delete, or disk reorder transition exists.

## Application Layout

Fields: window bounds/state; workspace and assistant visibility/width; split arrangement and divider;
acknowledged revision/timestamp per setting.

Validation: minimum 375 x 480 px; panes remain clamped with at least one document pane visible.
Discrete changes persist immediately; continuous changes persist after a pause; latest acknowledged
write across windows wins and does not reopen content.

## Appearance Preference

Fields: theme (`glass`, `material`, `minimal`); appearance choice (`auto`, `light`, `dark`); resolved
mode (`light`, `dark`); palette generation/version.

Validation: choice and resolved mode remain distinct. Material and Auto are defaults. Every consumer
uses the single token source; stale asynchronous renders are discarded.

Transitions: a theme or explicit mode write is acknowledged before becoming durable; Auto resolution
may change live without changing the stored choice; startup applies the acknowledged palette before
the first visible frame.

## Setting

Fields: stable namespaced key; group; type; accepted values/range; default; acknowledged value.

Validation: values outside the catalogue are rejected, not clamped; unknown stored keys are ignored;
each missing/invalid value falls back independently. Reset affects only the selected scope.

Transitions: `draft -> validating -> acknowledged` or `rejected`; a failed write leaves the prior
acknowledged value active.

## Provider Profile

Fields: stable ID; provider kind; endpoint; authentication mode; credential environment-variable name;
selected model; retained model filter; optional inference values; verification/capability results.

Validation: kinds are the six specified providers; credential values are never stored or returned;
optional parameters remain absent until set; reply reserve must be no greater than maximum output,
which must be less than context window.

Transitions: `draft -> tested` without persistence; `draft/tested -> saved`; test failures are
classified and do not prevent saving unless a governing rule explicitly requires it.

## Assistant Action

Fields: stable ID; localized label; family; directive; prerequisites; default scope; preservation
contract.

Validation: family is Correct, Reformat, Summarize, or Rewrite. Scope precedence is explicit choice,
non-empty selection, action default, then whole document. Unsupported prerequisites disable the action
with a reason rather than creating a different flow.

## Assistant Run

Fields: run ID; frozen provider/model; resolved scope snapshot; exact prompt; token allocation;
attempt/iteration counts; wall-clock deadline; cancellation state; observations; terminal outcome.

Relationships: may create at most one Proposal; chat-started runs append visible Transcript entries;
shares the application-wide long-operation gate with other long operations.

Validation: one gated run application-wide; retries do not consume iterations; per-attempt timeout is
bounded by remaining wall time; every content and tool argument is bounded and treated as inert data.

Transitions: `created -> running -> succeeded | failed | cancelled | timed-out | limited`; exactly one
terminal transition releases the gate. A provider/model change while running affects only the next run.

## Proposal

Fields: proposal ID; document ID; base document revision; exact scope/range and source text; replacement
text; review difference; status.

Validation: one proposal per run; empty, partial, over-context, or unparsable output never becomes a
proposal; Apply requires matching document identity, base revision, and source scope.

Transitions: `reviewable -> applied | discarded | superseded | stale`; Apply is one undoable in-memory
edit and never saves; Re-run supersedes through a new request; stale cannot force-apply.

## Transcript

Fields: document ID; ordered user/assistant/observation/proposal/terminal entries; visible full history;
trimmed model-context view.

Validation: session-only and document-scoped; trimming never removes the current directive or scoped
content from model context and never hides older visible turns from the user.

Transitions: created on first run; switches with active tab; destroyed on tab close or process exit.
