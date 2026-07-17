**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder
**Last Updated:** 2026-07-10
**Cross-references:** all `PHASE_NN_*.md`, `06_Process_and_Traceability/*`

# Roadmap

Implementation proceeds in ordered phases. Each phase file lists the stories to author (id, title,
size, cited clauses, target modules, dependencies) and a **Phase exit checklist**. Author stories for
a phase only after the previous phase's blocking stories are `done`. Phases may overlap where their
stories are independent, but the numeric order encodes the safe default sequence.

Cross-cutting binding inputs: `03_NonFunctional/*`, `04_Build_and_Release/*`, and `05_Dependencies/*`
are binding gates consulted in **every** phase plan (per
`../06_Process_and_Traceability/06_DEFINITION_OF_DONE.md`), whether or not a given story row cites
them; and `../01_Product/01_FUNCTIONAL_REQUIREMENTS.md#edge-cases` is the master EC registry from
which every phase's edge-case list is drawn.

| Phase | Theme | Delivers | Key modules | Depends on |
|---|---|---|---|---|
| **00** | Scaffold & toolchain | Wails v2 app boots (blank window), Go+React+Vite wiring, bridge-mock, DI root, apperr envelope, logging, DB open, `.claude`/CI/hooks, traceability scripts, ADR-0001..0006 | apperr, bootstrap, application, logging, db, file, dev/bridge-mock, ui/styles | — |
| **01** | Core editor + preview | Monaco source editor, live preview (base CommonMark/GFM), split view, view-mode toggle, status bar, single backend-owned in-memory document (`internal/appmodel` foundation: GetState + commands + `state:patch`, DD-62..64) | internal/appmodel, ui/components(CodeEditor,MarkdownView), ui/widgets(EditorView,PreviewView), logic/markdown, logic/store(documents projection) | 00 |
| **02** | File I/O + tabs | Native open/save/save-as via Go, new/close, UTF-8 + BOM/CRLF preservation, autosave, multiple tabs, dirty state, window title; file + tab ownership in `internal/appmodel` | internal/appmodel, internal/docs, logic/adapter(appModel), logic/store(tabs projection), logic/hooks(useAutosave) | 01 |
| **03** | Folder workspace + recent | Open folder → filtered tree sidebar, open from tree, recent files/folders, reopen last, multi-instance/new window, drag-and-drop open | internal/workspace, internal/recent, internal/fileassoc, ui/widgets(FileExplorer), logic/store(workspace,recent) | 02 |
| **04** | Rendering & extensions | Standard selector (Minimal/GFM/Full), KaTeX math, code highlighting, Mermaid, per-standard plugin sets, reading mode | logic/markdown, ui/components(MermaidBlock), ui/widgets(ReaderView) | 01 |
| **05** | Format & lint | Format + Compact (Prettier/remark), remark-lint consistency, on-demand + on-save, editor squiggles, problems count | logic/format, logic/lint, ui/components(Toolbar,StatusBar) | 04 |
| **06** | PDF export | Export current document to PDF via webview print; styled vs clean; print stylesheet | internal/export, ui/styles(print), ui/widgets | 04 |
| **07** | File associations | `wails.json` fileAssociations, `OnFileOpen`/argv routing, open-in-default-mode, per-OS packaging hooks, "set as default" prompt | internal/fileassoc, main.go, build/ | 02 |
| **08** | Theming & settings | Three themes × auto/light/dark, unified theme, full Settings dialog, Shortcuts & About dialogs, in-app menu bar, keyboard shortcuts, window & UI-layout state persistence (via `internal/appmodel` `SetUILayout`) | ui/styles(tokens), logic/theme, ui/widgets(SettingsDialog,AppMenuBar,ShortcutsDialog,AboutDialog), logic/hooks(useShortcuts), internal/appmodel, internal/settings | 01 |
| **09** | Assets & security | Local asset handler (relative resolution + allowlist), remote-content policy + banner, path-traversal guard | internal/assets, ui/widgets(ExternalContentBanner), logic/markdown | 04 |
| **10** | i18n, packaging & release | i18n layer + `en` bundle, NSIS/nfpm packaging, CI build matrix, git hooks, `verify:ui`, release artifacts | i18n, build/, .github/, scripts/ | 00–09 |
| **11** | LLM foundation | Provider abstraction (OpenAI-compatible + profiles), model discovery, verification (test conn/models/inference), settings tabs (AI/Providers, AI Context), single-flight gate reuse, retries/timeouts, tokenizer + fit estimate | internal/llm/{providers,verify,tokenizer,context}, internal/settings(+providers table), ui/widgets(settings AI tabs) | 08, 02 |
| **12** | Actions & proofread/reformat | Action catalog (Proofread, Confluence/Wiki, Article, Q&A, Summarize…), assistant sidebar shell, scope (selection/whole-doc) + token meter, single-shot agentic run, edit-proposal → diff → apply via editor command seam | internal/llm/{actions,agent,tools}, ui/widgets(assistant), logic/store(assistant,run) | 11, 05 |
| **13** | Chat & agentic tool loop | Multi-turn chat + custom instructions, bounded tool-call loop, tools (read document/selection, list/read workspace files), streaming, cancellation, workspace file access | internal/llm/{agent,tools}, ui/widgets(assistant chat), logic/store(chat) | 12, 03 |
| **14** | Context budgeting & polish | Explicit context budget, over-context warn/chunk, history sliding-window/summarize, transcript, provider/model UX polish, safety/limits hardening | internal/llm/{context,tokenizer,agent}, ui/widgets(assistant) | 13, 11 |
| **15** | CI/CD & release finalization | Version injection (`AppVersion` + ldflags + wails.json patch, DD-65), icon pipeline (`build/appicon.png` → all per-OS icons, DD-66), tag-triggered release workflow (determine-version → build matrix + test gate → create-release, SHA256SUMS, pre-release detect) + DD-67 isolation gate — cross-cutting; **v1 ships via this pipeline** | internal/settings, internal/application, build/, .github/, assets/icon | 10 |

