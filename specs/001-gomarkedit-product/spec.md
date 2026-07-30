# Feature Specification: GoMarkEdit Product

**Feature Branch**: `not-created (no before-specify branch hook)`

**Created**: 2026-07-30

**Status**: Draft

**Input**: Consolidate the existing GoMarkEdit specification into one Spec Kit product definition,
organized as Viewer, Editor, Assistant actions, and Assistant chat, while distinguishing delivered,
partial, missing, and known-gap behavior.

## Clarifications

### Session 2026-07-30

- Q: How should Monaco distinguish Markdown headings from Go keywords when both grammars emit a
  `keyword` token? → A: Use language-qualified rules such as `keyword.md` and `keyword.go`.
- Q: Which existing validations should the first Spec Kit phase remove as unnecessary? → A: Remove
  all non-Spec-Kit workflow and traceability validators, but retain product, architecture, quality,
  build, baseline-reliability, and live-verification gates.
- Q: Which existing gaps must be fixed in the first Spec Kit implementation phase? → A: Fix
  migration blockers and independently repairable foundation defects first; assign every
  consumer-dependent gap to the earliest user-facing slice that exercises it.
- Q: When should a requirement copied from `docs/delivery/` stop being governed by the initial
  specification and become governed by the Spec Kit artifacts? → A: Transfer authority
  requirement by requirement only after complete mapping and explicit approval.
- Q: How should the first Spec Kit phase treat functionality that already exists in the current source
  code? → A: Preserve independently verified behavior, repair partial or defective behavior, and
  implement missing behavior; historical completion labels are not evidence.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - View Any Supported Markdown Document (Priority: P1)

A user opens a local Markdown or text document and reads a complete, safe rendering in a native desktop
window. They can choose Liquid Glass, Material, or Minimal in light, dark, or system-following
appearance; use preview or distraction-free reading; and trust that ordinary use sends nothing off the
device.

**Why this priority**: Viewing is the first complete product stage and the base on which editing and
assistant review depend.

**Independent Test**: Install and launch the app with networking disabled, open the rendering fixture
corpus through the operating system and the in-app picker, switch all six visual combinations, enter
reading mode, and verify that supported content is readable, unsafe content is inert, and no
unsolicited request occurs.

**Acceptance Scenarios**:

1. **Given** a supported local document up to 10 MB, **When** it is opened in Viewer mode, **Then** it
   appears in one tab, renders according to the selected Markdown level, and remains view-only.
2. **Given** a document using tables, task lists, footnotes, highlighted code, diagrams, mathematics,
   local images, and raw HTML, **When** the applicable Markdown level is selected, **Then** supported
   constructs render, unsupported constructs remain literal, unsafe content is removed or blocked, and
   one failed block does not blank the document.
3. **Given** any app surface, **When** the user cycles three themes and light/dark appearance, **Then**
   every surface, editor token, rendered block, focus indicator, selection, scrollbar, and overlay uses
   the selected palette without clipping or an unstyled first frame.
4. **Given** Auto appearance, **When** the operating system changes between light and dark, **Then** the
   open document and all visible surfaces update immediately without leaving Viewer mode.
5. **Given** a remote image or stylesheet reference and the default Ask policy, **When** the document is
   opened, **Then** remote content stays blocked while the rest renders and one banner offers Load once,
   Always allow, or Keep blocked.
6. **Given** several application windows, **When** each opens and changes settings, **Then** they operate
   concurrently without a single-instance refusal and each running window retains its acknowledged
   settings until relaunch.

---

### User Story 2 - Edit, Organize, and Share Markdown (Priority: P2)

A user creates or opens documents, edits Markdown source with immediate feedback, formats and validates
it, works across tabs and a folder of notes, saves without corrupting file characteristics, finds
content and commands, and exports the current document as PDF.

**Why this priority**: Editing turns the Viewer into the full local Markdown workspace and establishes
the safe document-change path later used by the Assistant.

**Independent Test**: Create, open, edit, format, lint, save, reopen, organize, search, and export a
fixture workspace containing multiple documents, duplicate filenames, large files, images, mixed line
endings, and an externally modified file; verify both results and recovery paths without using any
assistant capability.

**Acceptance Scenarios**:

1. **Given** an editable document, **When** the user types, changes arrangements, or switches tabs,
   **Then** typing stays immediate, the preview follows after the specified pause, and the latest text
   and per-document view state are preserved before another consumer proceeds.
2. **Given** selected text or a caret line, **When** the user invokes formatting from the toolbar,
   context menu, or shortcut, **Then** the requested Markdown construct toggles or converts in one undo
   step using the configured marker style.
3. **Given** an existing file with permissions, line endings, and an optional byte-order mark, **When**
   it is saved, **Then** the write is atomic, those characteristics survive, and a competing external
   change is never overwritten without a Reload or Keep mine decision.
4. **Given** multiple open documents, **When** the user switches, reorders, or closes tabs, **Then**
   each document retains its content and view state, stale tab commands are refused atomically, and
   modified documents prompt before data is discarded.
5. **Given** an open workspace, **When** the user browses, creates, quick-opens, or reveals entries,
   **Then** supported files are discoverable within stated limits and the app never renames, moves, or
   deletes workspace content.
6. **Given** the current document, **When** Format, Compact, Lint, or Export runs, **Then** progress and
   in-place cancellation are available, only one long operation runs at a time, and failure or
   cancellation leaves no partial change or stranded busy state.

---

### User Story 3 - Proofread and Rewrite with an Assistant (Priority: P3)

A user configures a local or remote language-model provider and invokes predefined proofreading,
grammar, reformatting, summarizing, or rewriting actions against the active document or its current
selection. The assistant sends nothing until asked and returns a reviewable proposal rather than
changing the document.

