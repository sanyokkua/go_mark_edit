# Implementation plan

Backend: extend the existing conflict preview and save codec ownership to return full canonical text, full line counts, actual disk bytes and optional expected saved bytes with a typed unavailable reason. Preserve decision bindings and metadata handling.

Frontend: normalize the updated bridge payload, render explicit full-version statistics and use bundled Monaco in a shared read-only comparison component. Preserve ModalShell lifecycle. Separate floating-surface tokens from application-wide blur; use shared Popup/ModalShell styles, WebKit support and native visual verification.

Order: baseline; backend payload and regression tests; frontend projection/diff and regression tests; floating surfaces and browser regressions; build regeneration; full verification and baseline comparison; native walkthrough; independent review. Backend and styling may be delegated independently with disjoint ownership; frontend consumes the agreed backend schema.

Tests cover late and distant changes, insertions/deletions, Unicode/whitespace/end-of-file, full counts beyond old caps, LF/CRLF/BOM expected bytes, empty/trailing lines, unavailable encoding/normalization, metadata-only/read-only/stale versions, diff navigation/cleanup/timeout, responsive focus and all six appearances.

Preserve pre-existing generated runtime modifications and deleted frontend/dist/.gitkeep. No historical spec or constitution edits.
