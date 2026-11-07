# Design

## Context

The current push workflow runs Linux stages and focused cross-platform Go checks; the release workflow mixes verification, macOS builds and smoke tests. `scripts/build` also owns generated-file drift, bundle scanning and optional Windows installer generation. Windows E2E is not supported by the current harness.

## Goals / Non-Goals

**Goals:** Share verification across triggers, gate builds on exact revision evidence, retain verification coverage and publish only a complete set of five native outputs.

**Non-Goals:** Change offline application behavior, install runtime dependencies automatically, publish installers, or claim CI launches the distributable. Existing local installer commands remain supported.

## Decisions

- A reusable workflow owns the required verification jobs and an explicit aggregate. PR concurrency cancels only obsolete PR runs; master and release runs remain independent. This avoids duplicating coverage between release and ordinary verification.
- The gate considers only master push runs of the designated verification workflow, in this repository, at the exact SHA. The newest run and its latest attempt govern: success qualifies, failure or cancellation fails closed, and missing or in-progress evidence invokes the reusable workflow. The workflow definition at the target SHA must match the definition being trusted; stale definitions do not qualify. PR and fork results never qualify.
- The build interface separates production from verification and explicitly disables NSIS for releases. Generated-file drift and bundle scanning remain in the verification build stage. This preserves the existing local installer interface and avoids post-build release tests.
- Platform bundle and resource versions use the numeric base version; the Go application and asset names retain the complete prerelease version. Windows releases use Wails' error strategy for a missing WebView2 runtime, which the user installs separately.
- Native runners build each target and upload distinct run-scoped artifacts. A dependent collector validates the exact inventory and generates checksums before a tag-only publisher creates a release. Existing releases fail closed rather than mixing assets across runs.
- Release runs are serialized per ref without cancelling a publish. The publisher stages a draft and deletes its own draft on any failure before it becomes public, so a failed run leaves no release that blocks a retry. Artifacts are unsigned and un-notarized; the macOS bundle is re-sealed ad hoc after its version edit.
- Manual dispatch uses validated input as data and cannot publish. Versions retain stable/alpha/beta classification and tag notes. Only the publisher has contents write permission.

## Risks / Trade-offs

- [Hosted Actions semantics and runner availability] → Validate with nonpublishing hosted runs; report missing evidence instead of claiming a pass.
- [Windows WebView2 and Linux library dependencies] → Windows release builds use Wails' error strategy when WebView2 is missing; the user installs the runtime separately. Document prerequisites and preserve offline privacy.
- [Exact distributable is not exercised in CI] → Document the limitation and use separate local desktop verification where practical.
