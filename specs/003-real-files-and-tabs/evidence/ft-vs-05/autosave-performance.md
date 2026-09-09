# FT-VS-05 — Autosave performance evidence

**Superseded as the primary SC-FT-007 artifact on 2026-08-16 by
[`release-build-reconciliation-2026-08-16.md`](release-build-reconciliation-2026-08-16.md).** This
file is retained as the earlier distribution the re-run is compared against; read it for history,
not as the current answer.

**Proves: SC-FT-007** — partially. Added by T115, which found that SC-FT-007 was named nowhere in the
evidence tree or the test suite, so no mechanical answer existed to "which evidence proves this?"
even though the substance was measured here.

The protocol below is SC-FT-007's exactly — 20 uncounted warmups, 100 measured autosaves across
1 KiB / 256 KiB / 1 MiB / 2 MiB, monotonic timing from final input to atomic replacement. What it
does **not** satisfy is SC-FT-007's "fresh current-host **release build**": this is the
`native_evidence` build-tagged driver, and the substitution is stated at `:50` below.

**What T121 settled, 2026-08-16.** The two distributions agree — the re-run at HEAD is 100/100
committed with p50 1,253.896 ms and p95 1,333.884 ms against this run's 1,276.937 / 1,394.934 — and
the build substitution is narrower than this file conceded: `internal/appmodel` and `internal/file`
compile to **identical Go package build IDs** under the release tag set and under the harness tag
set, so the measured write path is the same object code the release binary links. What T121 could
**not** do is run the protocol against the `just build` artifact itself: that binary wires no
write-commit observer and embeds no scripted input driver, so it has neither timing seam. The
interactive host spot-check that would close the remainder is filed as **T181** and has not been
performed. **These numbers are also stale in one respect** — they predate T123's rewrite of
`newAtomicReplaceError` and T134's `close_drain.go`, both in the measured write path.

## Result

The current-host native-evidence run passed the exact T024 protocol:

| Requirement                           |                    Observed |
| ------------------------------------- | --------------------------: |
| Warmups                               |             20 (5 per size) |
| Measured trials                       |           100 (25 per size) |
| Successful measured commits           |                         100 |
| Measured misses                       |                           0 |
| Measured commits at or below 5,000 ms |                     100/100 |
| Measured p50                          | 1276937375 ns (1276.937 ms) |
| Measured p95                          | 1394934042 ns (1394.934 ms) |
| Measured maximum                      | 1722858875 ns (1722.859 ms) |

Percentiles use the retained measured-duration ordering with index `floor((n - 1) * percentile)`; no retry, outlier removal, or row discard was applied.

## Measurement contract

- Scenario: `autosave-latency`, build tag `native_evidence`.
- The Go harness created local path-backed writable fixtures of exactly 1,024, 262,144, 1,048,576, and 2,097,152 bytes.
- Every trial replaced exactly one character and waited for the next authoritative autosave commit before starting the next trial.
- t0 is stamped in Go when the webview acknowledgement arrives through `nativeEvidenceRuntime` after the final input handler returns.
- t1 is stamped in Go by the appmodel write-commit observer immediately after the write coordinator reports the atomic replacement for the exact content revision.
- Both stamps use `time.Now()` in the same Go process, preserving the monotonic component for subtraction. The interval therefore includes the frontend 200 ms buffer synchronization, the one-second backend debounce, and atomic replacement.
- The production `systemAutosaveTimerFactory`, file-version checks, coordinator, and atomic replacement path were used. No fake timer, writer, port, retry, or outlier filter was used.
- Every retained row has exact disk bytes equal to the requested fixture size; the measured rows below retain revision and commit identity.

## Build parity and limitation

The required `just build` parity command was attempted with the host SDK linker requirement (`CGO_LDFLAGS=-framework UniformTypeIdentifiers`) and the Wails CLI returned exit 1 while compiling the application. The equivalent command printed by Wails, using the same release tags and stripped release flags, completed successfully:

```text
GOCACHE=/tmp/gomarkedit-go-cache CGO_LDFLAGS='-framework UniformTypeIdentifiers' go build -buildvcs=false -tags 'desktop,wv2runtime.download,production' -ldflags '-w -s' -o /tmp/GoMarkEdit-parity ./
```

The native evidence run used the same release `production` settings plus the required `native_evidence` driver build tag and the local host linker flag:

