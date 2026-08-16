# SC-FT-001 — which test proves which fixture family

**Proves: SC-FT-001 — partially. Four of the seven fixture families are proved end to end; three
are proved only at one end.** Written by **T158**, which found SC-FT-001 named in no test and no
evidence file. This artifact is the named answer to "which evidence proves this?", and it is written
to be checkable rather than reassuring: every row says what the test actually asserts, and the rows
that stop short say where they stop.

## The criterion, split into clauses

> In 100% of the LF, CRLF, UTF-8-BOM, permission-mode, mixed-ending-confirmation, immediate-save,
> and write-failure fixtures, a one-line user edit either **reaches disk with the required
> characteristics** or the **original file remains byte-for-byte intact and visibly modified**.

Seven fixture families, two alternative outcomes. A family is fully proved only when a test drives a
real fixture on a real filesystem through the production write path and then reads the result back —
an encoder unit test comparing `[]byte` in memory proves the encoder, not the fixture.

## Family by family

| # | Fixture family | Proving test | What it actually asserts | Verdict |
|---|---|---|---|---|
| 1 | **LF** | `internal/appmodel/write_coordinator_test.go:178` `TestExplicitSaveSerializesWithAutosave` | Opens the LF fixture `base\n`, edits, explicit `Save`, then `os.ReadFile` returns `"second\n"` — real bytes through the real `file.AtomicReplace` | **Proved** (reaches disk). Anchored `FR-FT-019`; the LF round trip is incidental to that test's purpose |
| | | `internal/file/codec_test.go:30` `TestDocumentCodecEncodesEachPreservedConvention` (case `lf`) | Encoder output bytes, in memory | Supporting only |
| 2 | **CRLF** | `internal/file/codec_test.go:30` (cases `crlf`, `bom-crlf`) | Encoder emits `\r\n` for a CRLF snapshot, in memory | **Gap — encoder end only.** No test opens a uniformly-CRLF fixture, edits one line, saves, and reads CRLF bytes back off disk. `internal/file/atomic_replace_test.go:44` moves `"before\r\n"` → `"after\r\n"`, but those are opaque payload bytes: that test exercises no line-ending logic at all. The `writeMixedDocument` fixtures are *mixed*, not uniform CRLF |
| 3 | **UTF-8 BOM** | `internal/file/codec_test.go:30` (cases `bom-lf`, `bom-crlf`) | Encoder prepends `EF BB BF`, in memory | **Gap — encoder end only.** `internal/file/document_reader_test.go:90` `TestReadClassifiedDocument` proves the *read* side (`BOMPresent` set, BOM excluded from content). Nothing writes a BOM document back and re-reads the bytes; the BOM fixture at `internal/file/document_fixtures_test.go:84` is read-side only |
| 4 | **Permission mode** | `internal/file/atomic_replace_test.go:43` `TestAtomicReplace`, subtest `existing target preserves bytes and mode` | Real disk: bytes equal `"after\r\n"`, `info.Mode().Perm() == 0o640`, exactly one directory entry (no temp left behind), result version matches disk | **Proved at `file.AtomicReplace`; partial above it.** Anchored `FR-FT-009`. No `appmodel.Save`-level test asserts the mode survives a save, and **ownership is not merely untested — it is unimplemented**: `internal/file/atomic_replace.go` contains no `Chown`, only a `chmod` to `expected.Mode` at `:174` |
| 5 | **Mixed-ending confirmation** | `internal/appmodel/save_test.go:143` `TestMixedEndingAuthorization` | Real mixed fixture; first `Save` returns `WriteStatusNeedsNormalization` with a token and `ProposedEnding == "lf"`; second `Save` with the token commits; the token is consumed; the projection reports `LineEnding == "lf"` | **Confirmation gate proved; the disk half is not.** The test reads the projected field, never the resulting bytes |
| | | `internal/appmodel/save_test.go:407` `TestSaveRefusesMixedEndingsBeforeTouchingTheDisk` | Zero stats and zero stable reads occur before the refusal | **Proved** (original intact — by never opening the file) |
| | | `internal/appmodel/save_test.go:441` `TestUnauthorizedSaveAsksForNormalizationEvenWhenTheFileAlsoChanged` | The refusal stays `NeedsNormalization` even when the file also drifted | Supporting (ordering of the gate) |
| | | `internal/file/codec_test.go:107` `TestEncodeRefusesMixedAndUnsafeContent` | Encoder returns `ErrCodecMixedLineEndings` | Supporting (backstop: no write without a decision) |
| 6 | **Immediate save** | `internal/appmodel/save_test.go:54` `TestSaveAndSaveAs` | `Save` on a pathless document routes to Save As; `os.ReadFile(target) == "# saved\n"`; the document adopts the path, is `!Dirty`, status `saved` | **Proved, both halves in one test** |
| | | `internal/appmodel/write_coordinator_test.go:249` `TestExplicitSaveReusesMatchingAutosaveCommit` | Disk holds `"same revision\n"` after an explicit Save reuses an in-flight autosave commit | Supporting |
| 7 | **Write failure** | `internal/appmodel/close_plan_test.go:55` `TestClosePlanSaveOrderAndFailure` | With the second write injected to fail: `os.ReadFile(secondPath)` still returns the original `"second base\n"`, `Documents[secondID].Dirty == true`, the document stays open, and the first document's write did land | **Proved — the only test that asserts both halves of the "or" together.** Anchored `FR-FT-026 (partial)` |
| | | `internal/file/atomic_replace_test.go:145` six `pre-commit … preserves original` subtests | For each injected failure point (write, chmod, sync, close, recheck, replace): not committed, target bytes byte-identical to the pre-write read, temp file removed, category classified correctly | **Proved** (original intact). No dirty concept exists at this layer |
| | | `internal/appmodel/save_status_test.go:77` `TestFailedWriteLeavesStatusUnchanged` | `markFailedWrite` leaves the status label unchanged and mutates neither baseline nor content | Supporting ("visibly modified", struct level, no disk) |

## What this artifact does not claim

Stated here rather than left for a reader to infer, because a link that overstates is worse than
none:

1. **CRLF and BOM are not proved end to end.** Both are proved at `EncodeDocument` — a pure function
   compared in memory — and at the reader's classification. Nothing joins the two ends. This is the
   largest hole in SC-FT-001, and the criterion says "100% of the … fixtures".
2. **Permission mode is proved at `file.AtomicReplace`, not through `appmodel.Save`**, and
   **ownership preservation does not exist in the code**.
3. **The mixed-ending family's authorised commit never has its disk bytes read.**
4. **There is no single-document explicit-`Save` write-failure test.** The only end-to-end
   failure-plus-intact-bytes-plus-dirty assertion rides on the close-plan Save-all path.

Those four are filed as **T183**. Until they close, SC-FT-001 is proved for four families
(LF, permission-mode at the replace layer, immediate-save, write-failure) and half-proved for three.

## Also relevant, and deliberately not counted

`internal/file/document_fixtures_test.go:164` `TestDocumentFixtureBytesAndBounds` asserts the 0o640
fixture *was created* at 0o640. That proves the fixture builder, not a write, and is listed only so
a later reader does not mistake it for coverage.
