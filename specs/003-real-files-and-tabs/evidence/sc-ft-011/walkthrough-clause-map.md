# SC-FT-011 — which walkthrough proves which clause

**Proves: SC-FT-011 — partially. Nine of eleven clauses are covered on the real binary; two are not
covered at all, and one of the nine rests on the least-guarded observation in the tree.** Written by
**T158**, which `host-walkthrough-2026-08-15.md:13` names as owning "the artifact per clause".

No single walkthrough covers this criterion, and none was ever going to: the substance is spread over
seven runs on six different builds. This file is the map. It is not a new walkthrough and claims no
observation of its own.

## Clause by clause

| # | Clause | Artifact | Observed | Build |
|---|---|---|---|---|
| 1 | opens and saves real files on disk | `ft-ev-09/walkthrough-2026-08-14-automated.md`, "What this run does establish" + Addendum | `fixture-a.md` (96 B) opened through the real macOS Open dialog; two File-menu saves took it 96 → 132 → 145 B with disk content matching the editor | REAL, `3befc43e` |
| | corroborating | `ft-ev-09/native-binary-walkthrough-2026-08-11.md` bullets 2–3; `ft-ev-09/accelerators-2026-08-15.md` §5 | Save As through the real native sheet wrote `/private/tmp/native-walkthrough.md`; `⌘S` wrote `fixture-a.md` to 147 B leaving no `.gomarkedit-*` temp | REAL; the accelerators build came from an **uncommitted working tree** based on `4e141037` |
| 2a | verifies preserved **bytes** | `ft-ev-09/walkthrough-2026-08-14-automated.md` Addendum row 3; `ft-ev-09/sc-ft-002/boundaries-2026-08-15.md` row 1 | An autosave-off edit left `fixture-a.md` at 96 B with mtime `1786744610.459748` unchanged; `boundary-10mib-exact.md` verified at 10,485,760 B before and after | REAL, post-T104 build and `790375fb` |
| 2b | verifies preserved **permissions** | `ft-ev-09/host-walkthrough-2026-08-18/autosave-spot-check.md` | Closed 2026-08-19 (T186). Mode `640` survived every write on the shipped binary at `31c66762`, stale-instance guard recorded. The **non-default** mode is what makes this a verification rather than a coincidence — the earlier `sc-ft-002` listings read `-rw-r--r--`, which a fresh write produces anyway | — |
| 3 | switches two real tabs | `ft-ev-09/current-host-walkthrough.md` Journeys rows 8–9 | Grew to 15 tabs; returning to tab 1 restored its content, its per-document Split arrangement and its caret while the others stayed Editor-only | REAL, `just build` 2026-08-13, **no commit named** |
| | corroborating | `ft-ev-09/close-tab-click-2026-08-15.md` §3 | Active tab switched by click from a two-tab state, then closed | REAL, `258d1d32` |
| 4 | clean and dirty close | dirty: `current-host-walkthrough.md` rows 10, 12 and `native-binary-walkthrough-2026-08-11.md` bullet 4; clean: `close-tab-click-2026-08-15.md` §3 rows 1–6 and `host-walkthrough-2026-08-15.md` `File ▸ Exit` | Dirty close raised `Save changes before closing?` and quit raised `Save changes before quitting?` with the specified button sets; six clean closes across five states; `File ▸ Exit` with 40 empty untitled documents terminated with no prompt | REAL across all four; `258d1d32` and `790375fb` for the two 08-15 runs |
| 5 | resolves one external change | `ft-ev-09/native-binary-walkthrough-2026-08-11.md`, "Observed outcomes" bullet 6 — superseded 2026-08-19 (T186) by `ft-ev-09/host-walkthrough-2026-08-18/reload-from-disk-loses-external-change.md`, which names commit `31c66762` and records the stale-instance guard | An external byte change plus a local edit plus Save opened `File changed on disk` with `Reload from disk` / `Keep mine` / `Skip`; **Keep mine** completed the save and the disk bytes matched the local content | REAL binary, **no build or commit named, only the date**. See the caveat below |
| 6 | toggles autosave | `walkthrough-2026-08-14-automated.md`, "The defect" steps 1–4 **and** the Addendum | Before T104: the switch read `Autosave off` and the file still grew 145 → 165 B after six seconds. After: switch off, edit, wait 8 s — size and mtime unchanged on disk; File → Save then reported `Saved`, not `Autosaved`, and grew 96 → 122 B | REAL, `3befc43e` then the T104-fix build; persistence corroborated on `790375fb` |
| 7 | crosses the 10 MiB boundary | `ft-ev-09/sc-ft-002/boundaries-2026-08-15.md` rows 1–2 | 10,485,760 B opens writable and accepts typing (caret to Ln 3 Col 205766); 10,485,761 B opens `Read-only` with Save and Save As greyed | REAL, T104-fix build |
| 8 | crosses the 50 MiB boundary | `boundaries-2026-08-15.md` rows 3–4; message closed in `host-walkthrough-2026-08-15.md` and `host-screenshots/03-open-refused-over-50-mib.png` | 52,428,800 B opens `Read-only`; 52,428,801 B creates no tab and leaves the active document unchanged; the toast naming the 50 MiB limit was **absent** on the boundaries run (recorded there as F-1) and **present** on the later one | REAL, T104-fix build then `790375fb` |
| 9 | crosses the 40-document boundary | `host-walkthrough-2026-08-15.md` Results and §"The 40-document limit, finally settled on the real binary"; `host-screenshots/02-new-refused-at-forty-documents.png` | `New File` drove 1 → 40; the 41st was refused with "The window already contains 40 documents." after exactly 40 successful creations | REAL, `790375fb`, post-T107 |
| 10 | records every demonstrated, deferred and host-unverified behaviour | `ft-ev-09/host-evidence-ledger.md` | Written 2026-08-19 (T186). One index over the seven per-run limits sections in three dispositions — demonstrated, deferred, host-unverified — stating the commit-named and guarded status of every demonstrated row, and naming five genuinely open holes | — |
| 11 | captures the mapped webview chrome for comparison with the same-browser result | `ft-ev-09/host-walkthrough-2026-08-19/webview-vs-chromium/` | Measured 2026-08-19 (T186). WKWebView vs Chromium at matched geometry: **90.08% identical**, backgrounds bit-exact, residual 2.22% partitioned as native-host difference (28,000 px), capture boundary (11,042 px) and glyph antialiasing (15,313 px). The one true renderer difference — a divider band 19 levels lighter in the webview at identical geometry — is filed as T195, not passed | — |