**Why this priority**: Predefined actions deliver focused language assistance with bounded scope and
review before the more open-ended chat experience.

**Independent Test**: Configure a local provider, verify its draft configuration, run each action
family against a document and a selection with tool-capable and non-tool-capable models, inspect the
exact prompt, cancel a run, exceed context, modify the document before Apply, and verify that no edit
or file write occurs without explicit Apply and Save.

**Acceptance Scenarios**:

1. **Given** no verified provider, **When** the assistant toggle is used, **Then** the sidebar remains
   unavailable and the user is directed to provider configuration.
2. **Given** a provider draft, **When** connection, models, inference, and tool support are tested,
   **Then** the tests use the unsaved draft and selected model and only the explicit test causes network
   traffic.
3. **Given** a proofread or rewrite action, **When** it runs, **Then** scope follows the fixed precedence,
   the prompt treats document text as inert data, the context meter evaluates the complete request, and
   the result is at most one reviewable proposal.
4. **Given** a model without tool support, **When** a rewrite action runs, **Then** it uses a single-step
   path and produces the same proposal experience; an action requiring unavailable context is disabled
   with a reason.
5. **Given** a proposal, **When** the user chooses Apply, Re-run, or Discard, **Then** Apply changes only
   the stated scope without saving, Re-run makes a new request, and Discard changes nothing.
6. **Given** the document changed after proposal creation, **When** Apply is pressed, **Then** the
   proposal is marked stale and cannot be force-applied.

---

### User Story 4 - Chat About the Current Document (Priority: P4)

After predefined actions are available, a user enters custom prompts in a conversation focused on the
active tab. The assistant may read the current document and selection, and may read allowlisted
workspace documents when a workspace is open, but it can only propose edits for review.

**Why this priority**: Chat is a sub-stage of the Assistant and depends on proven provider, context,
proposal, cancellation, and document-command behavior.

**Independent Test**: Open two documents, hold separate conversations in each, issue custom prompts,
exercise all available read and proposal capabilities, attempt invalid and escaping paths, trigger
loop limits, cancel a run, switch models during a run, close and reopen the app, and verify scope,
isolation, safety, and non-persistence.

**Acceptance Scenarios**:

1. **Given** an active document, **When** the user sends a custom prompt, **Then** the conversation is
   associated with that document and the composer states that the current document is accessible.
2. **Given** an open workspace, **When** the model requests another allowed document, **Then** only a
   supported file beneath the workspace root may be read and its content is returned as inert data.
3. **Given** a tool request with an invalid scope or escaping path, **When** it is evaluated, **Then**
   validation rejects it before any file access and returns a recoverable observation to the model.
4. **Given** a repeated tool call, consecutive invalid arguments, iteration exhaustion, context
   exhaustion, cancellation, or wall-clock exhaustion, **When** the limit is reached, **Then** the run
   terminates deterministically, reports what completed, and releases the shared operation gate.
5. **Given** two document tabs, **When** the user switches between them, **Then** each shows its own
   session transcript; closing a tab discards its transcript and relaunching restores none.
6. **Given** a model change during a run, **When** that run completes, **Then** it used the original
   model and the new choice applies only to the next run.

### Edge Cases

- A file larger than 50 MB is refused without a partial document; one over 10 MB and up to 50 MB opens
  read-only; one over 2 MB pauses live preview but can render once on demand.
- Opening a 41st document is refused. Workspace enumeration stops at 20,000 entries and 12 levels.
  Result lists stop at 1,000 entries, while lint counts remain accurate when only 1,000 markers are
  decorated.
- A tab switch, close, save, export, or assistant read waits for the newest editor content; a failed
  flush leaves the previous active state unchanged.
- An empty never-saved document may be replaced by the first opened file, but a non-empty unsaved
  document is never overwritten or autosaved without a path.
- A symlink or relative path that escapes the document folder and workspace allowlist is rejected
  before any read, including image and assistant-tool access.
- Invalid Markdown extensions, diagram syntax, mathematics, missing images, and unknown code languages
  degrade locally without blanking the rest of the document.
- A theme change during asynchronous rendering discards stale visual output and never exits reading
  mode or changes the editor selection.
- An operating-system open arriving before startup completes is queued; an open while another instance
  runs creates a new window rather than taking over the existing process.
- A failed settings write leaves the last acknowledged value active. Unknown stored keys are ignored,
  and each missing value falls back independently.
- A remote-content policy change is persisted before any newly allowed request. Load once lasts for the
  current view and does not become a stored choice.
- An assistant response that is empty, truncated, unparsable, over context, or unsupported is
  classified distinctly and never becomes an empty or silently partial edit.
- Cancelling format, export, provider testing, or an assistant run is a normal outcome and must never
  leave a partial write, partial replacement, or permanently busy interface.

## Requirements _(mandatory)_

### Functional Requirements

#### Product-wide behavior

- **FR-001**: The product MUST be a native desktop application for macOS, Windows, and Linux that opens
  multiple independent windows and requires no server, account, or companion process.
- **FR-002**: The product MUST make no background network request, collect no telemetry or analytics,
  perform no automatic update check, and bundle every application, rendering, font, theme, language,
  and editor asset.
- **FR-003**: The only permitted outbound requests MUST be a user-approved document asset load or a
  direct user action against the configured assistant provider.
- **FR-004**: Every user-visible action MUST be keyboard reachable with visible focus, correct role,
  and an accessible name; reduced-motion preferences MUST collapse interface motion without changing
  behavior.
- **FR-005**: Every user-visible string MUST come from a stable, namespaced catalogue; missing
  translations MUST fall back to English and then the key, and controls MUST tolerate longer text.
