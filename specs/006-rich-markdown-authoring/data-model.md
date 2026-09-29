# Data Model: Rich Markdown Authoring

**Feature**: `specs/006-rich-markdown-authoring` | **Date**: 2026-09-29

The feature adds no database table and no backend-owned document state. The only persisted values are the six
existing Markdown settings. Everything else is a value type, an ephemeral frontend value, or a field added to an
existing bridge result. The backend stays authoritative for documents, settings and paths; the frontend
projection is disposable.

## Persisted: Markdown settings (existing group)

Owner: `internal/settings/` (keys `markdown.standard`, `format.onSave`, `lint.onSave`, `format.bulletMarker`,
`format.emphasisMarker`, `format.headingStyle` in the `settings` KV table).

| Field            | Type                           | Default | Notes                                                  |
| ---------------- | ------------------------------ | ------- | ------------------------------------------------------ |
| `standard`       | `'minimal' \| 'gfm' \| 'full'` | `full`  | Invalid or missing stored value reads as the default   |
| `bulletMarker`   | `'-' \| '*' \| '+'`            | `-`     | Format, Lint and the toolbar list actions              |
| `emphasisMarker` | `'_' \| '*'`                   | `_`     | Format, Lint and the toolbar emphasis actions          |
| `headingStyle`   | `'atx' \| 'setext'`            | `atx`   | Format and Lint only; toolbar heading actions stay ATX |
| `formatOnSave`   | boolean                        | `false` | Explicit saves of the active document only             |
| `lintOnSave`     | boolean                        | `true`  | After an explicit save of the active document          |

No migration: missing keys read as the default. Changes to existing code (research R16):

- Backend default `standard` changes from `gfm` to `full` (`internal/settings/model.go:53`); the other five
  defaults are already as above.
- The frontend slice defaults (`settingsSlice.ts:12-19`: `gfm`, emphasis `*`, Lint on save off) are removed; the
  slice holds no Markdown settings until `hydrated` is true.
- The fallbacks in `SettingsMenu.tsx:227` (`?? 'gfm'`), `:241` (`?? false`), `:248` (`?? true`) and
  `StatusBar.tsx:61` (`?? 'gfm'`) are removed.
- The preview header's fixed "GFM" string (`editor.preview.flavour`, `EditorStage.tsx:292`, `en.json:57`) is
  replaced by the stored standard.
- Status keys `status.markdownStandard.minimal` and `status.markdownStandard.full` are added; the unused
  `status.markdownStandard.commonmark` is removed.
- Before hydration (FR-ST-002): the preview header and the status bar show no standard; the Markdown settings
  rows (popup and dialog group), Format, Compact, Lint and the toolbar actions that use the bullet or emphasis
  marker are unavailable; the preview body renders nothing (loading state). No settings write is issued before
  hydration, so a write never merges into an unloaded group.

## Value: MarkdownStandard capabilities (frontend, static)

| Standard | Syntax added over CommonMark                                                        |
| -------- | ----------------------------------------------------------------------------------- |
| minimal  | none                                                                                |
| gfm      | tables, task lists, strikethrough, extended autolinks, footnotes, YAML front matter |
| full     | gfm plus inline and display math, `math` fences, five admonition containers, alerts |

The raw-HTML policy, fence highlighting and Mermaid apply at every standard.

Tidy always parses with the `full` set regardless of the selected standard, and treats `.txt` like Markdown.

## Value: TidyPreferences

`{ bullet: '-' | '*' | '+'; emphasis: '_' | '*'; heading: 'atx' | 'setext' }`, derived from the settings; a
snapshot is copied into each run so a settings change mid-run does not affect it.

## Value: TextEdit

`{ from: number; to: number; text: string }`, offsets into the LF-normalised text the run received. Edits are
non-overlapping and sorted by `from`. A run's edit list is applied to the editor as one undo step.

## Value: LintFinding

