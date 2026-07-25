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
| [02](PHASE_02_IT_LOOKS_DESIGNED.md) | It looks designed instead of unstyled | 01 | **next** |
| [03](PHASE_03_WRITE_MARKDOWN.md) | I can write Markdown, not just type it | 02 | |
| [04](PHASE_04_REAL_FILES.md) | I can open, edit and save real files, in tabs | 03 | |
| [05](PHASE_05_RICH_AND_SAFE.md) | My documents render richly and safely | 04 | |
| [06](PHASE_06_A_FOLDER_OF_NOTES.md) | I can work on a whole folder of notes | 04 | |
| [07](PHASE_07_INSTALL_IT.md) | I can install it, and double-clicking a `.md` opens it | 06 | |
| [08](PHASE_08_TIDY_AND_SHARE.md) | My Markdown stays tidy, and I can share it as a PDF | 05 | |
| [09](PHASE_09_AI_PROVIDER.md) | I can point the app at an AI provider | 04 | |
| [10](PHASE_10_ASSISTANT_REWRITES.md) | The assistant can proofread and rewrite my document | 08, 09 | |
| [11](PHASE_11_CONVERSATION.md) | I can have a conversation about my notes | 06, 10 | |

## Why this order

**Phase 02 comes second, not eighth.** `frontend/src/ui/styles/tokens.css` currently holds 62 tokens
and not one colour. The app renders in default browser colours while `mockups/gomarkedit-mockup.html`
shows three finished themes. Every phase that adds a surface before the palette exists gets restyled
later, and reading mode cannot even be demonstrated until there is chrome to hide. Colour first.

**Phase 03 exists at all.** Bold, italic, headings, lists, links and tables — the formatting toolbar
and its eleven keyboard shortcuts — are required by `01_Product/02_EDITOR_AND_VIEWER_MODES.md` and
were scheduled by nothing. The primary thing a person does in a Markdown editor had no home.

**Phase 07 is not last.** A release pipeline that only runs at the very end has never been proven when
you need it. Once there is something worth handing to a person, make it installable.

**Phase 09 does not wait for packaging.** The previous plan gated the entire AI assistant on Linux
`.rpm` construction. It needs the editor, not the installer.

## Rules that apply to every phase, not just one

These used to be phases of their own. They are not. They are things every phase must do.

- **Themes.** Any surface you add works in all three themes across light and dark. No hardcoded colour.
- **Settings.** A setting ships with the feature it configures, into the Settings dialog shell from
  Phase 02 — never as a separate later phase.
- **Menus and shortcuts.** A new user action is registered once in the shortcut registry (Phase 03) and
  appears in its menu. There is one registry, not two.
- **Strings.** Every user-facing string goes through `t()` and into `en.json`. Adding a locale is then
  a new JSON file and nothing else.
- **Accessibility.** Keyboard reachable, correct roles and names, focus visible.
- **Offline.** No background network. Ever. The only outbound call in the whole product is a
  user-invoked request to the AI provider the user configured (Phase 09 onward).

## Where the old phase documents went

Until 2026-07-25 this folder held 16 phase documents of about 304 KB, built from ID tables —
requirement ledgers (`PHNN-RNN`), transitions (`PHNN-Tnn`), cross-phase contracts, edge-case tables,
work packages and exit-evidence rows. They were replaced by the twelve pages above.

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

## How a phase turns into work

Read the phase. Answer its **Questions to settle first** — each answer edits the relevant
`01_Product/` file, or becomes an ADR in `docs/adr/` when it constrains the architecture. Then write
one story per step in **Build it in this order** (format in `docs/stories/README.md`). Build one story
per session. The phase is finished when you use the app and its **Done when** paragraph is true.

There is no completion validator and no evidence file. A person decides.