- **FR-006**: Every classified failure MUST present a distinct title and actionable remediation without
  exposing raw errors, secrets, full remote URLs, or private filesystem paths.
- **FR-007**: Notifications MUST deduplicate by failure and subject, show at most three toasts, never
  auto-dismiss errors, and remain silent for successful automatic work; explicit saves MUST confirm
  the filename, encoding, and preserved line endings.
- **FR-008**: Any operation that may exceed about half a second MUST show progress and, when it owns the
  shared long-operation slot, replace its trigger with Cancel until exactly one terminal outcome occurs.
- **FR-009**: Lists, trees, and tables MUST distinguish loading, truly empty, and filter-empty states
  and offer the specified next action instead of showing a blank surface.
- **FR-010**: All unbounded inputs MUST enforce and visibly explain these limits: 50 MB openable file,
  10 MB read-only threshold, 2 MB live-preview threshold, 40 open documents, 20,000 workspace entries,
  12 folder levels, 1,000 quick-open or palette results, and 1,000 decorated lint markers.

#### Viewer stage

- **FR-011**: Every launch MUST begin at a launcher offering New file, Open file, Open folder, and the
  six most recent documents or folders; content from a previous launch MUST not reopen automatically.
- **FR-012**: The window MUST provide its own themeable title area, platform-appropriate window
  controls, movement, maximize/restore, full screen, eight resize zones, and a minimum size of
  375 by 480 pixels.
- **FR-013**: The shell MUST contain a collapsible workspace region, central document region, and
  reserved assistant region, and MUST restore acknowledged window and pane layout before first display.
- **FR-014**: Layout changes MUST persist immediately for discrete actions and after a pause for
  continuous resizing; the most recently changed value across windows wins without reopening content.
- **FR-015**: The product MUST offer exactly Liquid Glass, Material, and Minimal themes, default to
  Material, and offer Auto, Light, and Dark appearance with Auto following operating-system changes
  live.
- **FR-016**: The chosen appearance and resolved light/dark value MUST remain distinct, persist across
  launches, apply before the first visible frame, and update every visible and rendered surface without
  animation.
- **FR-017**: Every surface MUST render correctly in all six theme and resolved-appearance combinations
  using one consistent palette for application surfaces, Markdown source, embedded code, selection,
  focus, scrollbars, status colors, overlays, and print consumers. Generated Monaco syntax rules MUST
  preserve the distinct Markdown and embedded-language palettes by qualifying every grammar token and
  descendant with Monaco's bundled language postfix; for example, `keyword.md` MUST use
  `--md-heading`, while `keyword.go` MUST use `--hl-keyword`.
- **FR-018**: The Viewer MUST offer Minimal, GFM, and Full Markdown levels, default to GFM, apply one
  level globally, show the active level, and re-render all open documents when it changes.
- **FR-019**: Minimal MUST render CommonMark; GFM MUST add tables, task lists, strikethrough, autolinks,
  footnotes, and top-of-document front matter handling; Full MUST additionally render mathematics,
  directives, and admonitions. Features above the selected level MUST remain literal.
- **FR-020**: Preview, preview-only, reading mode, and export MUST use one rendering interpretation;
  sanitization MUST run for every Markdown level after other document transformations.
- **FR-021**: Fenced code highlighting and Mermaid diagrams MUST work at every Markdown level;
  mathematics MUST work only at Full; unknown languages and invalid blocks MUST degrade locally while
  preserving the last successful document rendering.
- **FR-022**: Diagrams and mathematics MUST render without blocking initial text, obey the active
  visual palette, reject stale asynchronous results, and allow a rendered diagram to open full-window
  with zoom, pan, and Escape-to-close.
- **FR-023**: Reading mode MUST hide editing chrome without unmounting it, prevent edits, preserve the
  prior arrangement, scroll, caret, and selection, and remain active through theme changes and tab
  switches.
- **FR-024**: Reading text MUST support 15, 17, and 19 px sizes with 17 as default, and Narrow 60,
  Comfortable 72, and Wide 90 character columns with Comfortable as default.
- **FR-025**: Local document assets MUST resolve relative to the current document and, when present, the
  workspace root; canonicalized paths outside those roots MUST be refused before reading and missing
  assets MUST show their alternative text.
- **FR-026**: Remote document content MUST default to Ask and remain blocked until the user chooses
  Load once, Always allow, or Keep blocked; a stored policy change MUST succeed before content is
  requested.
- **FR-027**: The Viewer MUST support `.md`, `.markdown`, `.mdown`, and `.txt` from the in-app picker,
  drag-and-drop, workspace, and operating-system open flows, using the configured default open mode.
- **FR-028**: An operating-system open before readiness MUST queue; an open while another window runs
  MUST start a new window; unsupported text MAY open tolerantly but binary content MUST be refused
  without corruption.

#### Editor stage

- **FR-029**: The editor MUST display Markdown source rather than rich text, update the visible buffer
  and caret within about 16 ms of a keystroke, and synchronize canonical content after typing pauses
  rather than per keystroke.
- **FR-030**: The newest editor content MUST be acknowledged before blur, tab switch, tab close, save,
  export, or assistant access, and canonical state changes MUST never echo document text into the
  focused editor.
- **FR-031**: Editor, Split, and Preview arrangements MUST always leave at least one pane visible,
  preserve a per-document arrangement and view state, and support a cancellable, clamped split divider.
- **FR-032**: Live preview MUST update 150 to 300 ms after typing pauses, pause above 2 MB with Refresh
  preview, and leave buffer, caret, selection, and last successful preview intact.
- **FR-033**: The status bar MUST report Markdown level, caret, word count, encoding, line endings,
  autosave, problems, conditional provider outcome, and Reading action, dropping optional items in a
  fixed order at narrow widths while retaining Problems and Reading.