## The two clauses nothing covers, and one that nearly is not covered

**Clause 2b — permissions.** No artifact checks or states a file mode after a real save.
`sc-ft-002/listing-before.txt` and `listing-after.txt` are `ls -la` snapshots taken around a real-binary
run and *do* carry the mode column — `fixture-a.md` reads `-rw-r--r--` in both — but both listings are
framed exclusively as the FR-FT-009 temp-file-absence check and the after-file's own footer discusses
only bytes and presence. An unexamined by-product is not a verification. The one artifact that
deliberately snapshots a permission mode is `sc-ft-002/explicit-save-timings-2026-08-15.md`, and that
file states under "What this does not measure" that it is **not the `just build` artifact** — it is
the `native_evidence` driver. So the clause has no on-binary verification.

**Clause 10 — the tri-classification ledger.** `grep -i 'host-unverified'` across the whole `ft-ev-09/`
tree returns zero hits. Each walkthrough carries its own "What this walkthrough does not cover"
section and deferred surfaces are recorded piecemeal, but these are **per-run scope notes scattered
across seven files with corrections layered on three of them**, not one ledger over the criterion.
`coverage-ledger.md` does not fill the role either — its own scope line reads "aggregate traceability
only. This ledger takes over no FR or SC," and `SC-FT-011` appears nowhere in it.

**Clause 11 — the chrome comparison.** `host-screenshots/README.md` holds five window-ID captures of
the packaged Wails webview and explicitly disclaims this clause: they "are *not* parity references,
they are *not* compared to the binding mockup, and no comparator reads them". `coverage-ledger.md`
Claim 3 does build the four-way taxonomy the clause's second half needs — same-browser production
drift, capture non-determinism, composited-layer artefact, native-host difference — but its
"Native-host difference" row cites behavioural walkthroughs, not a captured chrome comparison. The
classification discipline exists; the comparison does not, so the "no automatic pass for native
renderer differences" guard is never exercised.

**Clause 5 is covered by the least-guarded observation in the tree.** The 2026-08-11 run is a genuine
host resolution of an external change, but it (a) names no build or commit, (b) predates T104, T107,
T110, T111 and T113 — five defects later found in this same shell — so it describes a build nothing
else corroborates, and (c) has no stale-instance guard, the trap
`host-walkthrough-2026-08-15.md` documents at length. No later walkthrough re-walks it.

## Two corrections a reader must carry

`host-walkthrough-2026-08-15.md` and `walkthrough-2026-08-14-automated.md` each carry an in-place
"Correction 2026-08-15 (T110)" that **withdraws** the reasoning that a `⌘S`-committed write proved
keystroke delivery. If clause 1 is read off the 2026-08-14 run, note that the 145 → 165 B growth was
the autosave defect, not the explicit save; the 96 → 132 → 145 B pair went through the File menu and
stands.

## What this artifact does not claim

`sc-ft-002/capacity-refusals-2026-08-15.md`'s `FT-VS-09` cases are Playwright against the bridge mock.
That file says so itself — "They do not prove the 40-document cap exists. They cannot." — and it must
not be cited for clause 9.

**T166 is still open and this map does not close it.** `Copy path` and `Reveal in file manager` were
dead in every shipped binary until T161, and the interactive walkthrough confirming they now reach the
pasteboard and Finder **has not been performed**. Nothing here implies it has.

Clauses 2b, 10 and 11, and the re-walk of clause 5 on a guarded, commit-named build, are filed as
**T186**.