| Field                                              | Type                   | Rule                                         |
| -------------------------------------------------- | ---------------------- | -------------------------------------------- |
| `rule`                                             | rule id (below)        | exactly one of the ten ids                   |
| `severity`                                         | `'error' \| 'warning'` | fixed per rule (below)                       |
| `startLine`, `startColumn`, `endLine`, `endColumn` | number, 1-based        | position-only findings widen to word or line |
| `message`                                          | catalogue key + args   | localized at display time                    |
| `hint`                                             | catalogue key          | the fix hint shown in the hover              |

Rule ids and severities: `ul-marker` (warning), `emphasis-marker` (warning), `strong-marker` (warning),
`heading-style` (warning), `list-indent` (warning), `single-h1` (warning), `trailing-space` (error),
`blank-lines` (warning, one finding per run), `fence-language` (warning), `final-newline` (error). A finding
belongs to one document and one run; a new run replaces the previous set.

## Value: ProblemsSummary (active document)

`{ findings: LintFinding[] (document order); total: number; stale: boolean }`. `total` is exact (may exceed
1,000); markers cover the first 1,000; the problems list shows the first 10,000 and then "N more not shown".
`stale` becomes true when the document changes after the run and false at the next completed run. One summary
exists, for the active document, in frontend memory only. It is discarded, with the editor markers, when
another document becomes active or the document closes; returning to the document shows no findings until Lint
runs again.

## Ephemeral store: OperationSlot (one per window)

```ts
type OperationSlotState =
    | { state: 'idle' }
    | {
          state: 'running';
          kind: 'format' | 'compact' | 'lint';
          documentId: string;
          progress: { done: number; total: number } | null;
      };
```

- Every Format, Compact and Lint run holds the slot from its start until its one outcome. `acquire(kind, { documentId, size })` moves
  idle to running and is refused while running; it returns a handle `{ signal, abort, setProgress, release }`; `release()` moves running to idle and is idempotent.
- While running, Format, Compact and Lint are all disabled with the "another operation is in progress" tooltip,
  except the running action's Cancel.
- `progress` is non-null, and progress and Cancel are shown, from the start of a run on a document larger than
  1 MiB, and from the moment any other run has lasted longer than one second.
- The run records `documentId` and the text version it started from. If the text changes or another document
  becomes active before the result arrives, the result is discarded as `stale` (FR-TD-015).
- Terminal outcomes: `done`, `cancelled`, `refused`, `failed`, `stale`. Cancel aborts the signal, which
  terminates the worker.
- The store is outside Redux and is not part of the backend projection.

## Value: TidyOutcome

| Outcome     | Producer | Payload                    | Effect                                                        |
| ----------- | -------- | -------------------------- | ------------------------------------------------------------- |
| `edits`     | worker   | `edits: TextEdit[]`        | applied as one undo step; empty list changes nothing          |
| `findings`  | worker   | `findings`, `total`        | replaces the document's ProblemsSummary                       |
| `refused`   | worker   | `reason: 'render-differs'` | text and findings unchanged; notice                           |
| `cancelled` | caller   | none                       | text and findings unchanged                                   |
| `failed`    | caller   | none                       | text and findings unchanged; notice with a stated reason      |
| `stale`     | caller   | none                       | result discarded; text and findings kept; `tidy-stale` notice |

`edits` and `findings` are the `done` outcome of the slot. A Format on save that ends `refused`, `cancelled`,
`failed` or `stale`, or finds the slot held, saves the unformatted text with the formatting-skipped notice
(FR-ST-005).

## Value: LinkTarget (frontend classifier `classifyLink`)

The existing kind names stay.

| Kind            | Fields                           | Next step                                                     |
| --------------- | -------------------------------- | ------------------------------------------------------------- |
| `anchor`        | `href`, `fragment`               | scroll the preview to the heading                             |
| `localDocument` | `href` (as written), `fragment?` | `openLink()`; the backend resolves the path                   |
| `external`      | `href` (http or https)           | open in the system browser                                    |
| `refused`       | `href`, `reason`                 | the existing refused-link notice naming the target and reason |

