# Language and text

## What it's for

English is the only language this ships in, and probably the only one it will ever ship in. The reason
every string still goes through a lookup is not translation — it is that a catalogue is the one place
where all of the product's copy can be read at once. Wording that is inconsistent, jargon that leaked in
from an error code, a button labelled two different things on two screens: none of that is visible when
the strings are scattered across ninety components, and all of it is visible in one JSON file.

The translation capability comes free from doing it that way, and it costs nothing to keep the door
open.

## What you can do

Use the app in English. Settings → Language lists the available languages; there is one.

If you want another, add a resource file. No code changes.

## Rules

### Every user-visible string comes from a catalogue {#every-string-goes-through-t}
- Text a user reads is looked up by key through `t(key)`. No component contains a display string.
- This covers menu items, dialog text, button labels, tooltips, status-bar labels, banners, toast
  messages, empty-state copy, placeholder text and accessible labels.

Examples: `t('menu.file.open')` → correct · `<button>Save</button>` → rejected ·
`aria-label="Close tab"` → rejected, `aria-label={t('tabs.close')}` → correct.

### Keys are stable and namespaced; the English text is not the identifier {#keys-are-the-identifier}
- Keys are namespaced and stable — `menu.file.open`, `status.autosave.on`,
  `banner.remoteContent.title`.
- Stories and tests reference the **key**, so wording can change without breaking anything.

Examples: `status.autosave.on` reworded from `Autosave: On` to `Autosaving` → nothing else changes ·
using the English text as the key → every rewording is a rename across the codebase, so nobody rewords
anything.

### The catalogue is flat namespaced JSON {#catalogue-format}
- `frontend/src/i18n/locales/en.json` is the canonical catalogue and the reference any new language
  mirrors.
- It is flat, namespaced JSON, so it diffs cleanly and a translator can work in it directly.

Examples: adding a key → a one-line diff · a nested structure with per-component objects → a diff that
shows a whole subtree moved when one string changed.

### Every error code has a title and a remediation sentence {#error-codes-have-copy}
- Every error code has both, in the catalogue, from the moment the code exists.
- The remediation says what to **do**, not what went wrong.

| Code | Title | Remediation |
|---|---|---|
| `not_found` | Couldn't find that file | It may have been moved or deleted. Check the path and try again. |
| `permission` | No permission to open that file | Check the file's permissions, or open a copy from somewhere you can write. |
| `io` | Couldn't finish reading or writing | The disk may be full or the file may be in use. Try again. |
| `unsupported` | That file is too large to open | GoMarkEdit opens documents up to the size in Settings → Editor. |
| `busy` | Something else is running | Wait for the current operation to finish, or cancel it. |
| `cancelled` | Cancelled | *(none — this is a normal outcome and it is not an error toast)* |
| `internal` | Something went wrong inside GoMarkEdit | The details are in the log. Settings → Diagnostics → Open logs folder. |
| `missing_credential` | The API key isn't set | Set the environment variable named in Settings → AI → Providers, then restart GoMarkEdit. |
| `provider_unreachable` | Couldn't reach the AI provider | Check the base URL in Settings → AI → Providers, and that the provider is running. |
| `context_window` | The document is too long for this model | Select a smaller part, or raise the context length in Settings → AI → Context. |
| `output_truncated` | The model ran out of room to answer | Raise Max output tokens in Settings → AI → Context, then try again. |
| `tools_unsupported` | This model can't use tools | GoMarkEdit will use a simpler single-step mode. Choose a different model for workspace-wide actions. |

Examples: a new error code added with no copy → it renders as a generic message that tells the user
nothing and generates a support question.

### A message never carries an internal path, a prefix or a raw error {#messages-are-clean}
- A user-facing message contains no operation prefix, no filesystem path taken from an internal error,
  and no raw error string. Those belong in the log.

Examples: `Couldn't finish reading or writing` → correct ·
`save: open /Users/ana/Documents/notes.md: permission denied` → rejected.

### The inner cause is what the user is told {#inner-cause-reaches-the-user}
- **When** one failure wraps another, the notification shows the **inner** code's title and remediation,
  not the outer wrapper's.

Examples: an assistant run that failed because a credential was rejected → `The API key isn't set` and
its remediation · collapsing it into one outer code → the user cannot tell "my key was rejected" from
"I typed the model name wrong", which is exactly the state a reviewed reference implementation shipped
in.

