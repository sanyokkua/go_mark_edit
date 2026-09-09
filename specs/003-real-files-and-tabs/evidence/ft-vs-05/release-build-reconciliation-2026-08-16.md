# SC-FT-007 release-build reconciliation — 2026-08-16

**Proves: SC-FT-007** — the measured protocol in full, and the release-build clause **mechanically
rather than by driving the release artifact**. What that means, and what it still does not cover, is
stated in "The one clause this does not close" below. Written by **T121**, which exists because
`autosave-performance.md` closed on a substitution and asked a later task to "spot-check the true
`just build` binary" — a string that appeared in that file and nowhere else in the repository, so
the reconciliation never happened.

## Verdict

**The two distributions agree.** Both pass SC-FT-007 outright and the re-run is tighter, not looser.

|                      | 2026-08-15 run (`autosave-performance.md`) | 2026-08-16 re-run at HEAD (this file) |
| -------------------- | -----------------------------------------: | ------------------------------------: |
| Warmups (uncounted)  |                                         20 |                                    20 |
| Measured trials      |                                        100 |                                   100 |
| Committed            |                                        100 |                                   100 |
| Misses               |                                          0 |                                     0 |
| At or below 5,000 ms |                                    100/100 |                               100/100 |
| p50                  |                               1,276.937 ms |                      **1,253.896 ms** |
| p95                  |                               1,394.934 ms |                      **1,333.884 ms** |
| Maximum              |                               1,722.859 ms |                      **1,339.916 ms** |
| Rows discarded       |                                          0 |                                     0 |

The re-run matters on its own account, not only as a comparison: the 2026-08-15 numbers were taken
before T123 rewrote `newAtomicReplaceError` in `internal/file/atomic_replace.go` and before T134
added `internal/appmodel/close_drain.go`, both of which sit in the measured write path. The old
distribution described code that is no longer the code.

## Protocol

Reproduced exactly, so the two distributions are comparable — same 20 uncounted warmups (5 per
size), same 100 measured trials (25 per size), same four buckets of 1,024 / 262,144 / 1,048,576 /
2,097,152 bytes, same monotonic final-input-to-atomic-replacement interval, same percentile index
`floor((n - 1) * percentile)`, **no retry, no outlier removal, no discarded row**. Every one of the
120 rows is retained below and in the machine-readable report beside this file.

```text
GOCACHE=/tmp/gomarkedit-go-cache CGO_LDFLAGS='-framework UniformTypeIdentifiers' \
  go run -tags 'native_evidence production' ./cmd/native-evidence \
  -scenario autosave-latency -database /tmp/gomarkedit-t121-run2
```

Per-bucket, from the retained rows:

| Size bytes |   n |        min ns |       mean ns |        max ns |
| ---------: | --: | ------------: | ------------: | ------------: |
|      1,024 |  25 | 1,215,308,625 | 1,219,799,660 | 1,227,842,875 |
|    262,144 |  25 | 1,232,939,000 | 1,240,272,181 | 1,253,896,209 |
|  1,048,576 |  25 | 1,268,592,750 | 1,279,581,778 | 1,301,315,875 |
|  2,097,152 |  25 | 1,315,205,375 | 1,329,598,464 | 1,339,916,334 |

Every retained row's disk bytes equal its requested fixture size; every row carries its content
revision, commit identity and a SHA-256 of the bytes that reached disk.

## The release build, and what was actually reconciled

### The fresh release artifact exists at HEAD

`just build` was run on this host at HEAD and exited 0 — the blocker recorded in the 2026-08-15 note
("the Wails CLI returned exit 1") is gone.

| Field                   | Value                                                              |
| ----------------------- | ------------------------------------------------------------------ |
| artifact                | `build/bin/GoMarkEdit.app/Contents/MacOS/GoMarkEdit`               |
| built                   | 2026-08-16T23:14:19Z                                               |
| size                    | 16,827,584 bytes                                                   |
| SHA-256                 | `ae9f581ea7e3a79e2475b7b440e261a5710b99841529400b529aa252f9ecbd88` |
| `go version -m` tags    | `desktop,wv2runtime.download,production`                           |
| `go version -m` ldflags | `-w -s`                                                            |
| Go                      | go1.26.6                                                           |

