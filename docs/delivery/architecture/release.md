# Release

How GoMarkEdit is built, packaged, signed, versioned and shipped. **Normative** — the same authority as
`rules.md`. A story that changes packaging, CI or versioning is checked against this file.

This document exists because build-and-release material has nowhere else to live. It is not a feature,
so it does not belong in `../spec/product/`. It is not a phase. It is not a code-layout rule. Left
homeless it ends up in a README that goes stale, or archived during a conversion and quietly lost — and
it is the part of the project that breaks most visibly when it drifts.

**Read this alongside the state of the world:** most of what follows is decided and only some of it is
built. Every row says which. Phase 08 (`../plan/phase-08-install-it.md`) is where the unbuilt half
lands.

---

## Artifacts

| Artifact | Platform | Built by | Output path | Built today |
|---|---|---|---|---|
| `GoMarkEdit.app` bundle | `darwin/arm64`, `darwin/amd64` | `just build` → `wails build` | `build/bin/GoMarkEdit.app` | **yes** |
| `GoMarkEdit.exe` | `windows/amd64` | `wails build -platform windows/amd64` | `build/bin/GoMarkEdit.exe` | not verified on this machine |
| `GoMarkEdit` ELF binary | `linux/amd64` (Ubuntu 24.04, `webkit2_41` tag) | `wails build -platform linux/amd64 -tags webkit2_41` | `build/bin/GoMarkEdit` | not verified on this machine |
| macOS `.zip` of the `.app` | `darwin/*` | Phase 08 pipeline | release asset | no |
| Windows NSIS installer | `windows/amd64` | Phase 08 pipeline | release asset | no |
| Linux `.deb` and `.rpm` | `linux/amd64` | Phase 08 pipeline | release asset | no |
| `SHA256SUMS.txt` | all | Phase 08 pipeline | release asset | no |

`just build` produces a **runnable binary, not a distributable artifact**. The distinction is
load-bearing: a Definition of Done that says "packaged" against `wails build` output certifies
something that was never produced.

`just package` exists at `justfile:141` as a deliberate stub. It prints the phase that introduces it
and **exits 1**. Naming a command that does not exist is how a gate certifies something false; a
recipe that shells out to `wails build` and calls the result "packaged" would be worse than no recipe.

## Versioning

- **The git tag is the single source of the version.** A release is cut by pushing a tag matching
  `v*.*.*`; nothing else sets a version, and there is no `VERSION` file or hand-maintained constant.
  Two sources of a version means two versions.
- **When** a release build runs, the version is injected at link time via
  `-ldflags "-X <module>/internal/settings.AppVersion=<tag>"` and shown in the About dialog.
- **When** any other build runs — local, `wails dev`, CI without a tag — the version reads exactly
  `dev`. Not `0.0.0`, not the last tag, not empty: `dev`, so a local build can never be mistaken for a
  release build.
- **If** a tag carries a suffix (`v1.2.0-rc1`), **then** the GitHub release is marked pre-release
  automatically.
- Wails substitutes the version into `build/darwin/Info.plist` as both `CFBundleVersion` and
  `CFBundleShortVersionString`, from `{{.Info.ProductVersion}}`, and `wails.json` is patched with the
  computed version before the build step.

**Not built yet.** There is no `AppVersion` symbol in `internal/settings` today, and no ldflags in any
build path — `just build` and `wails build` both produce a binary that reports no version at all.
Decided in `../adr/0015-cicd-versioning-icon.md`; built in Phase 08 step 1.

## Building

| Step | Command | Produces | Notes |
|---|---|---|---|
| Frontend bundle | `just frontend-build` | `frontend/dist/` | `tsc --noEmit && vite build` |
| Bindings | `just gen` | `frontend/wailsjs/` | `just gen-check` fails on drift |
| Binary | `just build` | `build/bin/` | `wails build` |
| Full local gate | `just check` | — | bindings, build, format, lint, types, frontend tests, vet, archtest, race tests |

- **When** a build runs from a clean checkout, `just setup` must have run first: `go mod download`,
  `npm --prefix frontend ci`, `lefthook install`.
- **The build is CGO-free.** `just cgo-free-check` runs `CGO_ENABLED=0 go build ./...` as part of
  `just archtest`. A CGO dependency breaks cross-compiling for every non-host target and is discovered
  at release time rather than at commit time, which is why it is a gate and not a convention. See
  `rules.md#build-is-cgo-free` and `../adr/0001-wails-v2-cgo-free.md`.
- **If** a required tool is absent, the build fails naming the tool — it never proceeds with a
  fallback.

### Icons

One source image generates every per-OS icon, deterministically, by script — never by hand in an image
editor, because hand-forked variants drift and nobody notices which one is stale.

| File | What it is |
|---|---|
| `build/icon/appicon-source.png` | The canonical 1.4 MB source artwork |
| `build/icon/process_icon.py` | Crops the tile, removes the dark backdrop to transparency, emits 1024×1024 |
| `build/appicon.png` | The generated input Wails derives from |
| `build/windows/icon.ico` | Windows application icon |
| `build/bin/GoMarkEdit.app/Contents/Resources/iconfile.icns` | Derived by Wails at build time |

Document-type icons for the file associations Phase 08 registers derive from the same source.

## Packaging

| Platform | Format | Installs to | Registers | Status |
|---|---|---|---|---|
| macOS | `.app` inside a `.zip` | `/Applications` | `.md`, `.markdown`, `.mdown`, `.txt` via `CFBundleDocumentTypes` | Phase 08 |
| Windows | NSIS installer | `%ProgramFiles%\GoMarkEdit` | the same four extensions, via registry | Phase 08 |
| Linux | `.deb` and `.rpm` | `/usr/bin` + `.desktop` entry | the same four extensions, via MIME | Phase 08 |

