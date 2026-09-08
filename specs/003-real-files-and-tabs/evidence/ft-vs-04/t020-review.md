# T020 review — accessible external-change decisions

## Outcome

T020 is implemented on `feature/v1-implementation--003-t020-conflict-prompt`.
The frontend now renders one shared accessible conflict modal for activation
and write-result conflicts. On disk/Yours comparison text remains transient
outside Redux; backend-provided previews retain the 12-logical-line and
4,096-UTF-8-byte bounds and visibly identify each truncated side. Metadata-only
differences show BOM, line-ending, and permission changes. Read-only conflicts
offer Reload from disk and structural Cancel only. Waiting conflict documents
retain a visible blocked-by-conflict tab state.

## Contract evidence

| Case | Evidence | Result |
|---|---|---|
| Editable decision order and invalidation | `ExternalChangePrompt decisions and invalidation` verifies File changed on disk, Skip initial focus, disabled Keep mine after Yours invalidation, and Skip/Escape decision callbacks | pass |
| Bounded first hunk | `conflict preview enforces both 12-line and 4096-byte bounds without splitting a code point` verifies both side truncation markers, bounded labels, and no replacement character in the rendered preview | pass |
| Truncation disclosure | `truncated side is visibly identified` verifies the side-specific truncation marker | pass |
| Metadata-only comparison | `metadata-only conflict shows characteristic differences` verifies BOM characteristics and no empty comparison region | pass |
| Read-only recovery | `read-only conflict offers Reload and Cancel only with Cancel focused` verifies the two allowed actions and absence of Keep mine/Skip | pass |
| Queued-tab projection | `queued conflict tabs render blocked-by-conflict` verifies every waiting tab exposes the blocked state and accessible name | pass |
| Shared modal focus contract | `ModalShell focus contract` verifies initial focus, Tab/Shift+Tab trapping, Escape, backdrop routing, and focus restoration | pass |
| Typed bridge ordering | `T020 guards every conflict decision with its exact bridge argument order` verifies all five guarded adapter calls | pass |
| Mock bridge parity | `mock conflict bridge preserves bounded preview and decision outcomes` verifies detection, authorization, Skip, Cancel, and blocked projection | pass |
| Browser journey | `FT-VS-04 shows the bounded external-change prompt and safe Skip decision` verifies prompt title, On disk/Yours, exact button order, Skip focus, and dismissal | pass |

The application-level Save/Save As path also consumes the same prompt: Keep
mine resumes the suspended write with the backend's single-use authorization;
Reload installs the returned active acknowledgement; Skip/Cancel clear only the
foreground decision. The projection normalizer preserves `conflictBlocked`.

## Verification

- `npm --prefix frontend test -- --runInBand` — 64 suites, 327 tests passed
- `npm --prefix frontend run lint` — pass
- `npm --prefix frontend run typecheck` — pass
- `npm --prefix frontend run format:check` — pass
- `npm --prefix frontend run verify:ui -- e2e/real-files-and-tabs.test.ts` — 4/4 passed, including FT-VS-04
- `GOCACHE=/private/tmp/gomarkedit-gocache just archtest` — pass; cgo-free check emitted the known restricted module-cache warning but returned zero findings
- `GOCACHE=/private/tmp/gomarkedit-gocache just check` — pass; all local gate steps completed, including 64 frontend suites and race tests
- `wails build -clean` — pass on current host; packaged and self-signed `build/bin/GoMarkEdit.app`
- `GOCACHE=/private/tmp/gomarkedit-gocache just gen-check` — pass; generated Wails bindings remain synchronized

The Feature 003 baseline remains unchanged and was not recaptured. T021
remains responsible for the real second-process/current-host external-writer
walkthrough; the browser journey is mock-bridge evidence only.