**The stale-instance trap was checked, not assumed.** `ps -eo pid,lstart,comm | grep -i gomarkedit`
returned nothing before and after the build, so no earlier process could be mistaken for this one.
`open`-ing a macOS `.app` raises an already-running instance rather than launching the new binary,
which is how a walkthrough comes to describe a build that is not in the tree.

**The mode-bit ordering was honoured.** `just build` rewrites `frontend/wailsjs/runtime/` at mode
644 — three files dirty with zero content difference. `just gen-check` was run _after_ the build and
restored them to 755; `git ls-files -s frontend/wailsjs/runtime/` confirms `100755` on all three.

### The write path is the same object code, and that is now checkable

The 2026-08-15 note asserted release parity in prose: "internal/appmodel and internal/file use the
production constructors and write path". That is an assertion nobody could check. It is now a
measurement.

The Go toolchain's package build ID is the compile-stage action ID — the hash of the source, the
compiler, and every flag that can change the emitted object. Under the release tag set taken from
the shipped binary itself (`go version -m`), and under the harness tag set, both measured packages
produce **identical** build IDs:

| Package             | release `desktop,wv2runtime.download,production`, `-ldflags '-w -s'` | harness `native_evidence production`        |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| `internal/appmodel` | `iW8gK3MuRyvCtdNdswe2/kAMpoWmiOnbVWQwDMCy9`                          | `iW8gK3MuRyvCtdNdswe2/kAMpoWmiOnbVWQwDMCy9` |
| `internal/file`     | `-Vnr8CQqFEBn2pXMfVe9/ww2CsGTvA9xeZRa7h73g`                          | `-Vnr8CQqFEBn2pXMfVe9/ww2CsGTvA9xeZRa7h73g` |

Taken with three supporting facts, all verified rather than assumed:

- `grep -rn native_evidence internal/` returns **nothing** — no file in either package is selected
  or deselected by the harness tag.
- `go list -f '{{.CgoFiles}}'` is empty for both packages, so the release build's cgo flags
  (`-mmacosx-version-min=10.13`, the `UniformTypeIdentifiers` framework) cannot reach them.
- `-ldflags '-w -s'` strips DWARF and the symbol table at link time; it cannot alter a compiled
  package. The build IDs above were computed with those ldflags on the release side anyway.

So the substitution the 2026-08-15 note conceded is narrower than it read. The 100 measurements did
not run on "a different build of the write path" — they ran on **the same object code the release
binary links**, reached through a different driver.

## The one clause this does not close

SC-FT-007 says "the fresh current-host release build MUST run … 100 measured autosaves". **The
`just build` artifact cannot run this protocol, and could not be made to without ceasing to be the
release build.** Two structural reasons, both verified:

1. **No t1 seam.** The stop stamp is taken by the write-commit observer. `SetWriteCommitObserver`
   (`internal/appmodel/service.go:261`) has exactly three call sites in the repository, all in
   `cmd/native-evidence/main_native_evidence.go:128,133`. The production composition root
   (`internal/application/application_context_holder.go`) never calls it, so a release binary
   publishes no commit instant to anything.
2. **No t0 seam and no driver.** The start stamp arrives as the `autosaveInputEvent` the evidence
   frontend emits after its final input handler returns. The release binary embeds
   `frontend/dist`, which has no such emitter and no trial loop; the 120 trials are issued by
   `frontend/evidence/main.tsx`'s `runAutosaveLatency`.

Adding either seam changes the artifact under measurement, which is the defect T121 exists to
remove, not a way to close it. The remaining honest route is an **interactive host spot-check** — a
person driving the real `.app`, typing one character into a path-backed fixture and observing the
atomic replacement — which is a GUI action and was **not performed**. It is filed as **T181** and
must not be read as done.

