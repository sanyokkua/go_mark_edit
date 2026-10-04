# Contract: Following a link to another local file

**Owners**: frontend `logic/markdown/linkPolicy.ts` (classifier) and `openLink()` in `app/useCommands.ts` (the
one open path); backend `internal/appmodel/preview_link.go` (resolver) with a path helper in
`internal/file/paths.go` and a tree lookup over the workspace snapshot; `WorkspaceTree` (reveal).
**Callers**: the preview (`MarkdownView` link activation through `PreviewPane`) and the editor (Cmd/Ctrl-click).
Both hand over the destination as parsed from the Markdown source, so angle brackets are already removed.

## Frontend classifier

`classifyLink(href: string, documentPath?: string): LinkTarget` (data model `LinkTarget`) reads the link as
written and never touches the disk. Kind names are the existing ones.

| Input                                                                  | Result                         |
| ---------------------------------------------------------------------- | ------------------------------ |
| `#section`                                                             | `anchor` with the fragment     |
| `http://…`, `https://…`                                                | `external`                     |
| path with optional `#fragment`, `%`-escapes, `./`, `../`, back-slashes | `localDocument`, fragment kept |
| drive-letter path (`C:\…`, `C:/…`); a single letter is not a scheme    | `localDocument`                |
| relative path while the document is untitled                           | `refused` `untitled-document`  |
| absolute path while the document is untitled                           | `localDocument`                |
| `//server/share/…`, `\\server\share\…`, `\\?\…`, `\\.\…`               | `refused` `network-path`       |
| the same spelled with escapes: `%5C%5Cserver\…`, `%2F%2Fserver/…`      | `refused` `network-path`       |
| `file:`, `mailto:`, `data:`, `javascript:`, `ftp:`, any other scheme   | `refused` `scheme`             |
| empty, or not percent-decodable                                        | `refused` `empty`, `malformed` |

"Network path" means exactly the UNC spellings (either slash) and the device-namespace spellings in the table: a Windows mapped drive (`Z:\…`) or a share mounted under a local directory (`/Volumes/…`) is an ordinary local path, and every URL scheme is handled by the `scheme` row.

The classifier percent-decodes the path part before its network-path check, so an escaped UNC or device
spelling is refused like the plain one. It behaves identically on every platform: back-slash and drive-letter
spellings classify as `localDocument` on macOS and Linux too, and the backend decides the outcome there (see the
resolver).

Refusal reasons are `empty`, `scheme`, `malformed`, `untitled-document` and `network-path`. The reasons
`outside-document-folder` and `unsupported-extension` are removed from links: the classifier no longer decides
folder membership, suffix support, existence or symlinks. `resolveLocalPath` and `isInsideDocumentFolder` stay
exported and unchanged, because `imagePolicy.ts` uses them; images keep the document-folder rule and their own
`outside-document-folder` reason.

## The one open path

```ts
async function openLink(target: LinkTarget & { kind: 'localDocument' }, sourceDocumentId: string): Promise<void>;
```

Steps, in order, as Open and Reopen do today:

1. `flushActiveDocument()`, so the outgoing document's latest edits stay in its tab.
2. `activation.begin()`.
3. `adapter.openPreviewLink(sourceDocumentId, href)`.
4. On `opened` or `focused`: `activation.acknowledge(generation, result.activeBuffer)`, so the editor and the
   preview show the target; reveal its tab; publish a tree reveal request (`result.documentId`,
   `result.treePath`) when `result.treePath` is set; publish
   a fragment request when the link has a fragment. When `result.documentId` equals `sourceDocumentId` (a
   self-link), the acknowledgement is skipped, so the source's editor session is not reinstalled, and only the
   fragment request is published (the generation claimed in step 2 is simply never installed).
5. On `refused`: with `result.revealPath` set, show the `link-unsupported-file` notice with the remediation
   `reveal-workspace-path` carrying that path; otherwise pass `result.error` to the existing `reportEntryError`
   in `useCommands.ts` without an intent, so the user sees the classified notice Open shows for the same
   condition, titled with the target's file name (resolver step 7). `NotificationRemediationIntent` has no
   `none` member; omitting the intent is the existing way `reportClassifiedError` offers no Retry, so
   `reportEntryError`'s `intent` parameter becomes optional and a link failure never offers a Retry that would
   re-run a different command. Nothing opens and the source document stays active.

