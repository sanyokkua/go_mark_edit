**Owner:** architect
**Audience:** everyone
**Last Updated:** 2026-07-25

# Roadmap

What we build, in what order, and why that order. Each phase ends with a sentence a user would say
out loud. Every dependency points backwards — no phase needs something a later phase delivers.

| # | What the user gets | Depends on | State |
|---|---|---|---|
| [00](PHASE_00_IT_RUNS.md) | The app opens | — | **done** |
| [01](PHASE_01_TYPE_AND_SEE.md) | I can type Markdown and watch it render | 00 | **done** |
| [02](PHASE_02_EVERY_THEME_LOOKS_RIGHT.md) | Every theme looks right, including my code | 01 | **next** |
| [03](PHASE_03_IT_LOOKS_DESIGNED.md) | It looks like a real app, not a web page | 02 | |
| [04](PHASE_04_WRITE_MARKDOWN.md) | I can write Markdown, not just type it | 03 | |
| [05](PHASE_05_REAL_FILES.md) | I can open, edit and save real files, in tabs | 04 | |
| [06](PHASE_06_RICH_AND_SAFE.md) | My documents render richly and safely | 05 | |
| [07](PHASE_07_A_FOLDER_OF_NOTES.md) | I can work on a whole folder of notes | 05 | |
| [08](PHASE_08_INSTALL_IT.md) | I can install it, and double-clicking a `.md` opens it | 07 | |
| [09](PHASE_09_FIND_ANYTHING.md) | I can find anything — in this file, this folder, this app | 07 | |
| [10](PHASE_10_TIDY_AND_SHARE.md) | My Markdown stays tidy, and I can share it as PDF or HTML | 06 | |
| [11](PHASE_11_AI_PROVIDER.md) | I can point the app at an AI provider | 05 | |
| [12](PHASE_12_ASSISTANT_REWRITES.md) | The assistant can proofread and rewrite my document | 10, 11 | |
| [13](PHASE_13_CONVERSATION.md) | I can have a conversation about my notes | 09, 12 | |

## Why this order

**Colour comes before chrome, and both come before features.** `frontend/src/ui/styles/tokens.css`
holds 62 tokens and not one colour, while `mockups/gomarkedit-mockup.html` shows three finished
themes. Every surface added before the palette exists gets restyled later, and reading mode cannot
even be demonstrated until there is chrome to hide.

**Phase 02 and Phase 03 are two phases, not one.** They used to be one, and it hid a lot of work.
Phase 02 is the colour system, and it is harder than it sounds: Monaco cannot read CSS custom
properties, so making the editor and the preview agree is a build step that generates six editor
themes from one syntax-token family — not a stylesheet. Phase 03 is everything that holds content:
chrome, draggable panes, dialogs, notifications, empty states, the settings shell.

**Phase 04 exists at all.** Bold, italic, headings, lists, links and tables — the formatting toolbar
and its eleven keyboard shortcuts — are required by `01_Product/02_EDITOR_AND_VIEWER_MODES.md` and
were scheduled by nothing. The primary thing a person does in a Markdown editor had no home.

**Phase 08 is not last.** A release pipeline that only runs at the very end has never been proven when
you need it. Once there is something worth handing to a person, make it installable.

**Phase 09 is one phase, not four features.** Find in document, quick-open, the command palette and
the outline are one search surface over four catalogs. Split up, the same result list, filtering,
keyboard handling and empty state get built three times. The outline also yields the
heading-to-source-line map that makes editor/preview scroll sync nearly free.

**Phase 11 does not wait for packaging.** The previous plan gated the entire AI assistant on Linux
`.rpm` construction. It needs the editor, not the installer.

## Rules that apply to every phase, not just one

These used to be phases of their own. They are not. They are things every phase must do.

- **Themes.** Any surface you add works in all three themes across light and dark. No hardcoded colour.
- **Settings.** A setting ships with the feature it configures, into the Settings dialog shell from
  Phase 03 — never as a separate later phase. It declares a type, a range and a default.