- **FR-034**: Formatting MUST operate on the selection or current line, toggle emphasis constructs,
  replace heading levels, convert list kinds, insert a table skeleton, and use one undoable edit.
- **FR-035**: The canonical defaults MUST be `-` bullets, `_` emphasis, ATX headings, line numbers on,
  word wrap off, Split arrangement, 14 px editor text, autosave on, format-on-save off, and lint-on-save
  on; any configurable alternative MUST be shared by toolbar, formatter, and linter.
- **FR-036**: Pasting or dropping an existing image MUST insert a document-relative link without
  copying it; a pathless clipboard bitmap MUST be saved beside an already-saved document; rich text
  MUST paste as plain text and unambiguous tabular text MUST become a one-step-undo table.
- **FR-037**: Actions and shortcuts MUST be registered once with global, editor, or document scope,
  rendered consistently in menus, tooltips, context menus, the shortcut dialog, and command palette,
  and never rebound after shipping.
- **FR-038**: New documents MUST start pathless in Editor mode and never autosave; filesystem opens MUST
  use the default Editor or Reading mode, defaulting to Editor.
- **FR-039**: Save MUST flush canonical content and use an atomic same-directory replacement that
  preserves permissions, detected line endings, and a byte-order mark; undecodable bytes MUST never be
  silently corrupted.
- **FR-040**: Autosave MUST write only existing files after typing pauses, never invoke format or lint,
  remain silent on success, and leave modified content untouched when disabled.
- **FR-041**: Every write MUST detect an external modification and offer Reload or Keep mine with a
  difference view; closing modified work MUST offer Save, Discard, or Cancel, and quitting MUST present
  one combined decision for all modified documents.
- **FR-042**: Opening an already-open path MUST focus its tab; duplicate filenames MUST be disambiguated;
  each tab MUST preserve content and view state; and stale reorder or close commands MUST change nothing.
- **FR-043**: Tab overflow MUST scroll, drag reorder MUST show and cancel its landing position, modified
  state MUST be visible on every tab, and tab context actions MUST cover close variants, path copy, and
  reveal in file manager.
- **FR-044**: The workspace tree MUST show supported text files and all directories, load children on
  expansion, indicate unreadable folders, refresh external changes manually, and provide accurate
  empty and filter-empty states.
- **FR-045**: Workspace mutations MUST be limited to creating a non-conflicting file or folder,
  revealing a path, and copying a path; rename, move, delete, disk reorder, and silent conflict renaming
  MUST not exist.
- **FR-046**: Find and replace MUST remain within the active document and expose regular expression,
  case, whole-word, selection, replace, replace-all, match count, and next/previous controls.
- **FR-047**: Quick open, command palette, and outline MUST share keyboard navigation, filtering,
  ranking, empty-state, and activation behavior; the outline MUST use parsed headings and exclude code
  fences.
- **FR-048**: Format and Compact MUST preserve meaning, be idempotent where applicable, avoid prose
  reflow and code-block whitespace changes, preserve ordered-list style and indented code, and apply a
  full-document replacement as one undo step without partial results.
- **FR-049**: Lint MUST report without modifying content, apply the defined ten-rule set, widen
  position-only findings, replace prior markers, retain an accurate count beyond 1,000 decorations,
  and expose all findings in a navigable problems list.
- **FR-050**: Explicit save MAY run Format then Lint when enabled; autosave MUST run neither.
- **FR-051**: Export MUST act only on the active document after a flush, render a separate print view,
  wait with bounded time for diagrams, fonts, and images, and release the operation slot after success,
  failure, timeout, or cancellation.
- **FR-052**: Export MUST produce only PDF, offer Current theme and Clean document styles, force Current
  theme onto a light printable background, preserve readable code, tables, headings, diagrams, and
  external link destinations, and write nothing when the operating-system dialog is cancelled.

#### Assistant action stage

- **FR-053**: The Assistant MUST support local Ollama, LM Studio, and llama.cpp endpoints plus OpenAI,
  Azure, and compatible remote endpoints through user-configured provider profiles, with a local
  endpoint as the default.
- **FR-054**: Provider credentials MUST be referenced only by environment-variable name; secret values
  MUST never be stored, returned to the interface, or written to logs or errors.
- **FR-055**: Provider configuration MUST remain a draft until saved and MUST offer explicit connection,
  model discovery, inference, and model-specific tool-support tests against the draft and selected model.
- **FR-056**: Every model picker MUST filter case-insensitively anywhere in model identifiers, report
  shown versus total counts, retain a per-provider filter, preserve selection while filtering, and show
  a clearable no-match state.
- **FR-057**: Optional inference parameters MUST remain omitted until set, and the relationship
  `reply reserve <= maximum output < context window` MUST be enforced.
- **FR-058**: Provider failures MUST distinguish transport, credential, discovery, context, truncation,
  empty output, and unsupported-tool outcomes; only retryable failures may retry, and total attempts
  MUST equal one plus the configured retry count.
- **FR-059**: Predefined actions MUST belong to Correct, Reformat, Summarize, or Rewrite families and
  declare their label, directive, requirements, and default scope as data rather than bespoke flows.
- **FR-060**: Every assistant prompt MUST delimit user content as inert data, repeat that treatment for
  tool observations, forbid invented facts, omit unsupported template fields, and end with the common
  output-only guardrail.
- **FR-061**: A user MUST be able to inspect and copy the exact prompt composition before sending,
  including family instruction, action directive, guardrail, truncated scope, and full token estimate;
  inspection MUST send and store nothing.
- **FR-062**: Action scope MUST resolve by explicit choice, then non-empty selection, then action
  default, then the Whole-document default; an empty selection MUST visibly fall back to the whole
  document.