Notices: only classifier refusals (`empty`, `scheme`, `malformed`, `untitled-document`, `network-path`) use
`preview-link-refused`, shown by the caller before any backend call. Every backend refusal reaches the user
through step 5.

`anchor` links scroll inside the preview container only. `external` links use the existing system-browser call.
A link to the current document with a fragment only scrolls; without a fragment nothing visible happens.

## Backend resolver (`OpenPreviewLink`)

`OpenPreviewLink(request, documentID, href) → OpenResult` keeps its handler shape. It:

1. Parses the href with a pure helper in `internal/file/paths.go` (called from `preview_link.go`): drops the
   query and fragment, percent-decodes (including `%20` and `%5C`), and splits separators and drive letters in
   the host's flavour. On Windows back-slash and drive-letter spellings resolve like the forward-slash form
   (FR-LK-014); on POSIX `\` and a drive prefix are ordinary file-name text, so such a target usually ends as
   `not-found`.
2. Refuses UNC paths (`\\server\share`, `//server/share`) and device-namespace paths (`\\?\`, `\\.\`), judged on
   the decoded path so escaped spellings are included, on every operating system before any read, as
   `unsupported-input` with the refused-link message.
3. Refuses a relative target from an untitled source document as `unsupported-input`; an absolute target from
   an untitled document continues.
4. Resolves a relative target against the source document's folder and canonicalises it (symlinks resolved).
5. Refuses an existing regular file whose suffix is not `.md`, `.markdown`, `.mdown` or `.txt`
   (case-insensitive) as `unsupported-input` and sets `RevealPath` to its absolute path.
6. Passes every other target to the existing `OpenPath`. Missing, folder, unreadable, over-50-MiB and
   40-document targets therefore get the classification Open gives, and an already-open file is focused as
   Open focuses it.
7. When `OpenPath` returns `refused`, replaces the result's safe subject (`Error.SafeSubject` and
   `Failure.Subject`, which `PrepareOpen` sets to the literal `document`) with the target's safe basename,
   derived by the rule `apperr.NewClassifiedError` applies (back-slashes read as `/`, then `filepath.Base`).
   The classified notice therefore names the file and never shows the absolute path. Category, message,
   remediations and the deduplication key (document id and category) are unchanged.

Removed from today's resolver: the `isWithinDirectory` check (the D11 folder limit), the blanket refusal of
every link from an untitled document, the suffix refusal for targets that do not exist, and the mapping of a
canonicalisation failure to `unsupported-input` ("could not be resolved").

**`TreePath`** is set on `opened` and `focused` when a folder is open, the target's canonical path is inside the
workspace's canonical root, and the snapshot has a node for it; otherwise it is empty. Containment is decided
as `createWorkspaceEntry` decides it: `filepath.Rel` from the root, outside when the result is absolute or
starts with `..`. The lookup is a small function over the in-memory snapshot (`service.state.workspace`).
A path segment matches a node exactly, or, when it differs only in capitalisation, when both files have the same
`file.Identity` (`internal/file/paths.go`), the identity Open uses to focus an existing tab. `file.Identity` is
the device and inode pair where the platform's file information exposes one, so on a case-insensitive
filesystem the two spellings name one file and match, and on a case-sensitive one they do not (FR-LK-005).
Where `file.Identity` falls back to the canonical path string, a case-only difference never matches and
`TreePath` is empty. Entries the tree omits
(dot-files, hidden folders while hidden, symlinks, unsupported suffixes, entries beyond the 20,000 limit)
simply yield an empty `TreePath`.

The fragment is never sent to the backend. `RevealPath` and `TreePath` are never logged.

## Consumers that change

- `internal/apperr/results.go` `OpenResult`: gains `RevealPath` and `TreePath` (data model `OpenResult`);
  `Path` is unchanged. The `frontend/wailsjs/` models are regenerated by the build, never edited.
- `logic/adapter/index.ts` `normalizeOpenResult`: copies fields one by one, so it adds `revealPath` and
  `treePath`.
- `logic/store/appModelTypes.ts` `OpenResult`: gains optional `revealPath` and `treePath`;
  `logic/hooks/useLivePreview.ts` (`openPreviewLink`) follows the type.
