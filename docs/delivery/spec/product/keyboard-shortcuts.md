# Keyboard shortcuts

## What it's for

A text editor is used by people whose hands stay on the keyboard. Every action that matters has a
binding, and the bindings are held in one registry so that a shortcut is defined once and then rendered
everywhere it is mentioned — the menus, the tooltips, the shortcuts dialog and, on macOS, the native
application menu. Without one registry, the label on a menu item and the key that actually fires drift
apart, and nobody notices until a user reports that the menu is lying.

## What you can do

Press `Ctrl/Cmd+?` for the shortcuts dialog, which lists every binding in the registry. Every menu item
and every toolbar tooltip shows its accelerator, so most bindings are learned without opening the
dialog at all.

On macOS the primary modifier is `Cmd` and the secondary is `Option`. On Windows and Linux they are
`Ctrl` and `Alt`. Bindings are written once with a platform-neutral token and resolved at runtime, so
`Ctrl+B` below is `Cmd+B` on a Mac and the menus show the right glyphs — `⌘`, `⌥`, `⇧`, `⏎`.

## Rules

### One registry, and it is what every surface renders {#one-shortcut-registry}
- A shortcut is one entry mapping an action id to a binding, a label and a scope.
- The in-window menu bar, the toolbar tooltips, the context menus, the shortcuts dialog and the macOS
  native menu all render from that registry. None of them holds its own copy.

Examples: changing a label in the registry → it changes in five places at once · a menu item with its
own hard-coded accelerator string → the label and the behaviour drift, and the menu becomes wrong
silently.

### There are three scopes {#shortcut-scopes}
- **global** — fires whenever the window has focus.
- **editor** — fires only when the Monaco editor is focused.
- **document** — needs an open document, but not editor focus.

Examples: `Ctrl/Cmd+B` with the file tree focused → nothing, it is editor-scope · `Ctrl/Cmd+S` while
reading mode is active → saves, it is document-scope · `Ctrl/Cmd+N` with nothing open → a new document,
it is global.

### A binding is never changed once it ships {#the-keymap-is-frozen}
- A later phase may **add** a binding to the registry. It may never **rebind** an existing one.
- **If** a proposed binding already appears in the registry, **then** it is rejected rather than
  reassigned.

Examples: the assistant adding `Ctrl/Cmd+J` for its sidebar → allowed, nothing else uses it · a later
phase moving Save to `Ctrl/Cmd+Shift+S` → rejected.

*Why:* muscle memory does the wrong thing silently. A shortcut that changes between releases is worse
than one that never existed. And because the shortcuts dialog renders the whole registry, a duplicate is
visible to the user rather than merely wrong.

### There are no chords {#no-chords}
- Every binding is a single key combination. No binding is a two-step sequence.
- `Ctrl/Cmd+K` is the editor-scope **Link** binding and nothing else.

Examples: `Ctrl/Cmd+Shift+O` opens a folder · a `Ctrl/Cmd+K O` chord for the same thing → with the
editor focused, which is the application's default state, editor scope wins at `Ctrl+K` and the chord
never fires, so the action has no working shortcut in the case that matters.

### On macOS the platform owns the clipboard and undo keys {#macos-owns-the-clipboard}
- `Cmd+C`, `Cmd+V`, `Cmd+X`, `Cmd+A`, `Cmd+Z` and `Cmd+Shift+Z` are resolved by the native application
  menu on macOS, not by this registry. They are deliberately absent from the tables below.
- An item appearing in both the native menu and the in-window menu bar dispatches through **one**
  registry entry.

Examples: `Cmd+C` in the editor on macOS → the platform's Edit menu handles it · registering a
`Cmd+C` handler in the registry as well → two handlers for one keypress.

### Formatting shortcuts {#formatting-shortcuts}

