# Constraints

Cross-cutting rules a user can perceive. These are not features and they are not phases. **Every phase
satisfies all of them**, and every phase's "Done when" paragraph checks the ones its work touches.

Scheduling any of these as a late phase means the software ships visibly unfinished in that dimension
for every phase before it, and retrofitting costs more than doing it inline.

---

### Every surface works in three themes across light and dark {#every-surface-is-themed}
- **When** a surface is added, it is checked in Liquid Glass, Material and Minimal, in light and dark —
  six combinations.
- No component contains a colour literal. Every visual value is a token in
  `frontend/src/ui/styles/tokens.css`.
- A surface that adds a visual value adds its token in the same change.

Examples: a new dialog checked in all six → correct · checked in Material light only → it is correct in
one of six, and the other five are discovered by a user.

*Verified by:* open the surface, switch theme three times and appearance twice, and look at it.

---

### Every action is reachable by keyboard, and focus is visible {#every-action-is-reachable-by-keyboard}
- **When** an action is added, it can be reached and invoked without a pointer.
- Every focusable element shows the focus ring, which is `0 0 0 2px var(--app-bg), 0 0 0 4px
  var(--accent)` — two layers so it reads on every surface.
- Controls have correct roles and accessible names, and the name goes through the text catalogue.

Examples: tab to every control in a new dialog and activate each with Enter or Space → correct · a
control reachable only by clicking → the feature does not exist for anyone using the keyboard · a focus
ring the theme forgot → "reachable by keyboard alone" is untestable, because you cannot see where you
are.

*Verified by:* put the pointer down, tab through the surface, and use it.

---

### Every list, tree and table has a written empty state {#every-list-has-an-empty-state}
- **When** a list is empty, it shows a heading, one sentence saying why, and one action.
- **If** it is empty because a filter excludes everything, **then** it says so and offers to clear the
  filter. It does not show the "nothing here yet" copy.
- An empty state is never shown while the thing is still loading. A large folder shows progress.

The five that exist:

| Surface | Copy |
|---|---|
| No documents open | `GoMarkEdit` · New file · Open file… · Open folder… · the six most recent documents and folders, each with its containing folder beneath it |
| An open folder with nothing to show | `No Markdown files in this folder.` · *New file* · *Open a different folder…* |
| A tree filter matching nothing | `Nothing matches "<query>".` · *Clear filter* |
| No recent files, on a first run | `Documents you open will appear here.` |
| No lint findings | `No problems found.` |

Examples: a filter matching nothing → the filter copy, not the empty-folder copy · one message for both
→ the user cannot tell whether their query is wrong or the folder is · the empty message shown for a
second while a folder enumerates → the user is told twice and the first time is a lie.

*Verified by:* empty each list and read what it says.

---

### Every user-visible string comes from the catalogue {#every-string-goes-through-t}
- Text a user reads is a key in `frontend/src/i18n/locales/en.json`, rendered with `t('key')`.
- This includes button labels, headings, placeholder text, empty-state copy, error messages, tooltips
  and accessible labels.
- A string with a variable uses a named placeholder in the catalogue value, never concatenation in code.

Examples: `t('tabs.close')` → correct · `aria-label="Close tab"` → rejected · `count + ' words'` →
rejected, because word order is then fixed in the code.

*Verified by:* search the changed files for quoted text that reaches the screen.

---

### Every error message is distinct and actionable {#every-error-message-is-distinct-and-actionable}
- Every error code has a **title** and a **remediation sentence** in the catalogue, from the moment the
  code exists. The remediation says what to do, not what went wrong.
- A message never contains an operation prefix, a filesystem path taken from an internal error, or a raw
  error string. Those belong in the log.
- **When** one failure wraps another, the **inner** code's title and remediation are shown.
- **When** a provider supplies a retry delay, it is shown: `Rate limited — try again in about 20
  seconds.`
- The full table is in `product/language-and-text.md#error-codes-have-copy`.

Examples: `Couldn't find that file` · `It may have been moved or deleted. Check the path and try again.`
→ correct · `save: open /Users/ana/notes.md: permission denied` → rejected · one generic message for six
different failures → the user cannot tell which of six things to do.