- **Menus and shortcuts.** A new user action is registered once in the shortcut registry (Phase 04)
  and appears in its menu. There is one registry, not two. The keymap is frozen in
  `01_Product/12_KEYBOARD_SHORTCUTS.md`; a later phase may add a binding, never rebind one.
- **Strings.** Every user-facing string goes through `t()` and into `en.json`. Adding a locale is then
  a new JSON file and nothing else.
- **Empty and busy states.** Any surface that can be empty ships its empty state's exact wording. Any
  operation that can take more than a moment ships a progress indicator and a way to cancel it.
- **Limits.** Any surface that accepts unbounded input — a file, a folder, a search, a document —
  names its bound in `03_NonFunctional/02_PERFORMANCE.md#hard-limits` and says what happens at the
  bound. "Bounded" is not a number.
- **Gates.** A new surface joins the visual matrix (`just verify-ui`) and gets at least one flow in
  `just verify-smoke`. A phase is not done while a gate it added is unwired.
- **Live checks.** Anything a mocked bridge cannot prove — real files on disk, two running instances,
  a real provider — gets a case in `docs/testing/LIVE_TESTING_PLAN.md`.
- **Accessibility.** Keyboard reachable, correct roles and names, focus visible.
- **Offline.** No background network. Ever. The only outbound call in the whole product is a
  user-invoked request to the AI provider the user configured (Phase 11 onward).

## Where the old phase documents went

Until 2026-07-25 this folder held 16 phase documents of about 304 KB, built from ID tables —
requirement ledgers (`PHNN-RNN`), transitions (`PHNN-Tnn`), cross-phase contracts, edge-case tables,
work packages and exit-evidence rows. They were replaced by the pages above.

Almost all of that content was a compression of `01_Product/`, which says the same things in prose a
person can read. Two parts were not, and were carried forward:

- **The 30 open specification conflicts** (`PHNN-Xnn`) — real places where two accepted documents
  disagreed. Each now appears as a plain question in the "Questions to settle first" section of the
  phase that owns it, with a recommended answer. Three were artefacts of the deleted phase-completion
  machinery and died with it.
- **The 108 transition rows** (`PHNN-Tnn`) — ordering and failure semantics. Most restated what
  `01_Product/` already says; the ordering that mattered is in each phase's build order, and the few
  failure rules stated nowhere else were folded into the owning `01_Product/` section.

The originals remain in git at revision `39efb7a`:

```bash
git show 39efb7a:specification/07_Phases/PHASE_04_RENDERING_EXTENSIONS.md
```

Read `docs/audits/2026-07-25-phase-00-02-audit.md` for why the change was made.

## The renumber

The 12-phase plan became the 14-phase plan above after a review against two shipped applications by
the same author. Two things moved: the old Phase 02 split into today's 02 and 03, and a search phase
was added at 09. Every phase from the old 03 onward shifted — old 03→04, 04→05, 05→06, 06→07, 07→08,
08→**10**, 09→**11**, 10→**12**, 11→**13**.

Two places were deliberately **not** renumbered, because they are dated records rather than plans:

- `docs/audits/2026-07-25-phase-00-02-audit.md` — a report about the app as it stood that day.
- `docs/stories/archive/` — history.

A third trap, worth knowing before you read them: ADR-0021, ADR-0022 and ADR-0024 say "Phase 02" and
mean the *retired 16-phase* numbering, not this table. Read it as today's Phase 05.
`docs/adr/README.md` records this.

## How a phase turns into work

Read the phase. Answer its **Questions to settle first** — each answer edits the relevant
`01_Product/` file, or becomes an ADR in `docs/adr/` when it constrains the architecture. Then write
one story per step in **Build it in this order** (format in `docs/stories/README.md`). Build one story
per session. The phase is finished when you use the app and its **Done when** paragraph is true.

There is no completion validator and no evidence file. A person decides.