## Slicing guidance

- A phase file lists stories at **S/M/L** granularity; the `architect` writes each as a real story
  file in `../docs/stories/` in the fixed format before the `coder` starts.
- Prefer **backend story before the UI story** that consumes it (the UI story `depends_on` it).
- Keep phase 00 stories small and verifiable — they unblock everything else.
- Each phase's stories cite `01_Product/*` clauses and the relevant `DD-NN`/`ADR-NNNN`.

## Stages

Phases roll up into the three implementation **stages** (`00_Foundation/06_IMPLEMENTATION_STAGES.md`),
each a shippable app:

- **Stage 1 — Viewer:** phases 00, 01 (render only), 03, 04, 07, 08 (shell), 09.
- **Stage 2 — Editor:** phases 02, 05, 06, + editing parts of 01/08.
- **Stage 3 — Assistant:** phases 11, 12, 13, 14.

Phase 10 is cross-cutting: it finalizes i18n, packaging, and release for each stage as it ships
(see `PHASE_10_I18N_PACKAGING.md`), so it belongs to no single stage; Phase 01 likewise spans
Stages 1–2 as noted above (render-only parts in Stage 1, editing parts in Stage 2). **Release
finalization is Phase 15** (`PHASE_15_CICD_RELEASE.md`, DD-65..67) — also cross-cutting: it
consumes Phase 10's verify gates and packaging metadata and completes the v1 release train
(version injection, icon derivation, tag-triggered release pipeline).

Stage-1/2 stories must honour the forward-compatibility constraints **F1–F9** in the stages doc so the
assistant drops in without rework.

## Milestones

- **M1 (Stage 1 — Viewer):** opens & renders files/folders, themes, associations, reading mode. Fully offline.
- **M2 (Stage 2 — Editor):** editable, saveable multi-tab editor with format/lint and PDF export. Fully offline.
- **M3 (Stage 3 — Assistant):** provider-configurable AI sidebar — proofread/reformat/chat/custom, agentic
  tool loop, selection/whole-document scope, context-fit. Local provider by default; user-invoked network only.

Every milestone's shippable release is produced by the **Phase 15** pipeline
(`PHASE_15_CICD_RELEASE.md`): a `v*.*.*` tag push yields versioned, checksummed per-OS assets.
