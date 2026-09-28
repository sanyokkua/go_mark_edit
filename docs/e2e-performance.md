# Real-backend E2E performance

The two final four worker runs pass the original 59 cases in 92.284–109.224 seconds, compared
with the 1,183.121 second baseline: 1,073.897–1,090.837 seconds saved, 90.8–92.2% less wall
time and 10.83–12.82 times faster. Both final runs have zero failures, skips or retries and retain
66 real app starts, including seven relaunches. The default is capped at four workers and the CPU capacity available to Node;
the clipboard project remains serial. An eight worker run hit an invalid scroll test target and
is excluded from accepted timing claims.

Measurements were taken on an Apple M1 Pro, 10 logical CPUs, 32 GiB RAM, macOS 27.0 arm64.
Versions: Go 1.27.1, Wails 2.15.0, Node 24.21.0, npm 11.19.0, Playwright 1.61.1,
Chromium 149.0.7827.55 and Vite 7.3.6. Wall time below is the canonical E2E stage duration,
including preparation. The user's 27–30 minute reference was not reproduced; comparison uses
the measured 19.7 minute baseline. Results are specific to this host.

| Cohort                    | Workers |        Wall |  Preparation | Starts (relaunches) | Launch total | Relaunch total | Teardown total |
| ------------------------- | ------: | ----------: | -----------: | ------------------: | -----------: | -------------: | -------------: |
| Original baseline         |       1 | 1,183.121 s | Not separate |              66 (7) |    927.028 s |      100.001 s |        9.520 s |
| Before projection fix     |       1 |   272.625 s |      7.941 s |              66 (7) |     30.342 s |        3.503 s |        2.949 s |
| Before projection fix     |       2 |   151.242 s |      8.326 s |              66 (7) |     34.098 s |        3.863 s |        2.949 s |
| Before projection fix     |       4 |   107.784 s |      8.890 s |              66 (7) |     60.774 s |        7.431 s |        3.478 s |
| After projection fix      |       4 |    90.487 s |      8.343 s |              66 (7) |     42.964 s |        4.595 s |        3.497 s |
| Final verification        |       4 |   109.224 s |     10.576 s |              66 (7) |     65.786 s |       10.083 s |        3.768 s |
| Final baseline comparison |       4 |    92.284 s |      7.580 s |              66 (7) |     46.380 s |        5.211 s |        3.035 s |

Each listed run passed 59/59. Run IDs are `baseline-20260927T213621Z-69023`,
`test-e2e-20260927T231850Z-25010`, `test-e2e-20260927T232404Z-28861`,
`test-e2e-20260927T232701Z-32716`, `test-e2e-20260927T234909Z-54091`,
`verify-20260928T050559Z-82816` and `baseline-20260928T051053Z-88847`, respectively.
The last two runs include both the projection fix and corrected scroll target.
Raw reports remain under `.local_tmp_files/runs/`; detailed baseline profiles remain under
`.local_tmp_files/e2e-performance/`. Lifecycle and browser-step totals are inclusive and can
overlap, especially in parallel runs; they must not be added to derive wall time. Baseline
preparation was repeated within launches and was not measured separately.

The detailed baseline ranks the measured costs as follows. Browser operations include 77.164
seconds of navigation, already included in app launch timing.

| Rank | Baseline measurement                               |                               Total |
| ---- | -------------------------------------------------- | ----------------------------------: |
| 1    | App launches, including rebuild/startup/navigation | 927.028 s; 78.4% of Playwright wall |
| 2    | Browser operations                                 |                           168.444 s |
| 3    | Expectations                                       |                           133.140 s |
| 4    | Hooks                                              |                            13.205 s |
| 5    | App teardown                                       |                             9.520 s |
| 6    | Browser, context and page fixtures combined        |                             3.311 s |

A representative original launch repeated a 4.634 second frontend build, 2.667 seconds of binding
generation, 2.659 seconds of Go compilation and 0.215 seconds of seeding. The slowest baseline
files were real files (295.364 s), workspace tree (199.666 s) and theme surfaces (149.106 s).
The harness now builds the standard Wails dev executable and existing seed helper once and starts
one owned Vite server, removing that repeated preparation cost.