*Verified by:* trigger each new failure path and read what appears.

---

### Notifications coalesce, and success is usually silent {#notifications-coalesce}
- A notification is a **toast** — transient, stacked, dismissible, for something that happened and is
  over — or **inline**, a banner attached to the surface it is about, for something that is still true.
- Every notification carries a **dedup key**, the error code plus the subject. A repeat of a live
  notification refreshes it and increments a count shown as a suffix — `Could not save release-notes.md
  · ×3` — rather than stacking a second.
- Auto-dismiss: `success` 4 s, `info` 6 s, `warning` 8 s. **`error` never auto-dismisses.**
- **At most three toasts are visible at once.** A fourth dismisses the oldest non-error early; an error
  is never evicted by a newer notification.
- Toasts stack at `--z-toast`, above dialogs, so a failure raised by a dialog is visible.
- **A successful autosave raises no toast, ever.** Nor does a successful render, lint run, theme change,
  or settings write.
- An explicit save does raise one, because the user asked and the outcome is otherwise invisible:
  `Saved · release-notes.md · UTF-8 · LF preserved`.

Examples: a lint failure repeating on every save → one toast with a count · an error that vanishes after
8 seconds → a message you must read before it disappears is a message you will miss · a toast per
autosave → a toast every few seconds while typing, hiding everything else.

*Verified by:* make one thing fail repeatedly and count the toasts.

---

### A long operation is visible and cancellable {#a-long-operation-is-visible-and-cancellable}
- **When** an operation can take longer than about half a second, it shows progress.
- **Any operation that holds the single long-operation gate must also offer cancel.** That covers
  format-all, export and every assistant run.
- Progress is **determinate** where a total is known — a bar plus `3 of 9` — and indeterminate
  otherwise, a spinner plus a label naming what is happening.
- **The cancel affordance replaces the trigger in place.** The `Format` button becomes `Cancel`.
- Cancelling is a normal outcome, not an error. It produces at most an informational toast, and the run
  reports what actually **completed**, never the loop index.

Examples: the control the user pressed is where they will look to un-press it · "Cancelled after step 1"
when step 1 never finished → a message that lies, and a real defect found in a shipped application.

*Verified by:* start each long operation, watch it, and cancel it.

---

### Nothing leaves the device {#nothing-leaves-the-device}
- The app makes **no** background or unsolicited network request: no update check, no telemetry, no
  crash report, no analytics, no font, plugin or theme fetch, no CDN asset.
- Before the assistant exists, the app makes **no outbound request at all**.
- **When** the assistant exists, the only outbound requests are inferences to the provider the user
  configured, and only in direct response to a user action — invoking an action, sending a message, or
  pressing a test button. The default provider is local, so a default installation still sends nothing
  off the machine.
- Logs are local files and are never transmitted. No log field carries a secret, an API key, a full
  remote URL, or a user's full home path.
- **If** any other outbound request is proposed, **then** it needs a decision record.

Remote images and stylesheets referenced *inside a user's document* are governed separately by the
content policy in `product/images-and-remote-content.md` and are not covered by this rule.

Examples: run the app for five minutes with a network monitor open and confirm zero requests · an
opt-out update check → "it only sends a version number" is a promise the user cannot verify, so the
product's answer is that there is nothing to verify.

*Verified by:* a network monitor, for five minutes, with the app in use.

---

### Every rendering asset is bundled {#every-asset-is-bundled}
- KaTeX's stylesheet and fonts, Mermaid, the highlight token styles, Monaco and every UI font are
  imported from the bundle and resolved at build time.

Examples: the app used with the network disconnected → every diagram, formula, code block and font
renders · a CDN link → the feature works on the developer's machine and silently fails for everyone
offline.

*Verified by:* disconnect the network and use the app.

---

### Every unbounded input names its bound and what happens at it {#every-limit-is-named}
- **When** a surface accepts unbounded input — a file, a folder, a search, a document, a list of tabs —
  it states its limit as a number with a unit, and what the user sees when it is reached.
- **Refusal is a first-class outcome.** Each limit produces a classified error or an inline banner with
  written copy — never a hang, never a silent truncation, never a crash.

