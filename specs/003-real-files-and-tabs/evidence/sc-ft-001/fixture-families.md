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
| 2 | **CRLF** | `internal/appmodel/save_test.go` `TestSaveKeepsAUniformlyCRLFDocumentCRLFOnDisk` (T183); encoder end at `internal/file/codec_test.go:30` | Opens a uniformly-CRLF fixture, edits through `appmodel.Save` with an **LF** working copy, and `os.ReadFile` returns `"one\r\nedited\r\n"` — the transformation, not a pass-through | **Proved** (reaches disk). Still do not cite `internal/file/atomic_replace_test.go:44` for this family: it moves `"before\r\n"` → `"after\r\n"` as opaque payload and exercises no line-ending logic. Verified to discriminate — with an LF fixture the assertion fails `bytes on disk = "one\nedited\n"` |
| 3 | **UTF-8 BOM** | `internal/appmodel/save_test.go` `TestSaveKeepsASingleUTF8BOMOnDisk` (T183); encoder end at `internal/file/codec_test.go:30`, read side at `internal/file/document_reader_test.go:90` | Opens a BOM fixture, edits through `appmodel.Save`, and asserts `EF BB BF` is still the first three bytes, that the next three are **not** another BOM, and that the content after it is the edited text | **Proved** (reaches disk). The doubled-mark case is the one that matters: the reader strips the BOM and the encoder re-adds it, so a prefix or length check alone would miss it. Verified to discriminate — without a BOM in the fixture the assertion fails |
| 4 | **Permission mode** | `internal/file/atomic_replace_test.go:43` `TestAtomicReplace`, subtest `existing target preserves bytes and mode` | Real disk: bytes equal `"after\r\n"`, `info.Mode().Perm() == 0o640`, exactly one directory entry (no temp left behind), result version matches disk | **Proved at both layers.** Anchored `FR-FT-009`. `internal/appmodel/save_test.go` `TestSavePreservesThePermissionModeAboveAtomicReplace` (T183) opens a `0640` fixture, edits through `appmodel.Save` and stats `0640` back. **Ownership is deliberately out of scope, by a reading of the criterion rather than an omission**: SC-FT-001 names a "*permission-mode*" fixture and Constitution V says "preserve permissions" — neither states ownership, and `atomic_replace.go` has no `Chown`. An ownership assertion here would fail by design against a requirement nothing makes |
| 5 | **Mixed-ending confirmation** | `internal/appmodel/save_test.go:143` `TestMixedEndingAuthorization` | Real mixed fixture; first `Save` returns `WriteStatusNeedsNormalization` with a token and `ProposedEnding == "lf"`; second `Save` with the token commits; the token is consumed; the projection reports `LineEnding == "lf"` | **Confirmation gate proved; the disk half is not.** The test reads the projected field, never the resulting bytes |
| | | `internal/appmodel/save_test.go:407` `TestSaveRefusesMixedEndingsBeforeTouchingTheDisk` | Zero stats and zero stable reads occur before the refusal | **Proved** (original intact — by never opening the file) |
| | | `internal/appmodel/save_test.go:441` `TestUnauthorizedSaveAsksForNormalizationEvenWhenTheFileAlsoChanged` | The refusal stays `NeedsNormalization` even when the file also drifted | Supporting (ordering of the gate) |
| | | `internal/file/codec_test.go:107` `TestEncodeRefusesMixedAndUnsafeContent` | Encoder returns `ErrCodecMixedLineEndings` | Supporting (backstop: no write without a decision) |
| 6 | **Immediate save** | `internal/appmodel/save_test.go:54` `TestSaveAndSaveAs` | `Save` on a pathless document routes to Save As; `os.ReadFile(target) == "# saved\n"`; the document adopts the path, is `!Dirty`, status `saved` | **Proved, both halves in one test** |
| | | `internal/appmodel/write_coordinator_test.go:249` `TestExplicitSaveReusesMatchingAutosaveCommit` | Disk holds `"same revision\n"` after an explicit Save reuses an in-flight autosave commit | Supporting |
| 7 | **Write failure** | `internal/appmodel/close_plan_test.go:55` `TestClosePlanSaveOrderAndFailure` | With the second write injected to fail: `os.ReadFile(secondPath)` still returns the original `"second base\n"`, `Documents[secondID].Dirty == true`, the document stays open, and the first document's write did land | **Proved.** Anchored `FR-FT-026 (partial)`. No longer the *only* test asserting both halves: T183 added `internal/appmodel/save_test.go` `TestFailedExplicitSaveLeavesTheFileIntactAndTheDocumentDirty`, which does it for a **single explicit Save** — the ordinary path — rather than as a by-product of a Save-all across a close plan. Verified to discriminate: without the injected failure the Save commits and the assertion fails |
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
