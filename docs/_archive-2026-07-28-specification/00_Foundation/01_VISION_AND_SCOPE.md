**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-10
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md`, `01_Product/01_FUNCTIONAL_REQUIREMENTS.md`

# 1. Vision & Scope

## Table of Contents

1. Vision
2. Product goals
3. In scope (v1)
4. Out of scope (v1)
5. Non-negotiable constraints
6. Success criteria

## 1. Vision

GoMarkEdit is a fast, native, **offline-first** desktop application for writing and reading Markdown.
It has two first-class modes — an **Editor** (create/edit/save Markdown source with a live rendered
preview) and a **Viewer** (a clean, distraction-free rendered view) — and it integrates with the
operating system as a registered handler for Markdown files. It is deliberately **minimalistic**:
the interface foregrounds the document, not the chrome.

The product is built with Wails v2 so that a single Go binary embeds a web UI and renders through the
platform-native webview (WebView2 / WKWebView / WebKitGTK) on Windows, macOS, and Linux.

## 2. Product goals

- **G1 — Author Markdown comfortably.** A syntax-highlighted source editor with a rich formatting
  toolbar and keyboard shortcuts that act on the selection or current line.
- **G2 — Read Markdown beautifully.** A faithful GFM+extensions renderer (tables, task lists, math,
  code highlighting, Mermaid) with a distraction-free reading mode.
- **G3 — Feel native.** Register as a Markdown file handler on all three OSes; open files by
  double-click; native open/save dialogs; multiple windows like an IDE.
- **G4 — Stay out of the way.** Three visual themes with light/dark/auto; minimal, uncluttered chrome;
  the Viewer hides everything but the document.
- **G5 — Be trustworthy.** Offline-first with no background network, no telemetry, MIT-licensed, logs
  written locally only. The only outbound traffic the app ever makes is the assistant's user-invoked
  LLM calls to the provider the user configured (local by default; DD-32 as revised).

## 3. In scope (v1)

- Editor mode and Viewer (reading) mode; per-document view state.
- Open/create/save/"save as" for `.md`, `.markdown`, `.mdown`, `.txt`; **autosave** for existing files (toggle).
- **Multiple document tabs**; **open a folder** as a workspace tree filtered to Markdown/text files.
- **Recent files & folders**; "reopen last file/folder" (no automatic session restore on launch).
- Markdown standard selectable: **Minimal (CommonMark)**, **GFM**, **Full (GFM + math + footnotes + …)**.
- Live rendered preview with **Mermaid**, **KaTeX**, and **code highlighting**.
- **Format** and **Lint** (consistency) — on demand and optionally on save.
- **Export current document to PDF** (styled-with-theme or clean, per setting).
- **File associations / default-app** registration on all three OSes.
- Local + remote **asset handling**: images resolved relative to the current file; remote content gated by a user policy.
- **Three themes** (Liquid Glass, Material, Minimal) × **Auto/Light/Dark**; unified editor+preview theme.
- **Keyboard shortcuts** for formatting/lint/format/save/open; **i18n-ready** UI (English shipped).
- **Multiple app instances** (VS Code-style).
- **LLM assistant** (the assistant phases) — a right-hand sidebar with proofread/reformat/summarize actions, chat,
  and custom instructions over the open document, applied as reviewable diffs. The default provider is
  **local** (Ollama / LM Studio / llama.cpp); remote providers are strictly opt-in. This is the app's
  **only** outbound network, and only on explicit user action (DD-32 as revised, DD-38–DD-55).

## 4. Out of scope (v1)

- WYSIWYG / rich-text editing (the editor shows Markdown **source**; the preview renders it).
- Crash recovery / swap files / automatic session restore on launch.
- Cloud sync, collaboration, plugins/extensions, custom user-authored themes.
- Code signing / notarization and auto-update (documented for later; unsigned builds for v1).
- Screen-reader certification and full WCAG audit (basic keyboard access only for v1).
- Deterministic paginated PDF (page size/headers/footers/breaks) — v1 exports the document as-is.

### Refused on 2026-07-25, with reasons

A review against two shipped applications produced a long list of candidate features. These were
considered and **declined**. They are recorded here so nobody relitigates them mid-build. Reopening one
means a new decision, not a story.

| Refused | Why |
|---|---|
| Rename, move or delete files from the workspace tree | Needs a filesystem watcher the specification deliberately does not have (EC-WS-6), reconciliation with any open tab on that path, and an undo story. Creating files and folders **is** in scope (DD-77); destructive operations are not. The mockup's Rename…/Delete… entries were removed. |
| Converting pasted HTML into Markdown | We cannot know how the user wants rich text inserted. Paste inserts the plain-text flavour, unchanged (DD-78). Losing formatting is a predictable outcome; guessing at structure is not. |
| A density / compact mode | Turns an eighteen-combination visual matrix into thirty-six for a spacing preference. |
| A custom accent-colour picker | DD-28 rules out user-authored themes; this is the same argument at lower cost to us and higher cost to consistency. |
| Settings export / import | A schema-versioned file format with its own migration story, for a single-user desktop app. **Reset to defaults** ships instead (DD-75). |
| A search box inside Settings | Roughly twenty-five settings across seven groups. |
| Theme preview thumbnails | Swatches are adequate. Revisit only if people cannot tell the themes apart. |
| Dragging a tree item onto a pane to open it there | A click already opens it; the second gesture buys nothing. |
| Accepting or rejecting individual hunks of a format result or an assistant proposal | You apply the whole proposal or you re-run it. Partial application needs conflict handling for a benefit nobody asked for. |
| A bundled "Getting started" guide and Markdown cheat sheet | Two documentation surfaces with no requirement, no phase and no translation plan behind them. |
| User-configured asset roots | The allowlist is the document's folder plus the workspace root. Three documents required "configured roots" and none defined a setting for them. |
| A persistent "provider connected" indicator in the status bar | It implies polling, which collides head-on with the no-background-network rule. Provider health is shown as the result of the last call you made. |
| Hiding individual toolbar groups via settings | A configuration surface substituting for a layout decision. The toolbar overflows instead. |
| An on-disk log of assistant runs | It would persist your document text to a file to make a misbehaving model diagnosable. The **Show prompt** disclosure (`01_Product/15_ACTIONS_LIBRARY.md`) answers the same question — what was actually sent — while storing nothing. Diagnosis is worth having; a second copy of your documents is not the price. |
| Link path autocompletion | Typing `](./` completing against the workspace is genuinely useful, and it needs the tree, a path index and a completion provider inside Monaco for a convenience the file tree already provides by other means. Revisit post-v1 if broken relative links turn out to be common. |
| Table editing helpers (Tab-to-next-cell, add row, set alignment) | Format already aligns table columns, and pasting a spreadsheet range covers how tables usually arrive (DD-78). A cell-aware editing mode inside a plain-text buffer is a small editor of its own. |

### Deferred, not refused

| Deferred | Note |
|---|---|
| Character-accurate editor↔preview scroll sync | The costly version. Phase 09 ships heading-accurate sync using the outline's heading-to-source-line map — most of the value, nearly none of the cost. |
| Spell checking | No offline dictionary is bundled, so a default install has no spelling assistance until an AI provider is configured. This is a deliberate size trade-off, said out loud rather than buried. |
| Persisted assistant history | The transcript is per-tab and in-memory (DD-44). Persisting it means storing document text, which the privacy posture would have to be reopened for. |

## 5. Non-negotiable constraints

See `00_Foundation/04_DESIGN_DECISIONS.md` for the authoritative, numbered list. Summary:

- **Offline-first, no background network.** The app makes **no background or unsolicited** network
  activity of any kind (no update checks, telemetry, or CDN/asset fetches); all assets (KaTeX fonts,
  Mermaid, highlight themes, fonts) are bundled. Before the assistant exists the app makes **zero** network calls. The **only**
  outbound requests are the assistant's user-invoked LLM calls to the configured provider
  (local by default; DD-32 as revised). Remote images/CSS in *documents* are loaded only under an
  explicit user policy (Ask / Always allow / Always block).
- **No telemetry, no auto-update.** Logs are written to a local file and never transmitted.
- **CGO-free Go.** Use `modernc.org/sqlite` (pure Go) so `wails build` cross-compiles cleanly.
- **Wails v2** (not v3) — v2 is the current stable line; v3 is alpha.
- **Handler → Service → Repository** backend layering with the Result-envelope error contract.
- **Components never import Wails bindings directly** — only the adapter layer does.
- **Token-driven theming**: one layout, CSS custom properties swapped by `data-theme` × `data-mode`.

## 6. Success criteria

The product is complete when every phase in `07_Phases/` is finished, `just check` passes,
and a manual smoke test confirms, on each OS: open a `.md` from the file manager (association works);
edit and autosave; open a folder and navigate the filtered tree; render a document containing a GFM
table, a KaTeX formula, a fenced code block, and a Mermaid diagram; format and lint a document; export
to PDF; switch across all three themes in light/dark/auto; and confirm the network posture (zero
outbound connections before the assistant exists, and once it does, outbound traffic **only** to the
user-configured LLM provider and **only** on user action — see `07_Phases/00_ROADMAP.md`).
