# Feature 003 native binary walkthrough — 2026-08-11

Binary under test:

`build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`

The rebuilt binary was launched through the macOS accessibility surface and exercised with
real Wails/native controls. The walkthrough used the temporary file
`/private/tmp/native-walkthrough.md`.

Observed outcomes:

- Ordinary startup opened an untitled document with File → Open Folder unavailable and the
  Assistant toggle unavailable in this slice.
- Real editor typing changed the status to `Unsaved changes`; File → Save As opened the native
  save sheet, saved to `/private/tmp/native-walkthrough.md`, and projected `Saved` in identity,
  status, and notification surfaces.
- File → Open File opened the native markdown/text chooser; cancellation returned to the
  document without mutation.
- File → New File and the tab-strip New tab created untitled tabs. Closing a dirty tab opened
  `Save changes before closing?` with Cancel, Discard, and Save; Discard removed only that tab.
- Editor/Preview arrangement controls changed the visible arrangement. File → Open Recent showed
  the saved file and `README.md`.
- An external byte change followed by a local edit and Save opened `File changed on disk` with
  `Reload from disk`, `Keep mine`, and `Skip`. Keep mine completed the save and the disk bytes
  matched the local content.
- Closing the final untitled tab reconciled to the file-only launcher with Recent files, New File,
  Open File, and disabled Open Folder. Launcher New File returned to an untitled editor.
- File → Exit terminated the rebuilt native process. The termination check was performed from the
  shell without calling the accessibility inspector afterward, because its app-state query
  transparently relaunches a closed app.

This is current-host functional evidence only. It does not claim Feature 003 release completion:
the unrestricted parity report still records genuine production pixel drift, and the
`prompt-normalization` reference condition remains explicitly unresolved.