- `ui/widgets/PreviewPane.tsx`: `localDocument` activation calls `openLink` through a callback prop instead of
  the adapter; `openResultRefusal` is deleted, because backend refusals are reported by `openLink` (step 5);
  `refusalReason` serves classifier refusals only, gains `network-path` and loses the two removed reasons;
  anchors scroll inside the preview container.
- `app/useCommands.ts`: adds `openLink()`; `reportEntryError`'s `intent` parameter becomes optional.
- `logic/store/classifiedNotification.ts` `retryIsExecutable`: `reveal-workspace-path` is executable when `path`
  is non-empty (today it returns false, so the action would not render).
- `app/useNotifications.ts`: `reveal-workspace-path` calls `RevealWorkspacePath(path)` (a no-op today).
- `logic/markdown/linkPolicy.ts`: the classifier above; the helpers `imagePolicy.ts` shares stay unchanged.
- `ui/widgets/WorkspaceTree/WorkspaceTree.tsx`: consumes the tree reveal request.

## Fragment and tree reveal

- **Fragment request** `{documentId, slug, seq}`: once the target is active, a visible preview scrolls to the
  element with that id inside its container, and a visible editor places the caret on the heading's line (from
  `extractHeadings` on the target's text) and reveals it. No match: the document shows from its top, no error.
- **Tree reveal request** `{documentId, path, seq}`, like `tabRevealRequest`: `WorkspaceTree` consumes it when
  the document `documentId` becomes active (the activation has landed and its active path is the target), expands every collapsed ancestor of `path`, sets its selection to `path`
  explicitly and scrolls the row into view. The explicit selection is required because `WorkspaceTree`
  (`WorkspaceTree.tsx:108-113`) selects the active document's path exactly and resets its local selection
  whenever the active path changes; consuming the request before that reset would lose the selection, and the
  active path can differ in spelling from `treePath`. Other folders keep their expansion. An unknown path does
  nothing.

## Editor entry (Cmd or Ctrl click)

- A Monaco link provider for `markdown` returns ranges for inline links, reference-style links (`[t][ref]`,
  `[ref]` with a definition) and autolinks, taken from the document parsed with `syntaxPlugins('full')`
  (debounced). The `links` contribution underlines the target while the modifier is held.
- `registerLinkOpener` hands the clicked target to the `onLinkActivate(href)` prop of `CodeEditor`; the default
  opener is never reached. `monacoSetup.ts` and `CodeEditor.tsx` are shared components under `ui/components`
  and import nothing from `app/`, the store, the adapter or the action registry, so the widget that renders
  the editor supplies the handler, which runs `classifyLink` and then `openLink` (or the browser call for
  `external`, or the `preview-link-refused` notice for a classifier refusal). A click without the modifier only
  moves the caret. An anchor link moves the caret to the heading line in the same document.
- The modifier is Cmd on macOS and Ctrl on Windows and Linux.

## Tests

- Classifier: every table row, including Windows spellings as string cases with the same result on every
  platform and `%5C%5Cserver%5Cshare%5Ca.md` and `%2F%2Fserver/share/a.md` refused as `network-path`; `imagePolicy` cases unchanged.
- Go: resolver with symlink, hard link, case-only difference on a case-insensitive volume where available, UNC
  and device strings on every platform, folder, missing, permission, over 50 MiB, 40 documents, unsupported
  suffix with `RevealPath`, relative and absolute targets from an untitled document, `TreePath` inside and
  outside the folder and for a hidden folder; a missing and a folder target return the target's basename as the
  safe subject and no absolute path. Tests asserting the D11 refusals are rewritten.
- Go on POSIX: `C:\docs\a.md` and `sub\b.md` are read as literal file names and end as `not-found`; UNC and
  device strings are still refused as `unsupported-input`.
- Frontend integration: activation makes the target the active tab in the editor and the preview, keeps an
  unsaved edit in the source tab, publishes the tree reveal and leaves the tree selection on `treePath`, a
  self-link with a fragment only scrolls, and the Reveal action renders; a backend refusal (missing target,
  folder target) shows the classified notice Open shows, titled with the target's file name and without a Retry
  action, and a classifier refusal shows `preview-link-refused`.
- E2E on macOS: US3 scenarios 1 to 9 and 11 (scenario 10 is an integration test) and US4 scenarios 1 to 4.
  Windows spellings are covered by Go and classifier tests only.
