# Tasks

## 1. Build and verification

- [x] 1.1 Separate release production from verification in `scripts/build` and stage/setup owners; preserve local installers, generated drift and bundle checks. Exercise release mode with NSIS present and verify drift and bundle failures.
- [x] 1.2 Extract shared Linux, macOS and Windows verification into a reusable workflow with an explicit aggregate, PR/master/manual triggers and PR-only cancellation. Preserve E2E shards, diagnostics and macOS subset; test failure and skip handling and document Windows GUI limits.

## 2. Release gate and assets

- [ ] 2.1 Gate exact-SHA release builds on the latest trusted master verification or shared fallback, validating versions, ancestry and workflow revision. Test wrong SHA, fork, failed rerun, missing and in-progress cases, and hosted workflow conditionals.
- [x] 2.2 Build the five specified native assets on matching runners without installers or tests; validate version metadata and names with focused tests and hosted dry runs.
- [x] 2.3 Collect exactly five current-run assets and checksums before tag-only publication; fail safely on existing releases and verify missing, extra, failed and manual cases.

## 3. Cross-platform evidence

- [ ] 3.1 Add and document reproducible Ubuntu 24.04 verification with isolated state; run feasible Linux architectures including native clipboard E2E, record architecture and limitations, and exercise macOS locally.
- [ ] 3.2 Document release prerequisites and limitations; run full verification, baseline comparison, strict OpenSpec validation, hosted nonpublishing dry run and independent review. Record unavailable Windows and hosted evidence without marking it passed.
