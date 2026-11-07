# Tasks

## 1. Build and verification

- [x] 1.1 Separate release production from verification in `scripts/build` and stage/setup owners; preserve local installers, generated drift and bundle checks. Exercise release mode with NSIS present and verify drift and bundle failures.
- [x] 1.2 Extract shared Linux, macOS and Windows verification into a reusable workflow with an explicit aggregate, PR/master/manual triggers and PR-only cancellation. Preserve E2E shards, diagnostics and macOS subset; test failure and skip handling and document Windows GUI limits.

## 2. Release gate and assets

- [x] 2.1 Gate exact-SHA release builds on the latest trusted master verification or shared fallback, validating versions, ancestry and workflow revision. Test wrong SHA, fork, failed rerun, missing and in-progress cases, and hosted workflow conditionals. Workflow conditionals are tested in `tools/verify/workflow-conditionals.test.mjs` by executing the authorize and gate steps' shell with a fake `gh` and by asserting each job and step `if`/`needs`.
- [x] 2.2 Build the five specified native assets on matching runners without installers or tests; validate version metadata and names with focused tests and hosted dry runs.
- [x] 2.3 Collect exactly five current-run assets and checksums before tag-only publication; fail safely on existing releases and verify missing, extra, failed and manual cases.

## 3. Cross-platform evidence

- [x] 3.1 Provide reproducible Ubuntu 24.04 verification with isolated state (`tools/verification-container`, run natively on ARM64 locally with native clipboard E2E) and a manual `container-verify` workflow that runs it on a native AMD64 runner, because local AMD64 emulation crashes the Go toolchain. The AMD64 container job has not been run; AMD64 verification evidence is the hosted `e2e (serial)` job with native clipboard on a native Ubuntu 24.04 AMD64 runner. macOS was exercised locally. Architectures and limitations are in `evidence.md`.
- [ ] 3.2 (reopened: the local baseline comparison failed, 200 passed, 1 failed, 16 not run, cause unexplained; rerun it to green or explain the failure) Document release prerequisites and limitations; run full verification, baseline comparison, strict OpenSpec validation, hosted nonpublishing dry run and independent review. Record unavailable Windows and hosted evidence without marking it passed.