- **FR-063**: Token estimation MUST occur offline and update with content or scope; the fit calculation
  MUST include a default 15 percent safety margin, default 1,024-token reply reserve, and a rewrite
  reserve of at least 110 percent of the scoped estimate.
- **FR-064**: The context meter MUST show fits, tight, or over states; an over-limit whole-document run
  MUST be blocked and offer the selection without sending or silently truncating content.
- **FR-065**: Every predefined action MUST return no more than one reviewable proposal and MUST never
  write the buffer or file directly; Proofread MUST preserve meaning and formatting while correcting
  grammar, spelling, and consistency.
- **FR-066**: Apply MUST change only the proposal scope in one undoable edit, mark the document modified
  without saving, and refuse a proposal whose source text or selection is stale; Re-run and Discard MUST
  have no hidden document effect.
- **FR-067**: A model without tool support MUST still run rewrite-type actions through a single-step
  path; actions that genuinely require unavailable tools MUST be disabled with a visible reason.

#### Assistant chat sub-stage

- **FR-068**: Quick actions, custom instructions, and chat messages MUST use one bounded conversation
  loop and one transcript for the active document, differing only in what starts a run.
- **FR-069**: The Assistant MUST expose exactly five capabilities: read the active document, read the
  active selection, list supported workspace files, read one allowlisted workspace file, and propose an
  edit; it MUST expose no shell, process, arbitrary filesystem, or independent network capability.
- **FR-070**: Every capability argument MUST be validated before work; escaping paths, absolute paths,
  symlink escapes, unknown scopes, and oversized inputs MUST be rejected before file access and returned
  as recoverable observations.
- **FR-071**: A capability failure MUST return a structured observation rather than crash the run; the
  run MUST stop after the same capability and arguments repeat consecutively or after two consecutive
  argument-validation failures.
- **FR-072**: Each run MUST have one wall-clock budget that pre-empts retries and iterations; each
  attempt MUST use the lesser of its own timeout and remaining run time, and a retry MUST not consume an
  iteration.
- **FR-073**: The default maximum tool iterations MUST be eight; cancellation MUST be checked at every
  iteration boundary; reaching a limit MUST return available partial results and a clear terminal
  transcript entry.
- **FR-074**: Only one assistant inference or other gated long operation may run application-wide;
  competing operations MUST be refused immediately rather than queued.
- **FR-075**: Conversation history MUST be per document and per session, switch with tabs, disappear on
  tab close or relaunch, remain fully visible when older turns are trimmed from model context, and never
  displace the current directive or scoped content.
- **FR-076**: The composer MUST state whether the current turn can access only the current document or
  also allowlisted workspace files, and the model picker MUST share the provider's filtering behavior.
- **FR-077**: A provider or model change during a run MUST leave that run unchanged and apply to the next
  run; streaming MAY improve display but correctness MUST not depend on streaming support.
- **FR-078**: The complete settings catalogue MUST expose the values and defaults below, write changes
  through immediately, reject values outside stated ranges instead of clamping, ignore unknown stored
  keys, fall back per missing value, and reset only the selected settings scope.
- **FR-079**: The complete shortcut catalogue below MUST use the platform's primary modifier, remain
  single-combination only, and keep platform-owned clipboard and undo actions in the native macOS menu.
- **FR-080**: The application MUST be installable on all three target platforms, register the four
  supported document extensions without silently taking default ownership, derive application and
  document icons from one source, and report an uninjected development build version as `dev`.

### Required Settings Catalogue

| Group               | Setting                    | Accepted values                               | Default                         |
| ------------------- | -------------------------- | --------------------------------------------- | ------------------------------- |
| Appearance          | Theme                      | Liquid Glass, Material, Minimal               | Material                        |
| Appearance          | Appearance                 | Auto, Light, Dark                             | Auto                            |
| Appearance          | Default open mode          | Reading, Editor                               | Editor                          |
| Editor              | Autosave                   | On, Off                                       | On                              |
| Editor              | Live preview               | On, Off                                       | On                              |
| Editor              | Line numbers               | On, Off                                       | On                              |
| Editor              | Word wrap                  | On, Off                                       | Off                             |
| Editor              | Default assistant scope    | Whole document, Selection                     | Whole document                  |
| Editor              | Editor text size           | 13, 14, 16 px                                 | 14 px                           |
| Editor              | Reading text size          | 15, 17, 19 px                                 | 17 px                           |
| Editor              | Reading width              | Narrow 60, Comfortable 72, Wide 90 characters | Comfortable 72                  |
| Markdown            | Standard                   | Minimal, GFM, Full                            | GFM                             |
| Markdown            | Format on explicit save    | On, Off                                       | Off                             |
| Markdown            | Lint on explicit save      | On, Off                                       | On                              |
| Markdown            | Bullet marker              | `-`, `*`, `+`                                 | `-`                             |
| Markdown            | Emphasis marker            | `_`, `*`                                      | `_`                             |
| Markdown            | Heading style              | ATX, Setext                                   | ATX                             |
| Export              | PDF styling                | Current theme, Clean document                 | Current theme                   |
| Content and privacy | External images and styles | Ask, Always allow, Always block               | Ask                             |
| Language            | Interface language         | English in v1                                 | English                         |
| Diagnostics         | Write logs locally         | On, Off                                       | On                              |
| Diagnostics         | Log level                  | debug, info, warn, error                      | warn release; debug development |
| Diagnostics         | Maximum log file size      | 1-100 MB                                      | 10 MB                           |
| Diagnostics         | Files retained             | 1-20                                          | 5                               |
| Diagnostics         | Days retained              | 1-365                                         | 30 days                         |
| Diagnostics         | Compress rotated logs      | On, Off                                       | On                              |
| Assistant context   | Estimator                  | Embedded estimate, characters divided by four | Embedded estimate               |
| Assistant context   | Safety margin              | Percentage                                    | 15 percent                      |
| Assistant context   | Reply reserve              | Token count                                   | 1,024                           |
| Assistant context   | Maximum tool iterations    | Positive count                                | 8                               |

