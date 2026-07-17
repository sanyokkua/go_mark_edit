**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-39, DD-43, DD-44), `01_Product/14_LLM_ASSISTANT_OVERVIEW.md`, `01_Product/16_CHAT_AND_AGENTIC_WORKFLOW.md`, `01_Product/18_TOKENIZER_AND_CONTEXT.md`, `mockups/gomarkedit-mockup.html`

# Actions Library

Preconfigured **actions** are the one-click entry points to the assistant. Each ships as **data** —
not code — so the catalog is extensible and the same agentic loop (`16_CHAT_AND_AGENTIC_WORKFLOW.md`)
runs behind every button (DD-39). This document defines the action model and specifies every action
shipped in v1, plus the free-text custom-instruction path.

The quick-actions grid in `mockups/gomarkedit-mockup.html` is the visual reference:
Proofread, Improve clarity, Confluence, Article, Q&A, Summarize, and a full-width **Custom
instruction…** button.

## Table of Contents

1. [Action model](#action-model)
2. [Proofread](#proofread)
3. [Reformat targets](#reformat-targets)
4. [Confluence-Wiki](#confluence-wiki)
5. [Article](#article)
6. [Q&A](#qa)
7. [Other actions](#other-actions)
8. [Custom instruction](#custom-instruction)
9. [Extensibility](#extensibility)

## Action model

An action is a data record with these fields (DD-39):

- **id** — stable machine identifier (e.g. `proofread`, `reformat.confluence`), used by stories,
  telemetry-free logs, and the run transcript.
- **label** — the user-facing button text (e.g. "Proofread"), routed through the i18n layer (DD-35).
- **category** — grouping for the actions bar and future menus (e.g. *Correct*, *Reformat*,
  *Summarize*, *Rewrite*).
- **system prompt** — the role/behaviour framing sent as the system message; kept concise because tool
  schemas and system prompts consume the context budget (DD-51; `18_TOKENIZER_AND_CONTEXT.md#context-budget`).
- **directive** — the specific instruction that seeds the loop ("Fix grammar and typos…").
- **default scope** — **Selection** or **Whole document** used when the user has not overridden it
  (DD-43); the runtime default-scope resolution (selection-if-present) still applies
  (`14_LLM_ASSISTANT_OVERVIEW.md#scope-selection-vs-document`).

**Invariant — everything is a proposal.** No action writes to the file or the buffer directly. An
action runs the loop, which may read context and return a **reviewable diff**; the user Applies,
reviews hunks, or discards (DD-42; `16_CHAT_AND_AGENTIC_WORKFLOW.md#apply-and-diff`). This holds for
every action below and for custom instructions.

**Preservation contract.** Each action's spec below names what it **must preserve**. Unless an action
explicitly transforms structure (the reformat targets), actions must **preserve valid Markdown, code
blocks, links, and the document's meaning** — they correct or improve prose, they do not silently drop
content.

Each action spec uses four fields: **Intent**, **Must preserve**, **Expected output**, **Default
scope**.

## Proofread

- **Intent.** Fix grammar, spelling, punctuation, and typos, and apply a **consistent** style
  (capitalization, hyphenation, spacing) across the scope.
- **Must preserve.** **All formatting and all meaning** (DD-39). Headings, lists, tables, links, images,
  code fences, inline code, math, and admonitions stay byte-for-byte intact except where a fix falls
  inside prose text. No rephrasing beyond what a correction requires; no added or removed sentences.
- **Expected output.** A proposed edit whose diff touches only corrected spans (the mockup shows
  `exited→excited`, `anounce→announce`, `relase→release`, … "Fixed 9 spelling/grammar issues;
  formatting and meaning preserved"). A one-line summary of what was fixed accompanies the card.
- **Default scope.** Selection if present, else Whole document (mirrors the runtime default).

## Reformat targets

The **Reformat** category rewrites the document's **structure and presentation** for a specific
destination while keeping the underlying information. Unlike Proofread, these actions *are* allowed to
restructure — that is their intent — but they **must not invent facts or drop information**; they
re-shape existing content. The shipped reformat targets are aimed at development and writing workflows:
**Confluence/Wiki**, **Article**, and **Q&A**. Each is specified below. All three default to **Whole
document** (structure changes are document-level), overridable to Selection.

Common preservation contract for reformat targets: preserve the **factual content**, code blocks
(verbatim), and links; produce **valid Markdown** at the app's active standard
(`04_MARKDOWN_STANDARDS.md`). Reformatting returns a proposed edit like any other action (DD-42).

## Confluence-Wiki

- **Intent.** Reformat the document into a **Confluence / wiki page** shape: a clear title, a short
  lead/summary, sectioned `##`/`###` headings, and wiki-friendly constructs (info/note callouts as
  admonitions where the standard allows, tables for structured data, a table-of-contents-friendly
  heading hierarchy).
- **Must preserve.** All facts, code blocks (verbatim), and links; convert rather than discard content
  that does not map cleanly.
- **Expected output.** A proposed edit rewriting the document into wiki-page structure; a summary noting
  the structural changes.
- **Default scope.** Whole document.

## Article

- **Intent.** Reformat into a **readable article/blog** shape: an engaging title, an intro paragraph,
  logically ordered sections with prose transitions, and a brief conclusion. Tightens flow without
  changing facts.
- **Must preserve.** Meaning, facts, code blocks, and links; do not add claims not present in the
  source.
- **Expected output.** A proposed edit presenting the same information as flowing article prose.
- **Default scope.** Whole document.

## Q&A

- **Intent.** Reformat into a **question-and-answer** / FAQ structure: derive natural questions from the
  content and answer them from the document, using a consistent `### Question` / answer pattern (or a
  definition-list style where the standard supports it).
- **Must preserve.** The answers must be **grounded in the document** — no fabricated Q&A pairs; code
  and links preserved.
- **Expected output.** A proposed edit rendering the content as Q&A pairs; a summary of how many pairs
  were produced.
- **Default scope.** Whole document.

## Other actions

Additional shipped actions (data records like the rest):

- **Summarize** — *Intent:* produce a concise summary of the scope (a lead paragraph and/or bullet
  points). *Must preserve:* factual accuracy; no invented detail. *Expected output:* by default a
  proposed edit that **prepends or replaces** with the summary per its directive, or, when invoked as a
  question in chat, a summary message with no edit. *Default scope:* Whole document.
- **Improve clarity** — *Intent:* rewrite for clarity and readability (shorter sentences, plainer
  wording) without changing meaning. *Must preserve:* meaning, formatting, code, links. *Expected
  output:* a proposed edit. *Default scope:* Selection if present, else Whole document.
- **Make formal** — *Intent:* raise the register to a formal/professional tone. *Must preserve:*
  meaning, structure, code, links. *Expected output:* a proposed edit. *Default scope:* Selection if
  present, else Whole document.
- **Make concise** — *Intent:* tighten wording and remove redundancy while keeping every point.
  *Must preserve:* all distinct points, meaning, code, links. *Expected output:* a proposed edit.
  *Default scope:* Selection if present, else Whole document.

The exact shipped set is finalized in the catalog module (`internal/llm/actions/`); the mockup shows a
representative subset in the actions grid. Adding or removing an item is a data change (see
[Extensibility](#extensibility)).

## Custom instruction

The **Custom instruction…** button (full-width, dashed, at the foot of the actions grid) and the
composer are the free-text path (DD-39, DD-44). The user's text becomes the loop's **directive** over
the current scope, with a neutral general-purpose system prompt; it bypasses the catalog entirely. This
is how a user runs an intent no shipped action covers ("Turn the second section into a table", "Rewrite
in British English"). It obeys the same proposal/preservation/apply rules as catalog actions.

- **EC-LLM-17** — an empty custom instruction is a no-op: the composer send is disabled until non-blank,
  and a whitespace-only submission is ignored rather than starting a run. (Distinct from EC-LLM-11, the
  empty-**selection** fallback in `14_LLM_ASSISTANT_OVERVIEW.md#scope-selection-vs-document`.)

## Extensibility

Because actions are data (id, label, category, system prompt, directive, default scope), **new actions
are added without code changes where possible** (DD-39): a new record in the action catalog
(`internal/llm/actions/`) surfaces a new button. Labels flow through i18n (DD-35), so a locale adds
translations without touching action logic. The custom-instruction path guarantees that *any*
uncatalogued intent is still reachable, so the shipped catalog is a convenience layer, not a ceiling.

Constraints on additions: an action must fit the proposal model (read context → return message and/or
diff), must declare a default scope, and must keep its system prompt concise to respect the context
budget (DD-51). An action may **not** introduce a new tool or a write-to-disk capability — the tool set
is fixed and least-privilege (DD-41; `16_CHAT_AND_AGENTIC_WORKFLOW.md#tool-scope`).