| Limit | Value | At the limit |
|---|---|---|
| Openable file size | **50 MB** | Refused with a message naming the limit. Nothing is partially loaded. |
| Read-only threshold | **10 MB** | Opens, read-only: no editing, no autosave, and an inline banner saying why. |
| Live-preview pause | **2 MB** | The preview stops updating on every keystroke and shows a **Refresh preview** action in a banner. Not configurable. |
| Open documents | **40** | Opening the 41st is refused with a message. |
| Folder entries enumerated | **20,000** per workspace | Enumeration stops; the tree shows what it has plus a note that the folder is too large to index. |
| Folder depth | **12** levels | Deeper directories are not descended into. This also bounds symlink cycles. |
| Quick-open and palette results | **1,000** | The list stops and says how many were found. A 20,000-entry workspace can match far more than a list is useful at. |
| Lint markers decorated | **1,000** | The count stays accurate; only the first thousand get squiggles. The problems list shows all of them. |
| Undo history | the editor's default | Not overridden. |

Examples: exactly 2.0 MB → live preview, because the check is *greater than* 2 MB · 2.1 MB → paused ·
"bounded" with no number → not a specification.

*These are v1 numbers chosen to be safe, not tuned.* Raising one is a decision with evidence behind it.
Lowering one because something is slow is a defect being papered over.

*Verified by:* cross each limit and read what happens.

---

### One monochrome icon set, tinted from the current colour {#icons-are-monochrome-svg}
- Icons are one inline monochrome SVG sprite that inherits `currentColor`.
- **There is no emoji anywhere in the product interface.**

Examples: an icon in six palettes → six correct tints from one asset · a colour emoji as a toolbar glyph
→ a bitmap that cannot take a design token and renders differently, or not at all, on each platform,
which makes a cross-platform app look unfinished on two of three.

*Verified by:* look at the toolbar and the menus in a dark theme.

---

### Motion respects the reduced-motion preference {#motion-respects-the-preference}
- Every animated property uses `--dur-fast` (120 ms), `--dur-base` (180 ms) or `--dur-slow` (300 ms).
- **While** the operating system reports `prefers-reduced-motion: reduce`, one rule collapses every
  duration token to `0ms`.
- Switching theme or appearance is never animated.

Examples: reduced motion on → menus appear without a transition and everything still works · a hardcoded
`transition: 200ms` → it survives the reduced-motion rule and nobody notices.

*Verified by:* turn on reduced motion in the operating system and use the app.

---

### A new setting ships with the feature it configures {#settings-ship-with-their-feature}
- A setting arrives in the same change as the thing it controls, in the settings dialog, and it declares
  a **type**, a **range** and a **default** in `product/settings.md`.
- Out-of-range values are **rejected with the range in the message**, never clamped.
- The control, the validator and the seeded default all read that one statement.

Examples: three copies of a range → an interface offering a value the backend rejects, which is a
real defect from a reviewed application where a control offered 1–3600 against a validator accepting
1–600 and a seeder writing 60. · a validator accepting 1–600 given exactly `600` → accepted, because
the bound is inclusive; given `601` → rejected with the range in the message, never clamped down to
600

*Verified by:* type an out-of-range value and read the rejection.

---

### A new action is registered once, in the shortcut registry {#actions-register-once}
- A user action is registered once and appears in its menu, its tooltip, the shortcuts dialog and the
  command palette from that one registration.
- **A later phase may add a binding. It may never rebind one.**

Examples: adding a command → it appears in the palette without the palette changing · a menu item with
its own hard-coded accelerator label → the label and the behaviour drift and the menu becomes wrong
silently.

*Verified by:* add a command, then open the shortcuts dialog and the palette without touching either.

---

### Anything a mocked bridge cannot prove gets a live-test case {#live-checks-exist}
- Real bytes on a real disk, two processes at once, the built binary rather than `wails dev`, a real
  provider, and anything about the platform get a numbered case in `../plan/testing/live-plan.md`.
- **Every confirmed finding from a live run gets an automated test**, and the report names its path.

Examples: encoding and line-ending preservation → a live case, then a test · asserting it only against a
mock → the mock has whatever encoding behaviour the mock was written with.

*Verified by:* reading the live plan against what the phase added.