| Action | Binding | Scope |
|---|---|---|
| Bold | `Ctrl+B` | editor |
| Italic | `Ctrl+I` | editor |
| Strikethrough | `Ctrl+Shift+X` | editor |
| Inline code | `Ctrl+E` | editor |
| Link | `Ctrl+K` | editor |
| Image | `Ctrl+Shift+I` | editor |
| Heading 1 / 2 / 3 | `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | editor |
| Bullet list | `Ctrl+Shift+8` | editor |
| Numbered list | `Ctrl+Shift+7` | editor |
| Task list | `Ctrl+Shift+9` | editor |
| Quote | `Ctrl+Shift+.` | editor |
| Table | `Ctrl+Shift+T` | editor |
| Format document | `Alt+Shift+F` | document |
| Compact document | `Alt+Shift+C` | document |
| Lint document | `Alt+Shift+L` | document |

Examples: `Ctrl/Cmd+Shift+8` on a selected paragraph → each line becomes `- item`.

### File shortcuts {#file-shortcuts}

| Action | Binding | Scope |
|---|---|---|
| New file | `Ctrl+N` | global |
| New window | `Ctrl+Shift+N` | global |
| Open file | `Ctrl+O` | global |
| Open folder | `Ctrl+Shift+O` | global |
| Reopen last closed tab | `Ctrl+Shift+Alt+T` | global |
| Save | `Ctrl+S` | document |
| Save As | `Ctrl+Shift+S` | document |
| Export to PDF | `Ctrl+Shift+E` | document |
| Close tab | `Ctrl+W` | document |
| Next tab | `Ctrl+Tab`, also `Ctrl+PageDown` | global |
| Previous tab | `Ctrl+Shift+Tab`, also `Ctrl+PageUp` | global |
| Exit | `Ctrl+Q` | global |

Examples: reopen-last-closed-tab takes `Ctrl+Shift+Alt+T` because `Ctrl+Shift+T` is the table binding ·
there is no jump-to-tab-by-number, because `Ctrl+1`, `Ctrl+2` and `Ctrl+3` are headings, which a
Markdown author uses far more often than jumping to the fourth tab.

### Search and navigation shortcuts {#search-shortcuts}

| Action | Binding | Scope |
|---|---|---|
| Find in document | `Ctrl+F` | editor |
| Replace in document | `Ctrl+H` | editor |
| Find next / previous | `F3` / `Shift+F3` | editor |
| Quick open by filename | `Ctrl+P` | global |
| Command palette | `Ctrl+Shift+P` | global |
| Toggle outline | `Ctrl+Shift+U` | global |

- `Ctrl/Cmd+F` and `Ctrl/Cmd+H` are Monaco's own find and replace widget, not a reimplementation. They
  act on the active document only; there is no cross-file search to bind.
- These bindings are **reserved from the moment the registry exists**, before the features are built, so
  that nothing binds over them — in particular so that no app-level handler shadows Monaco's find.
- **`Ctrl/Cmd+Shift+F` is unbound and unreserved.** It held a folder-wide search that is not a capability
  of this product, and it is free for any later phase to take.

Examples: an app-level `Ctrl+F` handler added before find is built → Monaco's find stops opening, and
the cause is a handler in an unrelated feature.

### View shortcuts {#view-shortcuts}

| Action | Binding | Scope |
|---|---|---|
| Toggle sidebar | `Ctrl+\` | global |
| Reading mode | `Ctrl+Enter` | document |
| Increase reading size | `Ctrl+=` | global |
| Decrease reading size | `Ctrl+-` | global |
| Reset reading size | `Ctrl+0` | global |
| Settings | `Ctrl+,` | global |
| Keyboard shortcuts dialog | `Ctrl+?` | global |
| Full screen | `F11` | global |

Examples: reading size uses `Ctrl+=` rather than `Ctrl++` because `+` needs Shift on most layouts and
`Ctrl+1/2/3` are already headings · `F11` has no modifier and is identical on all three platforms.

### The platform mapping is declared once {#platform-mapping}

| Token | Windows and Linux | macOS |
|---|---|---|
| Primary | `Ctrl` | `Cmd` |
| Secondary | `Alt` | `Option` |
| Shift | `Shift` | `Shift` |

- Bindings are declared with these tokens and resolved at runtime. Menus and tooltips render the
  platform-correct glyphs.

Examples: `Alt+Shift+F` displays and fires as `⌥⇧F` on macOS.

### The shortcuts dialog lists the whole registry {#shortcuts-dialog}
- `Ctrl/Cmd+?` opens a dialog listing every binding, grouped as the tables above are, with the
  platform-correct glyphs.
- A binding added by any phase appears there without that phase changing the dialog.

Examples: the assistant's `Ctrl/Cmd+J` appearing in the dialog the moment it is registered · a dialog
with a hand-maintained list → it goes stale on the first addition.

## What it looks like

- The shortcuts dialog — `../surface/mockup.html#material-light/shortcuts`
- Accelerators in a menu — `../surface/mockup.html#material-light/menu-file`
- Accelerators in the editor context menu — `../surface/mockup.html#material-light/editor-menu`
- The focus ring, which is what makes keyboard reachability visible —
  `../surface/mockup.html#material-light/focus`

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| A document-scoped shortcut is pressed with nothing open | Nothing happens | Open a document |
| An editor-scoped shortcut is pressed in reading mode | Nothing happens | Leave reading mode |
| A binding collides with an operating-system accelerator the platform will not yield | The platform wins; the menu label shows the effective binding | Use the menu item |

