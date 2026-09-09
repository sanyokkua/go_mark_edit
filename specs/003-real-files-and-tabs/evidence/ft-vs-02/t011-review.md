# FT-VS-02 raw codec and disk-version primitives — T011

Date: 2026-08-08

## Verified commands

- `GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/file -run 'TestDocumentCodecRoundTrip|TestNoneEndingPreservedUntilBreakInserted|TestDiskVersionEquality' -count=1` — passed.
- `GOCACHE=/private/tmp/gomarkedit-gocache go test -race ./internal/file -count=1` — package passed.
- `git diff --check` — passed.

## Contract evidence

- `DecodeDocument` strips and records a UTF-8 BOM, rejects invalid UTF-8, NUL bytes, and lone ASCII CR, and canonicalizes accepted CRLF content to LF.
- `EncodeDocument` writes canonical UTF-8 with the recorded LF/CRLF and BOM characteristics, refuses mixed endings, and preserves a `none` file without a terminator until content contains a break, which selects LF.
- `DiskVersion.Equal` compares existence, byte size, nanosecond modification time, permission bits, and optional platform file identity in one implementation.
- `CurrentDiskVersion` returns an explicit absent version for a missing path and preserves non-not-found stat errors.