```text
GOCACHE=/tmp/gomarkedit-go-cache CGO_LDFLAGS='-framework UniformTypeIdentifiers' go run -tags 'native_evidence production' ./cmd/native-evidence -scenario autosave-latency -database /tmp/gomarkedit-native-evidence-run3
```

The limitation is explicit: this is not the `just build` artifact. The appmodel and file packages use the production constructors and byte-identical write path; only the build-tagged native driver and evidence frontend are added. T039 must independently spot-check the true `just build` binary and reopen this task if its distribution disagrees.

**Resolved 2026-08-16 by T121, and only partly in this file's favour.** T039 never performed that
spot-check — the string `spot-check` appeared here and nowhere else in the repository. T121 rebuilt
the release artifact (`just build` exit 0, no stale instance, `just gen-check` run afterwards),
re-ran the full 100-trial protocol at HEAD, and found the distributions agree. It also replaced the
"byte-identical write path" claim above — which was prose nobody could check — with a measurement:
identical Go package build IDs for both packages under both tag sets, no `native_evidence` build
constraint in either package, and no cgo file in either. The clause that remains open is that the
release binary cannot run this protocol at all, for want of a t0 and a t1 seam; **T181** owns the
interactive host spot-check.

## Host and run metadata

| Field              | Value                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| arch               | `arm64`                                                                                                                     |
| buildTag           | `native_evidence`                                                                                                           |
| filesystem         | `type=apfs device=/dev/disk3s1 mount=/System/Volumes/Data`                                                                  |
| fixtureDirectory   | `/tmp/gomarkedit-native-evidence-run3/autosave-fixtures`                                                                    |
| go                 | `go1.26.5`                                                                                                                  |
| hostname           | `Oleksandrs-MacBook-Pro.local`                                                                                              |
| limitation         | `This is not the just build artifact; T039 must spot-check the true just build binary.`                                     |
| os                 | `darwin`                                                                                                                    |
| releaseBuildParity | `internal/appmodel and internal/file use the production constructors and write path; only the build-tagged driver is added` |
| report SHA-256     | `c0ee96e12fb7d0912e913d28eb1e1c22642ec6829cd0e1d4bbb7b90c76ac37cd`                                                          |
| report source      | `/tmp/gomarkedit-native-evidence-run3/autosave-latency-report.json`                                                         |
| report status      | `complete`                                                                                                                  |

### Warmup rows (20, uncounted)

| Trial | Size bytes | Document               | Revision | Status    | Duration ns | Disk bytes | Commit identity                   |
| ----: | ---------: | ---------------------- | -------: | --------- | ----------: | ---------: | --------------------------------- |
|     1 |       1024 | `doc-0000000000000004` |        1 | committed |  1213045291 |       1024 | `doc-0000000000000004@revision-1` |
|     2 |       1024 | `doc-0000000000000004` |        2 | committed |  1219709875 |       1024 | `doc-0000000000000004@revision-2` |
|     3 |       1024 | `doc-0000000000000004` |        3 | committed |  1216202875 |       1024 | `doc-0000000000000004@revision-3` |
|     4 |       1024 | `doc-0000000000000004` |        4 | committed |  1220577833 |       1024 | `doc-0000000000000004@revision-4` |
|     5 |       1024 | `doc-0000000000000004` |        5 | committed |  1213349291 |       1024 | `doc-0000000000000004@revision-5` |
|     1 |     262144 | `doc-0000000000000006` |        1 | committed |  1241405000 |     262144 | `doc-0000000000000006@revision-1` |
|     2 |     262144 | `doc-0000000000000006` |        2 | committed |  1238765917 |     262144 | `doc-0000000000000006@revision-2` |
|     3 |     262144 | `doc-0000000000000006` |        3 | committed |  1240977916 |     262144 | `doc-0000000000000006@revision-3` |
|     4 |     262144 | `doc-0000000000000006` |        4 | committed |  1245214500 |     262144 | `doc-0000000000000006@revision-4` |
|     5 |     262144 | `doc-0000000000000006` |        5 | committed |  1223504333 |     262144 | `doc-0000000000000006@revision-5` |
|     1 |    1048576 | `doc-0000000000000008` |        1 | committed |  1291556916 |    1048576 | `doc-0000000000000008@revision-1` |
|     2 |    1048576 | `doc-0000000000000008` |        2 | committed |  1307398750 |    1048576 | `doc-0000000000000008@revision-2` |
|     3 |    1048576 | `doc-0000000000000008` |        3 | committed |  1276059458 |    1048576 | `doc-0000000000000008@revision-3` |
|     4 |    1048576 | `doc-0000000000000008` |        4 | committed |  1300052542 |    1048576 | `doc-0000000000000008@revision-4` |
|     5 |    1048576 | `doc-0000000000000008` |        5 | committed |  1292312000 |    1048576 | `doc-0000000000000008@revision-5` |
|     1 |    2097152 | `doc-000000000000000a` |        1 | committed |  1380465458 |    2097152 | `doc-000000000000000a@revision-1` |
|     2 |    2097152 | `doc-000000000000000a` |        2 | committed |  1386826542 |    2097152 | `doc-000000000000000a@revision-2` |
|     3 |    2097152 | `doc-000000000000000a` |        3 | committed |  1341064375 |    2097152 | `doc-000000000000000a@revision-3` |
|     4 |    2097152 | `doc-000000000000000a` |        4 | committed |  1415622292 |    2097152 | `doc-000000000000000a@revision-4` |
|     5 |    2097152 | `doc-000000000000000a` |        5 | committed |  1497552209 |    2097152 | `doc-000000000000000a@revision-5` |

