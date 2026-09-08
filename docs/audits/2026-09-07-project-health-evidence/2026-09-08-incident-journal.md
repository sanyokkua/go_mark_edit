# Preview-link incident investigation — 8 September 2026

Source: `883fd053b9b30911248a304cf5f57d8cebe81795`, branch `feature/v1-implementation--project-audit`.
This is an audit extension, not an application fix or a native reproduction record.

## Owner evidence and preservation

The owner supplied a screenshot and reported clicking a file link in Markdown preview, after which GoMarkEdit became
unusable on its startup failure screen. Normal closing and the macOS force-close methods tried did not work;
terminating the process through htop did. In response to a launch-mode clarification, the owner explicitly selected
“Development app (`just dev` / `wails dev`)”. The exact link target, whether Retry responded, exact termination method,
target PID and signal have not been supplied. These are unknowns, not negative test results.

The screenshot shows “GoMarkEdit could not start”, “GoMarkEdit could not initialize its local settings. Please try
again.” and a Retry button. It does not identify the bootstrap stage that failed or establish a blocked process.
It was copied without alteration to `owner-preview-link-startup-failure.png`:

- Original: `codex-clipboard-ce607a5b-98ef-451b-97e4-1d74b7106d25.png`, supplied in the owner's temporary clipboard directory.
- 537,236 bytes; SHA-256 `463e709db5c0181ef8e39be5af355dbe9a3996e8287bd31ae56ee3eca90e77ad`.

Before the report was edited, the complete owner-reviewed Revision 2 was saved as `audit-revision-2-owner-reviewed.md`:
262,570 bytes, SHA-256 `ea393f1948be86a98e7af70f828ac9115f4ff459eacb8ee9984bdc8be57ffcf3`.
Its existing diagnosis, original requirements and appendices remain the basis of Revision 2.1. New findings are
APP-1…APP-5; no production refactoring was performed.

## Available logs

Read-only inspection used the paths selected by `internal/file/paths.go`: macOS Application Support directories
`GoMarkEdit/logs` and `GoMarkEdit-Dev/logs`. The production directory had no files. The development directory contained
one 524-byte `gomarkedit.log`, last modified 8 September 2026 09:18:25 +02:00. The retained snapshot is
`2026-09-08-development-log-snapshot.log`, SHA-256
`dc031a1cc6e62d3769dd52d9b2f2f840d011c404a4fb0f9e1d975275ce95856b`.

Its four entries record serving the frontend development server at localhost:5173 on 7 September at 16:37:49,
17:01:07 and 21:25:51, and 8 September at 09:18:25 (+02:00). It contains no bootstrap failure, stack, close request or
termination outcome. The snapshot supplies launch context only; it cannot prove the absence of an error, and the
incident's exact timestamp is not known. No profile database or user document was opened or modified.

## Investigations and probe boundaries

- `investigation-preview-links.md`: ordinary anchor rendering, document-base omission, sanitizer boundaries, Wails
  embedded/development asset behavior, bootstrap/retry effects, existing tests and relevant git history. Source review.
- `investigation-startup-close.md`: close-event delivery/readiness, native veto, Retry caches, discarded error stages,
  bridge deadlines/cancellation, relevant lock/drain waits and test omissions. Source review.
- `investigation-lifecycle-probes.md` and `lifecycle-probes/`: exact audited coordinator and projection source executed
  in disposable modules. Both diagnostic probes exited 0, with positive controls and external 30-second limits. They
  assert current defective behavior. Receiver/Quit and store/action boundaries are substituted; this is not native E2E.
- `investigation-navigation-probe.md` and `navigation-probe/`: actual pinned Wails public asset-server APIs and real
  Vite `--mode wails`, with response bodies/script hashes recorded. This observes HTTP responses, not JavaScript or
  native-window execution. The initial sandbox loopback failure is retained separately from the permitted successful run.

The navigation response can explain loss of the bridge in development. The close coordinator independently explains
how ordinary close becomes vetoed with no receiver. The settings cache independently explains an ineffective Retry
under isolated settings-read failure. These do not prove that every mechanism occurred in the owner's session.

## Outstanding incident capture

Obtain the exact href/document base, page URL and launch identity. Reproduce with disposable fixtures/profile in
development and packaged hosts separately; capture navigation response, bridge availability and bootstrap stage.
If termination fails again, capture native/Go/WebKit PIDs, stack samples and exact close/force-close action or signal
before stopping the specifically owned test process. Verify dirty-buffer/write-drain outcomes separately from a clean
startup failure. The full matrix and proposed acceptance are in audit §5.10.6 and RF-A12–A15/RF-C7/RF-D8.

No new native app was launched, no OS Force Quit/SIGKILL experiment was performed, and no new full gate run is claimed.
The existing three `frontend/wailsjs/runtime/` mode-only diffs were preserved. Temporary diagnostic source is retained
as text so it adds no collected tests, scripts, gate or new specification authority to the application.
