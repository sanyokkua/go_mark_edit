# Architecture Decision Records

One decision per file, `NNNN-slug.md`. ADR-0001…0012 were written before any code existed; ADR-0013
onward were written while implementing. They lived in two folders until 2026-07-28 and were merged
here — the numbers were already disjoint, so nothing was renumbered.

**An ADR is superseded, never edited.** The replacement names the old one in its `Supersedes:` line,
and the old one's `**Status:**` line becomes `superseded by ADR-NNNN`. That status line is the only
edit ever made to an accepted ADR body. The old file stays, because the point of an ADR is the
reasoning that was current at the time.

Two exceptions, both narrow and both already exercised: repairing an ungrammatical sentence left by a
botched global rename, and re-pointing a link whose target file was renamed. Neither changes a
decision, an option, a consequence or a trade-off. A meaning change is still a supersession.

**Write one when the decision constrains how the software is built and would be expensive to reverse**
— storage strategy, wire format, a major dependency, packaging, the concurrency model, a security
boundary, a module boundary, a major interaction pattern. Anything lighter is a dated one-liner in the
`## Decisions` section of the feature file it belongs to. Do not write an ADR about documentation,
story format, traceability, evidence or phase completion; eight such ADRs were written and all eight
were deleted on 2026-07-25 along with the machinery they described.

## Two things a reader of an old record needs to know

**`DD-NN` was the identifier scheme of the specification these records were written against.** Until
2026-07-28 there was a registry of 78 numbered design decisions, and the records below cite it heavily.
That registry is gone: every one of those decisions is now written into the sentence of the feature file
that needs it, which is the whole point of the conversion. The original registry is in git at revision
`e1bd33f`, as `specification/00_Foundation/04_DESIGN_DECISIONS.md`, if you ever need to read a citation
literally.

The records are **not** being edited to remove those identifiers. A decision record is a historical
document: it says what was decided, on what date, against what was known then. Rewriting one to match a
later vocabulary makes it a worse record. The specification validator reports every `DD-NN` in this
folder as a numeric identifier; that finding is expected here and nowhere else.

**"Phase 02" inside ADR-0021, ADR-0022 and ADR-0024 means the retired 16-phase numbering**, not the
current roadmap. Those three were written on 2026-07-23, before the phase documents were rewritten.
Read their "Phase 02" as **today's Phase 05 — "I can open, edit and save real files, in tabs"**.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-wails-v2-cgo-free.md) | Build on Wails v2 (not v3), CGO-free Go | accepted |
| [0002](0002-editor-engine-monaco.md) | Editor engine: Monaco for v1 | accepted |
| [0003](0003-rendering-format-pdf.md) | remark/rehype rendering; Prettier/remark format; webview-print PDF | accepted |
| [0004](0004-state-file-first-kv.md) | State: file-first + SQLite KV | accepted |
| [0005](0005-token-theming.md) | Token-driven theming; three built-in themes | accepted |
| [0006](0006-multi-instance.md) | Multiple instances; shared settings DB via WAL | accepted |
| [0007](0007-llm-provider-abstraction.md) | LLM provider abstraction (OpenAI-compatible + profiles) | accepted |
| [0008](0008-agentic-tool-call-loop.md) | Agentic tool-call loop (not a fixed prompt chain) | accepted |
| [0009](0009-tokenizer-context-budget.md) | Offline tokenizer + explicit context budgeting | accepted |
| [0010](0010-assistant-sidebar-apply-edit.md) | Assistant sidebar; edits applied via editor command seam | accepted |
| [0011](0011-network-policy-llm-exception.md) | Network policy: offline except user-invoked provider calls | accepted |
| [0012](0012-drag-and-drop.md) | Drag-and-drop opens files/folders via native path-based file drop | accepted |
| [0013](0013-window-ui-layout-state.md) | Persist window & UI-layout state with write-through, last-writer-wins | accepted |
| [0014](0014-backend-authoritative-state.md) | Make the Go backend the single source of truth for application state | accepted |
| [0015](0015-cicd-versioning-icon.md) | Tag-driven versioning, derived icons, isolated builds | accepted |
| [0017](0017-coordinated-document-seams.md) | Coordinate backend snapshots with document-bound editor commands | accepted |
| [0021](0021-identity-bound-active-buffer-acknowledgements.md) | Bind active-buffer acknowledgements to document identity and revision | accepted |
| [0022](0022-commit-writes-and-resynchronize-projection.md) | Commit successful file writes and resynchronize failed projections | accepted |
| [0024](0024-corrected-phase02-document-lifecycle-policy.md) | Document lifecycle: open modes, suffixless Save As, read-only unsafe bytes, normalization authorization | accepted |
| [0028](0028-window-chrome-and-native-menu.md) | Draw our own title bar, and install a native application menu on macOS | accepted |
| [0029](0029-generated-editor-themes.md) | Generate editor and preview colours at build time from one syntax-token family | accepted |
| [0030](0030-sanitization-allowlist-and-csp.md) | Constrain document HTML with a level-derived allowlist and a fixed CSP | accepted |
| [0031](0031-format-via-remark-stringify.md) | Format with remark-stringify over the maximal plugin set; Prettier is dev-time only | accepted |
| [0032](0032-run-registry-and-shutdown-ordering.md) | A cancellable-run registry, an `OnBeforeClose` veto, and one deterministic shutdown order | accepted |
| [0033](0033-additive-only-workspace-operations.md) | Workspace file operations are additive only: create, never rename, move or delete | accepted |
| [0034](0034-assistant-execution-contract.md) | Per-model capability, one wall-clock budget, a scope-sized reply reserve | accepted |

Ids 0016, 0018, 0019, 0020, 0023, 0025, 0026 and 0027 were used by the eight process ADRs deleted on
2026-07-25. They are not reused. ADR-0024 absorbed the content of the superseded ADR-0020.