Background networking and telemetry MUST appear as non-adjustable Off statements, and Assistant
requests MUST appear as an informational On demand statement. Resetting settings MUST NOT alter window
geometry, layout, or recent paths. A second open window keeps its acknowledged values until relaunch.

### Required Shortcut Catalogue

| Area     | Action                                                | Binding                                                                                          | Scope                            |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------- |
| Format   | Bold; Italic; Strikethrough; Inline code; Link; Image | Primary+B; Primary+I; Primary+Shift+X; Primary+E; Primary+K; Primary+Shift+I                     | Editor                           |
| Format   | Heading 1, 2, 3                                       | Primary+1, Primary+2, Primary+3                                                                  | Editor                           |
| Format   | Bullet; Numbered; Task list; Quote; Table             | Primary+Shift+8; Primary+Shift+7; Primary+Shift+9; Primary+Shift+period; Primary+Shift+T         | Editor                           |
| Tidy     | Format; Compact; Lint document                        | Alt/Option+Shift+F; Alt/Option+Shift+C; Alt/Option+Shift+L                                       | Document                         |
| File     | New file; New window; Open file; Open folder          | Primary+N; Primary+Shift+N; Primary+O; Primary+Shift+O                                           | Global                           |
| File     | Save; Save As; Export PDF; Close tab; Exit            | Primary+S; Primary+Shift+S; Primary+Shift+E; Primary+W; Primary+Q                                | Document or global as applicable |
| Tabs     | Next; Previous; Reopen closed                         | Primary+Tab or Primary+PageDown; Primary+Shift+Tab or Primary+PageUp; Primary+Shift+Alt/Option+T | Global                           |
| Search   | Find; Replace; Next; Previous                         | Primary+F; Primary+H; F3; Shift+F3                                                               | Editor                           |
| Navigate | Quick open; Command palette; Outline                  | Primary+P; Primary+Shift+P; Primary+Shift+U                                                      | Global                           |
| View     | Sidebar; Reading; Reading size up/down/reset          | Primary+backslash; Primary+Enter; Primary+equals, Primary+minus, Primary+0                       | Global or document               |
| App      | Settings; Shortcut dialog; Full screen                | Primary+comma; Primary+question mark; F11                                                        | Global                           |

`Primary` means Ctrl on Windows/Linux and Cmd on macOS. `Alt/Option` follows the same platform mapping.
Primary+Shift+F remains unbound and unreserved; there is no folder-wide content search.

### Key Entities _(include if feature involves data)_

- **Document**: A stable identity, optional path, canonical text, disk baseline, encoding and line-ending
  characteristics, modified/read-only state, and per-document view state.
- **Editor Working Copy**: The active document's immediate editable text, caret, selection, scroll, and
  pending synchronization state; it is temporary and never a second durable source of truth.
- **Workspace**: One optional folder root, its lazily discovered supported entries, enumeration state,
  and asset/tool access boundary.
- **Tab Set**: The ordered open-document identities, active document, revision used to reject stale
  commands, and recently closed history.
- **Application Layout**: Window size and state, pane visibility and widths, active arrangement, and
  most-recently acknowledged values shared across launches.
- **Appearance Preference**: Theme choice, user appearance choice, resolved light/dark appearance, and
  the complete visual palette applied to every surface.
- **Setting**: A stable key with one declared type, accepted range or values, default, current value,
  and group; unknown and missing values are handled independently.
- **Provider Profile**: Provider kind, endpoint, authentication mode, credential-variable name, selected
  discovered model, model filter, optional inference parameters, verification state, and per-model
  capability results.
- **Assistant Action**: Stable identifier, localized label, family, directive, prerequisites, default
  scope, and preservation contract.
- **Assistant Run**: Frozen provider/model choice, scope, prompt, context allocation, attempts,
  iterations, wall-clock budget, cancellation state, observations, and one terminal outcome.
- **Proposal**: Intended replacement text, document identity, scope and base revision, computed review
  difference, and applied, re-run, discarded, or stale state.
- **Transcript**: Session-only turns associated with one document, including user prompts, assistant
  replies, capability observations, proposal outcomes, and visible limit or cancellation results.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new user can launch the application and open a supported local document into a readable
  view in under 10 seconds without creating an account or connecting to a service.
- **SC-002**: The rendering fixture corpus produces the expected readable result at all three Markdown
  levels, with 100 percent of hostile-content fixtures inert and no single failing block blanking the
  surrounding document.
- **SC-003**: All user-facing surfaces pass visual and interaction review at 375 px, 768 px, and a
  desktop width across all six theme and resolved-appearance combinations, for 18 combinations per
  affected surface.
- **SC-004**: During five minutes of representative Viewer and Editor use with a network monitor, the
  application makes zero outbound requests; an Assistant request occurs only after the matching user
  action and only to the selected endpoint.
- **SC-005**: On representative mid-range hardware, 95 percent of editing samples update the caret
  within 16 ms and update live preview between 150 and 300 ms after typing pauses for documents at or
  below 2 MB.
- **SC-006**: Round-trip tests preserve 100 percent of fixture permissions, LF/CRLF line endings,
  byte-order marks, and tolerantly decoded bytes, and every injected write failure leaves the original
  file unchanged.
