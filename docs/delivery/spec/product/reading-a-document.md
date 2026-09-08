# Reading a document

## What it's for

Half of what people do with a Markdown file is read it, not write it. Reading a specification, a set of
release notes or someone else's documentation inside an editor full of chrome — a file tree, tabs, a
formatting toolbar, a status bar — is worse than reading it in a browser. Reading mode exists so that
GoMarkEdit is the best place to read a Markdown file, not merely an acceptable one.

## What you can do

Press `Ctrl/Cmd+Enter`, choose **Distraction-free reading** from the View menu, or click **Reading** in
the status bar. Every piece of chrome disappears — the sidebar, the tab bar, the toolbar, the menu bar
and the status bar — leaving the rendered document centred in the current theme, with a single "Done
reading" affordance to come back.

`Ctrl/Cmd +` and `Ctrl/Cmd -` change the reading text size, and `Ctrl/Cmd 0` resets it. The size and
the column width are also settings. They are separate from the editor's font size, which is a monospace
measurement for a different job.

The Preview pane in the editor is the same rendering with the chrome still there, for when you want to
see the result while you write.

## Rules

### Reading mode hides all chrome {#reading-hides-chrome}
- **While** reading mode is active, the sidebar, tab bar, formatting toolbar, menu bar and status bar
  are all hidden. The rendered document and a "Done reading" affordance are what remain.
- The chrome is hidden by a style change on the shared layout, not by unmounting it.

Examples: entering reading mode from Split → the document stays exactly where it was and everything
around it goes · a reading mode that keeps the status bar → not reading mode.

*Why style rather than unmount:* unmounting throws away the editor session, so leaving reading mode
would rebuild Monaco and lose the caret, the selection and the undo stack.

### Leaving reading mode restores exactly what was there {#exit-restores-arrangement}
- **When** reading mode is exited, the previous arrangement, the scroll position and the caret return
  unchanged.

Examples: Split at 60/40, scrolled to the fifth heading, enter and leave reading mode → Split at 60/40,
scrolled to the fifth heading · returning to the default Split at the top of the document → the user
loses their place, which is the specific reason people avoid a reading mode.

### Reading mode is view-only {#reading-is-view-only}
- **While** reading mode is active, the document cannot be edited. There is no toolbar and no tabs.
- Editor-scoped shortcuts — bold, italic, headings, find — do nothing, because the editor is not
  focused.

Examples: pressing `Ctrl/Cmd+B` while reading → nothing · a document that becomes editable in the
reader → two editing surfaces for one document, and a caret in a place the user cannot see.

### Reading mode is per document {#reading-is-per-document}
- Reading mode applies to the active document. It is part of that document's view state, so a document
  left in reading mode returns to reading mode when its tab is selected again.

Examples: document A in reading mode, switch to B in Split, switch back to A → reading mode. ·
reading mode switched off while document B is active → document A is unaffected, because the mode is
a property of a document and not of the application

### The theme applies to the reader and updates live {#reader-is-themed}
- The reader is styled from the same tokens as everything else.
- **When** the theme or appearance changes while reading mode is active, the reader restyles
  immediately and stays in reading mode.

Examples: switching from Material light to Glass dark while reading → the page recolours, the chrome
stays hidden · exiting reading mode to apply the theme → rejected.

### Reading size and column width are the user's {#reading-size-is-user-controlled}
- `Ctrl/Cmd +` increases the reading text size, `Ctrl/Cmd -` decreases it, `Ctrl/Cmd 0` resets it. All
  three take effect immediately in both the preview and the reader.
- Reading font size is a setting with the values **15**, **17** and **19 px**, defaulting to 17.
- Reading width is a setting: **Narrow** (60 characters), **Comfortable** (72 characters) or **Wide**
  (90 characters), defaulting to Comfortable.
- These are independent of the editor's font size, which is 13, 14 or 16 px and defaults to 14.

Examples: reading size 19 px, editor font size 14 px → both are honoured at once in Split view · one
size driving both → the editor's monospace measurement and the reader's prose measurement are made to
be the same number, and neither ends up right.

