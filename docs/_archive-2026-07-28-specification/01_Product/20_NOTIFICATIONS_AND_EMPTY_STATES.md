**Status:** Accepted
**Owner:** architect
**Audience:** architect, coder, tester
**Last Updated:** 2026-07-25
**Cross-references:** `00_Foundation/04_DESIGN_DECISIONS.md` (DD-68), `01_Product/10_THEMING.md`, `01_Product/13_I18N.md`, `02_Architecture/06_ERROR_HANDLING.md`, `mockups/gomarkedit-mockup.html`

# Notifications, progress, and empty states

How the app tells you something happened, that something is happening, or that there is nothing here
yet. Realises DD-68. `02_Architecture/06_ERROR_HANDLING.md` owns the error _envelope_; this document
owns what the user reads.

## Table of Contents

1. [Two surfaces](#two-surfaces)
2. [Severity, duration and stacking](#severity-duration-and-stacking)
3. [Coalescing](#coalescing)
4. [What does and does not raise a notification](#what-does-and-does-not-raise-a-notification)
5. [Error copy](#error-copy)
6. [Progress and cancel](#progress-and-cancel)
7. [Empty states](#empty-states)
8. [Edge cases](#edge-cases)

## Two surfaces

Every notification declares a `surface`:

- **`toast`** — transient, stacked in the corner, dismissible, never blocks. For things that happened
  and are over: a file saved, a drop rejected, an export finished.
- **`inline`** — a banner attached to the surface it is about, which stays until the condition changes.
  For things that are still true: this document references remote content; this file opened read-only;
  this preview is paused because the document is large.

The same event can legitimately need either. Remote content in a document is `inline`, because the
condition persists and the action ("Load once") belongs next to the content. A rejected file drop is
`toast`, because it is over.

Both are styled from tokens and inherit the theme. Toasts stack at `--z-toast`, above dialogs, so a
failure raised by a dialog is visible.

## Severity, duration and stacking

| Severity  | Auto-dismiss                | Used for                                                     |
| --------- | --------------------------- | ------------------------------------------------------------ |
| `success` | 4 s                         | An operation completed and the user could not otherwise tell |
| `info`    | 6 s                         | Context the user did not ask for but benefits from           |
| `warning` | 8 s                         | Something degraded; the app continued                        |
| `error`   | never — manual dismiss only | Something the user asked for did not happen                  |

Errors do not auto-dismiss. A message you must read before it vanishes is a message you will miss.

**At most three toasts are visible at once.** A fourth causes the oldest non-error to be dismissed
early. Newest appears nearest the edge and existing toasts move away from it, so position is stable
while you read.

Inline banners are not stacked and not capped: there is at most one per condition per surface, and the
surface decides where it sits.

## Coalescing

Every notification carries a **dedup key**. Raising one whose key matches a notification already on
screen does **not** add a second: it refreshes the existing one's timer and increments a count shown as
a suffix (`Could not save release-notes.md · ×3`).

This is not a refinement, it is load-bearing. Autosave is on by default and debounced; a lint run
happens on every save; a preview render happens on every debounce window. Any of these failing in a
loop without coalescing produces a wall of identical toasts that hides everything else.

The key is the error code plus the subject (usually a document path), not the message text.

## What does and does not raise a notification

**Never raises a toast:**

- **A successful autosave.** DD-68 states this and it is the single most important rule here: autosave
  is on by default and debounced, so a success toast per write is a toast every few seconds while
  typing. The status bar's saved indicator is the feedback.
- A successful preview render, lint run, or theme change. The result is visible; saying so is noise.
- A setting being written. The control's own state is the confirmation.

**Raises a toast:**

- An explicit save (`Ctrl/Cmd+S`) — `success`, because the user asked and the outcome is otherwise
  invisible. It names what was written and how: `Saved · release-notes.md · UTF-8 · LF preserved`.
- Any operation that ran in the background and finished: export, format-all, a completed assistant run.
- Every `error`-classified failure that is not already shown inline.

**Raises an inline banner:**

- A document referencing remote content, under the content policy (`09_ASSETS_AND_SECURITY.md`).
- A document opened read-only (unsafe bytes, or a file the process cannot write).
- A preview paused because the document exceeded the live-preview threshold
  (`03_NonFunctional/02_PERFORMANCE.md#hard-limits`), with the manual refresh action in the banner.

## Error copy

An error code without written copy becomes "An error occurred", which tells the user nothing and
generates a support question. Every `ErrorCode` in `02_Architecture/06_ERROR_HANDLING.md` therefore has
**a title and a remediation sentence**, both in `en.json` from the moment the code exists
(`13_I18N.md` — no user-facing string bypasses `t()`).

The remediation sentence says what to do, not what went wrong:

| Code                   | Title                                   | Remediation                                                                                          |
| ---------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `not_found`            | Couldn't find that file                 | It may have been moved or deleted. Check the path and try again.                                     |
| `permission`           | No permission to open that file         | Check the file's permissions, or open a copy from somewhere you can write.                           |
| `io`                   | Couldn't finish reading or writing      | The disk may be full or the file may be in use. Try again.                                           |
| `unsupported`          | That file is too large to open          | GoMarkEdit opens documents up to the size in Settings → Editor.                                      |
| `busy`                 | Something else is running               | Wait for the current operation to finish, or cancel it.                                              |
| `cancelled`            | Cancelled                               | _(no remediation — this is a normal outcome, and it is not an error toast)_                          |
| `internal`             | Something went wrong inside GoMarkEdit  | The details are in the log. Settings → Diagnostics → Open logs folder.                               |
| `missing_credential`   | The API key isn't set                   | Set the environment variable named in Settings → AI → Providers, then restart GoMarkEdit.            |
| `provider_unreachable` | Couldn't reach the AI provider          | Check the base URL in Settings → AI → Providers, and that the provider is running.                   |
| `context_window`       | The document is too long for this model | Select a smaller part, or raise the context length in Settings → AI → Context.                       |
| `output_truncated`     | The model ran out of room to answer     | Raise Max output tokens in Settings → AI → Context, then try again.                                  |
| `tools_unsupported`    | This model can't use tools              | GoMarkEdit will use a simpler single-step mode. Choose a different model for workspace-wide actions. |

Two rules govern the whole table, and both come from watching a shipped application get them wrong:

1. **The message never contains an operation prefix, a file-system path from an internal error, or a
   raw `err.Error()`.** Those belong in the log.
2. **The inner cause reaches the user.** When one failure wraps another — a tool failure caused by a
   rate limit, a run failure caused by a rejected credential — the notification shows the _inner_ title
   and remediation. Collapsing everything into one outer code means the user cannot tell "my key was
   rejected" from "I typed the model name wrong", which is exactly the state a reviewed reference
   implementation shipped in.

Where a provider supplies a retry delay (`Retry-After`), it is shown: _"Rate limited — try again in
about 20 seconds."_ Parsing it and then using it only internally, as that same implementation did, gives
the user no guidance at the one moment they need it.

## Progress and cancel

Any operation that can take longer than about half a second shows progress, and **any operation that
holds the single-flight gate must also offer cancel** (ADR-0032). This covers format-all, export, and
every assistant run.

- **Determinate** where a total is known (exporting page 3 of 9): a bar plus `3 of 9`.
- **Indeterminate** otherwise: a spinner plus a label naming what is happening.
- The **cancel affordance replaces the trigger in place** — the `Format` button becomes `Cancel` while
  the format runs — rather than appearing somewhere new. The control the user pressed is where they
  will look to un-press it.
- Cancelling is a normal outcome, not an error: it produces an `info` toast at most, and the run reports
  what actually **completed**, never the loop index. "Cancelled after step 1" when step 1 never finished
  is a message that lies, and it is a real defect found in a shipped application.

## Empty states

Five surfaces can be empty. Each has written copy, because "a defined empty state" without the words is
not a specification. Each states what is true and offers the next action.

**No tabs open** — the most important screen in the product. There is no session restore (DD-11), so
this is what a user sees on **every** launch. It is a launcher, not a blank pane:

> **GoMarkEdit**
> New file · Open file… · Open folder…
> _Recent_ — the six most recent documents and folders, each with its containing folder beneath it.

**Empty workspace tree** — a folder is open and contains nothing GoMarkEdit shows:

> No Markdown files in this folder.
> _New file_ · _Open a different folder…_

**Tree filter matched nothing:**

> Nothing matches "<query>".
> _Clear filter_

**No recent files** — first run:

> Documents you open will appear here.

**No lint findings:**

> No problems found.

Two rules for all of them:

- An empty state caused by a **setting** names that setting and where to change it. "History is off.
  Turn it on in Settings → Diagnostics" is useful; "Nothing here" is not.
- An empty state is never confused with a **loading** state. Enumerating a large folder shows progress,
  not "No Markdown files in this folder" followed by files appearing.

## Edge cases

- **EC-NOTIF-1** — The same failure recurs while its notification is on screen → the existing
  notification's count increments and its timer resets; no second toast appears.
- **EC-NOTIF-2** — A fourth toast arrives while three are visible → the oldest non-error is dismissed
  early. Errors are never evicted by a newer notification.
- **EC-NOTIF-3** — An error is raised while a modal dialog is open → the toast is visible above it
  (`--z-toast` exceeds `--z-modal`).
- **EC-NOTIF-4** — Autosave writes successfully → no toast, ever. Only the status bar changes.
- **EC-NOTIF-5** — Autosave _fails_ → a coalesced `error` toast keyed to the document, and the document
  stays dirty. The user is never told it was saved when it was not.
- **EC-NOTIF-6** — A gated operation is cancelled → the gate is released, the trigger control returns to
  its normal label, and the report names the completed count rather than the loop index.
- **EC-NOTIF-7** — A wrapped failure reaches the UI → the inner code's title and remediation are shown,
  not the outer wrapper's.
- **EC-NOTIF-8** — The app is quit while toasts are visible → they are not persisted and do not reappear
  on the next launch.