### A retry delay from a provider is shown {#retry-after-is-shown}
- **When** a provider supplies a retry delay, it is shown: `Rate limited — try again in about 20
  seconds.`

Examples: parsing the delay and using it only internally → the user gets no guidance at the one moment
they need it, which is what that same reference implementation did.

### Interpolation uses named placeholders {#named-placeholders}
- A string with a variable in it uses a named placeholder in the catalogue value — `"status.words":
  "{count} words"` — never concatenation in code.
- Numbers, dates and plurals go through the formatting helpers rather than a hard-coded format.

Examples: `{count} words` → a language that puts the noun first can reorder it ·
`count + ' words'` in a component → the word order is fixed in the code and no resource file can change
it.

### A missing key never renders blank {#missing-keys-fall-back}
- **If** a key has no value in the active language, **then** the English value is used; **if** there is
  no English value either, **then** the key itself is shown.

Examples: a partially translated language → English for the gaps, which is readable · a blank label →
a button with nothing on it, and no way for the user to guess what it does.

### Adding a language is a resource file and nothing else {#adding-a-language}
- To add a language: copy `en.json` to `<lang>.json`, translate the values, keep the keys identical. The
  language list is built from the bundled resource files.
- **No component, layout or logic change is permitted as a condition of adding a language.** If one is
  needed, that is a defect in the text layer, not in the language.

Examples: dropping in `de.json` → German appears in the Settings language list · needing to widen a
button for German → the control was built to fit one string, which is the defect.

### Every locale resource is bundled {#locales-are-bundled}
- Language resources ship in the application bundle. Nothing is fetched.

Examples: the app used offline → every string renders.

### Controls tolerate long strings {#long-strings-do-not-clip}
- A control wraps or ellipsises a long label rather than clipping it, and its target stays reachable.

Examples: a German label 60 % longer than the English → the button grows or the text ellipsises, and it
is still clickable · a fixed-width button → the label is cut in half and the action is unguessable.

### English is left-to-right, and the layout does not preclude right-to-left {#ltr-now-rtl-possible}
- The shipped language is left-to-right. Right-to-left is not a v1 requirement, and the token and layout
  model must not make it impossible.

Examples: layout expressed in logical properties — inline-start, inline-end — rather than left and right
where it costs nothing.

## What it looks like

- Settings → Language — `../surface/mockup.html#material-light/settings-language`
- Toasts, which is where most error copy is read — `../surface/mockup.html#material-light/toasts`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| A key is missing from the active language | The English text | Nothing — it is a gap in that language file |
| A key is missing everywhere | The key itself, for example `menu.file.open` | Report it; it is a defect |
| A resource file is malformed | The language does not appear in the list; English is used | Fix the file |

## Edge cases

**A placeholder is missing from a translated value**
- *Trigger:* `"status.words": "words"` with the `{count}` dropped.
- *Expected:* the string renders without the number rather than throwing.
- *Avoid:* an exception in a status bar that then fails to render at all.

**A string is needed inside an error the backend produced**
- *Trigger:* an error code crosses the bridge with safe details attached.
- *Expected:* the frontend looks the title and remediation up by code and interpolates the details.
- *Avoid:* the backend sending a user-facing English sentence, which puts product copy in Go where the
  catalogue cannot see it.

**The same word is used for two different things**
- *Trigger:* "Close" on a dialog's dismiss button and on the tab's close control.
- *Expected:* two keys, because a language that distinguishes them needs to.
- *Avoid:* one shared key reused for economy, which makes one of the two wrong in translation.

## Not this

- **No translation of document content.** The app translates its own interface, never the user's text.
- **No runtime language download.** The app must render every string with the network off, and a
  downloaded resource is an outbound request the product does not make.
- **No automatic language detection from the operating system in v1.** There is one language; detecting
  it would pick English every time and add a code path with no behaviour.
- **No right-to-left support in v1.** See `#ltr-now-rtl-possible` for what is required instead.
- **No English text used as a lookup key.** See `#keys-are-the-identifier`.

## Decisions

- *2026-07-25* — Every error code has written copy in the catalogue from the moment the code exists. A
  code with no copy renders as "An error occurred", which tells the user nothing and generates a support
  question.

## Open questions

*(none — ready to build)*