### Preview-only keeps the chrome {#preview-only-is-not-reading}
- The **Preview** segment of the view control renders the document with the toolbar, tabs, sidebar and
  status bar still present. It is not reading mode.
- The status bar's `Reading` item is what enters reading mode.

Examples: Preview segment → rendered document, chrome present, tabs switchable · `Ctrl/Cmd+Enter` →
chrome gone.

### Preview and reader render identically {#preview-and-reader-agree}
- The preview pane, the Preview arrangement and reading mode all use the same rendering pipeline, the
  same Markdown standard, the same remote-content policy and the same asset resolution.
- All three honour the same debounce and the same 2 MB live-preview pause.

Examples: a document with a Mermaid diagram, viewed in Split and then in reading mode → the same
diagram, the same colours · a reader that renders through a second pipeline → two answers to what the
document means.

### Reading a large document costs one render {#reading-a-large-document}
- Reading mode renders a single static snapshot with no editor attached, so opening a large document to
  read costs one render rather than a continuing stream of them.
- **When** a document over 2 MB is opened in reading mode, it renders on demand rather than staying
  paused — there is no typing to keep smooth.

Examples: a 3 MB document opened straight into reading mode → it renders, once · the same document in
Split → the preview is paused with a **Refresh preview** banner.

### Changing the Markdown standard re-renders open documents {#standard-change-rerenders}
- **When** the Markdown standard setting changes, the preview and the reader of every open document
  re-render under the new standard.

Examples: switching from GFM to Full while a document with a footnote is open → the footnote starts
rendering immediately · requiring the tab to be closed and reopened → the setting appears not to work.

## What it looks like

- Reading mode — `../surface/mockup.html#material-light/reading`
- Preview only, chrome present — `../surface/mockup.html#material-light/preview-only`
- The paused-preview banner — `../surface/mockup.html#material-light/paused-preview`
- Reading size and width settings — `../surface/mockup.html#material-light/settings-editor`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| `Ctrl/Cmd+Enter` with no document open | Nothing happens | Open a document first |
| A document references remote images and the policy is Ask | The remote-content banner, inside the reader | Load once, or change the policy |
| A Mermaid diagram in the document fails to parse | That diagram's error placeholder in `--err`; the rest of the document reads normally | Fix the diagram source |
| The document is over 2 MB | It renders once when reading mode is entered | Nothing — reading is not paused |

## Edge cases

**The theme changes during reading**
- *Trigger:* the operating system flips to dark while the user is reading with Auto selected.
- *Expected:* the reader restyles live and stays in reading mode.
- *Avoid:* dropping out of reading mode to re-apply the theme.

**Reading mode entered with no document open**
- *Trigger:* the shortcut is pressed on the launcher screen.
- *Expected:* nothing happens — reading mode needs a document.
- *Avoid:* an empty full-screen reader with no visible way out.

**The last tab is closed while reading**
- *Trigger:* the document being read is closed from the native menu or by a quit prompt.
- *Expected:* reading mode exits and the launcher appears.
- *Avoid:* a chrome-hidden reader showing nothing, with no affordance except "Done reading".

**The window is resized to 375 px while reading**
- *Trigger:* the window is dragged narrow during reading.
- *Expected:* the reading column narrows to fit and the measure setting is honoured as far as the width
  allows.
- *Avoid:* a fixed 72-character column that overflows horizontally on a narrow window.

## Not this

- **No editing in reading mode.** It is a reading surface; the editor is one keystroke away.
- **No per-document reading size.** The size and the measure are the reader's preference, not the
  document's property.
- **No printing from reading mode directly.** Export owns the print path, and it has its own styling
  choice; see `exporting-a-document.md`.
- **No reimplemented in-page find for the reader.** The webview's own find works there, and a second
  implementation would behave differently from Monaco's for the same query.

## Decisions

- *2026-07-25* — Reading size and column width became user-controlled with live shortcuts. "Read
  Markdown beautifully" is a stated headline goal, and a fixed size with a fixed measure does not
  deliver it.

## Open questions
