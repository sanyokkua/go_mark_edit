# Reload from disk discards the external change and then overwrites it

**Build:** `just build` at commit `478e6702`, binary mtime 2026-08-18 15:29:46,
process started 15:29:53 (started _after_ the binary was written, so this is not a
stale instance — the trap recorded against earlier host evidence).
**Host:** macOS, Darwin 25.5.0. **Found by:** the T186 host walkthrough.

## What happens

1. Open a path-backed document. Autosave on.
2. Change the file on disk from another process.
3. Return the application to the foreground. **The prompt appears correctly** —
   `File changed on disk`, with the FR-FT-030 metadata comparison
   (`On disk · 3 lines · 52 bytes` vs `Yours · 4 lines · 96 bytes`) and the three
   decisions `Reload from disk`, `Keep mine`, `Skip`. Detection is not the defect.
4. Click **Reload from disk**.
5. **The editor and the preview still show the pre-existing buffer.** The disk
   content is not installed. Verified by zoom on both panes, and stable across
   several seconds — not a render lag.
6. The identity header now reads **`Saved`** and the tab's dirty dot clears, so the
   application asserts it is in sync with disk while the two differ.
7. Type one character. Autosave fires and **writes the stale buffer over the file**.
   The external change is gone, with no second prompt.

## Why this is data loss rather than a cosmetic bug

Step 6 is the load-bearing one. The reload decision clears the conflict state and
marks the document clean _without_ taking the disk content, so the before-write
check at step 7 has nothing left to compare against and the write proceeds
silently. A user who is told "changed on disk", chooses the option that means
"take theirs", and then keeps typing, loses the other process's work without ever
being warned a second time.

Before step 7 the disk read `SECOND EXTERNAL CHANGE at 15:39:57`. After it, that
line is absent and the file holds the application's buffer plus the typed `X`.

## Reproduced

Twice, on two independent external changes (15:37:33 and 15:39:57), with the same
result both times. The first run was noticed as a possible render lag; the second
was performed deliberately to confirm, and the overwrite in step 7 was then tested
explicitly.

## What no existing gate sees

`just e2e-test` drives the dev bridge mock, which reimplements the conflict seam
in TypeScript, so the Playwright suites cannot observe the real reload install.
`internal/appmodel`'s tests cover the backend decision, not the frontend install.
Commit `3736ff27` ("guard the external-change reload install, per FR-FT-030") is
the nearest existing work and did not prevent this.

## Not established here

Which side drops the content — whether `ReloadFromDisk` returns the disk content
and the frontend fails to install it, or the backend returns the stale buffer.
That needs a debugger pass, and is the first thing the fixing task should
determine rather than assume.

---

## Fixed and verified, 2026-08-18

Five causes, each producing this identical symptom, and each individually
necessary:

1. `applyReload` replaced `document.content` without incrementing
   `ContentRevision` (`document.go:65` increments it for every ordinary edit).
2. `ReloadFromDisk` reported the _pre_-reload revision, which the frontend's
   activation guard compares against the projection — so it rejected the
   acknowledgement.
3. `useSyncedBuffer`'s activation memo depended on `[documentId]` alone, so the
   editor session never restarted and Monaco was never re-seeded.
4. `DocumentTabs` owns an external-change prompt separate from `App`'s, and the
   foreground check raises **that** one — so fixing App's arm changed nothing.
5. The strip's reload arm never installed `result.activeBuffer`, so restarting
   the session re-seeded Monaco with the same stale content.

**Verified on `just build` at `f53787c5` + the install fix**, binary 17:23:08,
process started 17:23:09, prompt screenshotted before clicking:

- Disk `DISK CONTENT FROM OTHER EDITOR`, buffer `BUFFER BEFORE RELOAD`.
- After **Reload from disk**: editor and preview show the disk text, status
  `Saved`, tab clean.
- After a keystroke and autosave: disk holds the **reloaded** text carrying that
  edit. `BUFFER BEFORE RELOAD` is absent. Mode `640` preserved.

The overwrite is the assertion that matters — the editor text alone would have
passed at step 3 while the data loss remained.