- **SC-007**: Keyboard-only walkthroughs complete every Viewer, Editor, Assistant action, and chat
  journey with a visible focus indicator and no pointer-only action.
- **SC-008**: Boundary tests at 2 MB, 10 MB, 50 MB, 40 documents, 20,000 entries, 12 levels, and 1,000
  displayed results produce the specified success, degradation, or refusal outcome with no crash,
  silent truncation, or partial load.
- **SC-009**: Every predefined Assistant action can be completed from scope selection through Apply,
  Re-run, or Discard, and 100 percent of test runs leave disk unchanged until the user separately saves.
- **SC-010**: Every over-context, stale-proposal, invalid-capability, repeated-call, timeout, cancellation,
  and provider-failure fixture reaches exactly one classified terminal outcome and leaves the app ready
  for the next operation.
- **SC-011**: Switching between two open documents shows the correct document and transcript in 100
  percent of test transitions; closing a tab or relaunching leaves no retained conversation history.
- **SC-012**: Every functional requirement is mapped during planning to at least one acceptance test or
  explicit live verification case, and no requirement is classified delivered solely from a phase or
  story status label.

## Assumptions

- The appearance batch is authoritative in this feature: `appearance-contract.md` supplies its
  complete behavior, exact values, edge cases, and proving evidence, while
  `surface/mockup.html` is the binding visual source. The corresponding files under
  `docs/delivery/` are historical reference only. Other legacy requirements transfer to Spec Kit one
  requirement at a time after their complete behavior, exact values, edge cases, and proving evidence
  are mapped without loss and the transfer is explicitly approved.
- This invocation creates one consolidated product specification because the requested stages are one
  dependency chain sharing documents, rendering, settings, safety rules, and acceptance evidence.
- Viewer, Editor, Assistant actions, and Assistant chat are delivery stages, not separate editions or
  permission tiers. Later stages include all earlier-stage behavior.
- Viewer includes the complete safe rendering, themes, local file-open, tabs, reading, settings,
  window, and platform-open experience required to read arbitrary supported local documents.
- Editor includes file creation and saving, Markdown manipulation, workspace browsing, navigation,
  validation, and PDF export. It does not include rich-text/WYSIWYG editing, cross-file content search,
  workspace rename/move/delete, HTML export, or runtime plugins.
- Assistant actions are implemented before custom chat. All Assistant behavior is centered on the
  active tab; optional workspace reads never change the primary document focus.
- The default Assistant provider remains local. Remote providers are explicit opt-in choices and
  credentials remain outside application storage.
- Existing delivered behavior is preserved through the migration but does not become evidence that a
  broader stage is complete. Before assigning implementation work, planning MUST inspect the current
  production path and direct evidence against the completely mapped requirement. Conforming behavior
  is preserved, partial or defective behavior is repaired by its owning slice, and missing behavior is
  implemented. Historical completion labels alone prove nothing.
- Spec Kit replaces legacy planning and traceability validation as those checks become redundant.
  The first implementation phase MUST remove superseded workflow-only validators and their wiring,
  but MUST retain product tests, architecture tests, formatting, type checking, linting, build checks,
  trustworthy baseline verification, and required live or real-build verification.
- The first Spec Kit implementation phase fixes specification contradictions, unreliable gates,
  superseded workflow validators, and foundation defects that can be verified without inventing a
  future consumer. Every other known gap remains required and MUST be owned by the earliest
  user-facing slice that exercises its production seam.

## Migration Baseline and Source Coverage

### Status vocabulary

- **Delivered**: Current code and direct tests provide evidence for the stated capability.
- **Partial**: Some required behavior exists, but the complete requirement or user journey does not.
- **Not delivered**: No production user journey currently provides the capability.
- **Blocked or unreliable**: Work or evidence exists, but a known specification, traceability, or gate
  problem prevents a trustworthy completion claim.

### Current capability baseline

| Capability                                                                                                                                                                | Status on 2026-07-30    | Planning interpretation                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native application foundation, typed failures, local settings storage, multi-window-safe persistence, adapter boundary, and three-region shell reservation                | Delivered foundation    | Preserve and verify; this is infrastructure, not a complete Viewer journey.                                                                                                                 |
| One in-memory document with source editing, sanitized GFM preview including footnotes, Editor/Split/Preview arrangements, counts, and debounced canonical synchronization | Delivered limited slice | Preserve; it has no real file open/save, tabs, workspace, or reading-mode journey.                                                                                                          |
| Application palette choice, six base palettes, persisted appearance values, and bundled Material/Minimal fonts                                                            | Partial                 | The base palette story shipped, but complete tokens, generated editor palettes, live Auto behavior, first-paint correctness, and the full 18-combination gate remain unfinished or blocked. |
| Complete app window, menus, dialogs, notifications, launcher, responsive chrome, and settings interface                                                                   | Not delivered           | Re-plan under Viewer before declaring the product visually complete.                                                                                                                        |
| Real file open/save, atomic preservation, tabs, drag/drop, operating-system open, and recent files                                                                        | Not delivered           | Required for both complete Viewer and Editor stages.                                                                                                                                        |
| Complete rich rendering, reading mode, local/remote assets, diagrams, mathematics, highlighting, and three Markdown levels                                                | Partial                 | Base GFM and sanitization exist; the complete Viewer renderer does not.                                                                                                                     |
| Formatting toolbar, shortcuts registry, paste/drop transformations, find/navigation, formatter, linter, workspace, and PDF export                                         | Not delivered           | Editor-stage scope.                                                                                                                                                                         |
| Installers, file associations, platform icons, and package command                                                                                                        | Not delivered           | Required before Viewer or Editor can be called distributable.                                                                                                                               |
| Provider configuration, model discovery, prompt/context controls, and predefined Assistant actions                                                                        | Not delivered           | Assistant action-stage scope.                                                                                                                                                               |
| Custom document chat, bounded capability loop, transcripts, and proposal workflow                                                                                         | Not delivered           | Assistant chat sub-stage, after predefined actions.                                                                                                                                         |