What the harness frontend does and does not stand in for is worth being exact about, because it is
smaller than "a different frontend": `frontend/evidence/main.tsx` mounts the **real** `src/App` and
drives the **real** `appModelAdapter.updateBuffer`, so the production 200 ms working-copy
synchronisation is inside the measured interval. What is outside it is the production editor's own
keystroke handling — Monaco's input event, the React render, and the call into the adapter — plus
the packaged `.app`'s launch context (LaunchServices, self-signing, the app bundle). Those are the
residual delta, and T181 owns them.

## Host and run metadata

| Field                   | Value                                                              |
| ----------------------- | ------------------------------------------------------------------ |
| arch                    | `arm64`                                                            |
| buildTag                | `native_evidence`                                                  |
| filesystem              | `type=apfs device=/dev/disk3s1 mount=/System/Volumes/Data`         |
| fixtureDirectory        | `/tmp/gomarkedit-t121-run2/autosave-fixtures`                      |
| go                      | `go1.26.6`                                                         |
| hostname                | `Oleksandrs-MacBook-Pro.local`                                     |
| os                      | `darwin`                                                           |
| started / completed     | 2026-08-16T23:19:39+02:00 / 2026-08-16T23:22:44+02:00              |
| retained report         | `autosave-latency-report-2026-08-16.json`                          |
| retained report SHA-256 | `d22f7caa82aed5abd39caf692bc2fed02416c85ae224e8ed3a95f9ec2dacd78e` |
| report status           | `complete`                                                         |

### Warmup rows (20, uncounted)

| Trial | Size bytes | Document               | Revision | Status    | Duration ns | Disk bytes | Commit identity                   |
| ----: | ---------: | ---------------------- | -------: | --------- | ----------: | ---------: | --------------------------------- |
|     1 |       1024 | `doc-0000000000000004` |        1 | committed |  1213469208 |       1024 | `doc-0000000000000004@revision-1` |
|     2 |       1024 | `doc-0000000000000004` |        2 | committed |  1216800958 |       1024 | `doc-0000000000000004@revision-2` |
|     3 |       1024 | `doc-0000000000000004` |        3 | committed |  1221550625 |       1024 | `doc-0000000000000004@revision-3` |
|     4 |       1024 | `doc-0000000000000004` |        4 | committed |  1219948250 |       1024 | `doc-0000000000000004@revision-4` |
|     5 |       1024 | `doc-0000000000000004` |        5 | committed |  1218850500 |       1024 | `doc-0000000000000004@revision-5` |
|     1 |     262144 | `doc-0000000000000006` |        1 | committed |  1239242125 |     262144 | `doc-0000000000000006@revision-1` |
|     2 |     262144 | `doc-0000000000000006` |        2 | committed |  1234555750 |     262144 | `doc-0000000000000006@revision-2` |
|     3 |     262144 | `doc-0000000000000006` |        3 | committed |  1236333917 |     262144 | `doc-0000000000000006@revision-3` |
|     4 |     262144 | `doc-0000000000000006` |        4 | committed |  1234081500 |     262144 | `doc-0000000000000006@revision-4` |
|     5 |     262144 | `doc-0000000000000006` |        5 | committed |  1240396958 |     262144 | `doc-0000000000000006@revision-5` |
|     1 |    1048576 | `doc-0000000000000008` |        1 | committed |  1281179542 |    1048576 | `doc-0000000000000008@revision-1` |
|     2 |    1048576 | `doc-0000000000000008` |        2 | committed |  1290980959 |    1048576 | `doc-0000000000000008@revision-2` |
|     3 |    1048576 | `doc-0000000000000008` |        3 | committed |  1271290208 |    1048576 | `doc-0000000000000008@revision-3` |
|     4 |    1048576 | `doc-0000000000000008` |        4 | committed |  1280392792 |    1048576 | `doc-0000000000000008@revision-4` |
|     5 |    1048576 | `doc-0000000000000008` |        5 | committed |  1301338666 |    1048576 | `doc-0000000000000008@revision-5` |
|     1 |    2097152 | `doc-000000000000000a` |        1 | committed |  1319312083 |    2097152 | `doc-000000000000000a@revision-1` |
|     2 |    2097152 | `doc-000000000000000a` |        2 | committed |  1321503459 |    2097152 | `doc-000000000000000a@revision-2` |
|     3 |    2097152 | `doc-000000000000000a` |        3 | committed |  1334412958 |    2097152 | `doc-000000000000000a@revision-3` |
|     4 |    2097152 | `doc-000000000000000a` |        4 | committed |  1347997083 |    2097152 | `doc-000000000000000a@revision-4` |
|     5 |    2097152 | `doc-000000000000000a` |        5 | committed |  1319799541 |    2097152 | `doc-000000000000000a@revision-5` |

