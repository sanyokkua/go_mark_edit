# FT-VS-04 / T021 current-host external-writer recovery

## Result

SC-FT-006 has demonstrated zero-silent-overwrite evidence for a real packaged
GoMarkEdit build, a real Wails bridge, a native Open panel, a real file, and a
second process represented by an external shell writer. The evidence below
separates what was demonstrated on this host from cases that remain
host-unverified or deferred. No mock-only run is used as current-host proof.

Host and build identity are preserved in
[`host-and-build-final.raw.log`](logs/t021/host-and-build-final.raw.log).
The fixture was
`/var/folders/r9/r0j788zn3x1g25mmm_xs4wgw0000gn/T/gomarkedit-t021.XXXXXX.vOqDfsxhVl/conflict.md`.

## Demonstrated on the current host

| Scenario                                | Evidence                                                                                                                                                    | Observed result                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Open of a real file              | [`opened-fixture.jpeg`](artifacts/t021/opened-fixture.jpeg), earlier raw fixture logs                                                                       | `conflict.md` opened from the native picker with UTF-8/LF metadata and Saved status.                                                                             |
| Manual local edit followed by Save      | [`ui-conflict-reload-final.raw.log`](logs/t021/ui-conflict-reload-final.raw.log)                                                                            | Save was initiated from the real File menu after the editor buffer was changed.                                                                                  |
| External replacement by another process | [`external-replacement-final.raw.log`](logs/t021/external-replacement-final.raw.log)                                                                        | The shell replaced the file with 41 bytes and hash `bb21eb0e...5e8c977`; the app did not write during the replacement.                                           |
| Bounded comparison prompt               | [`conflict-prompt-final.jpeg`](artifacts/t021/conflict-prompt-final.jpeg), [`ui-conflict-reload-final.raw.log`](logs/t021/ui-conflict-reload-final.raw.log) | The prompt showed the first changed hunk, exact 41/37-byte side sizes, both texts, and Reload/Keep mine/Skip actions. Accessibility state reported Skip focused. |
| Reload from disk                        | [`reload-final.jpeg`](artifacts/t021/reload-final.jpeg), [`ui-conflict-reload-final.raw.log`](logs/t021/ui-conflict-reload-final.raw.log)                   | Prompt dismissed; editor and live preview both showed the external text; status was Saved; disk hash stayed unchanged.                                           |

The current-host run found and fixed two bridge/UI lifecycle defects before
this final capture: nanosecond disk versions now cross the bridge as exact text,
and same-document Reload refreshes the editor and preview after pending session
work has drained. The pre-fix Skip failure and stale-preview observations remain
in the earlier raw logs and are not counted as passing evidence.

## Host-unverified

These cases were not substituted with mock evidence and are intentionally not
claimed as current-host passes:

- external deletion and the detached/read-only conflict path;
- metadata-preserving byte replacement, metadata-only change, BOM change, and
  line-ending-only change;
- Keep mine exactly once, including post-decision disk hash verification;
- editing while the prompt is displayed and the invalidated Keep mine path;
- Skip followed by retry, a second external change after comparison, and two
  simultaneous document conflicts;
- Save As target drift and target-file external replacement.

The implementation has focused unit/mock coverage for the decision-token,
revision, prompt, Skip/retry, and authorization rules, but those tests do not
promote these rows to current-host evidence.

## Deferred

No background watcher or polling claim is made. Any scenario requiring a
different host filesystem policy, a second GUI editor process, or a future
Save-As evidence harness remains deferred to a dedicated current-host run.