`localDocument` no longer carries today's `path` field (the target resolved lexically against the document's
folder): the backend resolves the target, so the classifier computes no path. Consequences:

- `linkPolicy.ts`: `classifyLink` stops checking folder membership and the suffix, so its supported-suffix set
  and those checks leave the classifier; `LinkRefusalReason` loses `outside-document-folder` and
  `unsupported-extension` and gains `network-path`; `linkPolicy.test.ts` drops its `path` expectations.
- `imagePolicy.ts`: unchanged. It still imports `resolveLocalPath` and `isInsideDocumentFolder` from
  `linkPolicy.ts`, which stay exported with the same behaviour, and keeps its own reason type with
  `outside-document-folder`.
- `PreviewPane.tsx` never reads `path`, so no consumer changes for the removed field.

Refusal reasons:

- Kept: `empty`, `scheme` (includes `file:`), `malformed`, `untitled-document` (now only a relative target while
  the document is untitled; absolute local targets pass, FR-LK-010).
- Added: `network-path` for UNC paths with either slash (`//host/x`, `\\host\x`) and device-namespace paths
  (`\\?\`, `\\.\`), refused on every platform, checked after percent-decoding so `%5C%5Chost…` and
  `%2F%2Fhost…` are refused too. Today `//` is refused as `scheme` and `\\host\x` is not refused on
  POSIX.
- Removed: `outside-document-folder` and `unsupported-extension`. Suffix support, existence and folder
  membership are decided by the backend, which needs symbolic-link resolution.

The classifier behaves identically on every platform: back-slash and drive-letter spellings (`C:\…`, `sub\b.md`)
classify as `localDocument`. On Windows the backend resolves them like the forward-slash form (FR-LK-014); on
POSIX it treats `\` and a drive prefix as ordinary file-name text, so the result is usually the `not-found`
notice. UNC and device paths are refused on every platform. `imagePolicy` keeps
its own `outside-document-folder` reason and the shared helpers `resolveLocalPath` and `isInsideDocumentFolder`
unchanged.

## Bridge result: OpenResult (additions)

`OpenResult` (`internal/apperr/results.go`) already carries `Status`, `DocumentID`, `Path` (set today only for
`folder-target`, returned by Reopen for a recent folder; a link never sets it), `ProjectionRevision`,
`ActiveBuffer` and `Error`. Added: `RevealPath string` (`revealPath`) and `TreePath string` (`treePath`), both
empty by default.

| Outcome                                  | Status           | Error category        | RevealPath | TreePath         |
| ---------------------------------------- | ---------------- | --------------------- | ---------- | ---------------- |
| Supported document opened or focused     | opened / focused | none                  | empty      | set if a row (1) |
| Existing file, unsupported suffix        | refused          | `unsupported-input`   | absolute   | empty            |
| Missing target                           | refused          | `not-found` (as Open) | empty      | empty (3)        |
| Folder, unreadable, over 50 MiB, 40 open | refused          | as Open (2)           | empty      | empty (3)        |
| UNC, device or other network path        | refused          | `unsupported-input`   | empty      | empty            |
| Untitled source with a relative target   | refused          | `unsupported-input`   | empty      | empty            |

(1) Set when a folder is open and the target is inside it with a row in the tree. (2) The classification the
Open command gives for the same condition, with its notice (the 40-document case shows the existing capacity
notice); for a folder target this replaces today's `unsupported-input`. (3) `OpenPreviewLink` replaces the
refused result's safe subject (`Error.SafeSubject` and `Failure.Subject`, the literal `document` from
`PrepareOpen`) with the target's safe basename, so the classified notice names the file and never the
absolute path; `openLink()` reports it through `reportEntryError` without an intent, so no Retry is offered.
Network paths show the existing refused-link notice.

`TreePath` is the snapshot node's path, found by the lookup in research R14: a segment matches exactly, or, when
it differs only in capitalisation, when both files have the same `file.Identity` (the identity Open uses to
focus an existing tab). Where `file.Identity` falls back to the path string, a case-only difference never
matches. `RevealPath` and `TreePath` are
absolute paths shown only to the user who followed the link and never logged (Constitution IV: no user home
paths in logs).

Consumers that must carry the new fields: `adapter/index.ts` `normalizeOpenResult` (copies fields one by one),
`logic/store/appModelTypes.ts` (`OpenResult` type), `logic/hooks/useLivePreview.ts`, `app/useCommands.ts`
(`openLink()` shows the unsupported-file notice when `revealPath` is set and reports every other backend
refusal through `reportEntryError`; `openResultRefusal` in `ui/widgets/PreviewPane.tsx` is deleted), and the
notification path: `classifiedNotification.ts:151` returns
false for the `reveal-workspace-path` remediation argument and `useNotifications.ts:157` treats it as a no-op,
so the reveal action would not render or act until both change. Generated Wails models are regenerated by the
build.

## Ephemeral requests (frontend)

| Request             | Fields                                              | Producer                       | Consumer        |
| ------------------- | --------------------------------------------------- | ------------------------------ | --------------- |
| Tree reveal request | `{ documentId: string; path: string; seq: number }` | `openLink()` (from `TreePath`) | `WorkspaceTree` |
| Fragment request    | `{ documentId: string; slug: string; seq: number }` | `openLink()`                   | preview, editor |

The tree consumes the reveal request when the document `documentId` becomes active (the activation has landed
and its active path is the target), expands
the ancestors of `path`, sets its selection to `path` explicitly and scrolls the row into view. The explicit
selection is required: `WorkspaceTree` selects the active document's path exactly and resets its local
selection when the active path changes (`WorkspaceTree.tsx:108-113`), and the active path can differ in
spelling from the node path. The preview scrolls to the
element with `id = slug` inside the preview container; the editor places the caret on the heading line.

A request is consumed once by `seq`; a later request replaces an unconsumed one. No match for `slug` leaves the
document at its top with no error.

## Value: Heading (shared extractor)

`{ depth: 1..6; text: string; slug: string; line: number }`, produced once from mdast by
`logic/markdown/headings.ts`. The preview assigns `id = slug` to the matching rendered heading; the editor uses
`line` for the caret. The slug rule is `github-slugger` with combining marks kept (research R10). The preview
assigns no `id` to headings written as raw HTML; an `id` the author wrote in raw HTML is kept as written
(research R7).

## Limits (numeric bounds, all with a visible outcome)

| Bound                                  | Value                | Outcome above the bound                                 |
| -------------------------------------- | -------------------- | ------------------------------------------------------- |
| Live preview pause                     | 2 MiB                | existing pause with manual refresh (unchanged, R22)     |
| Editable document                      | 10 MiB               | existing read-only opening; Format and Compact disabled |
| Tidy run shown as long run             | 1 MiB or 1 s         | progress and Cancel replace the triggering control      |
| Mermaid diagrams rendered              | 50                   | placeholder "too many diagrams to render" for the rest  |
| Mermaid source length                  | 50,000 chars         | placeholder "too large to render"                       |
| Mermaid edges                          | 500                  | parse-style error box with the engine message           |
| Formulas rendered                      | 1,000                | placeholder for the rest                                |
| Formula length                         | 10,000 chars         | placeholder "too large to render"                       |
| Unclosed `$` lookahead                 | 10,000 chars         | the `$` is literal text                                 |
| Fenced block highlighted               | 200,000 chars        | shown without colouring                                 |
| Editor lint markers                    | 1,000                | count in the status bar stays exact                     |
| Problems list rows                     | 10,000               | "N more not shown"                                      |
| Edits applied with `executeEdits`      | 20,000               | above: one whole-text replacement, still one undo step  |
| Open documents / open size / tree size | 40 / 50 MiB / 20,000 | existing notices, unchanged                             |
