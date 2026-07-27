# Phase 08 — I can install it, and double-clicking a `.md` opens it

## What you get

A real installer for macOS, Windows and Linux, with an icon and a version number. Install it,
double-click a `.md` file in your file manager, and GoMarkEdit opens it.

## Why here and not at the end

A release pipeline that has never run is not a release pipeline. Once there is something worth handing
to another person — and after Phase 07 there is — make it installable and keep it that way. Every later
phase then ships through a path that already works.

## Build it in this order

1. **A version.** Injected at build time via ldflags into `internal/settings.AppVersion`, shown in the
   About dialog. Local and development builds report `dev`, always.
2. **Icons.** One source image generates every per-OS application icon and the document icon, by a
   script, deterministically — not by hand in an image editor.
3. **Installers.** `.app` for macOS, NSIS for Windows, `.deb` and `.rpm` for Linux. v1 ships unsigned
   and un-notarized; the install caveats that creates are documented for the user, not hidden.
4. **File associations.** Register `.md`, `.markdown`, `.mdown` and `.txt`. Handle the OS opening a
   file at launch and while already running, on all three platforms. Opening a file this way uses the
   configured default view mode.
5. **The release pipeline.** A tag triggers it: work out the version, build the matrix, run the test
   gate, produce the artifacts with checksums, create the release, and detect a pre-release. Builds
   are isolated from each other.
6. **Finish the strings.** Sweep for any user-facing text that is still hardcoded and move it into the
   catalog. English is the only locale that ships; the point is that adding another is a JSON file.
7. **Prove the release candidate before shipping it.** Against a built artifact, not a dev server:
   no unsolicited network traffic and no telemetry, logs written locally only, every rendering asset
   bundled rather than fetched, startup within the budget in `03_NonFunctional/02_PERFORMANCE.md`, and
   the Monaco bundle within its size bound. A candidate that misses one of these is not released.

## Where the details are

- Associations: `01_Product/08_FILE_ASSOCIATIONS.md`
- Packaging and release: `04_Build_and_Release/02_PACKAGING_AND_ASSOCIATIONS.md`,
  `04_Build_and_Release/04_VERSIONING_ICON_AND_CICD.md`
- The budgets the candidate must meet: `03_NonFunctional/02_PERFORMANCE.md`,
  `03_NonFunctional/04_OFFLINE.md`
- i18n: `01_Product/13_I18N.md`, DD-35
- Decisions: DD-34 (unsigned in v1), DD-65 (version injection), DD-66 (icon pipeline), DD-67 (build
  isolation), ADR-0015
- The icon source and script: `assets/icon/`

## Questions to settle first

- **Opening an unsupported or binary file from the OS.** Someone will associate the app with something
  odd, or double-click a `.txt` that is really binary. The answer follows Phase 05's question 2 — if
  invalid bytes open read-only, the same applies here and there is nothing new to decide. Binary input
  is declined with a message. Confirm before step 4.
- **Which view mode an OS open uses.** Same question as Phase 05's question 1, already answered.

## Done when

On each platform you have access to: install the built package, launch it from the applications menu,
check the About dialog shows a real version rather than `dev`, then double-click a `.md` file in the
file manager and watch it open in GoMarkEdit. Push a tag and get a release with artifacts and
checksums attached.

Where a platform is not available to test on, say so plainly in the release notes rather than implying
it was verified.
