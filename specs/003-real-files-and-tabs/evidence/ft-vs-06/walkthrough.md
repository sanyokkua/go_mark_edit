# T028 — real transactional close and quit walkthrough

## Evidence identity

- Host: macOS 26.5.2, Darwin 25.5.0 arm64; Go `go1.26.5 darwin/arm64`.
- Source commit at the start: `fea08b7460bf7d0db634dbeb2dd3f762d8dab32f` (T027 parent).
- Frontend build: `npm --prefix frontend run build` passed.
- Real binary: `/tmp/GoMarkEdit-t028`, built with the direct production Go command recorded in [host-build.raw.log](logs/t028/host-build.raw.log).
- Binary SHA-256: `fada5f1aa57080c148359402cd574286e35d166708f5dc45cd29bde906003365`.
- Native proof used the same fresh binary installed into `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit` and launched with `open build/bin/GoMarkEdit.app`, so the final quit check ran through the real macOS app-bundle launch path.
- Fixture inputs: `/tmp/gomarkedit-t028-fixture.md` and `/tmp/gomarkedit-t028-fixture.txt`.
- Raw accessibility snapshots are in [native-ax.raw.log](logs/t028/native-ax.raw.log).

## Walkthrough

1. A fresh native window showed one clean `Untitled` tab, a `Close Untitled` control, `New tab`, and `Not saved`. The captured baseline is [clean-tab-initial.jpeg](artifacts/t028/clean-tab-initial.jpeg).
2. Closing the clean final tab removed the document and entered the true zero-document launcher. The captured transition is [final-launcher.jpeg](artifacts/t028/final-launcher.jpeg).
3. Typing `T028 unsaved native content` produced `Unsaved changes`. Closing the tab opened the real Save/Discard/Cancel prompt ([dirty-close-prompt.jpeg](artifacts/t028/dirty-close-prompt.jpeg)). Cancel returned to the same tab and buffer with `Unsaved changes` ([dirty-close-cancelled.jpeg](artifacts/t028/dirty-close-cancelled.jpeg)); no write or close occurred.
4. Three real tabs were created. The first, second, and third were independently made dirty. `Close Others` on the second tab opened one multi-document prompt listing the targeted dirty documents; Cancel left all three tabs and the active second buffer unchanged. `Close to the Right` on the second tab opened the complete target prompt for the dirty third tab; Cancel left all three tabs unchanged. The pre-close dirty state is [dirty-tab-before-close.jpeg](artifacts/t028/dirty-tab-before-close.jpeg); full prompt/cancel snapshots are retained in `native-ax.raw.log`.
5. On the two-target `Close Others` plan, Save all opened the native macOS Save As panel for the first target. Canceling that first native picker was the first failure: the close plan stayed open and every target remained. Retrying Save all opened the first picker, saved as `t028-first.md`, then opened the second picker and saved as `t028-third.md` in authoritative target order. The targeted tabs then closed only after both saves succeeded; the active second tab remained dirty. All intermediate outcomes are in `native-ax.raw.log`.
6. The real window close button opened the native close plan. Clicking the native close control again while the plan was already open left the same prompt and did not duplicate or bypass it; Cancel left the dirty tab open. The retained recapture is [recaptured-native-window-close-prompt.jpeg](artifacts/t028/recaptured-native-window-close-prompt.jpeg).
7. macOS `Cmd+Q` opened the real quit plan. Discard all completed the plan, authorized the one-shot native quit, and the isolated app-bundle process exited; the final `ps` check returned no matching GoMarkEdit process. The retained quit prompt is [final-bundle-native-quit-prompt.jpeg](artifacts/t028/final-bundle-native-quit-prompt.jpeg). Earlier direct-binary captures are retained as [recaptured-native-quit-prompt.jpeg](artifacts/t028/recaptured-native-quit-prompt.jpeg).

## Result

SC-FT-005 is evidenced through real controls and the real Wails bridge: Cancel has zero effect, Save all is ordered and transactional across first failure and retry, repeated native close is idempotent, final-tab close reaches the launcher, and the app-bundle quit path exits only after the close plan authorizes it.
