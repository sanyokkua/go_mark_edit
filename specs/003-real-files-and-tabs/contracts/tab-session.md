# Contract: Real Tabs and Activation-Scoped Editor Sessions

## Backend tab contract

The backend owns `OrderedTabSet { orderedDocumentIds, activeDocumentId?, revision }`. Every effective add, remove,
reorder, or active-set transition increments the tab-set revision exactly once. Same-position reorder and cancelled
drag do not issue a command and do not bump revisions.

### ActivateDocument

```text
ActivateDocument(targetDocumentId, expectedTabSetRevision) -> ActiveBufferAcknowledgement
```

Frontend precondition: capture the current activation and await the newest buffer and view flush. If either fails,
do not call the command. Backend sequence:

1. Require matching tab-set revision and existing target.
2. If already active, return the matching current acknowledgement without an extra state transition.
3. Set active id and publish a content-free active/revision patch.
4. Return `{documentId, documentRevision, projectionRevision, content}`.

Frontend applies the acknowledgement only when:

- it is the newest activation request generation;
- Redux has synchronously applied at least `projectionRevision`;
- projected active id equals `documentId`;
- projected document content revision equals `documentRevision`.

Otherwise it is discarded without installing content.

### ReorderDocument

```text
ReorderDocument(documentId, targetIndex, expectedTabSetRevision) -> TabTransitionOutcome
```

Validate identity, index and revision before mutation. Same-position is a successful no-op without revision bump.
A stale result never changes local order optimistically.

### Tab navigation

Next/Previous resolves the target from the backend-confirmed order captured at dispatch. The canonical bindings are:

- next: `Ctrl/Cmd+Tab` and `Ctrl+PageDown`;
- previous: `Ctrl/Cmd+Shift+Tab` and `Ctrl+PageUp`;
- close active: `Ctrl/Cmd+W`;
- reopen last: `Ctrl/Cmd+Shift+Alt/Option+T`;
- Table remains `Ctrl/Cmd+Shift+T`;
- no by-number binding exists.

## Lifecycle flush contract

`flushActiveSession(expectedDocumentId, expectedActivationToken)` performs one all-or-nothing frontend barrier:

1. Resolve the exact active editor handle/token.
2. Capture current content, caret, selection, editor scroll, preview scroll, and current arrangement/view.
3. Queue content and complete view state for the same document.
4. Await the buffer queue through the captured generation.
5. Await the view queue through the captured intent.
6. Return the accepted identity/revision or fail.

The tab identity does not change until both queues succeed. Blur may request a background flush, but Save/switch/
close/reload/hide must call and await this imperative barrier.

## Monaco activation contract

- Hydration/activation acknowledgement creates a fresh `activationToken` and fresh Monaco URI/model.
- Only that model contains source in the webview.
- Deactivation disposes model/session only after the flush barrier succeeds and before incoming content installs.
- Returning to the same document creates a new model; Monaco undo/redo history does not survive.
- Setting/theme/arrangement changes during one activation update the live model in place and preserve its content,
  caret, selection, scroll, and undo history.
- `useDocumentCommands` continues validating document id plus activation token. A stale formatting action returns
  `document-mismatch` and cannot mutate a replacement model.

## View-state contract

Each backend Document owns mode, Editor/Split/Preview arrangement, caret, selection, editor/preview scroll, dirty,
and save/capability state. Switching restores the target's values. Per-path persisted arrangement is fallback only
on Open; the recently closed entry can restore full view metadata when reopening within the window.

## Real tab surface

Each projected tab exposes:

- filename and enough parent segments to distinguish identical basenames;
- full canonical path in tooltip and Copy path only;
- active/inactive treatment independent from the unsaved dot;
- dirty dot on active/background tabs, muted only during a real write;
- close affordance and accessible name;
- New affordance.

### Disambiguated label rendering

A tab displays `basename — shortest unique canonical parent suffix`, using the fewest trailing parent segments that
distinguish every open matching basename under the host filesystem's canonical identity comparison, recomputed
after open, close, or Save As. When identical basenames also share identical immediate parent names, the suffix
extends by further segments until unique.

- C0 control characters, DEL (U+007F), and bidirectional-formatting controls MUST render as visible `\uXXXX`
  escapes; remaining user-supplied path text MUST be directionally isolated so it cannot spoof adjacent chrome.
- Visual ellipsis MUST retain part of the distinguishing suffix; truncating to the basename alone is a failure.
- The complete disambiguated label remains the accessible name, and the approved full canonical path remains in
  the tooltip and explicit path actions only.

The strip scrolls inside its own bounds and does not shrink labels to unreadable widths or create page scroll.
Drag shows exact insertion, reduced-opacity source, Escape cancellation, edge autoscroll, and no command for a
same-position drop.

The tab context menu order is exactly Close, Close others, Close to the right, Move tab left, Move tab right,
Copy path, Reveal in file manager. The Move actions sit after the close group and before the path group, and are
unavailable at their respective strip edges. Path actions are unavailable for untitled documents. Workspace/tree
operations are absent.

Copy path copies the exact canonical absolute path of any path-backed document, including a detached one, to the
clipboard and announces `Copied path for {safe filename}` via a transient polite live-region notification. Reveal
revalidates existence first: a known-missing target shows Reveal as unavailable; a disappearance discovered only
at invocation marks the document detached and reports one deduplicated `not-found` error offering Save to recreate
and Copy path. On a still-present target, Reveal requests native exact-file selection where supported, otherwise
opens the containing folder; OS acceptance is success with no toast. A clipboard write failure (Copy path) or OS
command failure (Reveal) reports one deduplicated `system-command-failure` error naming only the safe basename,
offering Retry, and — for Reveal — also Copy path. Either action closes the menu and returns focus without
activating another document: originating tab if present, else current tab, else tab-strip New, else launcher New;
a successful Reveal restores that focus only once the application regains foreground focus. See the classified
error and remediation contract in `spec.md` for the full category/remediation vocabulary.

## Recently closed contract

The backend holds at most 40 unique path-backed entries per window, newest first, each containing canonical path
and view metadata only. Closing moves a path to the top. Untitled documents and source never enter the list.

`ReopenLastFile(expectedTabSetRevision)`:

1. Refuse a 41st document before touching the entry.
2. Call canonical Open with a fresh identity, or focus an already-open path.
3. Consume the entry on either success.
4. Remove a missing path and return a classified `not-found` error.
5. Retain another failed Open for retry.
6. Repeated successful calls continue newest first.

Discarded edits are never restored; the current disk content is read.

## Stale and failure invariants

- A failed outgoing flush leaves current tab/session/content active.
- A late activation/reload never installs content after another request wins.
- A stale reorder/close changes no order, active identity, close state, or recently closed history.
- Closing active selects an adjacent backend-defined tab; closing final projects active id/buffer absent together.
- No component dispatches an optimistic tab/order/document projection update.

## Required proof

- Pure backend order/revision/add/remove/reorder/no-op/adjacent/final-close tests.
- Adapter buffer+view generation barrier tests, including one side failing.
- Activation request races and mismatched id/document/projection revisions.
- Monaco fresh URI/model/token, disposal, inactive-source absence, no cross-switch undo, same-activation settings
  preservation, and Feature 002 formatting regressions.
- Identical basename, 40-tab navigation, drag/Escape/edge/no-op, middle-click/close/context path availability,
  keyboard/focus, and contained overflow journeys.
- Reopen uniqueness/consume/missing/retry/fresh-id/view/no-source tests.
