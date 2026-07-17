**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-32, DD-38–DD-55), `00_Foundation/06_IMPLEMENTATION_STAGES.md` (Stage 3, F1–F9), `01_Product/15_ACTIONS_LIBRARY.md`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `01_Product/17_PROVIDERS_MODELS_SETTINGS.md`, `01_Product/18_TOKENIZER_AND_CONTEXT.md`, `01_Product/11_SETTINGS.md`, `mockups/gomarkedit-mockup.html`

# LLM Assistant — Overview

The LLM Assistant adds AI-powered proofreading, reformatting, chat, and custom instructions over the
open document. It is the third and final implementation stage (`06_IMPLEMENTATION_STAGES.md` §1); it
must not exist in Stages 1–2, and it drops into the seams those stages reserved (F1–F9) without
restructuring the Viewer or Editor. This document defines the assistant surface, its interaction
modes, its scope model, and its privacy/network posture. The detailed behaviour of each part is
specified in the four companion documents (15–18).

The canonical visual reference is `mockups/gomarkedit-mockup.html`: the right-hand sidebar,
the provider chip, the scope segmented control with token meter, the quick-actions grid, the chat
transcript with tool-call rows and a proposed-edit card, and the composer.

## Table of Contents

1. [Assistant sidebar](#assistant-sidebar)
2. [Modes: actions, chat](#modes-actions-chat)
3. [Scope: selection vs document](#scope-selection-vs-document)
4. [Privacy and network](#privacy-and-network)
5. [Forward-compat](#forward-compat)

## Assistant sidebar

The assistant lives in a **right-hand sidebar** — the third region of the app shell's three-region
layout (left file tree, centre document area, right assistant; F1) (DD-38). It can be shown or hidden.
It occupies the reserved right-region slot at a fixed comfortable width (~360 px in the mockup) and
collapses to zero width when hidden; showing or hiding it never reflows or restructures the
Editor/Viewer (F1).

**Composition, top to bottom** (matches the `.assistant` column of the mockup):

- **Header** — the label "Assistant" and a **provider/model chip** (e.g. `Ollama · qwen2.5:7b ▾`) with
  a status dot. Clicking the chip opens the **AI / Providers** settings tab
  (`17_PROVIDERS_MODELS_SETTINGS.md`).
- **Scope + token meter** — an *Apply to* segmented control (**Whole document** / **Selection**) and a
  live **token-fit meter** (a bar plus `≈ N tokens … · fits · M ctx`) that re-estimates as scope
  changes (DD-43, DD-50; see `18_TOKENIZER_AND_CONTEXT.md#fit-meter`).
- **Quick-actions bar** — a grid of preconfigured action buttons (Proofread, Improve clarity,
  Confluence, Article, Q&A, Summarize) plus a full-width **Custom instruction…** button
  (`15_ACTIONS_LIBRARY.md`).
- **Chat transcript** — the multi-turn conversation for the active document, including assistant text,
  tool-call rows, and proposed-edit cards (`16_CHAT_AND_AGENTIC_WORKFLOW.md`).
- **Composer** — a free-text input with a send button, a context row (current document; workspace
  files when a folder is open), and a model/temperature chip row.

**Show / hide.** The sidebar is toggled from the title-bar action (the `✦` button) and the keyboard
shortcut **Ctrl/Cmd+J** (registered in `12_KEYBOARD_SHORTCUTS.md`). Its shown/hidden state persists per
the settings/KV store.

**Default visibility.** The sidebar is **hidden by default until a provider is configured** (DD-38).
On a fresh install no provider is set up, so the assistant stays collapsed and the title-bar toggle,
when used, surfaces a short "Configure a provider to use the assistant" affordance that deep-links to
the **AI / Providers** settings tab. Once a provider is saved and verified, the sidebar becomes
available and remembers its last shown/hidden state.

**States.** The sidebar has these top-level states: **Unconfigured** (no provider — actions/composer
disabled, prompt to configure), **Ready** (provider configured and idle — actions/composer enabled),
**Busy** (a run is in flight — a single-flight gate holds; new runs are refused with a Busy notice,
DD-47), and **Error** (last run surfaced an error via the standard Result-envelope/toast path, DD-48).
The status bar mirrors this (`● <provider> connected`, `Assistant ready` / `Assistant busy…`).

## Modes: actions, chat

The assistant offers **three interaction modes**, all backed by the same agentic tool-call loop
(`16_CHAT_AND_AGENTIC_WORKFLOW.md#agentic-loop`); they differ only in what seeds the loop:

1. **Preconfigured actions** — one-click buttons from the action catalog. Each carries a fixed system
   prompt and directive (e.g. Proofread, Summarize) and a default scope; clicking one starts a run over
   the current scope (DD-39; `15_ACTIONS_LIBRARY.md`).
2. **Chat** — free-form, **multi-turn** conversation about the open document. The user asks questions
   or gives instructions in natural language; the assistant may read the document/selection and (when a
   folder is open) workspace files, and may propose edits. History is kept per document/tab for the
   session (DD-44; `16_CHAT_AND_AGENTIC_WORKFLOW.md#chat`).
3. **Custom instructions** — a free-text directive (the composer, or the **Custom instruction…**
   action). The user's text becomes the loop's directive over the current scope; this is the "action
   you didn't ship" path and reuses the identical loop (DD-39, DD-44).

All three converge on the same outcome contract: the model gathers context with read tools and returns
either an **assistant message**, a **proposed edit** (a reviewable diff — never a direct file write,
DD-42), or both. There is no fourth "silent apply" mode.

## Scope: selection vs document

Every action and instruction runs against a **scope**: the **Selection** or the **Whole document**
(DD-43). The *Apply to* segmented control in the sidebar header sets it explicitly, and the token meter
re-estimates immediately when it changes (the mockup switches `≈ 1,480 tokens of document` ↔
`≈ 96 tokens of selection`).

**Default scope resolution.** The scope for a run is resolved by this fixed precedence (highest first),
which keeps the behaviour unambiguous and testable:

1. **Explicit user choice** — if the user has set the *Apply to* control for this run, that value wins
   (DD-43).
2. **Non-empty selection** — otherwise, if the editor has a non-empty selection when the run starts,
   scope is **Selection** (DD-43, the selection-if-present rule).
3. **Action's catalog default** — otherwise, if the invoked action declares its own default scope, that
   value is used (DD-39; `15_ACTIONS_LIBRARY.md#action-model`).
4. **Global setting** — otherwise the *Default action scope* setting applies (default **Whole document**;
   `11_SETTINGS.md#editor-group`, `#defaults`).

Steps 3–4 both resolve to **Whole document** by default, so with no selection and no override a run
targets the whole document, consistent with DD-43. The user can always override per run via the *Apply
to* control.

**Apply semantics.** A **Selection**-scoped edit replaces only the selected range in the buffer; a
**Whole document**-scoped edit replaces the whole buffer — both via the document-command seam (F3/F7),
never by touching the editor widget directly (DD-42; `16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff`).

- **EC-LLM-11** — Scope is **Selection** but the selection is empty (or was cleared before the run
  starts): the assistant falls back to **Whole document** and reflects the change in the scope control
  and token meter, rather than running on an empty input.

## Privacy and network

The assistant is the app's **only** source of outbound network traffic, and it is strictly
user-initiated (DD-32 as revised for Stage 3, DD-54).

- **Document text leaves the machine only on a user action** — invoking an action, sending a chat
  message, or applying a custom instruction — and **only to the single provider the user configured**.
  No document content is sent in the background, on load, on save, or on idle.
- **The app makes no other network calls, ever** — no update checks, no telemetry, no analytics, no CDN
  or asset fetches (DD-32, DD-33). All rendering assets remain bundled (Stages 1–2 invariant).
- **The default provider is local** (e.g. Ollama / LM Studio), so a default install keeps every byte of
  document text **on-device** (DD-32, DD-54; `17_PROVIDERS_MODELS_SETTINGS.md#defaults-local`). Remote
  providers (OpenAI, Azure, generic compatible) are strictly opt-in and require the user to enter their
  own endpoint and credential reference.
- **Credentials are never persisted or logged.** API keys are referenced only by **environment-variable
  name**; the value is read from the environment at request time and never written to the KV store, the
  `providers` table, or any log (DD-45; `17_PROVIDERS_MODELS_SETTINGS.md#auth-env-var`).
- **This is stated plainly to the user.** The **Content & privacy** settings tab states that LLM
  requests go only to the configured provider and only on user action, that telemetry/auto-update are
  never present, and that a local provider keeps everything on-device (DD-54; mockup Content & privacy
  pane: `LLM requests — Only to your configured provider, only when you act — on-demand`).

## Forward-compat

Stage 3 is **additive only**: it consumes the seams Stages 1–2 reserved (`06_IMPLEMENTATION_STAGES.md`
§3) and does not change the Viewer/Editor contracts destructively.

- The sidebar occupies the **reserved right-region slot** (F1) — the three-region shell and its
  show/hide plumbing already exist; Stage 3 fills the slot rather than restructuring the layout (DD-38).
- Reading the document and selection, and applying edits, go through the **document-command seam**
  (F2/F3/F7) — the same interface Stage 2 made editable. No assistant component reaches into the editor
  widget directly (DD-42).
- The **single-flight gate** (F5), the `apperr` Result-envelope path, logging, and file services are
  reused as-is; inference becomes "a long operation" the generic gate guards (DD-47).
- The offline invariant was always **scoped, not absolute** (F6): "no *background/unsolicited* network".
  The user-invoked provider client slots into the reserved HTTP-client seam without fighting the
  architecture (DD-32).
- The settings registry accepts the new **AI / Providers** and **AI Context** groups and the additive
  `providers` table as growth, not rewrite (F4; `17_PROVIDERS_MODELS_SETTINGS.md#persistence`).
- Diff rendering (F9), and the Format/Lint transforms as callable functions (F8), are reused by the
  proposed-edit card and post-apply cleanup.

This document, and 15–18, describe **Stage 3 only**. No behaviour here may be present in a Stage-1/2
build.
