**Status:** Accepted
**Owner:** architect
**Audience:** all
**Last Updated:** 2026-07-10

# Glossary

- **GoMarkEdit** — the product; a desktop Markdown editor & viewer.
- **Editor mode** — UI state showing the Markdown source editor (optionally with live preview).
- **Viewer / Reading mode** — distraction-free UI state showing only the rendered document, no chrome.
- **Preview** — the live rendered pane shown beside the editor in split view.
- **Document** — an open file buffer (`.md`/`.markdown`/`.mdown`/`.txt`) represented by a tab.
- **Workspace** — an opened folder shown as a filtered tree (Markdown/text files only).
- **Tab** — one open document within a window.
- **Instance / window** — a running GoMarkEdit process window; multiple may run concurrently (DD-08).
- **Standard** — the selected Markdown feature level: Minimal (CommonMark) / GFM / Full (DD-14).
- **GFM** — GitHub-Flavored Markdown (tables, task lists, strikethrough, autolinks, footnotes).
- **CommonMark** — the strict baseline Markdown specification.
- **Format** — pretty-print the document (pad tables, normalize markers, wrap) (DD-16).
- **Compact** — conservative whitespace tightening (not aggressive minification) (DD-16).
- **Lint** — consistency checks (marker/emphasis/heading style) surfaced as squiggles (DD-17).
- **Renderer / rendering pipeline** — react-markdown + remark/rehype plugins that turn source → HTML (DD-19).
- **MermaidBlock** — the custom component that renders ` ```mermaid ` fences to SVG.
- **Asset handler** — the guarded Wails `AssetServer.Handler` that serves local files to the webview (DD-21).
- **File association** — OS registration that makes GoMarkEdit a handler for a file type (DD-25).
- **`OnFileOpen`** — the Wails callback invoked (macOS) when a file is opened via the OS.
- **Result envelope** — the `apperr.*Result` struct every bound Go handler returns (never `(T, error)`).
- **Adapter** — the frontend layer that wraps generated Wails bindings; components never import bindings directly.
- **Application model (`internal/appmodel`)** — the Go-owned, in-memory **single source of truth** for the
  live app state: open documents and their canonical content, dirty flags, tab set, workspace ref, and
  UI/layout (DD-62, `02_Architecture/02_BACKEND_GO.md#application-model`).
- **Projection** — the frontend Redux store as a derived, disposable view-model of the application model:
  hydrated once via the `GetState` query, then reconciled by `state:patch` events; never a source of truth
  (DD-63, `02_Architecture/03_FRONTEND_REACT.md#state-ownership`).
- **Command** — a UI interaction dispatched to the backend to mutate the application model (e.g.
  `OpenDoc`, `UpdateBuffer`, `SetUILayout`); the backend applies it and emits the resulting change (DD-63).
- **`state:patch`** — the event the backend emits after every model mutation, carrying only the changed
  sections of the application model; the adapter applies it to the projection (DD-62/DD-63).
- **Buffer sync** — the debounced push of the active Monaco editor's working copy to the backend
  (`UpdateBuffer`), flushed on editor blur, tab switch, close, and save; the backend never echoes buffer
  text back into the focused editor (DD-64).
- **Bridge mock** — the dev-only Vite plugin that lets the frontend run without the Go backend.
- **Token / theme token** — a CSS custom property; themes swap token values via `data-theme` × `data-mode`.
- **Appearance** — Light / Dark / Auto (Auto follows OS `prefers-color-scheme`).
- **Story** — one implementable unit of work (`../docs/stories/story-NNN-*.md`).
- **AC** — Acceptance Criterion (`STORY-NNN-AC-N`); each has a proving test.
- **EC** — Edge Case id (`EC-AREA-N`) that a story must satisfy.
- **ADR** — Architecture Decision Record (`08_Decisions/NNNN-*.md`).
- **Module inventory** — the authoritative list of shippable modules (`06.../01_MODULE_INVENTORY.md`).
- **Traceability** — the generated record linking spec clause ↔ story ↔ AC ↔ test ↔ module.
- **Phase** — a themed batch of related stories delivered together (`07_Phases/`).
- **Stage** — one of the three coarse delivery milestones (Viewer → Editor → Assistant), each shipping a
  working app (`00_Foundation/06_IMPLEMENTATION_STAGES.md`).
- **Assistant / assistant sidebar** — the Stage-3 right-hand sidebar providing LLM-powered actions,
  chat, and custom instructions over the open document (DD-38).
- **Action** — a preconfigured, one-click assistant task shipped as data (id, label, category, system
  prompt, directive, default scope), e.g. Proofread (DD-39, `15_ACTIONS_LIBRARY.md`).
- **Provider / provider profile** — an LLM backend (Ollama, LM Studio, llama.cpp, OpenAI, Azure OpenAI,
  or generic OpenAI-compatible) reached through one OpenAI-compatible client parameterized by a per-kind
  profile (DD-45, `17_PROVIDERS_MODELS_SETTINGS.md`).
- **Agentic loop** — the bounded tool-call loop the assistant runs (gather context → decide → repeat)
  with hard iteration/time limits (DD-40, `16_CHAT_AND_AGENTIC_WORKFLOW.md`).
- **Tool call** — a model-requested invocation of one of the fixed, least-privilege read/propose tools
  (`read_document`, `read_selection`, `list_workspace_files`, `read_workspace_file`, `propose_edit`) (DD-41).
- **Edit proposal / apply-as-diff** — a reviewable diff the assistant returns; the user Applies, reviews
  hunks, or discards. The model never writes files directly (DD-42).
- **Single-flight gate** — the process-wide guard allowing at most one long operation / LLM inference at
  a time (DD-47, F5).
- **Token-fit meter / context budget** — the live estimate of whether the scoped content fits the model's
  context window, and the explicit allocation of that window (DD-50, DD-51, `18_TOKENIZER_AND_CONTEXT.md`).
- **DD-NN** — a Locked Design Decision (`00_Foundation/04_DESIGN_DECISIONS.md`).
