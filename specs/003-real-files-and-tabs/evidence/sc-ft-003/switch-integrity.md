# SC-FT-003 — which test proves which switch clause

**Proves: SC-FT-003 — partially. The "zero cross-document text installations" half is proved for
both arms; the "repeated switches among 40 distinct documents" scale is not exercised at all, and
the restoration half is proved for the editor pane only.** Written by **T158**.

SC-FT-003 was the one criterion in T158's list that was a **real** coverage gap rather than a
missing link: until **T128**, `acceptsActivationAcknowledgement` was imported only by its own test
while production installed every acknowledgement unconditionally. T128 built the wiring. This file
names what now proves what.

## The criterion, split

> Across **repeated switches among 40 distinct documents**, 100% of named cases restore the correct
> **content identity, caret, selection, scroll, and arrangement**; **stale or failed switches produce
> zero cross-document text installations**.

## The zero-installations half — proved, both arms

| Arm                            | Proving test                                                                                                                                                                             | What it asserts                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stale** switch               | `frontend/src/App.test.tsx` `T128 never installs the acknowledgement of a superseded tab switch`                                                                                         | Two activations are issued; the `document-2` promise resolves **last** carrying `superseded cross-document source` at `projectionRevision: 13`. The buffer status region must still read `winning source` and must not contain the superseded text. Anchored `FR-FT-030` + `SC-FT-003 (partial)` |
| **Failed** switch              | `frontend/src/App.test.tsx` `T140 refuses a switch whose outgoing flush fails and installs no incoming content`                                                                          | `flushActiveSession` rejects; exactly one `activate:outgoing-flush` notification, `activateDocument` never called, buffer still `outgoing content`, active id still `document-1`. The mocked incoming content is never requested. Anchored `FR-FT-031` + `SC-FT-003 (partial)`                   |
| Failed switch, component level | `frontend/src/ui/widgets/DocumentTabs.test.tsx` `T140 reports a failed switch and leaves the outgoing tab active` and `T140 refuses the fallback switch when the outgoing flush rejects` | Failure reported, outgoing tab stays active, `activateDocument` not called — on the direct and the adapter-fallback paths. Their own anchors already say "installs no incoming content" is proved here only as a **precondition**, since the buffer is `App` state                               |
| The predicate alone            | `frontend/src/ui/widgets/editorSession.integration.test.tsx` `T017 rejects a late activation acknowledgement without installing content`                                                 | Pure call of `acceptsActivationAcknowledgement`: `false` under a superseded generation, `true` under the current one. No render, no install. **This test passed for a whole phase while production ignored the guard** — which is exactly why it is listed as supporting, not covering           |

Server-side refusal is a different mechanism and is listed so it is not double-counted:
`internal/appmodel/tab_session_test.go:69` `TestStaleTabCommands` proves a stale tab-set-revision
`ActivateDocument` returns `ClassifiedConflict`, mutates nothing and emits no patch (anchored
`FR-FT-033`). Go refuses stale _commands_; the acknowledgement race is frontend-only by construction,
and there is no Go test about a suppressed acknowledgement because there cannot be one.

## The restoration half — proved for two documents, one round trip

| Clause                                                  | Proving test                                                                                                                                                    | Scope                                                                                                                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| content identity, arrangement, per-document dirty state | `frontend/src/ui/widgets/EditorView.integration.test.tsx` `T157 keeps each document its own dirty state and arrangement across a switch`                        | Two documents, 1→2→1. Catches the outgoing document's scroll leaking into the incoming one. Its anchor already says `FR-FT-032 (partial)` and excludes reading state and preview-scroll restoration |
| caret, selection, Monaco view state, editor scroll      | `frontend/src/ui/widgets/EditorView.integration.test.tsx` `STORY-022-AC-3 restores the exact Monaco session and saved scroll state without bootstrap reseeding` | Also pins `saveViewState` ordered before `setDocView`. Anchored `FR-FT-032 (partial)`                                                                                                               |
| selection at the activation boundary                    | `frontend/src/ui/components/CodeEditor.test.tsx` `restores the acknowledged selection at the fresh editor activation boundary`                                  | `setSelection` called with the acknowledged range                                                                                                                                                   |
| persistence of the saved view                           | `internal/appmodel/layout_repository_sqlite_test.go:614,639`                                                                                                    | The repository side of the saved document view                                                                                                                                                      |

## What this artifact does not claim

1. **The 40-document scale is untested.** Every "40" elsewhere in the tree is the _cap_, not a switch
   population: `internal/appmodel/file_lifecycle_test.go:110`
   `TestNewDocumentRefusesStaleOrFortyFirst`, the e2e `FR-FT-041` refusal case, and
   `DocumentTabs.test.tsx:895`. The `[parity states] 40/40` line printed by `just e2e-test` is a count
   of visual-parity states and is an unrelated 40 — **do not read it as this clause**. No test performs
   repeated switches among 40 distinct documents, and none asserts "100% of named cases" across a
   document population; the restoration tests use two documents and one round trip.
2. **Preview scroll is not restored, so it cannot be proved.** The T157 anchor records this: preview
   `scrollTop` is captured but never re-applied (filed as **T179**). The "scroll" item of SC-FT-003 is
   therefore proved for the editor pane only.
3. **No test exercises multiple concurrently pending acknowledgements** or a supersession chain
   deeper than one.

Item 1 is filed as **T185**.
