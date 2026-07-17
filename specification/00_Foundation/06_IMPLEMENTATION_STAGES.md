**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `07_Phases/00_ROADMAP.md`, `04_DESIGN_DECISIONS.md`, `02_Architecture/01_SYSTEM_ARCHITECTURE.md`, `02_Architecture/08_LLM_INTEGRATION.md`

# Implementation Stages

GoMarkEdit is delivered in **three high-level stages**. A stage is a coarse milestone that produces a
**fully working, shippable app**; it groups the fine-grained **phases** (`07_Phases/`) which in turn
group the **stories** (`../docs/stories/`). Stages are the "where are we" axis; phases/stories are the
"what to build next" axis.

The governing rule: **each stage must ship a working app, and each stage must leave the seams open for
the next stage without hard-coding decisions that would block it.** A stage may build less, but it must
not build a wall.

## Table of Contents

1. The three stages
2. Stage → phase mapping
3. Forward-compatibility constraints (per stage)
4. What each stage explicitly does NOT build
5. Stage exit criteria

## 1. The three stages

- **Stage 1 — Markdown Viewer.** The complete application shell and read path: open and render single
  files, open a folder as a filtered workspace tree, theming (3 themes × light/dark/auto), OS
  file associations, local/remote asset handling, and distraction-free reading mode. **Rendered, not
  editable.** Fully offline. (Multiple document tabs arrive with Phase 02 in Stage 2 — see §2 and
  `04_DESIGN_DECISIONS.md` §12.)
- **Stage 2 — Markdown Editor.** Adds the write path on top of the working Viewer: the source editor,
  new/open/save/save-as, autosave, dirty state, encoding/line-ending preservation, the rich formatting
  toolbar and keyboard shortcuts, Format/Compact/Lint, and PDF export. Still fully offline.
- **Stage 3 — LLM Assistant.** Adds the right-hand assistant sidebar on top of the working Editor:
  provider/model configuration, an agentic tool-call loop, preconfigured actions (Proofread, reformat
  targets, summarize…), chat and custom instructions, selection/whole-document scope, tokenizer-based
  context fitting, and apply-as-diff into the editor. Introduces the app's only outbound network
  (LLM calls to the user-configured provider; local by default).

Each stage is usable on its own: Stage 1 is a capable Markdown viewer; Stage 2 is a full editor; Stage 3
is the editor plus an AI assistant.

## 2. Stage → phase mapping

Phases are defined in `07_Phases/00_ROADMAP.md`. Their grouping into stages:

| Stage | Phases | Delivers |
|---|---|---|
| **Stage 1 — Viewer** | 00 (scaffold), 01 (render/preview only), 03 (folder workspace + recent), 04 (rendering & extensions), 07 (file associations), 08 (theming & settings shell), 09 (assets & security) | Boots, opens & renders files/folders, themes, associations, reading mode |
| **Stage 2 — Editor** | 02 (file I/O + tabs write path), 05 (format & lint), 06 (PDF export), + the editing parts of 01/08 | Full create/edit/save/export editor |
| **Stage 3 — Assistant** | 11 (LLM foundation), 12 (actions & proofread/reformat), 13 (chat & agentic tool loop + workspace access), 14 (context budgeting, tokenizer, polish) | AI assistant sidebar |

> Note: Phase 01 spans stages — its *render/preview* stories are Stage 1; its *editing* stories are
> Stage 2. Phase 08's *theming + settings shell* is Stage 1; the *AI settings tabs* land in Stage 3.
> Phase 10 (i18n & packaging) is cross-cutting and finalized per stage as each ships.

## 3. Forward-compatibility constraints (per stage)

These are **binding**: a Stage-1/2 story that violates one is not `done`. They ensure the later stages
drop in without rework.

### Stage 1 must leave open

- **F1 — Three-region layout.** The app shell is a horizontal three-region layout: **left** (file
  tree), **center** (document area), **right** (assistant). In Stage 1 the right region is **absent/empty
  and collapsed**, but the layout, its show/hide plumbing, and its CSS grid/flex slot **exist and are
  reserved**. Adding the assistant in Stage 3 must not restructure the shell. (DD-38)