### Measured rows (100, retained in full)

| Trial | Size bytes | Document               | Revision | Status    | Duration ns | Disk bytes | Commit identity                    |
| ----: | ---------: | ---------------------- | -------: | --------- | ----------: | ---------: | ---------------------------------- |
|     6 |       1024 | `doc-0000000000000004` |        6 | committed |  1218087875 |       1024 | `doc-0000000000000004@revision-6`  |
|     7 |       1024 | `doc-0000000000000004` |        7 | committed |  1218702750 |       1024 | `doc-0000000000000004@revision-7`  |
|     8 |       1024 | `doc-0000000000000004` |        8 | committed |  1219528084 |       1024 | `doc-0000000000000004@revision-8`  |
|     9 |       1024 | `doc-0000000000000004` |        9 | committed |  1220008417 |       1024 | `doc-0000000000000004@revision-9`  |
|    10 |       1024 | `doc-0000000000000004` |       10 | committed |  1218020000 |       1024 | `doc-0000000000000004@revision-10` |
|    11 |       1024 | `doc-0000000000000004` |       11 | committed |  1225123542 |       1024 | `doc-0000000000000004@revision-11` |
|    12 |       1024 | `doc-0000000000000004` |       12 | committed |  1219537333 |       1024 | `doc-0000000000000004@revision-12` |
|    13 |       1024 | `doc-0000000000000004` |       13 | committed |  1218559959 |       1024 | `doc-0000000000000004@revision-13` |
|    14 |       1024 | `doc-0000000000000004` |       14 | committed |  1216932208 |       1024 | `doc-0000000000000004@revision-14` |
|    15 |       1024 | `doc-0000000000000004` |       15 | committed |  1215308625 |       1024 | `doc-0000000000000004@revision-15` |
|    16 |       1024 | `doc-0000000000000004` |       16 | committed |  1219498500 |       1024 | `doc-0000000000000004@revision-16` |
|    17 |       1024 | `doc-0000000000000004` |       17 | committed |  1217426292 |       1024 | `doc-0000000000000004@revision-17` |
|    18 |       1024 | `doc-0000000000000004` |       18 | committed |  1219447125 |       1024 | `doc-0000000000000004@revision-18` |
|    19 |       1024 | `doc-0000000000000004` |       19 | committed |  1220221250 |       1024 | `doc-0000000000000004@revision-19` |
|    20 |       1024 | `doc-0000000000000004` |       20 | committed |  1218558625 |       1024 | `doc-0000000000000004@revision-20` |
|    21 |       1024 | `doc-0000000000000004` |       21 | committed |  1219040917 |       1024 | `doc-0000000000000004@revision-21` |
|    22 |       1024 | `doc-0000000000000004` |       22 | committed |  1222320833 |       1024 | `doc-0000000000000004@revision-22` |
|    23 |       1024 | `doc-0000000000000004` |       23 | committed |  1217478250 |       1024 | `doc-0000000000000004@revision-23` |
|    24 |       1024 | `doc-0000000000000004` |       24 | committed |  1224788208 |       1024 | `doc-0000000000000004@revision-24` |
|    25 |       1024 | `doc-0000000000000004` |       25 | committed |  1219995417 |       1024 | `doc-0000000000000004@revision-25` |
|    26 |       1024 | `doc-0000000000000004` |       26 | committed |  1219423417 |       1024 | `doc-0000000000000004@revision-26` |
|    27 |       1024 | `doc-0000000000000004` |       27 | committed |  1220952500 |       1024 | `doc-0000000000000004@revision-27` |
|    28 |       1024 | `doc-0000000000000004` |       28 | committed |  1219653417 |       1024 | `doc-0000000000000004@revision-28` |
|    29 |       1024 | `doc-0000000000000004` |       29 | committed |  1227842875 |       1024 | `doc-0000000000000004@revision-29` |
|    30 |       1024 | `doc-0000000000000004` |       30 | committed |  1218535083 |       1024 | `doc-0000000000000004@revision-30` |
|     6 |     262144 | `doc-0000000000000006` |        6 | committed |  1244672959 |     262144 | `doc-0000000000000006@revision-6`  |
|     7 |     262144 | `doc-0000000000000006` |        7 | committed |  1236441291 |     262144 | `doc-0000000000000006@revision-7`  |
|     8 |     262144 | `doc-0000000000000006` |        8 | committed |  1240572458 |     262144 | `doc-0000000000000006@revision-8`  |
|     9 |     262144 | `doc-0000000000000006` |        9 | committed |  1235835375 |     262144 | `doc-0000000000000006@revision-9`  |
|    10 |     262144 | `doc-0000000000000006` |       10 | committed |  1235516833 |     262144 | `doc-0000000000000006@revision-10` |
|    11 |     262144 | `doc-0000000000000006` |       11 | committed |  1238777292 |     262144 | `doc-0000000000000006@revision-11` |
|    12 |     262144 | `doc-0000000000000006` |       12 | committed |  1240974291 |     262144 | `doc-0000000000000006@revision-12` |
|    13 |     262144 | `doc-0000000000000006` |       13 | committed |  1239543459 |     262144 | `doc-0000000000000006@revision-13` |
|    14 |     262144 | `doc-0000000000000006` |       14 | committed |  1239108208 |     262144 | `doc-0000000000000006@revision-14` |
|    15 |     262144 | `doc-0000000000000006` |       15 | committed |  1241745792 |     262144 | `doc-0000000000000006@revision-15` |
|    16 |     262144 | `doc-0000000000000006` |       16 | committed |  1243851791 |     262144 | `doc-0000000000000006@revision-16` |
|    17 |     262144 | `doc-0000000000000006` |       17 | committed |  1253896209 |     262144 | `doc-0000000000000006@revision-17` |
|    18 |     262144 | `doc-0000000000000006` |       18 | committed |  1232939000 |     262144 | `doc-0000000000000006@revision-18` |
|    19 |     262144 | `doc-0000000000000006` |       19 | committed |  1235788250 |     262144 | `doc-0000000000000006@revision-19` |
|    20 |     262144 | `doc-0000000000000006` |       20 | committed |  1240885333 |     262144 | `doc-0000000000000006@revision-20` |
|    21 |     262144 | `doc-0000000000000006` |       21 | committed |  1238083000 |     262144 | `doc-0000000000000006@revision-21` |
|    22 |     262144 | `doc-0000000000000006` |       22 | committed |  1237028958 |     262144 | `doc-0000000000000006@revision-22` |
|    23 |     262144 | `doc-0000000000000006` |       23 | committed |  1248651375 |     262144 | `doc-0000000000000006@revision-23` |
|    24 |     262144 | `doc-0000000000000006` |       24 | committed |  1239892167 |     262144 | `doc-0000000000000006@revision-24` |
|    25 |     262144 | `doc-0000000000000006` |       25 | committed |  1245076750 |     262144 | `doc-0000000000000006@revision-25` |
|    26 |     262144 | `doc-0000000000000006` |       26 | committed |  1244755666 |     262144 | `doc-0000000000000006@revision-26` |
|    27 |     262144 | `doc-0000000000000006` |       27 | committed |  1238947667 |     262144 | `doc-0000000000000006@revision-27` |
|    28 |     262144 | `doc-0000000000000006` |       28 | committed |  1235820125 |     262144 | `doc-0000000000000006@revision-28` |
|    29 |     262144 | `doc-0000000000000006` |       29 | committed |  1238786500 |     262144 | `doc-0000000000000006@revision-29` |
|    30 |     262144 | `doc-0000000000000006` |       30 | committed |  1239213791 |     262144 | `doc-0000000000000006@revision-30` |
|     6 |    1048576 | `doc-0000000000000008` |        6 | committed |  1301315875 |    1048576 | `doc-0000000000000008@revision-6`  |
|     7 |    1048576 | `doc-0000000000000008` |        7 | committed |  1283698250 |    1048576 | `doc-0000000000000008@revision-7`  |
|     8 |    1048576 | `doc-0000000000000008` |        8 | committed |  1285048542 |    1048576 | `doc-0000000000000008@revision-8`  |
|     9 |    1048576 | `doc-0000000000000008` |        9 | committed |  1277031333 |    1048576 | `doc-0000000000000008@revision-9`  |
|    10 |    1048576 | `doc-0000000000000008` |       10 | committed |  1281600667 |    1048576 | `doc-0000000000000008@revision-10` |
|    11 |    1048576 | `doc-0000000000000008` |       11 | committed |  1268592750 |    1048576 | `doc-0000000000000008@revision-11` |
|    12 |    1048576 | `doc-0000000000000008` |       12 | committed |  1275878459 |    1048576 | `doc-0000000000000008@revision-12` |
|    13 |    1048576 | `doc-0000000000000008` |       13 | committed |  1282749041 |    1048576 | `doc-0000000000000008@revision-13` |
|    14 |    1048576 | `doc-0000000000000008` |       14 | committed |  1284077125 |    1048576 | `doc-0000000000000008@revision-14` |
|    15 |    1048576 | `doc-0000000000000008` |       15 | committed |  1281246500 |    1048576 | `doc-0000000000000008@revision-15` |
|    16 |    1048576 | `doc-0000000000000008` |       16 | committed |  1281873875 |    1048576 | `doc-0000000000000008@revision-16` |
|    17 |    1048576 | `doc-0000000000000008` |       17 | committed |  1275264125 |    1048576 | `doc-0000000000000008@revision-17` |
|    18 |    1048576 | `doc-0000000000000008` |       18 | committed |  1288679166 |    1048576 | `doc-0000000000000008@revision-18` |
|    19 |    1048576 | `doc-0000000000000008` |       19 | committed |  1271986667 |    1048576 | `doc-0000000000000008@revision-19` |
|    20 |    1048576 | `doc-0000000000000008` |       20 | committed |  1276516709 |    1048576 | `doc-0000000000000008@revision-20` |
|    21 |    1048576 | `doc-0000000000000008` |       21 | committed |  1269710000 |    1048576 | `doc-0000000000000008@revision-21` |
|    22 |    1048576 | `doc-0000000000000008` |       22 | committed |  1281280792 |    1048576 | `doc-0000000000000008@revision-22` |
|    23 |    1048576 | `doc-0000000000000008` |       23 | committed |  1269884292 |    1048576 | `doc-0000000000000008@revision-23` |
|    24 |    1048576 | `doc-0000000000000008` |       24 | committed |  1272606042 |    1048576 | `doc-0000000000000008@revision-24` |
|    25 |    1048576 | `doc-0000000000000008` |       25 | committed |  1278643166 |    1048576 | `doc-0000000000000008@revision-25` |
|    26 |    1048576 | `doc-0000000000000008` |       26 | committed |  1281823625 |    1048576 | `doc-0000000000000008@revision-26` |
|    27 |    1048576 | `doc-0000000000000008` |       27 | committed |  1277331167 |    1048576 | `doc-0000000000000008@revision-27` |
|    28 |    1048576 | `doc-0000000000000008` |       28 | committed |  1281103750 |    1048576 | `doc-0000000000000008@revision-28` |
|    29 |    1048576 | `doc-0000000000000008` |       29 | committed |  1278966792 |    1048576 | `doc-0000000000000008@revision-29` |
|    30 |    1048576 | `doc-0000000000000008` |       30 | committed |  1282635750 |    1048576 | `doc-0000000000000008@revision-30` |
|     6 |    2097152 | `doc-000000000000000a` |        6 | committed |  1333331625 |    2097152 | `doc-000000000000000a@revision-6`  |
|     7 |    2097152 | `doc-000000000000000a` |        7 | committed |  1333567125 |    2097152 | `doc-000000000000000a@revision-7`  |
|     8 |    2097152 | `doc-000000000000000a` |        8 | committed |  1333823708 |    2097152 | `doc-000000000000000a@revision-8`  |
|     9 |    2097152 | `doc-000000000000000a` |        9 | committed |  1331318000 |    2097152 | `doc-000000000000000a@revision-9`  |
|    10 |    2097152 | `doc-000000000000000a` |       10 | committed |  1336312375 |    2097152 | `doc-000000000000000a@revision-10` |
|    11 |    2097152 | `doc-000000000000000a` |       11 | committed |  1337033875 |    2097152 | `doc-000000000000000a@revision-11` |
|    12 |    2097152 | `doc-000000000000000a` |       12 | committed |  1332069208 |    2097152 | `doc-000000000000000a@revision-12` |
|    13 |    2097152 | `doc-000000000000000a` |       13 | committed |  1334097750 |    2097152 | `doc-000000000000000a@revision-13` |
|    14 |    2097152 | `doc-000000000000000a` |       14 | committed |  1339916334 |    2097152 | `doc-000000000000000a@revision-14` |
|    15 |    2097152 | `doc-000000000000000a` |       15 | committed |  1327739458 |    2097152 | `doc-000000000000000a@revision-15` |
|    16 |    2097152 | `doc-000000000000000a` |       16 | committed |  1315205375 |    2097152 | `doc-000000000000000a@revision-16` |
|    17 |    2097152 | `doc-000000000000000a` |       17 | committed |  1324341709 |    2097152 | `doc-000000000000000a@revision-17` |
|    18 |    2097152 | `doc-000000000000000a` |       18 | committed |  1337976958 |    2097152 | `doc-000000000000000a@revision-18` |
|    19 |    2097152 | `doc-000000000000000a` |       19 | committed |  1333523917 |    2097152 | `doc-000000000000000a@revision-19` |
|    20 |    2097152 | `doc-000000000000000a` |       20 | committed |  1321709500 |    2097152 | `doc-000000000000000a@revision-20` |
|    21 |    2097152 | `doc-000000000000000a` |       21 | committed |  1333883917 |    2097152 | `doc-000000000000000a@revision-21` |
|    22 |    2097152 | `doc-000000000000000a` |       22 | committed |  1331555417 |    2097152 | `doc-000000000000000a@revision-22` |
|    23 |    2097152 | `doc-000000000000000a` |       23 | committed |  1319364792 |    2097152 | `doc-000000000000000a@revision-23` |
|    24 |    2097152 | `doc-000000000000000a` |       24 | committed |  1328086458 |    2097152 | `doc-000000000000000a@revision-24` |
|    25 |    2097152 | `doc-000000000000000a` |       25 | committed |  1320526583 |    2097152 | `doc-000000000000000a@revision-25` |
|    26 |    2097152 | `doc-000000000000000a` |       26 | committed |  1330249708 |    2097152 | `doc-000000000000000a@revision-26` |
|    27 |    2097152 | `doc-000000000000000a` |       27 | committed |  1331191291 |    2097152 | `doc-000000000000000a@revision-27` |
|    28 |    2097152 | `doc-000000000000000a` |       28 | committed |  1324611416 |    2097152 | `doc-000000000000000a@revision-28` |
|    29 |    2097152 | `doc-000000000000000a` |       29 | committed |  1324715500 |    2097152 | `doc-000000000000000a@revision-29` |
|    30 |    2097152 | `doc-000000000000000a` |       30 | committed |  1323809625 |    2097152 | `doc-000000000000000a@revision-30` |
