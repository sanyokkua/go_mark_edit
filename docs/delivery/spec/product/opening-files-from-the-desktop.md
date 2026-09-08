# Opening files from the desktop

## What it's for

A Markdown editor that you can only open files *from* is half an editor. People find a file in Finder,
Explorer or a file manager and double-click it, and they expect their editor to appear with it loaded.
Being in the "Open With" list, having a recognisable document icon, and being settable as the default
are what make GoMarkEdit feel like it belongs to the operating system rather than being a program you
have to launch first.

## What you can do

Double-click a `.md`, `.markdown`, `.mdown` or `.txt` file and GoMarkEdit launches and opens it. If it
is already running, the file opens in a new window. The app appears in the platform's "Open With" list
and ships its own document icon so its files are recognisable in a folder.

You can make GoMarkEdit the default for a file type through your platform's normal mechanism. The app
may offer to help, and it never takes the default without being asked.

## Rules

### Four extensions are declared {#declared-extensions}
- The app declares handling for `.md`, `.markdown`, `.mdown` and `.txt`, and ships a document icon for
  them.
- The same four extensions filter the open dialog and the workspace tree.

Examples: a `.mdx` file → not associated, and not shown in the tree · a `.txt` → associated, because a
lot of notes live in one.

### Each platform delivers the path its own way, and one place normalises it {#one-normalisation-point}
- On **macOS** the path arrives through the platform's file-open callback.
- On **Windows and Linux** it arrives as the **first command-line argument**.
- Both are turned into an open request by one function, which is pure and unit-testable.
- A path from a drag-and-drop goes through the same function; see
  `dragging-files-in.md#drops-use-the-os-open-path`.

Examples: `/Users/ana/My Notes/todo.md` with a space → parsed correctly · a path with non-ASCII
characters → parsed correctly · two parsing paths, one per platform → they diverge, and the bug appears
on the platform nobody develops on.

### A file opened before the app is ready is queued {#queue-opens-during-startup}
- **If** the platform delivers an open before initialisation has finished — which happens on macOS cold
  start — **then** the event is queued and the file opens once the app is ready.

Examples: double-clicking a file with the app not running on macOS → the app launches and the file opens
· handling the event immediately → it arrives before the model exists and the file is silently dropped,
so the app launches empty and the user double-clicks again.

### An operating-system open uses the default open mode {#os-opens-use-the-default-mode}
- A file opened from the operating system opens in the configured default open mode, Editor or Reading,
  which defaults to Editor. This is the same setting the workspace tree, the Open dialog and a drop use.

Examples: default Editor → double-clicking lands in the editor · default Reading → it lands in the
reader.

### An unsupported extension reaching the app is handled, not corrupted {#unsupported-extension-via-open-with}
- The operating system routes only the four declared extensions automatically, so any other extension
  reaches the app only through an explicit "Open With" choice.
- **If** such a file's content decodes as text, **then** it opens as a tolerantly-decoded text document,
  the same read a `.txt` gets.
- **If** it is clearly binary, **then** the app declines with a toast and opens nothing.
- It is never silently corrupted.

Examples: `notes.log` chosen via Open With → it opens as text · a `.png` chosen via Open With → declined
with a toast · opening the `.png` as text and letting the user save → the image is destroyed by an editor
that agreed to open it.

### An open while an instance is running starts a new window {#opens-start-a-new-window}
- **When** a file is opened from the operating system while GoMarkEdit is already running, the open is
  handled by launching a **new window**, not by being forwarded into the existing one.
- Several paths opened at once are each routed the same way.

Examples: two files selected in Finder and opened together → they open per this policy rather than
appearing as two tabs in whichever window happened to be focused · forwarding into a running process →
that requires a single-instance lock, which this product does not have; see
`the-app-window.md#multiple-windows`.

### The app never seizes the default {#never-seizes-the-default}
- The app appears in "Open With" on all three platforms and is settable as the default there.
- **If** the app detects it is not the default, **then** it may show a **non-blocking** prompt with the
  platform's instructions or action. The user decides.
- It never sets itself as default silently, and on Windows and macOS platform policy prevents it
  regardless.