- **F2 — Document model with a stable identity + content accessor.** Each open document/tab is a
  first-class model with an id, path, and a **read accessor for its content and (later) selection**. In
  Stage 1 content is read-only; the model and its accessor interface are shaped so Stage 2 can make it
  editable and Stage 3 can read content/selection through the **same interface**. Do not model a
  document as a bare string passed around ad hoc.
- **F3 — A document-command seam.** Define (even if minimally implemented) a **document command
  interface** — the single point through which content is read and (later) mutated. Stage 2 implements
  mutation (edit/replace-range/replace-all); Stage 3's apply-edit calls it. No component should reach
  into the editor widget directly.
- **F4 — Settings registry that can grow.** Settings are a typed, grouped registry backed by the KV
  store. Stage 1 ships Appearance/Markdown/Content groups; the registry and its persistence must accept
  **new groups (AI / Providers, AI Context) without schema rewrites** — migrations are additive, and the
  `providers` table may be introduced later as a new additive migration.
- **F5 — Backend seam packages reserved.** The DI root, `apperr` envelope, logging, gate, and file
  services exist. The **single-flight gate** is generic (guards "a long operation"), so Stage 3 reuses
  it for inference. No Stage-1 decision may assume single-instance (multi-instance holds, DD-08).
- **F6 — Offline invariant is scoped, not absolute.** Stage 1/2 make zero network calls. Do not hard-code
  a "the app must never open a socket" assumption in a way that blocks Stage 3's user-invoked provider
  calls; the invariant is "no *background/unsolicited* network" (DD-32). Keep an HTTP-client seam
  possible (not built) so Stage 3 adds a provider client without fighting the architecture.

### Stage 2 must leave open

- **F7 — Editable buffer exposes selection + apply-edit through F3's command seam.** When the editor
  becomes editable, the document-command interface gains **get-selection**, **replace-range**, and
  **replace-all** operations. These are exactly the operations Stage 3's edit-proposal apply needs — so
  implement them as the stable public surface, not as private editor callbacks.
- **F8 — Format/Lint pipeline is callable programmatically.** The Format/Lint transforms are pure,
  callable functions (not only toolbar handlers), so Stage 3 can, e.g., run Format after applying an
  LLM edit, or reuse the diff renderer for edit proposals.
- **F9 — Diff rendering is a reusable component.** The Format/Lint (or a dedicated) diff view is a
  standalone component; Stage 3's edit-proposal card reuses it.

### Stage 3 builds

- The assistant sidebar, provider abstraction, agentic tool loop, tools (read document/selection,
  list/read workspace files, propose edit), tokenizer/context budgeter, and the AI settings tabs — all
  consuming F1–F9 seams. See `02_Architecture/08_LLM_INTEGRATION.md`.

## 4. What each stage explicitly does NOT build

- **Stage 1 does NOT build:** any editing/mutation, save, autosave, format/lint, PDF export, or any LLM
  code, provider client, or network call.
- **Stage 2 does NOT build:** any LLM code, provider client, assistant UI, tokenizer, or network call.
- **Stage 3 does NOT change** the Viewer/Editor contracts destructively — it only consumes the reserved
  seams and adds modules; any required change to an earlier contract is a new story (+ ADR if significant).

## 5. Stage exit criteria

A stage is complete when **all its phases' stories are `done`**, `just check` + `just trace-check` pass,
and:

- **Stage 1 exit:** on each OS, open a `.md` from the file manager (association) → renders in reading
  mode; open a folder → filtered tree navigable; a document with a table, math, code, and a Mermaid
  diagram renders; all three themes × light/dark/auto work; **zero** network connections observed.
- **Stage 2 exit:** create/open/edit/save round-trips with encoding + line endings preserved; autosave
  works; tabs; Format and Lint operate; export a document to PDF; still **zero** network connections.
- **Stage 3 exit:** configure a **local** provider; run Proofread on a selection and on the whole
  document; apply the proposed diff into the editor and save; chat multi-turn with a custom instruction;
  the token-fit meter warns on an over-context whole-document action; a network trace shows requests
  **only** to the configured provider endpoint and **only** on user action; telemetry/auto-update absent.