## Edge cases

**A shortcut is pressed while a modal dialog is open**
- *Trigger:* `Ctrl/Cmd+S` while the settings dialog is showing.
- *Expected:* the dialog keeps focus and the shortcut does not fire behind it.
- *Avoid:* saving a document the user cannot currently see, from a dialog they thought was modal.

**The same binding is registered twice**
- *Trigger:* a later phase adds a binding that already exists.
- *Expected:* it is rejected at registration, loudly, in development.
- *Avoid:* last-registration-wins, which silently reassigns a binding the user has learned.

**A platform-neutral binding is rendered before the platform is known**
- *Trigger:* the first paint of a menu.
- *Expected:* the platform is known at startup, so labels are correct on first render.
- *Avoid:* rendering `Ctrl+B` on macOS and correcting it a frame later.

## Not this

- **No user-customisable key bindings.** Every surface renders from the registry, so a user remapping
  would have to be reflected in the native macOS menu, the in-window menu, every tooltip and the
  dialog — and the shortcuts documentation would stop describing anybody's actual app.
- **No chords.** With the editor focused — the application's default state — editor scope wins on the
  first key and the second never arrives, so a chord has no working binding in the case that matters.
- **No reimplementation of find, and no reduced wrapper around it.** See
  `finding-things.md#find-is-the-editors-own-and-fully-exposed`.
- **No jump-to-tab-by-number.** `Ctrl/Cmd+1`, `2` and `3` are the heading shortcuts, which a Markdown
  author presses far more often than they jump to the fourth tab.

## Decisions

- *2026-07-25* — Three bindings changed, before anything rendered a label, and they are the last
  changes. `Ctrl/Cmd+P` moved from Export to PDF to **Quick open**, because in an application with tabs,
  a file tree and Monaco that is where people reach for quick-open, and `Ctrl+P`-as-print is a browser
  convention. Export moved to `Ctrl/Cmd+Shift+E`. Open folder moved from the `Ctrl/Cmd+K O` chord to
  `Ctrl/Cmd+Shift+O`, because the chord could never fire with the editor focused.
- *2026-07-28* — **`Ctrl/Cmd+Shift+F` was unbound and is not reserved.** It held "Search in folder", and
  there is no folder-wide search: find and replace act on the open document only
  (`finding-things.md#search-never-leaves-the-open-file`). A binding reserved for a capability that does
  not exist is a binding no later phase can use for one that does.

## Open questions

*(none — ready to build)*
