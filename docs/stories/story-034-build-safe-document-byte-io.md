---
id: STORY-034
title: Build safe document byte I/O and native dialog seams
status: draft
spec_clauses:
  - 01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings
  - 02_Architecture/02_BACKEND_GO.md#dialogs
  - 02_Architecture/02_BACKEND_GO.md#file-io
  - 07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases
phase_requirements:
  - PH02-R01
  - PH02-R02
  - PH02-R03
  - PH02-R04
  - PH02-R10
modules:
  - internal/docs/
acceptance_criteria:
  - STORY-034-AC-1
  - STORY-034-AC-2
  - STORY-034-AC-3
  - STORY-034-AC-4
  - STORY-034-AC-5
  - STORY-034-AC-6
edge_cases:
  - EC-DOCS-1
  - EC-DOCS-7
  - EC-DOCS-8
  - EC-DOCS-9
  - EC-DOCS-10
depends_on:
  - STORY-002
  - STORY-003
  - STORY-033
adrs:
  - ADR-0001
  - ADR-0024
phase: 02
owner: coder
estimate: M
---

# STORY-034 — Build safe document byte I/O and native dialog seams

## Goal

Open and replace supported document files without corrupting bytes, leaving partial files, or turning a
cancelled native dialog into an application error.

## In scope

- Create the `internal/docs` read, classification, fingerprint, dialog, and atomic-write service.
- Preserve UTF-8 BOM and uniform line endings and classify unsafe text as read-only.
- Enforce supported dialog filters and Save As suffix policy.

## Out of scope

- Adding documents to the application model, owned by STORY-035.
- Canonical save lifecycle and dirty state, owned by STORY-037.
- Rendering the read-only warning, owned by STORY-040.

## Spec inputs

- `01_Product/03_FILES_TABS_WORKSPACE.md#encoding-and-line-endings` — preserve BOM and line endings and
  avoid corrupting tolerantly decoded input.
- `02_Architecture/02_BACKEND_GO.md#dialogs` — use native filtered dialogs with cancellation as a no-op.
- `02_Architecture/02_BACKEND_GO.md#file-io` — keep document I/O behind the docs service and preserve
  UTF-8 metadata on round trip.
- `07_Phases/PHASE_02_FILE_IO_TABS.md#edge-and-failure-cases` — prove missing, permission, unsafe-byte,
  round-trip, and Save As outcomes explicitly.

## Design constraints

- `internal/docs` owns filesystem/dialog execution seams; appmodel later composes it and remains the only
  frontend-facing state owner.
- The story adds one aggregate exported service seam,
  `DocsService.Execute(ctx, DocumentIOCommand) (DocumentIOResult, error)`; read, classify, dialog, fingerprint,
  and atomic-write helpers remain private.
- Reads return raw-byte fingerprint and decoded display data; invalid UTF-8 or NUL data is never converted
  into a writable round trip (ADR-0024).
- Every write command rechecks document capability and rejects read-only input before any filesystem write
  primitive is invoked.
- Atomic replacement preserves the prior target until commit and cleans failed temporary artifacts.
- Any future bound handler follows Handler → Service → Repository, concrete `apperr.*Result`, no bound
  `context.Context`, and panic recovery; concrete wiring stays in `internal/application`.
- Preserve DD-15, DD-32, DD-62–64, ADR-0014, adapter-only `wailsjs/`, token-only theming, and zero network.

## Acceptance criteria

### STORY-034-AC-1
**Satisfies:** PH02-R03, PH02-R10

**Given** a supported path, **when** it is read, **then** the result contains its canonical path, raw-byte
disk fingerprint, decoded display content, BOM metadata, and deterministic line-ending metadata.

### STORY-034-AC-2
**Satisfies:** PH02-R03, PH02-R04

**Given** UTF-8 BOM, invalid UTF-8, or NUL-bearing bytes, **when** they are classified, **then** BOM is
excluded from canonical text, unsafe input is marked read-only, and any write command is rejected before a
disk primitive without modifying the original bytes. (satisfies EC-DOCS-8)

### STORY-034-AC-3
**Satisfies:** PH02-R03, PH02-R04

**Given** LF, CRLF, or mixed endings, **when** metadata is calculated, **then** uniform endings round-trip
unchanged and mixed input reports its dominant ending with first-observed tie breaking. (satisfies
EC-DOCS-9)

### STORY-034-AC-4
**Satisfies:** PH02-R02, PH02-R10

**Given** a replacement write fails before commit, **when** the error returns, **then** the original target
bytes remain intact and no partial replacement is visible. (satisfies EC-DOCS-7)

### STORY-034-AC-5
**Satisfies:** PH02-R01, PH02-R02

Open and Save As dialogs accept `.md`, `.markdown`, `.mdown`, and `.txt` case-insensitively; suffixless
Save As appends `.md`, an unsupported suffix is rejected before a write, native overwrite confirmation is
required for an existing target, and cancellation changes nothing. (satisfies EC-DOCS-10)

### STORY-034-AC-6
**Satisfies:** PH02-R01, PH02-R10

A cancelled dialog returns a no-op result, while an inaccessible or disappeared selected path returns a
sanitized error and performs no write. (satisfies EC-DOCS-1)

## Test plan

- STORY-034-AC-1 — integration — `internal/docs/service_test.go` —
  `TestSTORY034AC1ReadsCanonicalByteMetadata`.
- STORY-034-AC-2 — unit — `internal/docs/encoding_test.go` —
  `TestSTORY034AC2ClassifiesUnsafeBytesReadOnly_EC_DOCS_8`.
- STORY-034-AC-3 — unit — `internal/docs/encoding_test.go` —
  `TestSTORY034AC3RoundTripsAndClassifiesEndings_EC_DOCS_9`.
- STORY-034-AC-4 — integration — `internal/docs/service_test.go` —
  `TestSTORY034AC4AtomicFailurePreservesTarget_EC_DOCS_7`.
- STORY-034-AC-5 — unit — `internal/docs/service_test.go` —
  `TestSTORY034AC5SuffixOverwriteAndCancellationPolicy_EC_DOCS_10`.
- STORY-034-AC-6 — integration — `internal/docs/service_test.go` —
  `TestSTORY034AC6CancelAndMissingPathAreNonDestructive_EC_DOCS_1`.

## Definition of done

- [ ] Every AC and every declared edge has a passing test with explicit `Proves:`/`Evidence:` markers.
- [ ] Byte fixtures cover BOM, LF, CRLF, mixed ties, invalid UTF-8, NUL, permission, and missing-path cases.
- [ ] Atomic-write tests leave the old target intact on every pre-commit failure.
- [ ] Tests prove the single aggregate service seam and that all supporting helpers remain private.
- [ ] Backend format, vet, lint, and race-enabled tests pass.
- [ ] Bound surfaces, if added, use Result envelopes and regenerated drift-free bindings.
- [ ] Backend authority, adapter boundary, token theming, and offline behavior remain intact.
- [ ] `just trace` and `just trace-check` pass during implementation.
- [ ] The module inventory remains unchanged.