### Known gaps that planning must not hide

The first implementation phase owns migration blockers and independently verifiable foundation
repairs. A gap that requires a not-yet-built product consumer is not deferred indefinitely: planning
MUST assign it to the earliest user-facing slice that exercises that seam and include its failure and
recovery evidence in that slice.

- Current state projection supports only one effective event subscriber; an additional subscriber can
  be discarded silently.
- The current one-document model assumes a non-empty tab set; real empty-state and multi-tab behavior
  require correction rather than extension of that assumption.
- The development bridge and canonical application model disagree about modified-state behavior, so
  mock-only evidence cannot prove file lifecycle correctness.
- The reserved three-region shell has historically been tested through a mock of itself and lacks
  trustworthy user-interface evidence.
- Encoding and line-ending labels can expose untranslated catalogue keys in the current limited editor.
- Theme delivery inherited a truncated requirement copy and a previously unreliable static-analysis
  baseline. The syntax-scope conflict is resolved by FR-017: generated Monaco rules use bundled
  language-qualified tokens such as `keyword.md` and `keyword.go`, including qualified descendants,
  so Markdown and embedded-language palettes remain distinct. Theme completion still requires a
  trustworthy baseline before implementation.
- One database concurrency test is intermittently unreliable under CPU contention.
- The shared long-operation gate and settings adapter exist without production consumers, so their
  important busy, cancellation, failure, and round-trip paths remain unproven.
- Packaging intentionally fails because the distributable packaging stage has not been implemented.
- Architecture checks are absent from continuous integration, and continuous integration itself does
  not run on ordinary branch or pull-request changes.
- Legacy planning, story-copy, phase-status, and retired-requirement traceability validators are
  superseded by the SpecKit feature artifacts. The first implementation phase removes their command
  wiring only after confirming that it provides no retained
  product, architecture, quality, build, baseline-reliability, or live-verification evidence.
- Startup failure copy differs between the governing specification and current interface.
- Many historical test traceability tags point to retired or nonexistent requirements; they must be
  reconciled to these requirements or removed only when direct review shows they prove no current rule.

### Legacy source coverage map

This consolidated specification covers every current product source as follows. During planning, the
source file remains authoritative for each clause until its complete behavior, exact values, edge cases,
and proving evidence are mapped to the listed requirement group without loss and explicitly approved.
Approval transfers authority only for that mapped requirement; it does not implicitly supersede other
clauses in the same source file.

| Current source                                              | Consolidated coverage                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `constraints.md`                                            | FR-001 through FR-010 plus stage-specific accessibility, privacy, limits, settings, notifications, and live evidence |
| `the-app-window.md`                                         | FR-011 through FR-014                                                                                                |
| `themes-and-appearance.md`                                  | FR-015 through FR-017                                                                                                |
| `choosing-a-markdown-standard.md`                           | FR-018 and FR-019                                                                                                    |
| `rendering-rich-documents.md`                               | FR-020 through FR-022                                                                                                |
| `reading-a-document.md`                                     | FR-023 and FR-024                                                                                                    |
| `images-and-remote-content.md`                              | FR-025 and FR-026                                                                                                    |
| `opening-files-from-the-desktop.md`, `dragging-files-in.md` | FR-027 and FR-028                                                                                                    |
| `writing-in-the-editor.md`                                  | FR-029 through FR-033                                                                                                |
| `formatting-text.md`, `keyboard-shortcuts.md`               | FR-034 through FR-037                                                                                                |
| `opening-and-saving-files.md`, `working-in-tabs.md`         | FR-038 through FR-043                                                                                                |
| `a-folder-of-notes.md`                                      | FR-044 and FR-045                                                                                                    |
| `finding-things.md`                                         | FR-046 and FR-047                                                                                                    |
| `tidying-markdown.md`                                       | FR-048 through FR-050                                                                                                |
| `exporting-a-document.md`                                   | FR-051 and FR-052                                                                                                    |
| `settings.md`, `language-and-text.md`                       | FR-005 through FR-007, FR-014 through FR-018, FR-024, FR-026, FR-035, and FR-053 through FR-064                      |
| `connecting-an-ai-provider.md`                              | FR-053 through FR-058                                                                                                |
| `quick-actions.md`, `how-much-fits-in-context.md`           | FR-059 through FR-067                                                                                                |
| `chatting-about-a-document.md`                              | FR-068 through FR-077                                                                                                |
| `surface/mockup.html`                                       | User Stories 1 through 4 and SC-003; shape and presentation arbitration remains authoritative during migration       |

## Out of Scope

- Rich-text or WYSIWYG editing, an editable rendered preview, or a second Markdown interpretation.
- Runtime plugins, downloadable themes, custom accent colors, remote fonts, or remote language packs.
- Accounts, cloud synchronization, collaboration, telemetry, analytics, crash upload, or automatic
  update checks.
- Cross-file content search or replace. Quick open searches filenames only; workspace reads by the
  Assistant are not a general search feature.
- Workspace rename, move, delete, disk reorder, continuous filesystem watching, or arbitrary extra
  asset roots.
- HTML export, batch/folder export, selection export, or application-managed clipboard conversion.
- Automatic document modification by a model, partial proposal apply, persisted conversations, an
  arbitrary filesystem tool, shell/process execution, or assistant-initiated networking.
- More than the three specified themes, three Markdown levels, four Assistant action families, six
  provider kinds, or five Assistant capabilities without a separately approved specification change.
