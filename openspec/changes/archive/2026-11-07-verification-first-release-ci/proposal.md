# Proposal

## Why

Release builds currently mix verification and packaging, cover only macOS, and do not require a consistent pull request check. This makes release ordering and cross-platform evidence difficult to assess.

## What Changes

- Run shared verification for pull requests, master pushes, manual requests and release fallback before release builds.
- Gate release builds on trusted verification of the exact commit, then produce five native executable assets and checksums together.
- Keep manual releases nonpublishing and preserve version and master ancestry rules.
- Move existing verification out of release production; do not run post-build smoke tests in CI.
- Preserve local installer workflows and offline application behavior. Hosted runner and native desktop coverage remain separately evidenced.

## Capabilities

### New Capabilities

- `release-verification`: Verification, release gating and publication contracts for distributed builds.

### Modified Capabilities

None.

## Impact

GitHub Actions, build and verification scripts, developer documentation and release assets change. No application runtime network behavior changes.
