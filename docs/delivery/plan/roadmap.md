# Roadmap

What we build, in what order, and why that order. Each phase ends with a sentence a user would say out
loud. Every dependency points backwards — no phase needs something a later phase delivers.

| # | What the user gets | Depends on | State |
|---|---|---|---|
| [00](phase-00-it-runs.md) | The app opens | — | **done** |
| [01](phase-01-type-and-see.md) | I can type Markdown and watch it render | 00 | **done** |
| [02](phase-02-every-theme-looks-right.md) | Every theme looks right, including my code | 01 | **next** |
| [03](phase-03-it-looks-designed.md) | It looks like a real app, not a web page | 02 | |
| [04](phase-04-write-markdown.md) | I can write Markdown, not just type it | 03 | |
| [05](phase-05-real-files.md) | I can open, edit and save real files, in tabs | 04 | |
| [06](phase-06-rich-and-safe.md) | My documents render richly and safely | 05 | |
| [07](phase-07-a-folder-of-notes.md) | I can work on a whole folder of notes | 05 | |
| [08](phase-08-install-it.md) | I can install it, and double-clicking a `.md` opens it | 07 | |
| [09](phase-09-find-anything.md) | I can find anything in this file, and jump anywhere in the app | 07 | |
| [10](phase-10-tidy-and-share.md) | My Markdown stays tidy, and I can share it as a PDF | 06 | |
| [11](phase-11-ai-provider.md) | I can point the app at an AI provider | 05 | |
| [12](phase-12-assistant-rewrites.md) | The assistant can proofread and rewrite my document | 10, 11 | |
| [13](phase-13-conversation.md) | I can have a conversation about my notes | 09, 12 | |

## Why this order

**Colour comes before chrome, and both come before features.** `frontend/src/ui/styles/tokens.css`
holds 62 tokens and not one colour, while `../spec/surface/mockup.html` shows three finished themes.
Every surface added before the palette exists gets restyled later, and reading mode cannot even be
demonstrated until there is chrome to hide.

**Phase 02 and Phase 03 are two phases, not one.** They used to be one, and it hid a lot of work. Phase
02 is the colour system, and it is harder than it sounds: Monaco cannot read CSS custom properties, so
making the editor and the preview agree is a build step that generates six editor themes from one
syntax-token family — not a stylesheet. Phase 03 is everything that holds content: chrome, draggable
panes, dialogs, notifications, empty states, the settings shell.

**Phase 04 exists at all.** Bold, italic, headings, lists, links and tables — the formatting toolbar and
its keyboard shortcuts — are the primary thing a person does in a Markdown editor, and they were
scheduled by nothing.

**Phase 08 is not last.** A release pipeline that only runs at the very end has never been proven when
you need it. Once there is something worth handing to a person, make it installable.

**Phase 09 is one phase, not four features.** Find in document, quick-open, the command palette and the
outline are one search surface over four catalogues. Split up, the same result list, filtering, keyboard
handling and empty state get built three times. The outline also yields the heading-to-source-line map
that makes editor-and-preview scroll sync nearly free.

**Phase 11 does not wait for packaging.** An earlier plan gated the entire assistant on Linux `.rpm`
construction. It needs the editor, not the installer.

## Rules that apply to every phase, not just one

These used to be phases of their own. They are not. They are things every phase does, and every phase's
"Done when" paragraph checks the ones it touched. They are specified in full in
[`../spec/constraints.md`](../spec/constraints.md):

- **Themes** — every surface works in three themes across light and dark, with no colour literal.
- **Keyboard and focus** — every action is reachable without a pointer, and focus is visible.
- **Empty states** — every list, tree and table has one, with its exact wording.
- **Strings** — every user-visible string goes through `t()` and into `en.json`.
- **Errors** — every error message is distinct, actionable, and free of internal paths.
- **Notifications** — they coalesce, errors do not auto-dismiss, and a successful autosave is silent.
- **Long operations** — visible progress, and cancel in place of the trigger.
- **Network** — nothing leaves the device; every rendering asset is bundled.
- **Limits** — every unbounded input names its bound and what happens at it.
- **Settings** — a setting ships with the feature it configures, with a type, a range and a default.
- **Shortcuts** — a new action registers once; a later phase may add a binding, never rebind one.
- **Live checks** — anything a mocked bridge cannot prove gets a case in
  [`testing/live-plan.md`](testing/live-plan.md).

## How a phase turns into work

Read the phase. Answer its **Questions to settle first** — each answer edits the feature file it belongs
to, or becomes a decision record in [`../adr/`](../adr/) when it constrains the architecture. Then run
`/plan-phase NN`, which slices it into stories, and `/plan-story NNN` for each one.

A phase is finished when a person uses the app and its **Done when** paragraph is true. There is no
completion validator and no evidence file. A person decides.
