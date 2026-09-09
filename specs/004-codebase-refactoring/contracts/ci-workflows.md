# Contract: CI workflows

Requirements: FR-061, FR-066, FR-067, FR-068, FR-070, SC-006, SC-015. Both workflows call only the
five scripts. `.github/workflows/main.yml` is replaced by the two files below.

## `push.yml` — every push

```
on: push (all branches)
runs-on: ubuntu-24.04
timeout-minutes: 40
steps:
  - actions/checkout@v4
  - sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev   # the Linux Wails toolchain
  - actions/setup-go@v6      with go-version-file: go.mod
  - actions/setup-node@v4    with node-version-file: .nvmrc, cache: npm, cache-dependency-path: frontend/package-lock.json
  - scripts/build setup
  - scripts/verify --skip e2e                                   # blocking; Build links the real Linux desktop artifact (tag webkit2_41)
```

## `release.yml` — release and dry run

```
on:
  push: tags: ['v*']
  workflow_dispatch: inputs: version (string, required, X.Y.Z)
runs-on: macos-latest        # arm64 today; the artifact name states the architecture
timeout-minutes: 60
permissions: contents: write # gh release create with GITHUB_TOKEN
steps:
  - actions/checkout@v4 with fetch-depth: 0
  - derive VERSION: from the tag (vX.Y.Z → X.Y.Z) or the dispatch input; fail if it is not X.Y.Z
  - guard: ON_MASTER = git merge-base --is-ancestor "$GITHUB_SHA" origin/master; on a tag push that is
    not ON_MASTER the job ends here, successfully, with a notice naming the tag and the branch — no
    later step runs, nothing is built, nothing is published (FR-067, SC-015); every later step is
    conditioned on the guard's output
  - actions/setup-go@v6, actions/setup-node@v4 (as above)
  - scripts/build setup --with-browser
  - scripts/verify                                              # all six stages, including the wails dev suite
  - scripts/build --version "$VERSION"
  - ditto -c -k --keepParent build/bin/GoMarkEdit.app "GoMarkEdit-$VERSION-macos-arm64.zip"
  - if tag push (ON_MASTER by the guard): gh release create "$GITHUB_REF_NAME" "GoMarkEdit-$VERSION-macos-arm64.zip" --title "GoMarkEdit $VERSION" --notes-from-tag (GITHUB_TOKEN only; pre-release when the tag carries a suffix)
  - if dispatch: actions/upload-artifact@v4 with the zip (dry run)
```

Release notes are the annotated tag's message; the owner writes the walkthrough sentence for the
tag (date, commit, host, outcome — FR-027) into that message before pushing the tag, as the
architecture map's release steps state.

## Rules

- No other job, script or step list exists; a change to a stage is a change to `scripts/`.
- Signing and notarisation are not performed; the artifact is unsigned (recorded as an open decision
  in the architecture map).
- No universal binary and no disk image; the runner's own architecture only.
- Node, Go and Wails versions are read from `.nvmrc`, `go.mod` and the Wails module requirement, never
  written in the workflow.
- `scripts/verify --skip e2e` never reports the E2E stage as passed; the push check is the five other
  stages.
- The workflow makes no network assertion about the application (FR-028 is verified on the developer
  host).

## Acceptance evidence (SC-006, SC-015)

- `grep -E 'run:' .github/workflows/*.yml` shows only `scripts/…`, `sudo apt-get …`, the version
  derivation, `ditto`, `git merge-base` and `gh release create`.
- A manual dispatch with `version: 9.9.9` produces `GoMarkEdit-9.9.9-macos-arm64.zip` whose About
  dialog reports `9.9.9` (checked in the closing walkthrough of the dry-run artifact).
- A tag pushed on `feature/…` produces no artifact and no release: the job ends at the guard step.