Worker-level backend reuse was considered but rejected: database reset alone cannot reset the
backend in-memory model, native lifecycle and startup-failure state, and no complete reset contract
exists. Prepared process starts are now cheap enough to preserve that isolation without adding a
production reset API. The expensive immutable preparation and frontend server are shared per run;
Playwright already reuses browser processes and supplies fresh contexts. This follows its
[fixture lifetime](https://playwright.dev/docs/test-fixtures) and
[parallel isolation](https://playwright.dev/docs/test-parallel) guidance. Runs own their servers
and never depend on a manually started developer instance.

Every case still gets a fresh real Wails/Go process, profile, document folder, browser context and
page. It owns a unique port and checks backend initialization through existing Wails getters before
React loads. Relaunch preserves only that case's profile, folder and browser origin. Final disposal
stops owned processes and removes temporary state. The E2E Vite configuration extends the selected
repository's normal configuration and serves inert HTML only to the hidden native host's root
requests. Chromium is the sole active React frontend; real native lifecycle/quit callbacks and
browser→Wails IPC→Go remain. Native webview rendering stays in the manual walkthrough. These
mechanics use the pinned [Wails dev runtime](https://github.com/wailsapp/wails/blob/v2.15.0/internal/app/app_dev.go)
and [native request marker](https://github.com/wailsapp/wails/blob/v2.15.0/pkg/assetserver/assetserver_dev.go#L24).

Faster execution exposed a narrow production projection defect. A real wire probe delivered
revisions 6, 9, 7 and 8: the browser showed the launcher while authoritative `GetState` at revision
9 contained the reopened tab. The partial reducer discarded older revisions and lost their fields;
the pinned [Wails devserver broadcasts through goroutines](https://github.com/wailsapp/wails/blob/v2.15.0/internal/frontend/devserver/devserver.go#L234).
The existing projection owner now holds revision gaps, coalesces an existing `GetState` call,
accepts an authoritative full snapshot at the current revision and drains contiguous patches.
Partial stale/duplicate guards remain; failed recovery retries on a later event and disposed
attempts ignore late results. Recovery neither installs editor content nor replays commands.
The same real wire probe passed 4/4 after the fix despite all four retaining the exact reordered
sequence; the frontend suite passed 863/863.

Before that fix, a repeated four worker run and an eight worker run each passed only 58/59:
Reopen Last failed in `test-e2e-20260927T233100Z-39238`, and Save identity failed in
`test-e2e-20260927T232910Z-35950`. These failed runs are excluded from the table.
The corrected eight worker run, `test-e2e-20260928T045439Z-72764`, also passed 58/59 in 75.864
seconds, with zero skips/retries and clean process/profile/document cleanup. It retained all
66 starts and seven relaunches; preparation was 8.910 s, launches 111.210 s and teardown 4.766 s.
The scroll check reported 17 source lines against the unchanged limit of four, but its screenshot
showed both panes at code line 18: editor line 318 was compared with the whole fenced block's
anchor at 301. The ordinary preview seek target of 300 admitted that fenced block within its
12-line band. Moving only that target to 250 excludes the fence while retaining the band, the
four-line assertion and the following dedicated fenced-block check. The failure was an invalid
test boundary, rather than evidence of a product alignment defect. Four remains the conservative
default. The corrected scroll case then passed eight concurrent repetitions with no retries,
skips or failures in 37.861 seconds (`test-e2e-20260928T050456Z-81857`). This is a focused
stress check, not a passing full-suite eight-worker benchmark.

The remaining cost in the final baseline-comparison run is real user journeys and required waits.
Slowest cases: preview links 35.684 s, late completion 30.536 s and synchronized scroll 25.762 s.
Slowest file totals: theme surfaces 70.952 s, synchronized scroll 46.718 s and real files 39.279 s. Warning
dismissals, database lock timing, scroll quiet windows, persistence and native quit assertions
remain intact. Automatic screenshots and app output are retained on failure; traces require
explicit `--trace`.

| Significant files                                                                                          | Change                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/tests/support/{prepare,e2eProcess,e2eVite.config,harness,profile}.ts`                            | One preparation/Vite lifetime, real app ownership/readiness, isolated case state and reused seed executable.                                                                              |
| `frontend/playwright.config.ts` and affected E2E declarations                                              | Bounded parallelism, exactly two serial clipboard cases, scoped screenshot output, visible close-completion synchronization and an ordinary scroll target that excludes the fenced block. |
| `scripts/test`, `scripts/lib/stages.sh`, `tools/verify/results.mjs`                                        | Targeted arguments, canonical cleanup/reporting and bounded timing summaries.                                                                                                             |
| `appModelProjection.ts`, `documentsSlice.ts`, `uiSlice.ts`, `workspaceSlice.ts` and projection regressions | Authoritative metadata recovery for reordered partial events.                                                                                                                             |
| Support integration tests and `.github/workflows/push.yml`                                                 | Lifecycle/native transport/reporting coverage and the Linux `lsof` prerequisite.                                                                                                          |
| `docs/architecture.md`                                                                                     | Current owners, projection recovery and E2E execution contract.                                                                                                                           |

Playwright `--list` matches all 59 original file/title identities in 17 files; file, grep and repeat
selection remain correct. Failure isolation deliberately failed one real app case, then passed the
next case in a fresh worker with no inherited Recents; the previous app PID, profile and documents
were removed. Reverse-order workspace→startup→launcher selection passed 3/3 in 20.335 seconds
including 11.703 seconds preparation (`reverse-final.json`, direct Playwright wall).
A selected source archive without `.git` passed its launcher case through `E2E_REPO` in
`test-e2e-20260927T233807Z-47794` (10.103 s including 7.569 s preparation). It reused dependencies
via a `node_modules` symlink, proving selected-source preparation rather than an uncached machine
setup. Owned processes and temporary state were removed and the generated placeholder restored.

Run the full suite with `scripts/test e2e`; select through the same runner with a file path,
`scripts/test e2e -- --grep '<pattern>'`, `--workers` or `--repeat-each`. Linux test hosts need
`lsof` for owned-listener checks. Full verification remains `scripts/verify` followed by
`scripts/baseline --compare`. Native Computer Use app selection timed out; the manual open/save
walkthrough remains unverified.

Both `scripts/verify` and `scripts/baseline --compare` passed all six stages on the final code.
The explicit comparison reported zero new or remaining gate findings for every stage. Backend
counts remained 104 unit and 332 integration; frontend counts increased from 520 to 531 unit and
321 to 332 integration tests. All 59 original E2E identities remain, with no added, removed,
skipped or retried cases. Recorded app PIDs, Vite PIDs, profiles, document folders and run
directories were absent after both final runs. Independent reviews found no remaining Blocking
or Important findings.

Lint passes with zero errors and 1,410 non-failing ESLint warnings, compared with 1,326 at
baseline; these are not all pre-existing. The macOS deployment-target linker warning also remains.
Linux runtime execution and an uncached machine setup were not verified on this macOS host.
The native manual walkthrough remains unverified because Computer Use app selection timed out;
automated real-backend browser journeys, native clipboard and native quit checks passed.

Integration into the completed feature branch exposed another setup race in the folder-tab ribbon
case (`baseline-20260928T090204Z-67154`). Its eight consecutive tree clicks could submit an Open
with the preceding tab-set revision; the captured UI showed seven tabs and the backend's explicit
“The tab set changed; Open must be retried” refusal. Each setup click now waits for its tab to be
selected, which is published with the new tab-set revision. All existing overflow, visibility and
reactivation assertions remain. Eight focused repetitions at four workers passed with zero retries
or skips (`test-e2e-20260928T090758Z-73538`); independent review confirmed the added completion
assertion strengthens the scenario without changing product behavior.

A subsequent integration comparison (`baseline-20260928T091309Z-79594`) caught the deferred
Save-validation test reading disk after the conflict dialog disappeared but before the asynchronous
write completed. The captured page already showed Save success by screenshot time. The case now
waits for the existing Save-success notification before retaining its exact disk-byte assertion,
matching the other explicit Keep mine Save cases. Its pre-decision check still requires the external
bytes to remain unchanged. No retries, fixed delays or production behavior changes were introduced.