Examples: a first launch when another editor holds `.md` → an optional, dismissible prompt · a modal
dialog on every launch until the user complies → the app nagging about something that is not its
decision.

### Each platform registers associations its own way {#per-platform-registration}

| Platform | How | How the path arrives |
|---|---|---|
| macOS | `CFBundleDocumentTypes` in the app bundle's `Info.plist`, produced from `wails.json`, with imported and exported type declarations where needed | the platform file-open callback |
| Windows | The installer declares a ProgID for GoMarkEdit, links each extension to it, and registers the icon | the first command-line argument |
| Linux | A `.desktop` entry with `MimeType=` for the Markdown and text types, an installed icon, and registration through the freedesktop database | the first command-line argument |

- The declaration lives in `wails.json` under `info.fileAssociations` and is materialised per platform by
  the packaging step.

Examples: `xdg-mime default gomarkedit.desktop text/markdown` on Linux makes it the default · the app
running that command by itself → see `#never-seizes-the-default`.

### One source artwork produces every icon {#one-icon-source}
- The application icon and the document icon derive from one source image,
  `build/icon/appicon-source.png`, processed by `build/icon/process_icon.py` into a 1024 × 1024
  transparent-background `build/appicon.png`.
- The per-platform icons — the macOS `.icns`, the Windows `.ico` — are derived from that, never
  hand-forked.

Examples: changing the artwork → one file changes and every platform icon regenerates · a hand-edited
Windows icon → the platforms drift and nobody notices until someone compares two machines.

## What it looks like

There is no in-app screen for this. What the user sees is their own file manager: the app in the "Open
With" list, and the document icon on `.md` files. The optional set-as-default prompt uses the standard
toast surface — `../surface/mockup.html#material-light/toasts`.

## When things go wrong

| Situation | What the user sees | What they can do |
|---|---|---|
| An "Open With" file is clearly binary | A toast saying the file cannot be opened; nothing opens | Open it in the application that owns that file type |
| The file was deleted between double-click and launch | `Couldn't find that file` · `It may have been moved or deleted. Check the path and try again.` | Nothing — the file is gone |
| The file cannot be read | `No permission to open that file` · `Check the file's permissions, or open a copy from somewhere you can write.` | Fix the permissions, or copy it somewhere readable |
| GoMarkEdit is not the default handler | An optional, dismissible prompt with the platform's instructions | Follow them, or dismiss it |

## Edge cases

**Several files are opened at once from the file manager**
- *Trigger:* five files selected and opened together.
- *Expected:* each is routed by the same policy; none is silently discarded.
- *Avoid:* handling the first argument and ignoring the rest, which is what a naive argv read does.

**A path containing spaces or non-ASCII characters**
- *Trigger:* `/Users/ana/Мои заметки/todo.md`.
- *Expected:* it opens.
- *Avoid:* splitting the command line on whitespace, which turns one path into three arguments and finds
  none of them.

**An open arrives during macOS cold start**
- *Trigger:* double-clicking a file with the app not running.
- *Expected:* the event is queued and the file opens once the model exists.
- *Avoid:* dropping it, which makes double-click-to-open work only when the app is already running — and
  that is exactly the case a developer tests in.

**The app is opened with a directory as its argument**
- *Trigger:* `gomarkedit ~/notes` from a terminal.
- *Expected:* the path is `stat`-ed, found to be a directory, and opened as the workspace.
- *Avoid:* trying to read it as a file and reporting an unhelpful error.

## Not this

- **No silent seizing of the default handler.** See `#never-seizes-the-default`.
- **No forwarding an open into a running instance.** See `#opens-start-a-new-window`.
- **No extension beyond the declared four.** A wider claim means appearing as a handler for files the app
  is not good at, and `.txt` is already generous.
- **No hand-maintained per-platform icons.** A hand-edited Windows icon and a generated macOS one drift,
  and nobody notices until two machines are compared side by side.
- **No code signing or notarisation in v1.** The unsigned-install caveats are documented instead; signing
  is a certificate and a per-platform pipeline the project does not yet have.

## Decisions

- *2026-07-10* — Being the "default app" means appearing in Open With, being settable as default, and
  launching to open a file. It explicitly does not mean taking the default, which Windows and macOS
  policy prevent anyway.

## Open questions
