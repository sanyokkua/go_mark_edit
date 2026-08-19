# Host evidence ledger — demonstrated, deferred, host-unverified

**Requirement:** SC-FT-011 clause 10, "records every demonstrated, deferred and host-unverified
behaviour". **Task:** T186. **Written:** 2026-08-19.

Clause 10 asks for one ledger. Before this file there were per-run "what this does not cover"
sections in seven artifacts, with corrections layered on three of them, and `grep -i
'host-unverified'` over this directory returned nothing. Seven honest local disclaimers are not a
ledger: no reader could assemble the whole picture without opening all seven and reconciling the
corrections. This file is the single index. It supersedes none of those sections — each remains
the authority on its own run, and this file cites rather than restates them.

The three dispositions are deliberately unequal in what they claim:

- **Demonstrated** — observed on a real `just build` binary, by a person or an instrumented host
  run. The strongest thing this tree can say.
- **Deferred** — not built in Feature 003, by an approved decision. There is nothing to verify;
  the entry exists so absence is never mistaken for a gap.
- **host-unverified** — the behaviour ships, and no observation on a real binary covers it.
  This is the column that matters. An entry here is a known hole, not a passing grade.

---

## Demonstrated on a real binary

| Behaviour | Artifact | Build named? | Stale-instance guard? |
|---|---|---|---|
| Opens and saves real files on disk | `walkthrough-2026-08-14-automated.md` + Addendum | no | no |
| Preserves bytes across a save | `walkthrough-2026-08-14-automated.md` Addendum row 3; `sc-ft-002/boundaries-2026-08-15.md` row 1 | no | no |
| Preserves file mode across a save | `host-walkthrough-2026-08-18/autosave-spot-check.md` | yes (`31c66762`) | yes |
| Switches two real tabs, restoring per-tab state | `current-host-walkthrough.md` rows 8–9 | no | no |
| Clean and dirty close | `current-host-walkthrough.md` rows 10, 12; `close-tab-click-2026-08-15.md` | no | no |
| Resolves one external change | `host-walkthrough-2026-08-18/reload-from-disk-loses-external-change.md` | yes (`31c66762`) | yes |
| Toggles autosave, and the toggle actually stops it | `walkthrough-2026-08-14-automated.md` + T110 correction | no | no |
| 10 MiB boundary, both sides | `sc-ft-002/boundaries-2026-08-15.md` rows 1–2 | no | no |
| 50 MiB boundary, both sides | `sc-ft-002/boundaries-2026-08-15.md` rows 3–4; `host-walkthrough-2026-08-15.md` | no | no |
| 40-document limit and the 41st refusal | `host-walkthrough-2026-08-15.md`; `sc-ft-002/capacity-refusals-2026-08-15.md` | no | no |
| Autosave coalescing and constancy | `host-walkthrough-2026-08-18/autosave-spot-check.md` | yes (`31c66762`) | yes |
| Persisted default open mode applied by Open | `default-open-mode-2026-08-15.md` | no | no |
| Menu and settings accelerators | `accelerators-2026-08-15.md`; `settings-accelerator-2026-08-15.md` | no | no |
| Read-only reason surfacing | `readonly-reason-2026-08-15.md` | no | no |
| Details disclosure | `details-disclosure-2026-08-15.md` | no | no |
| Settings persist across restart; session does not | `coverage-ledger.md` Claim 2 | no | no |

**The two right-hand columns are the point of this table.** Only the three 2026-08-18 artifacts
name the commit they ran against *and* record the `ps -o lstart` check against the binary mtime.
Everything above them was observed on a build nobody can now identify, and `open` raises an
existing process, so a stale instance cannot be ruled out after the fact. That does not make those
observations wrong — it makes them unrepeatable, which is a weaker thing than the tree's phrasing
has sometimes implied. Any future host walk should name its commit and record the guard.

## Deferred by approved decision

Nothing to verify. Listed so absence is never read as an unfilled gap.

| Behaviour | Where the deferral is recorded |
|---|---|
| Assistant surface | `spec.md` negative clause; asserted deferred in `offline-and-controls.test.ts:194` |
| Workspace surface | `spec.md` negative clause; pinned only as sizing and absence |
| Custom native frame | `spec.md` negative clause — **asserted nowhere**, filed as T189 |
| Deferred rich-rendering widgets | `spec.md` negative clause — **asserted nowhere**, filed as T189 |
| Settings row for default open mode | `default-open-mode-2026-08-15.md`; belongs to T155 |
| `Format on save`, `Lint on save` | `actionRegistry.ts`, availability `laterDeferred` |
| Monaco's interior, for pixel comparison | FR-FT-055 reviewed exclusion; `reference-adapter.ts` |
| The overflow popup's interior, for pixel comparison | T173/T193 reviewed exclusion; key removed from `targeted-manifest.ts` |

The two entries marked **asserted nowhere** are the honest half of this table. They are deferred
*and* unproven — the criterion's wording survives only as a prose comment at
`real-files-parity.test.ts:90-95`. T189 exists because naming them in a criterion as though they
were covered is the false record Constitution II forbids.

## host-unverified

Behaviours that ship with no observation on a real binary behind them.

| # | Behaviour | Why it is still open | Owner |
|---|---|---|---|
| 1 | Mapped webview chrome compared against the same-browser result | SC-FT-011 clause 11. `host-screenshots/README.md` disclaims the existing captures outright — not parity references, not compared to the binding mockup, read by no comparator. The vocabulary exists (`coverage-ledger.md` Claim 3's four-way taxonomy); the comparison does not. | T186 |
| 2 | `File ▸ Close Tab` **by click** on the host | `accelerators-2026-08-15.md` §"One thing this walk could not confirm": fails twice on the host from a stable two-tab state with the click verified to land, while passing in Chromium against the mock and at unit level. The mock-divergence class this tree has been bitten by before. | filed separately |
| 3 | Copy path reaching the system pasteboard, and Reveal *selecting* the file in Finder | T161 proved the ports non-nil and the bytes correct; the last hop — another application reading the pasteboard, and `open -R` selecting rather than merely revealing the folder — is observable only by a person. | T166 |
| 4 | SC-FT-007's autosave latency **magnitude** | The 2026-08-18 spot-check established coalescing and constancy on the shipped binary but not magnitude: the tool round trip (~5.6 s) is coarser than the ~1.25 s quantity, and an anchor cannot bound an interval shorter than itself. Needs a stopwatch or an instrumented release build. | T181 |
| 5 | The zero-tolerance parity contract on `ubuntu-24.04` | The CI interface gate has never run — nothing is pushed and `gh` is absent. `Inter` and `JetBrains Mono` may resolve differently under Linux's fallback chain, and the two compared pages are different DOMs whose glyph rasterisation agrees only if both resolve the same font. | T180 |

## What this ledger does not cover

- **It is an index, not a re-verification.** Every row's strength is the strength of the artifact
  it cites. Where that artifact names no commit, this file says so rather than repairing it.
- **The legacy manual DoD checks M7, M8, M11 and M13** (`gates/verify.log`) are review
  obligations, not host observations, and are deliberately absent from the host-unverified table.
  Listing them there would inflate a list whose whole value is that every row is a real hole.
- **No pixel or parity claim is made here.** Those live under `ft-vs-08/`.