The macOS `.app` is re-zipped with `zip -X` so the executable bit on
`Contents/MacOS/GoMarkEdit` survives the round trip. A plain archive loses it and the installed app
will not launch.

**What uninstalling leaves behind is not yet decided.** The application's data lives in the per-user
configuration folder (`GoMarkEdit`, or `GoMarkEdit-Dev` for development builds —
`internal/file/paths.go:10-11`), and no uninstaller currently removes it. That is an open question for
Phase 08, not an omission here.

## Signing and distribution

- **v1 ships unsigned and un-notarised**, on every platform. Decided in
  `../adr/0015-cicd-versioning-icon.md`; the cost is accepted, not overlooked.
- **What the user sees.** macOS Gatekeeper refuses the first launch with *"GoMarkEdit cannot be opened
  because the developer cannot be verified"*; the user must right-click → Open, or clear the quarantine
  attribute. Windows SmartScreen shows *"Windows protected your PC"* and requires *More info* → *Run
  anyway*. **The release notes carry these instructions explicitly.** An unsigned artifact whose install
  caveats are undocumented reads to the user as a broken download.
- **Artifacts are published as GitHub release assets**, with `SHA256SUMS.txt` beside them.
- **There is no update check.** The application makes no background network call, ever
  (`rules.md#no-background-network`), and a version check is a network call. Updating means downloading
  a new release.

## Continuous integration

`.github/workflows/main.yml`.

| Trigger | Runs | Blocking |
|---|---|---|
| pull request | **nothing — there is no `pull_request` trigger** | no |
| push to a branch | **nothing — there is no branch `push` trigger** | no |
| push to a tag `v*.*.*` | `test` (staged quality gate), then `release-skeleton` | yes |
| `workflow_dispatch` | the same two jobs | yes |

The `test` job, on `ubuntu-24.04`, runs: `just gen-check`, `just frontend-build`, `just fmt-check`,
`just lint`, `just typecheck`, `just frontend-test`, `just go-vet`, `just go-test`.

**Two gaps, both recorded rather than fixed** — see `../plan/KNOWN_ISSUES.md` items 9 and 15:

1. **`just archtest` runs in no CI job.** It is the Definition of Done's M5, the one item never diffed
   against a baseline because it is the only mechanical thing standing between an implementer and an
   unapproved design decision — and CI never runs it. `.github/workflows/main.yml:31-46` lists eight
   `just` steps and `archtest` is not among them.
2. **CI triggers only on a version tag.** Between releases, the only thing between a broken commit and
   the main branch is the developer running `just check`, plus the lefthook pre-push hook — which
   `--no-verify` skips, and which this project therefore prohibits (`../../../AGENTS.md`).

Both changes alter *when work is blocked*, which is the user's call rather than a documentation
change. Neither is made here.

`release-skeleton` is a placeholder job that echoes one line. It produces no artifact.

### Local hooks

`lefthook.yml` — a local safety net, not the authoritative gate.

| Hook | Runs |
|---|---|
| pre-commit | `gofmt -w` and `prettier --write` on staged files, re-staged |
| pre-push | `scripts/hooks/pre-push-bindings.sh`, then `-frontend.sh`, then `-go.sh`, in that order |

The pre-push ordering is load-bearing: bindings first, because a stale binding makes the frontend
checks fail for the wrong reason.

## Reproducibility

| Pinned | Where | Value |
|---|---|---|
| Go toolchain | `go.mod` | `1.25.7`, read by CI via `go-version-file` |
| Wails CLI | `.github/workflows/main.yml:24` | `v2.12.0` |
| golangci-lint | `.github/workflows/main.yml:28` | `v2.12.2` |
| Node | `.github/workflows/main.yml:20` | `22` |
| CI runner image | `.github/workflows/main.yml:12,51` | `ubuntu-24.04` |
| Go dependencies | `go.sum` | exact hashes |
| npm dependencies | `frontend/package-lock.json` | `npm ci`, never `npm install`, in CI |
| Generated SQL | `sqlc.yaml` → `internal/db/store/` | `just sqlc-check` diffs it |
| Generated bindings | `frontend/wailsjs/` | `just gen-check` diffs it |

**Deliberately not pinned:** the macOS and Windows runner images, because those builds do not yet run
in CI. When Phase 08 adds them, they get pinned in the same table.

## Not permitted

- **Publishing a release from a developer machine.** The version comes from the tag and the artifacts
  come from the pipeline; a hand-built upload has no provenance and cannot be reproduced.
- **Releasing from a dirty tree.** The tag names a commit. If the artifact does not correspond to that
  commit, the tag is a lie.
- **Hand-editing a generated artifact** — `frontend/wailsjs/`, `internal/db/store/`, any derived icon.
  Regenerate the source and re-run the generator. `just gen-check` and `just sqlc-check` catch the
  first two; the third is caught by nothing, which is why it is written down.
- **Downloading a dependency at build time from anywhere but the declared registry.** Everything comes
  from `go.sum` and `package-lock.json`.
- **Bundling a rendering asset that is fetched at runtime.** Fonts, Monaco and every stylesheet ship
  inside the binary. This is a privacy property, not a performance one — see
  `rules.md#no-background-network` and `../spec/constraints.md#nothing-leaves-the-device`.
- **Signing with a personal identity to make a warning go away.** v1 is unsigned by decision; changing
  that is a new ADR, not a build-script edit.
