# Parity evidence — what is here and what it means

**Read this before quoting any number out of the JSON files in this directory.**

Three of the five committed files are the output of a **withdrawn** contract. They are kept on
purpose: they are the measurement that justified withdrawing it. They are not a live report, and
nothing regenerates them.

## Why the numbers look alarming

`manifest-report.json` opens with:

```json
"logical": 546, "repetitions": 3, "planned": 1638,
"pixelComparison": { "logical": 510, "planned": 1530, "passed": 0, "failed": 1512 }
```

`passed: 0` is not a regression report. It is the evidence that **whole-screen comparison against
the binding mockup could never pass**, which is why it was withdrawn on 2026-08-14. The mockup
depicts the product's final state while Feature 003 delivers a subset, so its own sidebar,
Assistant and provider readout displace every element inside a screen — 240 of the 510 keys
differed in the _position_ of the mapped region, not merely its pixels.

See `spec.md` → Clarifications → Session 2026-08-14, the amended FR-FT-051, and
`../phase-18/t035-run-after-repair.md`.

## The contract that replaced it

|                    | Withdrawn (these reports)                                    | Live (since 2026-08-14)                                     |
| ------------------ | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Pixel-compared     | 510 whole-screen keys                                        | **14 component keys** (`frontend/e2e/targeted-manifest.ts`) |
| Behaviour-verified | 36 keys                                                      | **36 keys** (`frontend/e2e/parity/manifest.ts`)             |
| Repetitions        | 3 × 546 = 1,638 comparisons                                  | `repeatEach: 3` on the `parity` Playwright project          |
| Runner             | `real-files-parity.test.ts` T035 — **removed** in `f9a34a7b` | `targeted-parity.test.ts` — 20 cases, 60 executions         |

## The five committed files

| File                             | Status                                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest-report.json` (3.7 MB)  | **Withdrawn contract.** Per-key planned/attempted/completed/passed/failed across 546 keys and 1,638 comparisons. No code regenerates it.                                                                          |
| `hash-report.json` (1.0 MB)      | **Withdrawn contract.** Reference and actual image hashes per case per repetition, plus the source/adapter/manifest/mapping hashes of that run.                                                                   |
| `state-coverage.json` (158 KB)   | **Withdrawn contract.** Per-state-ID, per-palette, per-repetition status. Every row reads `verification: "pixel-comparison"`.                                                                                     |
| `t045-zero-assistant-mapping.md` | **Decision, partly live.** Its ruling — the production Assistant stays zero-width and deferred, preserving CL-17 and FR-FT-049 — still holds. Its surrounding description of a serial 1,638-capture run does not. |
| `t050-reference-readiness.md`    | **Stale.** Line 8 claims "Parity unit suites: 4 suites, 15 tests passed"; the current figure is **7 suites / 43 tests** (`npx jest e2e/parity`). The T050 navigation probe it names does still exist and pass.    |

## Why only five files are committed

`.gitignore:38` excludes `/specs/003-real-files-and-tabs/evidence/ft-vs-08/parity/*/*`. The run
retains **547 per-case directories** of image triplets and raw artifacts locally — over 13,000
files — and those are deliberately not source-controlled. Only the compact top-level reports are.

The same rule covers the live contract's artifacts under `targeted/`: the 14 component slices and
the 36 behaviour keys write evidence there on every run, and none of it is committed. **For the
live contract the passing run is the proof, not a file in this directory** — re-running
`just e2e-test` regenerates all of it.