### Measured rows (100, retained in full)

| Trial | Size bytes | Document               | Revision | Status    | Duration ns | Disk bytes | Commit identity                    |
| ----: | ---------: | ---------------------- | -------: | --------- | ----------: | ---------: | ---------------------------------- |
|     6 |       1024 | `doc-0000000000000004` |        6 | committed |  1213533833 |       1024 | `doc-0000000000000004@revision-6`  |
|     7 |       1024 | `doc-0000000000000004` |        7 | committed |  1213183375 |       1024 | `doc-0000000000000004@revision-7`  |
|     8 |       1024 | `doc-0000000000000004` |        8 | committed |  1213317125 |       1024 | `doc-0000000000000004@revision-8`  |
|     9 |       1024 | `doc-0000000000000004` |        9 | committed |  1215451917 |       1024 | `doc-0000000000000004@revision-9`  |
|    10 |       1024 | `doc-0000000000000004` |       10 | committed |  1214933375 |       1024 | `doc-0000000000000004@revision-10` |
|    11 |       1024 | `doc-0000000000000004` |       11 | committed |  1216375792 |       1024 | `doc-0000000000000004@revision-11` |
|    12 |       1024 | `doc-0000000000000004` |       12 | committed |  1215079500 |       1024 | `doc-0000000000000004@revision-12` |
|    13 |       1024 | `doc-0000000000000004` |       13 | committed |  1215543417 |       1024 | `doc-0000000000000004@revision-13` |
|    14 |       1024 | `doc-0000000000000004` |       14 | committed |  1219709959 |       1024 | `doc-0000000000000004@revision-14` |
|    15 |       1024 | `doc-0000000000000004` |       15 | committed |  1214329667 |       1024 | `doc-0000000000000004@revision-15` |
|    16 |       1024 | `doc-0000000000000004` |       16 | committed |  1218046250 |       1024 | `doc-0000000000000004@revision-16` |
|    17 |       1024 | `doc-0000000000000004` |       17 | committed |  1214315292 |       1024 | `doc-0000000000000004@revision-17` |
|    18 |       1024 | `doc-0000000000000004` |       18 | committed |  1214667250 |       1024 | `doc-0000000000000004@revision-18` |
|    19 |       1024 | `doc-0000000000000004` |       19 | committed |  1217932792 |       1024 | `doc-0000000000000004@revision-19` |
|    20 |       1024 | `doc-0000000000000004` |       20 | committed |  1218874708 |       1024 | `doc-0000000000000004@revision-20` |
|    21 |       1024 | `doc-0000000000000004` |       21 | committed |  1213805417 |       1024 | `doc-0000000000000004@revision-21` |
|    22 |       1024 | `doc-0000000000000004` |       22 | committed |  1231521792 |       1024 | `doc-0000000000000004@revision-22` |
|    23 |       1024 | `doc-0000000000000004` |       23 | committed |  1243089333 |       1024 | `doc-0000000000000004@revision-23` |
|    24 |       1024 | `doc-0000000000000004` |       24 | committed |  1214829417 |       1024 | `doc-0000000000000004@revision-24` |
|    25 |       1024 | `doc-0000000000000004` |       25 | committed |  1222116875 |       1024 | `doc-0000000000000004@revision-25` |
|    26 |       1024 | `doc-0000000000000004` |       26 | committed |  1241704916 |       1024 | `doc-0000000000000004@revision-26` |
|    27 |       1024 | `doc-0000000000000004` |       27 | committed |  1221834125 |       1024 | `doc-0000000000000004@revision-27` |
|    28 |       1024 | `doc-0000000000000004` |       28 | committed |  1258300250 |       1024 | `doc-0000000000000004@revision-28` |
|    29 |       1024 | `doc-0000000000000004` |       29 | committed |  1230175208 |       1024 | `doc-0000000000000004@revision-29` |
|    30 |       1024 | `doc-0000000000000004` |       30 | committed |  1223659667 |       1024 | `doc-0000000000000004@revision-30` |
|     6 |     262144 | `doc-0000000000000006` |        6 | committed |  1266882542 |     262144 | `doc-0000000000000006@revision-6`  |
|     7 |     262144 | `doc-0000000000000006` |        7 | committed |  1252861458 |     262144 | `doc-0000000000000006@revision-7`  |
|     8 |     262144 | `doc-0000000000000006` |        8 | committed |  1249339375 |     262144 | `doc-0000000000000006@revision-8`  |
|     9 |     262144 | `doc-0000000000000006` |        9 | committed |  1273510416 |     262144 | `doc-0000000000000006@revision-9`  |
|    10 |     262144 | `doc-0000000000000006` |       10 | committed |  1264270459 |     262144 | `doc-0000000000000006@revision-10` |
|    11 |     262144 | `doc-0000000000000006` |       11 | committed |  1266351750 |     262144 | `doc-0000000000000006@revision-11` |
|    12 |     262144 | `doc-0000000000000006` |       12 | committed |  1240967875 |     262144 | `doc-0000000000000006@revision-12` |
|    13 |     262144 | `doc-0000000000000006` |       13 | committed |  1258368625 |     262144 | `doc-0000000000000006@revision-13` |
|    14 |     262144 | `doc-0000000000000006` |       14 | committed |  1239780292 |     262144 | `doc-0000000000000006@revision-14` |
|    15 |     262144 | `doc-0000000000000006` |       15 | committed |  1237867083 |     262144 | `doc-0000000000000006@revision-15` |
|    16 |     262144 | `doc-0000000000000006` |       16 | committed |  1276937375 |     262144 | `doc-0000000000000006@revision-16` |
|    17 |     262144 | `doc-0000000000000006` |       17 | committed |  1259886917 |     262144 | `doc-0000000000000006@revision-17` |
|    18 |     262144 | `doc-0000000000000006` |       18 | committed |  1262533791 |     262144 | `doc-0000000000000006@revision-18` |
|    19 |     262144 | `doc-0000000000000006` |       19 | committed |  1234310375 |     262144 | `doc-0000000000000006@revision-19` |
|    20 |     262144 | `doc-0000000000000006` |       20 | committed |  1245967625 |     262144 | `doc-0000000000000006@revision-20` |
|    21 |     262144 | `doc-0000000000000006` |       21 | committed |  1249055500 |     262144 | `doc-0000000000000006@revision-21` |
|    22 |     262144 | `doc-0000000000000006` |       22 | committed |  1242657709 |     262144 | `doc-0000000000000006@revision-22` |
|    23 |     262144 | `doc-0000000000000006` |       23 | committed |  1232113416 |     262144 | `doc-0000000000000006@revision-23` |
|    24 |     262144 | `doc-0000000000000006` |       24 | committed |  1259553625 |     262144 | `doc-0000000000000006@revision-24` |
|    25 |     262144 | `doc-0000000000000006` |       25 | committed |  1264842292 |     262144 | `doc-0000000000000006@revision-25` |
|    26 |     262144 | `doc-0000000000000006` |       26 | committed |  1225053833 |     262144 | `doc-0000000000000006@revision-26` |
|    27 |     262144 | `doc-0000000000000006` |       27 | committed |  1258005708 |     262144 | `doc-0000000000000006@revision-27` |
|    28 |     262144 | `doc-0000000000000006` |       28 | committed |  1261798083 |     262144 | `doc-0000000000000006@revision-28` |
|    29 |     262144 | `doc-0000000000000006` |       29 | committed |  1241269125 |     262144 | `doc-0000000000000006@revision-29` |
|    30 |     262144 | `doc-0000000000000006` |       30 | committed |  1251920417 |     262144 | `doc-0000000000000006@revision-30` |
|     6 |    1048576 | `doc-0000000000000008` |        6 | committed |  1297346500 |    1048576 | `doc-0000000000000008@revision-6`  |
|     7 |    1048576 | `doc-0000000000000008` |        7 | committed |  1287705208 |    1048576 | `doc-0000000000000008@revision-7`  |
|     8 |    1048576 | `doc-0000000000000008` |        8 | committed |  1323926000 |    1048576 | `doc-0000000000000008@revision-8`  |
|     9 |    1048576 | `doc-0000000000000008` |        9 | committed |  1356679917 |    1048576 | `doc-0000000000000008@revision-9`  |
|    10 |    1048576 | `doc-0000000000000008` |       10 | committed |  1312186667 |    1048576 | `doc-0000000000000008@revision-10` |
|    11 |    1048576 | `doc-0000000000000008` |       11 | committed |  1528586833 |    1048576 | `doc-0000000000000008@revision-11` |
|    12 |    1048576 | `doc-0000000000000008` |       12 | committed |  1359284000 |    1048576 | `doc-0000000000000008@revision-12` |
|    13 |    1048576 | `doc-0000000000000008` |       13 | committed |  1345944041 |    1048576 | `doc-0000000000000008@revision-13` |
|    14 |    1048576 | `doc-0000000000000008` |       14 | committed |  1283259209 |    1048576 | `doc-0000000000000008@revision-14` |
|    15 |    1048576 | `doc-0000000000000008` |       15 | committed |  1314709417 |    1048576 | `doc-0000000000000008@revision-15` |
|    16 |    1048576 | `doc-0000000000000008` |       16 | committed |  1292283792 |    1048576 | `doc-0000000000000008@revision-16` |
|    17 |    1048576 | `doc-0000000000000008` |       17 | committed |  1330734917 |    1048576 | `doc-0000000000000008@revision-17` |
|    18 |    1048576 | `doc-0000000000000008` |       18 | committed |  1348952000 |    1048576 | `doc-0000000000000008@revision-18` |
|    19 |    1048576 | `doc-0000000000000008` |       19 | committed |  1324224166 |    1048576 | `doc-0000000000000008@revision-19` |
|    20 |    1048576 | `doc-0000000000000008` |       20 | committed |  1328983166 |    1048576 | `doc-0000000000000008@revision-20` |
|    21 |    1048576 | `doc-0000000000000008` |       21 | committed |  1311554375 |    1048576 | `doc-0000000000000008@revision-21` |
|    22 |    1048576 | `doc-0000000000000008` |       22 | committed |  1315371042 |    1048576 | `doc-0000000000000008@revision-22` |
|    23 |    1048576 | `doc-0000000000000008` |       23 | committed |  1307118834 |    1048576 | `doc-0000000000000008@revision-23` |
|    24 |    1048576 | `doc-0000000000000008` |       24 | committed |  1318880417 |    1048576 | `doc-0000000000000008@revision-24` |
|    25 |    1048576 | `doc-0000000000000008` |       25 | committed |  1328817791 |    1048576 | `doc-0000000000000008@revision-25` |
|    26 |    1048576 | `doc-0000000000000008` |       26 | committed |  1384581667 |    1048576 | `doc-0000000000000008@revision-26` |
|    27 |    1048576 | `doc-0000000000000008` |       27 | committed |  1334168167 |    1048576 | `doc-0000000000000008@revision-27` |
|    28 |    1048576 | `doc-0000000000000008` |       28 | committed |  1319357458 |    1048576 | `doc-0000000000000008@revision-28` |
|    29 |    1048576 | `doc-0000000000000008` |       29 | committed |  1298183750 |    1048576 | `doc-0000000000000008@revision-29` |
|    30 |    1048576 | `doc-0000000000000008` |       30 | committed |  1300854833 |    1048576 | `doc-0000000000000008@revision-30` |
|     6 |    2097152 | `doc-000000000000000a` |        6 | committed |  1688575875 |    2097152 | `doc-000000000000000a@revision-6`  |
|     7 |    2097152 | `doc-000000000000000a` |        7 | committed |  1375827583 |    2097152 | `doc-000000000000000a@revision-7`  |
|     8 |    2097152 | `doc-000000000000000a` |        8 | committed |  1393884416 |    2097152 | `doc-000000000000000a@revision-8`  |
|     9 |    2097152 | `doc-000000000000000a` |        9 | committed |  1333319833 |    2097152 | `doc-000000000000000a@revision-9`  |
|    10 |    2097152 | `doc-000000000000000a` |       10 | committed |  1364829041 |    2097152 | `doc-000000000000000a@revision-10` |
|    11 |    2097152 | `doc-000000000000000a` |       11 | committed |  1370711916 |    2097152 | `doc-000000000000000a@revision-11` |
|    12 |    2097152 | `doc-000000000000000a` |       12 | committed |  1355865625 |    2097152 | `doc-000000000000000a@revision-12` |
|    13 |    2097152 | `doc-000000000000000a` |       13 | committed |  1358259125 |    2097152 | `doc-000000000000000a@revision-13` |
|    14 |    2097152 | `doc-000000000000000a` |       14 | committed |  1366460833 |    2097152 | `doc-000000000000000a@revision-14` |
|    15 |    2097152 | `doc-000000000000000a` |       15 | committed |  1394934042 |    2097152 | `doc-000000000000000a@revision-15` |
|    16 |    2097152 | `doc-000000000000000a` |       16 | committed |  1371428959 |    2097152 | `doc-000000000000000a@revision-16` |
|    17 |    2097152 | `doc-000000000000000a` |       17 | committed |  1331420292 |    2097152 | `doc-000000000000000a@revision-17` |
|    18 |    2097152 | `doc-000000000000000a` |       18 | committed |  1351725625 |    2097152 | `doc-000000000000000a@revision-18` |
|    19 |    2097152 | `doc-000000000000000a` |       19 | committed |  1396649084 |    2097152 | `doc-000000000000000a@revision-19` |
|    20 |    2097152 | `doc-000000000000000a` |       20 | committed |  1348855666 |    2097152 | `doc-000000000000000a@revision-20` |
|    21 |    2097152 | `doc-000000000000000a` |       21 | committed |  1359155250 |    2097152 | `doc-000000000000000a@revision-21` |
|    22 |    2097152 | `doc-000000000000000a` |       22 | committed |  1389405375 |    2097152 | `doc-000000000000000a@revision-22` |
|    23 |    2097152 | `doc-000000000000000a` |       23 | committed |  1365700833 |    2097152 | `doc-000000000000000a@revision-23` |
|    24 |    2097152 | `doc-000000000000000a` |       24 | committed |  1355530417 |    2097152 | `doc-000000000000000a@revision-24` |
|    25 |    2097152 | `doc-000000000000000a` |       25 | committed |  1362021792 |    2097152 | `doc-000000000000000a@revision-25` |
|    26 |    2097152 | `doc-000000000000000a` |       26 | committed |  1358491917 |    2097152 | `doc-000000000000000a@revision-26` |
|    27 |    2097152 | `doc-000000000000000a` |       27 | committed |  1360191042 |    2097152 | `doc-000000000000000a@revision-27` |
|    28 |    2097152 | `doc-000000000000000a` |       28 | committed |  1722858875 |    2097152 | `doc-000000000000000a@revision-28` |
|    29 |    2097152 | `doc-000000000000000a` |       29 | committed |  1322284209 |    2097152 | `doc-000000000000000a@revision-29` |
|    30 |    2097152 | `doc-000000000000000a` |       30 | committed |  1485629459 |    2097152 | `doc-000000000000000a@revision-30` |

## Supporting UI proof

- `npm --prefix frontend test -- --runInBand`: 64 suites passed, 334 tests passed, including `autosave setting is acknowledged before it applies`, `autosave success emits no toast`, and the in-flight status coverage.
- `npm --prefix frontend run typecheck`: passed.
- `node frontend/evidence/check-boundaries.mjs`: passed, including the autosave driver boundary.
- `go test -tags native_evidence ./cmd/native-evidence -run 'TestAutosaveLatencyScenarioUsesSystemTimer|TestAutosaveLatencyStampsSpanSynchronizationAndDebounce' -count=1`: passed.
- The FT-VS-05 Playwright check covers control/status wiring only; it is mock-bridge evidence and is not used for the latency criterion.
